import { Request, Response, NextFunction } from 'express';
import { validateAndVerifyTelegramData, TelegramWebAppData } from '../../utils/telegram.js';
import { getOrCreateUser } from '../../services/user.js';
import { apiLogger } from '../../utils/logger.js';
import { User } from '@prisma/client';

// Расширяем Request для хранения данных пользователя
declare global {
  namespace Express {
    interface Request {
      telegramData?: TelegramWebAppData;
      user?: User;
    }
  }
}

/**
 * Middleware для аутентификации через Telegram WebApp initData
 */
export function telegramAuth(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const initData = req.headers['x-telegram-init-data'] as string;
    
    if (!initData) {
      if (required) {
        return res.status(401).json({ error: 'Missing Telegram init data' });
      }
      return next();
    }
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      apiLogger.error('TELEGRAM_BOT_TOKEN not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const validation = validateAndVerifyTelegramData(initData, botToken);
    
    if (!validation.valid || !validation.data?.user) {
      apiLogger.warn({ error: validation.error }, 'Invalid Telegram auth');
      return res.status(401).json({ error: validation.error || 'Invalid auth' });
    }
    
    req.telegramData = validation.data;
    
    // Получаем/создаём пользователя в БД
    try {
      const user = await getOrCreateUser({
        telegramId: BigInt(validation.data.user.id),
        username: validation.data.user.username,
        firstName: validation.data.user.first_name,
        lastName: validation.data.user.last_name,
        languageCode: validation.data.user.language_code,
      });
      
      req.user = user;
    } catch (error) {
      apiLogger.error({ error }, 'Failed to get/create user');
      return res.status(500).json({ error: 'Database error' });
    }
    
    next();
  };
}

/**
 * Middleware для проверки админских прав
 */
export function adminOnly() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!req.user.isAdmin) {
      apiLogger.warn({ userId: req.user.id }, 'Admin access denied');
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  };
}

/**
 * Middleware для внутренних API запросов (от Directus)
 */
export function internalAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const internalKey = process.env.INTERNAL_API_KEY;
    
    if (!internalKey || token !== internalKey) {
      apiLogger.warn('Invalid internal API key');
      return res.status(401).json({ error: 'Invalid internal API key' });
    }
    
    next();
  };
}

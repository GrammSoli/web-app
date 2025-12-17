/**
 * AdminJS Setup (v6 - CommonJS Compatible)
 * 
 * Внутренняя админ-панель для управления данными.
 */

const AdminJS: any = require('adminjs');
const AdminJSExpress: any = require('@adminjs/express');
const { Database, Resource } = require('@adminjs/prisma');
import { Router } from 'express';
const session: any = require('express-session');
const connectPgSimple: any = require('connect-pg-simple');
const { prisma } = require('../services/database.js');
const { adminLogger } = require('../utils/logger.js');

// Регистрируем Prisma адаптер
AdminJS.registerAdapter({ Database, Resource });

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mindful.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-session-key-change-me';

// ============================================
// ПОЛУЧАЕМ PRISMA DMMF ДЛЯ РЕСУРСОВ
// ============================================

function getResources() {
  // Для AdminJS v6 с @adminjs/prisma@3 используем Prisma модели напрямую
  const dmmf = (prisma as any)._baseDmmf || (prisma as any)._dmmf;
  
  if (!dmmf) {
    adminLogger.warn('DMMF not found, using empty resources');
    return [];
  }

  return [
    // ===== USERS =====
    {
      resource: { model: dmmf.modelMap.User, client: prisma },
      options: {
        navigation: { name: 'Пользователи', icon: 'User' },
        listProperties: ['telegramId', 'username', 'firstName', 'subscriptionTier', 'status', 'isAdmin', 'dateCreated'],
        filterProperties: ['subscriptionTier', 'status', 'isAdmin'],
        editProperties: ['username', 'firstName', 'lastName', 'subscriptionTier', 'status', 'isAdmin', 'reminderEnabled', 'reminderTime', 'timezone'],
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
      },
    },
    
    // ===== JOURNAL ENTRIES =====
    {
      resource: { model: dmmf.modelMap.JournalEntry, client: prisma },
      options: {
        navigation: { name: 'Контент', icon: 'FileText' },
        listProperties: ['id', 'userId', 'moodScore', 'moodLabel', 'isVoice', 'isProcessed', 'dateCreated'],
        filterProperties: ['moodScore', 'isVoice', 'isProcessed'],
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
        actions: {
          new: { isAccessible: false },
        },
      },
    },
    
    // ===== BROADCASTS (РАССЫЛКИ) =====
    {
      resource: { model: dmmf.modelMap.Broadcast, client: prisma },
      options: {
        navigation: { name: 'Рассылки', icon: 'Send' },
        listProperties: ['title', 'targetAudience', 'status', 'sentCount', 'failedCount', 'scheduledAt', 'dateCreated'],
        filterProperties: ['status', 'targetAudience'],
        editProperties: ['title', 'messageText', 'messagePhotoUrl', 'targetAudience', 'scheduledAt'],
        properties: {
          messageText: {
            type: 'textarea',
          },
          messagePhotoUrl: {
            description: 'URL изображения для рассылки (опционально)',
          },
        },
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
      },
    },
    
    // ===== TRANSACTIONS =====
    {
      resource: { model: dmmf.modelMap.Transaction, client: prisma },
      options: {
        navigation: { name: 'Финансы', icon: 'DollarSign' },
        listProperties: ['id', 'userId', 'transactionType', 'amountStars', 'amountUsd', 'isSuccessful', 'dateCreated'],
        filterProperties: ['transactionType', 'isSuccessful'],
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
        },
      },
    },
    
    // ===== SUBSCRIPTIONS =====
    {
      resource: { model: dmmf.modelMap.Subscription, client: prisma },
      options: {
        navigation: { name: 'Финансы', icon: 'CreditCard' },
        listProperties: ['id', 'userId', 'tier', 'startsAt', 'expiresAt', 'isActive', 'priceStars'],
        filterProperties: ['tier', 'isActive'],
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
        actions: {
          new: { isAccessible: false },
        },
      },
    },
    
    // ===== USAGE LOGS =====
    {
      resource: { model: dmmf.modelMap.UsageLog, client: prisma },
      options: {
        navigation: { name: 'Аналитика', icon: 'Activity' },
        listProperties: ['id', 'userId', 'serviceType', 'modelName', 'inputTokens', 'outputTokens', 'costUsd', 'dateCreated'],
        filterProperties: ['serviceType', 'modelName'],
        sort: { sortBy: 'dateCreated', direction: 'desc' as const },
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
        },
      },
    },
    
    // ===== APP SETTINGS =====
    {
      resource: { model: dmmf.modelMap.AppSetting, client: prisma },
      options: {
        navigation: { name: 'Настройки', icon: 'Settings' },
        listProperties: ['key', 'value', 'description', 'dateUpdated'],
        editProperties: ['key', 'value', 'description'],
      },
    },
  ];
}

// ============================================
// СОЗДАНИЕ ADMINJS INSTANCE
// ============================================

export function createAdminJS(): any {
  const admin = new AdminJS({
    resources: getResources(),
    rootPath: '/internal_admin',
    branding: {
      companyName: 'Mindful AI Admin',
      logo: false,
    },
    locale: {
      language: 'ru',
      translations: {
        labels: {
          User: 'Пользователи',
          JournalEntry: 'Записи дневника',
          Broadcast: 'Рассылки',
          Transaction: 'Транзакции',
          Subscription: 'Подписки',
          UsageLog: 'Логи API',
          AppSetting: 'Настройки',
        },
        messages: {
          successfullyCreated: 'Успешно создано',
          successfullyUpdated: 'Успешно обновлено',
          successfullyDeleted: 'Успешно удалено',
        },
        buttons: {
          save: 'Сохранить',
          filter: 'Фильтр',
          addNewItem: 'Добавить',
          logout: 'Выход',
        },
      },
    },
  });
  
  return admin;
}

// ============================================
// СОЗДАНИЕ РОУТЕРА С АУТЕНТИФИКАЦИЕЙ
// ============================================

export function createAdminRouter(): Router {
  const admin = createAdminJS();
  
  // Session store для PostgreSQL
  const PgSession = connectPgSimple(session);
  
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'admin_sessions',
    createTableIfMissing: true,
  });
  
  // Аутентификация
  const authenticate = async (email: string, password: string) => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      adminLogger.info({ email }, 'Admin logged in');
      return { email, role: 'admin' };
    }
    adminLogger.warn({ email }, 'Failed admin login attempt');
    return null;
  };
  
  // Создаём роутер с аутентификацией (AdminJS v6 API)
  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate,
      cookieName: 'adminjs',
      cookiePassword: SESSION_SECRET,
    },
    null,
    {
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      secret: SESSION_SECRET,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
      },
    }
  );
  
  adminLogger.info('AdminJS v6 initialized at /internal_admin');
  
  return adminRouter;
}

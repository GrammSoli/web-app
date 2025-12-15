import rateLimit from 'express-rate-limit';
import { apiLogger } from '../../utils/logger.js';

/**
 * Rate limiter для API запросов
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 минута
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10), // 60 запросов
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    apiLogger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json(options.message);
  },
});

/**
 * Более строгий лимитер для AI запросов
 */
export const aiLimiter = rateLimit({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 минута
  max: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '10', 10), // 10 AI запросов в минуту
  message: { error: 'AI request limit exceeded, please wait' },
  keyGenerator: (req) => {
    // Лимитируем по user ID если есть
    return req.user?.id || req.ip || 'unknown';
  },
});

/**
 * Лимитер для внутренних API
 */
export const internalLimiter = rateLimit({
  windowMs: parseInt(process.env.INTERNAL_RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.INTERNAL_RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: { error: 'Internal API rate limit exceeded' },
});

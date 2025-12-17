/**
 * AdminJS Setup
 * 
 * Внутренняя админ-панель для управления данными.
 * НЕ ВЛИЯЕТ на Directus — работает параллельно через тот же Prisma Client.
 */

import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import * as AdminJSPrisma from '@adminjs/prisma';
import { Router } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { prisma } from '../services/database.js';
import { adminLogger } from '../utils/logger.js';

// Регистрируем Prisma адаптер
AdminJS.registerAdapter({
  Resource: AdminJSPrisma.Resource,
  Database: AdminJSPrisma.Database,
});

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mindful.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_me_later';
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-session-key-change-me';

// ============================================
// КАСТОМНЫЕ ACTIONS ДЛЯ BROADCASTS
// ============================================

const sendBroadcastAction = {
  actionType: 'record' as const,
  icon: 'Send',
  label: 'Отправить рассылку',
  guard: 'Вы уверены, что хотите отправить эту рассылку?',
  handler: async (_request: unknown, _response: unknown, context: { record: any; currentAdmin: any; h: any }) => {
    const { record } = context;
    
    if (!record) {
      return {
        record: record?.toJSON(),
        notice: { message: 'Рассылка не найдена', type: 'error' },
      };
    }
    
    const broadcast = record.params;
    
    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return {
        record: record.toJSON(),
        notice: { message: 'Можно отправить только черновик или запланированную рассылку', type: 'error' },
      };
    }
    
    try {
      // Импортируем функцию отправки
      const { executeBroadcast } = await import('../services/broadcast.js');
      
      // Запускаем рассылку в фоне
      executeBroadcast(broadcast.id).catch((err: Error) => {
        adminLogger.error({ error: err, broadcastId: broadcast.id }, 'Broadcast execution failed');
      });
      
      // Обновляем статус
      await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: 'sending', startedAt: new Date() },
      });
      
      return {
        record: record.toJSON(),
        notice: { message: 'Рассылка запущена!', type: 'success' },
        redirectUrl: context.h.resourceUrl({ resourceId: 'Broadcast' }),
      };
    } catch (error) {
      adminLogger.error({ error }, 'Failed to start broadcast');
      return {
        record: record.toJSON(),
        notice: { message: `Ошибка: ${error}`, type: 'error' },
      };
    }
  },
  isVisible: true,
  isAccessible: true,
};

// ============================================
// РЕСУРСЫ (МОДЕЛИ)
// ============================================

function getResources() {
  // Получаем DMMF для Prisma моделей
  const dmmf = (prisma as any)._baseDmmf as DMMFClass;
  
  return [
    // ===== USERS =====
    {
      resource: { model: dmmf.modelMap.User, client: prisma },
      options: {
        navigation: { name: 'Пользователи', icon: 'User' },
        listProperties: ['telegramId', 'username', 'firstName', 'subscriptionTier', 'status', 'isAdmin', 'dateCreated'],
        filterProperties: ['subscriptionTier', 'status', 'isAdmin', 'reminderEnabled'],
        editProperties: ['username', 'firstName', 'lastName', 'subscriptionTier', 'status', 'isAdmin', 'reminderEnabled', 'reminderTime', 'timezone'],
        showProperties: ['id', 'telegramId', 'username', 'firstName', 'lastName', 'subscriptionTier', 'subscriptionExpiresAt', 'balanceStars', 'totalEntriesCount', 'totalVoiceCount', 'totalSpendUsd', 'status', 'isAdmin', 'reminderEnabled', 'reminderTime', 'timezone', 'dateCreated'],
        sort: { sortBy: 'dateCreated', direction: 'desc' },
      },
    },
    
    // ===== JOURNAL ENTRIES =====
    {
      resource: { model: dmmf.modelMap.JournalEntry, client: prisma },
      options: {
        navigation: { name: 'Контент', icon: 'FileText' },
        listProperties: ['id', 'userId', 'moodScore', 'moodLabel', 'isVoice', 'isProcessed', 'dateCreated'],
        filterProperties: ['moodScore', 'isVoice', 'isProcessed'],
        showProperties: ['id', 'userId', 'textContent', 'moodScore', 'moodLabel', 'aiTags', 'aiSummary', 'aiSuggestions', 'isVoice', 'voiceDurationSeconds', 'isProcessed', 'dateCreated'],
        sort: { sortBy: 'dateCreated', direction: 'desc' },
        actions: {
          // Запрещаем создание записей через админку
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
        showProperties: ['id', 'title', 'messageText', 'messagePhotoUrl', 'targetAudience', 'status', 'scheduledAt', 'startedAt', 'completedAt', 'totalRecipients', 'sentCount', 'failedCount', 'lastError', 'dateCreated'],
        properties: {
          messageText: {
            type: 'textarea',
            props: { rows: 10 },
          },
          messagePhotoUrl: {
            description: 'URL изображения для рассылки (опционально). Можно использовать Telegram file_id или HTTP URL.',
          },
          targetAudience: {
            availableValues: [
              { value: 'all', label: 'Все пользователи' },
              { value: 'premium', label: 'Только Premium' },
              { value: 'free', label: 'Только бесплатные' },
            ],
          },
          status: {
            availableValues: [
              { value: 'draft', label: '📝 Черновик' },
              { value: 'scheduled', label: '📅 Запланировано' },
              { value: 'sending', label: '📤 Отправляется' },
              { value: 'sent', label: '✅ Отправлено' },
              { value: 'failed', label: '❌ Ошибка' },
            ],
          },
        },
        actions: {
          send: sendBroadcastAction,
        },
        sort: { sortBy: 'dateCreated', direction: 'desc' },
      },
    },
    
    // ===== TRANSACTIONS =====
    {
      resource: { model: dmmf.modelMap.Transaction, client: prisma },
      options: {
        navigation: { name: 'Финансы', icon: 'DollarSign' },
        listProperties: ['id', 'userId', 'transactionType', 'amountStars', 'amountUsd', 'isSuccessful', 'dateCreated'],
        filterProperties: ['transactionType', 'isSuccessful'],
        showProperties: ['id', 'userId', 'transactionType', 'amountStars', 'amountUsd', 'currency', 'invoiceId', 'isSuccessful', 'failureReason', 'metadata', 'dateCreated'],
        sort: { sortBy: 'dateCreated', direction: 'desc' },
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
        sort: { sortBy: 'dateCreated', direction: 'desc' },
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
        sort: { sortBy: 'dateCreated', direction: 'desc' },
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
        properties: {
          value: {
            type: 'mixed', // JSON editor
          },
        },
      },
    },
  ];
}

// ============================================
// СОЗДАНИЕ ADMINJS INSTANCE
// ============================================

export function createAdminJS(): AdminJS {
  const admin = new AdminJS({
    resources: getResources(),
    rootPath: '/internal_admin',
    loginPath: '/internal_admin/login',
    logoutPath: '/internal_admin/logout',
    branding: {
      companyName: 'Mindful AI Admin',
      logo: false,
      favicon: 'https://em-content.zobj.net/source/apple/391/brain_1f9e0.png',
      withMadeWithLove: false,
      theme: {
        colors: {
          primary100: '#6366f1',
          primary80: '#818cf8',
          primary60: '#a5b4fc',
          primary40: '#c7d2fe',
          primary20: '#e0e7ff',
          accent: '#8b5cf6',
          hoverBg: '#f5f3ff',
          filterBg: '#f8fafc',
        },
      },
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
          confirmDelete: 'Вы уверены, что хотите удалить этот элемент?',
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
  
  // Создаём роутер с аутентификацией
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
  
  adminLogger.info('AdminJS initialized at /internal_admin');
  
  return adminRouter;
}

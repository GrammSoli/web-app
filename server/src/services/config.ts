/**
 * ConfigService - Dynamic Configuration with Caching
 * 
 * Fetches configuration from Directus (app_config table) with:
 * - In-memory caching (TTL-based)
 * - Fallback to defaults if DB unavailable
 * - Type-safe getters
 * - Batch loading for performance
 */

import { prisma } from './database.js';
import { configLogger } from '../utils/logger.js';

// ============================================
// ТИПЫ
// ============================================

type ConfigValueType = 'string' | 'number' | 'boolean' | 'json';

interface ConfigRow {
  key: string;
  value: string;
  valueType: ConfigValueType;
  defaultValue: string;
  isActive: boolean;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

// ============================================
// ДЕФОЛТНЫЕ ЗНАЧЕНИЯ (FALLBACK)
// ============================================

const DEFAULTS: Record<string, unknown> = {
  // Pricing
  'openai.gpt4o_mini.input': 0.15,
  'openai.gpt4o_mini.output': 0.60,
  'openai.gpt4o.input': 2.50,
  'openai.gpt4o.output': 10.00,
  'openai.whisper.per_minute': 0.006,
  'stars_to_usd_rate': 0.02,
  
  // Subscription
  'subscription.basic.stars': 50,
  'subscription.basic.duration_days': 30,
  'subscription.premium.stars': 150,
  'subscription.premium.duration_days': 30,
  
  // Limits - Free
  'limits.free.daily_entries': 5,
  'limits.free.voice_allowed': false,
  'limits.free.voice_minutes_daily': 0,
  
  // Limits - Basic
  'limits.basic.daily_entries': 20,
  'limits.basic.voice_allowed': true,
  'limits.basic.voice_minutes_daily': 5,
  
  // Limits - Premium
  'limits.premium.daily_entries': -1,
  'limits.premium.voice_allowed': true,
  'limits.premium.voice_minutes_daily': -1,
  
  // AI
  'ai.default_model': 'gpt-4o-mini',
  'ai.temperature': 0.7,
  'ai.max_tokens': 500,
  'ai.system_prompt': `Ты — эмпатичный психолог-аналитик. Твоя задача — анализировать записи дневника и определять эмоциональное состояние человека.

Отвечай ТОЛЬКО в формате JSON (без markdown):
{
  "moodScore": <число от 1 до 10, где 1 = очень плохо, 5 = нейтрально, 10 = отлично>,
  "moodLabel": "<одно слово: радость/грусть/тревога/спокойствие/злость/усталость/воодушевление/апатия>",
  "tags": ["<тег1>", "<тег2>", "<тег3>"],
  "summary": "<краткое резюме записи в 1-2 предложениях>",
  "suggestions": "<мягкая рекомендация или поддержка в 1-2 предложениях>"
}

Правила:
- Теги должны отражать ключевые эмоции и темы (максимум 5 тегов)
- Рекомендации должны быть тёплыми и поддерживающими, не навязчивыми
- Если запись слишком короткая для анализа, всё равно постарайся дать оценку
- Отвечай на русском языке`,
  
  // Rate Limiting
  'rate_limit.api.window_ms': 60000,
  'rate_limit.api.max_requests': 60,
  'rate_limit.ai.max_requests': 10,
  
  // Feature Flags
  'feature.voice_enabled': true,
  'feature.adsgram_enabled': false,
  'feature.maintenance_mode': false,
  
  // Messages
  'msg.welcome': `👋 Привет, {name}!

Я — твой AI-дневник настроения. Просто отправь мне сообщение о том, как прошёл твой день, и я помогу проанализировать твои эмоции.

📝 *Что я умею:*
• Анализировать текстовые записи
• Распознавать голосовые сообщения (Premium)
• Отслеживать динамику настроения
• Давать мягкие рекомендации

Начни прямо сейчас — напиши, как ты себя чувствуешь!`,

  'msg.help': `📖 *Как пользоваться дневником:*

1️⃣ Просто отправь мне сообщение о своих мыслях и чувствах
2️⃣ Я проанализирую твоё настроение и сохраню запись
3️⃣ Открой веб-приложение, чтобы увидеть статистику

*Команды:*
/start — начать сначала
/stats — краткая статистика
/premium — информация о подписке
/help — эта справка`,

  'msg.limit_exceeded': '⚠️ {reason}\n\nОформи подписку, чтобы увеличить лимиты! /premium',
  'msg.error_generic': '😔 Не удалось обработать запрос. Попробуй ещё раз позже.',
  'msg.voice_processing': '🎤 Расшифровываю голосовое сообщение...',
  'msg.payment_success': '✅ Спасибо за покупку!\n\nТвоя подписка активирована. Наслаждайся всеми возможностями! 🎉',
};

// ============================================
// CONFIG SERVICE CLASS
// ============================================

class ConfigService {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;
  private isLoading = false;
  private lastFullLoad = 0;
  private fullLoadInterval: number;

  constructor(options: { ttlMs?: number; fullLoadIntervalMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.fullLoadInterval = options.fullLoadIntervalMs ?? 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Get a configuration value with type safety
   */
  async get<T>(key: string, defaultValue?: T): Promise<T> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    // Try to load from database
    try {
      const value = await this.loadKey(key);
      if (value !== undefined) {
        return value as T;
      }
    } catch (error) {
      configLogger.warn({ key, error }, 'Failed to load config from DB, using fallback');
    }

    // Fallback chain: provided default -> DEFAULTS -> undefined
    const fallback = defaultValue ?? DEFAULTS[key] as T;
    return fallback;
  }

  /**
   * Get string value
   */
  async getString(key: string, defaultValue?: string): Promise<string> {
    return this.get<string>(key, defaultValue);
  }

  /**
   * Get number value
   */
  async getNumber(key: string, defaultValue?: number): Promise<number> {
    return this.get<number>(key, defaultValue);
  }

  /**
   * Get boolean value
   */
  async getBool(key: string, defaultValue?: boolean): Promise<boolean> {
    return this.get<boolean>(key, defaultValue);
  }

  /**
   * Get JSON value
   */
  async getJson<T>(key: string, defaultValue?: T): Promise<T> {
    return this.get<T>(key, defaultValue);
  }

  /**
   * Get message template and replace placeholders
   */
  async getMessage(key: string, replacements: Record<string, string> = {}): Promise<string> {
    let message = await this.getString(key, DEFAULTS[key] as string);
    
    for (const [placeholder, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value);
    }
    
    return message;
  }

  /**
   * Get tier limits as structured object
   */
  async getTierLimits(tier: 'free' | 'basic' | 'premium'): Promise<{
    dailyEntries: number;
    voiceAllowed: boolean;
    voiceMinutesDaily: number;
  }> {
    const [dailyEntries, voiceAllowed, voiceMinutesDaily] = await Promise.all([
      this.getNumber(`limits.${tier}.daily_entries`),
      this.getBool(`limits.${tier}.voice_allowed`),
      this.getNumber(`limits.${tier}.voice_minutes_daily`),
    ]);

    return { dailyEntries, voiceAllowed, voiceMinutesDaily };
  }

  /**
   * Get subscription pricing
   */
  async getSubscriptionPricing(tier: 'basic' | 'premium'): Promise<{
    stars: number;
    durationDays: number;
  }> {
    const [stars, durationDays] = await Promise.all([
      this.getNumber(`subscription.${tier}.stars`),
      this.getNumber(`subscription.${tier}.duration_days`),
    ]);

    return { stars, durationDays };
  }

  /**
   * Get OpenAI pricing for a model
   */
  async getOpenAIPricing(model: 'gpt-4o-mini' | 'gpt-4o'): Promise<{
    input: number;
    output: number;
  }> {
    const normalizedKey = model === 'gpt-4o-mini' ? 'gpt4o_mini' : 'gpt4o';
    
    const [input, output] = await Promise.all([
      this.getNumber(`openai.${normalizedKey}.input`),
      this.getNumber(`openai.${normalizedKey}.output`),
    ]);

    return { input, output };
  }

  /**
   * Get Whisper pricing
   */
  async getWhisperPricing(): Promise<number> {
    return this.getNumber('openai.whisper.per_minute');
  }

  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(feature: string): Promise<boolean> {
    return this.getBool(`feature.${feature}`, false);
  }

  /**
   * Load all config into cache (batch operation)
   */
  async preload(): Promise<void> {
    if (this.isLoading) return;
    
    const now = Date.now();
    if (now - this.lastFullLoad < this.fullLoadInterval) return;

    this.isLoading = true;
    
    try {
      configLogger.info('Preloading all configuration from database');
      
      const rows = await prisma.$queryRaw<ConfigRow[]>`
        SELECT key, value, value_type as "valueType", default_value as "defaultValue", is_active as "isActive"
        FROM app.app_config
        WHERE is_active = TRUE
      `;

      for (const row of rows) {
        const parsedValue = this.parseValue(row.value, row.valueType, row.defaultValue);
        this.cache.set(row.key, {
          value: parsedValue,
          expiresAt: now + this.ttlMs,
        });
      }

      this.lastFullLoad = now;
      configLogger.info({ count: rows.length }, 'Configuration preloaded');
    } catch (error) {
      configLogger.error({ error }, 'Failed to preload configuration');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Invalidate cache for specific key or all
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      configLogger.debug({ key }, 'Cache invalidated for key');
    } else {
      this.cache.clear();
      this.lastFullLoad = 0;
      configLogger.info('Full cache invalidated');
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): { size: number; lastFullLoad: Date | null } {
    return {
      size: this.cache.size,
      lastFullLoad: this.lastFullLoad ? new Date(this.lastFullLoad) : null,
    };
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async loadKey(key: string): Promise<unknown | undefined> {
    const rows = await prisma.$queryRaw<ConfigRow[]>`
      SELECT key, value, value_type as "valueType", default_value as "defaultValue", is_active as "isActive"
      FROM app.app_config
      WHERE key = ${key} AND is_active = TRUE
      LIMIT 1
    `;

    if (rows.length === 0) {
      return undefined;
    }

    const row = rows[0];
    const parsedValue = this.parseValue(row.value, row.valueType, row.defaultValue);
    
    // Cache it
    this.cache.set(key, {
      value: parsedValue,
      expiresAt: Date.now() + this.ttlMs,
    });

    return parsedValue;
  }

  private parseValue(value: string, type: ConfigValueType, defaultValue: string): unknown {
    try {
      switch (type) {
        case 'number':
          const num = parseFloat(value);
          return isNaN(num) ? parseFloat(defaultValue) : num;
        
        case 'boolean':
          return value.toLowerCase() === 'true' || value === '1';
        
        case 'json':
          return JSON.parse(value);
        
        case 'string':
        default:
          return value;
      }
    } catch (error) {
      configLogger.warn({ value, type, defaultValue, error }, 'Failed to parse config value, using default');
      
      // Try to parse default value
      try {
        switch (type) {
          case 'number':
            return parseFloat(defaultValue);
          case 'boolean':
            return defaultValue.toLowerCase() === 'true';
          case 'json':
            return JSON.parse(defaultValue);
          default:
            return defaultValue;
        }
      } catch {
        return defaultValue;
      }
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const configService = new ConfigService({
  ttlMs: 5 * 60 * 1000,        // 5 minutes cache TTL
  fullLoadIntervalMs: 10 * 60 * 1000, // 10 minutes between full reloads
});

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Get config value (shorthand for configService.get)
 */
export async function getConfig<T>(key: string, defaultValue?: T): Promise<T> {
  return configService.get(key, defaultValue);
}

/**
 * Get message with replacements
 */
export async function getMessage(key: string, replacements?: Record<string, string>): Promise<string> {
  return configService.getMessage(key, replacements);
}

/**
 * Check feature flag
 */
export async function isFeatureEnabled(feature: string): Promise<boolean> {
  return configService.isFeatureEnabled(feature);
}

export default configService;

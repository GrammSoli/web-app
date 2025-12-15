/**
 * OpenAI API Pricing Calculator
 * Dynamic pricing from ConfigService with fallbacks
 */

import { configService } from '../services/config.js';

// ============================================
// ТИПЫ
// ============================================

export type TextModel = 'gpt-4o-mini' | 'gpt-4o';
export type AudioModel = 'whisper-1';
export type ModelName = TextModel | AudioModel;
export type SubscriptionTier = 'free' | 'basic' | 'premium';

// ============================================
// STATIC DEFAULTS (fallback if config unavailable)
// ============================================

const DEFAULT_OPENAI_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'whisper-1': { perMinute: 0.006 },
} as const;

const DEFAULT_STARS_RATE = 0.02;

const DEFAULT_TIER_LIMITS = {
  free: { dailyEntries: 5, voiceAllowed: false, voiceDaily: 0 },
  basic: { dailyEntries: 20, voiceAllowed: true, voiceDaily: 5 },
  premium: { dailyEntries: -1, voiceAllowed: true, voiceDaily: -1 },
} as const;

const DEFAULT_SUBSCRIPTION_PRICES = {
  basic: { stars: 50, durationDays: 30 },
  premium: { stars: 150, durationDays: 30 },
} as const;

// ============================================
// LEGACY EXPORTS (для обратной совместимости)
// Deprecated: use async functions below
// ============================================

/** @deprecated Use getOpenAIPricing() instead */
export const OPENAI_PRICING = DEFAULT_OPENAI_PRICING;

/** @deprecated Use getStarsToUsdRate() instead */
export const STARS_TO_USD_RATE = DEFAULT_STARS_RATE;

/** @deprecated Use getTierLimits() instead */
export const TIER_LIMITS = DEFAULT_TIER_LIMITS;

/** @deprecated Use getSubscriptionPrices() instead */
export const SUBSCRIPTION_PRICES = {
  basic: { ...DEFAULT_SUBSCRIPTION_PRICES.basic, usd: DEFAULT_SUBSCRIPTION_PRICES.basic.stars * DEFAULT_STARS_RATE },
  premium: { ...DEFAULT_SUBSCRIPTION_PRICES.premium, usd: DEFAULT_SUBSCRIPTION_PRICES.premium.stars * DEFAULT_STARS_RATE },
};

// ============================================
// ASYNC CONFIG GETTERS
// ============================================

/**
 * Get OpenAI text model pricing
 */
export async function getTextModelPricing(model: TextModel): Promise<{ input: number; output: number }> {
  return configService.getOpenAIPricing(model);
}

/**
 * Get Whisper pricing per minute
 */
export async function getWhisperPricing(): Promise<number> {
  return configService.getWhisperPricing();
}

/**
 * Get Stars to USD conversion rate
 */
export async function getStarsToUsdRate(): Promise<number> {
  return configService.getNumber('stars_to_usd_rate', DEFAULT_STARS_RATE);
}

/**
 * Get tier limits
 */
export async function getTierLimits(tier: SubscriptionTier): Promise<{
  dailyEntries: number;
  voiceAllowed: boolean;
  voiceDaily: number;
}> {
  return configService.getTierLimits(tier);
}

/**
 * Get subscription pricing
 */
export async function getSubscriptionPricing(tier: 'basic' | 'premium'): Promise<{
  stars: number;
  durationDays: number;
  usd: number;
}> {
  const pricing = await configService.getSubscriptionPricing(tier);
  const rate = await getStarsToUsdRate();
  
  return {
    ...pricing,
    usd: pricing.stars * rate,
  };
}

// ============================================
// COST CALCULATION (async versions)
// ============================================

/**
 * Calculate text API cost (async, uses dynamic pricing)
 */
export async function calculateTextCostAsync(
  model: TextModel,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const pricing = await getTextModelPricing(model);
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Calculate audio transcription cost (async)
 */
export async function calculateAudioCostAsync(durationSeconds: number): Promise<number> {
  const pricePerMinute = await getWhisperPricing();
  const durationMinutes = durationSeconds / 60;
  
  return Number((durationMinutes * pricePerMinute).toFixed(6));
}

// ============================================
// SYNC COST CALCULATION (uses static defaults)
// For hot paths where async is not desirable
// ============================================

/**
 * Calculate text cost synchronously (uses default pricing)
 */
export function calculateTextCost(
  model: TextModel,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = DEFAULT_OPENAI_PRICING[model];
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Calculate audio cost synchronously
 */
export function calculateAudioCost(durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60;
  const cost = durationMinutes * DEFAULT_OPENAI_PRICING['whisper-1'].perMinute;
  
  return Number(cost.toFixed(6));
}

/**
 * Calculate cost for any model
 */
export function calculateCost(params: {
  model: ModelName;
  inputTokens?: number;
  outputTokens?: number;
  durationSeconds?: number;
}): number {
  const { model, inputTokens = 0, outputTokens = 0, durationSeconds = 0 } = params;
  
  if (model === 'whisper-1') {
    return calculateAudioCost(durationSeconds);
  }
  
  return calculateTextCost(model as TextModel, inputTokens, outputTokens);
}

// ============================================
// STARS CONVERSION
// ============================================

export function starsToUsd(stars: number): number {
  return Number((stars * DEFAULT_STARS_RATE).toFixed(4));
}

export function usdToStars(usd: number): number {
  return Math.ceil(usd / DEFAULT_STARS_RATE);
}

export async function starsToUsdAsync(stars: number): Promise<number> {
  const rate = await getStarsToUsdRate();
  return Number((stars * rate).toFixed(4));
}

export async function usdToStarsAsync(usd: number): Promise<number> {
  const rate = await getStarsToUsdRate();
  return Math.ceil(usd / rate);
}

// ============================================
// LIMIT CHECKING (async)
// ============================================

/**
 * Check user limits against tier (async version)
 */
export async function checkLimitsAsync(
  tier: SubscriptionTier,
  currentDailyEntries: number,
  currentDailyVoice: number,
  isVoice: boolean
): Promise<{ allowed: boolean; reason?: string }> {
  // Check maintenance mode first
  const maintenanceMode = await configService.getBool('feature.maintenance_mode', false);
  if (maintenanceMode) {
    return {
      allowed: false,
      reason: 'Сервис временно недоступен. Пожалуйста, попробуйте позже.',
    };
  }

  // Check global voice feature flag
  if (isVoice) {
    const voiceEnabled = await configService.getBool('feature.voice_enabled', true);
    if (!voiceEnabled) {
      return {
        allowed: false,
        reason: 'Голосовые сообщения временно отключены',
      };
    }
  }

  const limits = await getTierLimits(tier);
  
  // Check voice permission
  if (isVoice && !limits.voiceAllowed) {
    return {
      allowed: false,
      reason: 'Голосовые записи доступны только в платных тарифах',
    };
  }
  
  // Check voice daily limit
  if (isVoice && limits.voiceDaily !== -1 && currentDailyVoice >= limits.voiceDaily) {
    return {
      allowed: false,
      reason: `Достигнут лимит голосовых записей (${limits.voiceDaily}/день)`,
    };
  }
  
  // Check total daily limit
  if (limits.dailyEntries !== -1 && currentDailyEntries >= limits.dailyEntries) {
    return {
      allowed: false,
      reason: `Достигнут лимит записей (${limits.dailyEntries}/день)`,
    };
  }
  
  return { allowed: true };
}

/**
 * Check limits (sync version with static defaults)
 */
export function checkLimits(
  tier: SubscriptionTier,
  currentDailyEntries: number,
  currentDailyVoice: number,
  isVoice: boolean
): { allowed: boolean; reason?: string } {
  const limits = DEFAULT_TIER_LIMITS[tier];
  
  if (isVoice && !limits.voiceAllowed) {
    return {
      allowed: false,
      reason: 'Голосовые записи доступны только в платных тарифах',
    };
  }
  
  if (isVoice && limits.voiceDaily !== -1 && currentDailyVoice >= limits.voiceDaily) {
    return {
      allowed: false,
      reason: `Достигнут лимит голосовых записей (${limits.voiceDaily}/день)`,
    };
  }
  
  if (limits.dailyEntries !== -1 && currentDailyEntries >= limits.dailyEntries) {
    return {
      allowed: false,
      reason: `Достигнут лимит записей (${limits.dailyEntries}/день)`,
    };
  }
  
  return { allowed: true };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format cost for display
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}

/**
 * Estimate text cost before request
 */
export function estimateTextCost(textLength: number): {
  estimatedTokens: number;
  estimatedCost: number;
} {
  // Rough estimate: 1 token ≈ 2.5 characters for Russian
  const estimatedInputTokens = Math.ceil(textLength / 2.5);
  const estimatedOutputTokens = 200;
  
  return {
    estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedCost: calculateTextCost('gpt-4o-mini', estimatedInputTokens, estimatedOutputTokens),
  };
}

/**
 * Estimate audio cost
 */
export function estimateAudioCost(durationSeconds: number): {
  estimatedCost: number;
} {
  return {
    estimatedCost: calculateAudioCost(durationSeconds),
  };
}

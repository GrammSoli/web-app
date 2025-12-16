/**
 * Application constants - centralized hardcoded values
 */

// Search limits
export const FREE_SEARCH_LIMIT = 30;

// Placeholder texts for new entry
export const PLACEHOLDER_TEXTS = [
  'Сегодня я чувствую себя...',
  'Меня радует, что...',
  'Сегодня произошло...',
  'Я думаю о том, что...',
  'Мне хочется рассказать о...',
];

// Support link
export const SUPPORT_LINK = 'https://t.me/mindful_support';

// Default subscription limits (fallback if not loaded from server)
export const DEFAULT_LIMITS: Record<string, { entries: number; label: string }> = {
  free: { entries: 3, label: '3' },
  basic: { entries: 20, label: '20' },
  premium: { entries: Infinity, label: '∞' },
};

// Default subscription features (fallback if not loaded from server)
export const DEFAULT_FEATURES = {
  basic: [
    '20 записей в день',
    '5 голосовых в день',
    'Расширенный анализ',
    'Теги и рекомендации',
  ],
  premium: [
    'Безлимитные записи',
    'Безлимитные голосовые',
    'Глубокий анализ с ИИ',
    'Персональные инсайты',
    'Приоритетная поддержка',
  ],
};

// Default plans (fallback if API fails)
export const DEFAULT_PLANS = {
  basic: { stars: 50, durationDays: 30, name: 'Basic', features: DEFAULT_FEATURES.basic },
  premium: { stars: 150, durationDays: 30, name: 'Premium', features: DEFAULT_FEATURES.premium },
};

// Tags display limits
export const MAX_VISIBLE_TAGS = 8;
export const MAX_TAGS_PER_ENTRY = 10;
export const MAX_TAG_LENGTH = 30;

// Text limits
export const MAX_TEXT_PREVIEW_LENGTH = 100;

// Random placeholder getter
export function getRandomPlaceholder(): string {
  return PLACEHOLDER_TEXTS[Math.floor(Math.random() * PLACEHOLDER_TEXTS.length)];
}

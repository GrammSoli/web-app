/**
 * AI mood analysis constants
 * Mood labels and fallback values for AI responses
 */

// Possible mood labels that AI can return
export const MOOD_LABELS = [
  'радость',
  'грусть',
  'тревога',
  'спокойствие',
  'злость',
  'усталость',
  'воодушевление',
  'апатия',
  'неопределённо',
] as const;

export type MoodLabel = typeof MOOD_LABELS[number];

// Fallback analysis when AI response cannot be parsed
export const DEFAULT_MOOD_ANALYSIS = {
  moodScore: 5,
  moodLabel: 'неопределённо' as MoodLabel,
  tags: [] as string[],
  summary: 'Не удалось проанализировать запись',
  suggestions: 'Попробуйте написать подробнее о своих чувствах',
};

// AI service constraints
export const AI_MAX_TAGS_PER_ANALYSIS = 5;
export const AI_MIN_MOOD_SCORE = 1;
export const AI_MAX_MOOD_SCORE = 10;

/**
 * Validates and clamps mood score to valid range
 */
export function validateMoodScoreRange(score: number): number {
  return Math.max(AI_MIN_MOOD_SCORE, Math.min(AI_MAX_MOOD_SCORE, Math.round(score || 5)));
}

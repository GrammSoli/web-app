/**
 * Mood configuration - centralized emoji and gradient mappings
 */

export const MOOD_EMOJIS: Record<number, string> = {
  1: '😢',
  2: '😔',
  3: '😕',
  4: '😐',
  5: '🙂',
  6: '😊',
  7: '😄',
  8: '😁',
  9: '🤩',
  10: '🥳',
};

export const MOOD_GRADIENTS: Record<number, string> = {
  1: 'from-red-500 to-rose-600',
  2: 'from-orange-500 to-red-500',
  3: 'from-amber-500 to-orange-500',
  4: 'from-yellow-500 to-amber-500',
  5: 'from-gray-400 to-gray-500',
  6: 'from-lime-500 to-green-500',
  7: 'from-green-500 to-emerald-500',
  8: 'from-emerald-500 to-teal-500',
  9: 'from-cyan-500 to-blue-500',
  10: 'from-purple-500 to-pink-500',
};

// Lighter gradients for cards
export const MOOD_GRADIENTS_LIGHT: Record<number, string> = {
  1: 'from-red-400 to-red-500',
  2: 'from-orange-400 to-orange-500',
  3: 'from-amber-400 to-amber-500',
  4: 'from-yellow-400 to-yellow-500',
  5: 'from-gray-400 to-gray-500',
  6: 'from-lime-400 to-lime-500',
  7: 'from-green-400 to-green-500',
  8: 'from-emerald-400 to-emerald-500',
  9: 'from-cyan-400 to-cyan-500',
  10: 'from-purple-400 to-purple-500',
};

// Quick mood selector options
export const QUICK_MOOD_OPTIONS = [
  { emoji: '😔', label: 'Грустно', score: 2 },
  { emoji: '😐', label: 'Нейтрально', score: 5 },
  { emoji: '🙂', label: 'Хорошо', score: 7 },
  { emoji: '🤩', label: 'Супер!', score: 9 },
];

// Full mood selector for new entry (with color gradients for UI)
export const MOOD_SELECTOR_OPTIONS = [
  { emoji: '😢', label: 'Грустно', score: 2, color: 'from-red-400 to-red-500' },
  { emoji: '😔', label: 'Тоскливо', score: 3, color: 'from-orange-400 to-orange-500' },
  { emoji: '😐', label: 'Нейтрально', score: 5, color: 'from-gray-400 to-gray-500' },
  { emoji: '🙂', label: 'Хорошо', score: 7, color: 'from-green-400 to-green-500' },
  { emoji: '😊', label: 'Отлично', score: 8, color: 'from-emerald-400 to-emerald-500' },
  { emoji: '🤩', label: 'Супер!', score: 9, color: 'from-purple-400 to-purple-500' },
];

// Helper function to get emoji by score
export function getMoodEmoji(score: number): string {
  return MOOD_EMOJIS[score] || '🙂';
}

// Helper function to get gradient by score
export function getMoodGradient(score: number, light = false): string {
  const gradients = light ? MOOD_GRADIENTS_LIGHT : MOOD_GRADIENTS;
  return gradients[score] || 'from-gray-400 to-gray-500';
}

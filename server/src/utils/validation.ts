/**
 * Shared validation utilities
 * Used both in server-side validation and client-side input
 */

// Validation constants
export const MAX_ENTRY_TEXT_LENGTH = 10000;
export const MAX_TAGS_PER_ENTRY = 10;
export const MAX_TAG_LENGTH = 30;

/**
 * Validates and cleans a single tag
 * @param tag - Raw tag string
 * @returns Cleaned tag or null if invalid
 */
export function validateTag(tag: string): string | null {
  if (typeof tag !== 'string') return null;
  
  const cleaned = tag.trim().toLowerCase();
  if (cleaned.length === 0 || cleaned.length > MAX_TAG_LENGTH) {
    return null;
  }
  
  return cleaned;
}

/**
 * Validates and cleans array of tags
 * Deduplicates and limits to max count
 * @param tags - Array of raw tag strings
 * @param maxTags - Maximum number of tags allowed (default: MAX_TAGS_PER_ENTRY)
 * @returns Deduplicated array of valid tags
 */
export function validateTags(tags: string[], maxTags: number = MAX_TAGS_PER_ENTRY): string[] {
  if (!Array.isArray(tags)) return [];
  
  const validated = new Set<string>();
  
  for (const tag of tags) {
    if (validated.size >= maxTags) break;
    
    const cleanTag = validateTag(tag);
    if (cleanTag) {
      validated.add(cleanTag);
    }
  }
  
  return Array.from(validated);
}

/**
 * Validates entry text content
 * @param text - Entry text
 * @returns Error message or null if valid
 */
export function validateEntryText(text: unknown): string | null {
  if (typeof text !== 'string') {
    return 'Текст должен быть строкой';
  }
  
  if (text.trim().length === 0) {
    return 'Текст не может быть пустым';
  }
  
  if (text.length > MAX_ENTRY_TEXT_LENGTH) {
    return `Текст слишком длинный (макс ${MAX_ENTRY_TEXT_LENGTH} символов)`;
  }
  
  return null;
}

/**
 * Validates mood score
 * @param score - Mood score
 * @returns Error message or null if valid
 */
export function validateMoodScore(score: unknown): string | null {
  if (typeof score !== 'number') {
    return 'Настроение должно быть числом';
  }
  
  if (!Number.isInteger(score)) {
    return 'Настроение должно быть целым числом';
  }
  
  if (score < 1 || score > 10) {
    return 'Настроение должно быть от 1 до 10';
  }
  
  return null;
}

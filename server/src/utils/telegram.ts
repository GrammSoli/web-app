import CryptoJS from 'crypto-js';

/**
 * Валидация Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramWebAppData(
  initData: string,
  botToken: string
): { valid: boolean; data?: TelegramWebAppData } {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return { valid: false };
    }
    
    // Удаляем hash из параметров для проверки
    urlParams.delete('hash');
    
    // Сортируем параметры и создаём строку для проверки
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Создаём секретный ключ
    const secretKey = CryptoJS.HmacSHA256(botToken, 'WebAppData');
    
    // Вычисляем HMAC
    const calculatedHash = CryptoJS.HmacSHA256(dataCheckString, secretKey).toString(CryptoJS.enc.Hex);
    
    if (calculatedHash !== hash) {
      return { valid: false };
    }
    
    // Парсим данные пользователя
    const userJson = urlParams.get('user');
    const user = userJson ? JSON.parse(userJson) : null;
    
    return {
      valid: true,
      data: {
        user,
        queryId: urlParams.get('query_id') || undefined,
        authDate: parseInt(urlParams.get('auth_date') || '0', 10),
        hash,
      },
    };
  } catch (error) {
    return { valid: false };
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramWebAppData {
  user: TelegramUser | null;
  queryId?: string;
  authDate: number;
  hash: string;
}

/**
 * Default auth data expiration time (24 hours)
 * Can be overridden via config: auth.max_age_seconds
 */
const DEFAULT_AUTH_MAX_AGE_SECONDS = 86400; // 24 hours

/**
 * Проверка что данные не устарели
 */
export function isDataFresh(authDate: number, maxAgeSeconds = DEFAULT_AUTH_MAX_AGE_SECONDS): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - authDate < maxAgeSeconds;
}

/**
 * Полная валидация с проверкой свежести
 */
export function validateAndVerifyTelegramData(
  initData: string,
  botToken: string,
  maxAgeSeconds = DEFAULT_AUTH_MAX_AGE_SECONDS
): { valid: boolean; data?: TelegramWebAppData; error?: string } {
  const result = validateTelegramWebAppData(initData, botToken);
  
  if (!result.valid) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  if (!result.data) {
    return { valid: false, error: 'No data' };
  }
  
  if (!isDataFresh(result.data.authDate, maxAgeSeconds)) {
    return { valid: false, error: 'Data expired' };
  }
  
  if (!result.data.user) {
    return { valid: false, error: 'No user data' };
  }
  
  return { valid: true, data: result.data };
}

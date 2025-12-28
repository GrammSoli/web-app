import type { User, JournalEntry, UserStats, PaginatedResponse, UserSettings, Habit, HabitsResponse, HabitToggleResponse, CreateHabitInput } from '@/types/api';
import { APP_CONFIG } from '@/config/app';

const API_BASE = '/api';

/**
 * Get Telegram initData for authentication
 */
function getInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

/**
 * Get browser timezone
 */
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Base fetch wrapper with auth and timeout
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = getInitData();
  const timezone = getBrowserTimezone();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.API_TIMEOUT_MS);
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        'X-Timezone': timezone,
        ...options.headers,
      },
    });

    if (!response.ok) {
      // Handle 401 Unauthorized - session expired or invalid
      if (response.status === 401) {
        const message = 'Сессия истекла. Пожалуйста, перезапустите приложение.';
        if (window.Telegram?.WebApp?.showAlert) {
          window.Telegram.WebApp.showAlert(message, () => {
            window.Telegram?.WebApp?.close();
          });
        } else {
          alert(message);
          window.location.reload();
        }
        throw new Error(message);
      }
      
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания ответа');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// PUBLIC CONFIG API (no auth required)
// ============================================

export interface PublicConfig {
  supportLink: string;
  channelLink: string;
}

export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    const response = await fetch(`${API_BASE}/config/public`);
    if (!response.ok) {
      throw new Error('Failed to fetch config');
    }
    return response.json();
  } catch {
    // Fallback to default
    return { 
      supportLink: 'https://t.me/mindful_support',
      channelLink: 'https://t.me/mindful_journal_channel',
    };
  }
}

// ============================================
// USER API
// ============================================

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/user/me');
}

export async function getUserStats(): Promise<UserStats> {
  return apiFetch<UserStats>('/user/stats');
}

export async function syncTimezone(timezone: string): Promise<{ timezone: string }> {
  return apiFetch<{ timezone: string }>('/user/timezone', {
    method: 'POST',
    body: JSON.stringify({ timezone }),
  });
}

// ============================================
// ENTRIES API
// ============================================

export async function getEntries(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<JournalEntry>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  
  const query = searchParams.toString();
  return apiFetch<PaginatedResponse<JournalEntry>>(`/user/entries${query ? `?${query}` : ''}`);
}

export async function getEntry(id: string): Promise<JournalEntry> {
  return apiFetch<JournalEntry>(`/user/entries/${id}`);
}

export async function createEntry(data: {
  textContent: string;
  moodScore?: number;
}): Promise<JournalEntry> {
  return apiFetch<JournalEntry>('/user/entries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await apiFetch(`/user/entries/${id}`, {
    method: 'DELETE',
  });
}

export async function updateEntry(id: string, data: { textContent?: string; tags?: string[]; moodScore?: number; moodLabel?: string }): Promise<JournalEntry> {
  return apiFetch<JournalEntry>(`/user/entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getEntryAudio(id: string): Promise<{ audioUrl: string; duration: number | null }> {
  return apiFetch<{ audioUrl: string; duration: number | null }>(`/user/entries/${id}/audio`);
}

// ============================================
// SUBSCRIPTION API
// ============================================

export async function getSubscriptionPlans(): Promise<{
  basic: { stars: number; durationDays: number };
  premium: { stars: number; durationDays: number };
}> {
  return apiFetch('/user/subscription/plans');
}

export async function createInvoice(tier: 'basic' | 'premium'): Promise<{ invoiceUrl: string }> {
  return apiFetch('/user/subscription/invoice', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export async function getCryptoPrices(): Promise<{
  enabled: boolean;
  basic: { usdt: number; durationDays: number };
  premium: { usdt: number; durationDays: number };
}> {
  return apiFetch('/user/subscription/crypto-prices');
}

export async function createCryptoInvoice(tier: 'basic' | 'premium'): Promise<{ invoiceUrl: string; invoiceId: number }> {
  return apiFetch('/user/subscription/crypto-invoice', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export async function createCardPayment(tier: 'basic' | 'premium'): Promise<{ paymentUrl: string }> {
  return apiFetch('/user/subscription/card-payment', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export async function getCardPrices(): Promise<{
  enabled: boolean;
  basic: { rub: number; durationDays: number };
  premium: { rub: number; durationDays: number };
}> {
  return apiFetch('/user/subscription/card-prices');
}

// ============================================
// SETTINGS API
// ============================================

export async function getUserSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>('/user/settings');
}

export async function updateUserSettings(data: Partial<UserSettings>): Promise<UserSettings> {
  return apiFetch<UserSettings>('/user/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ============================================
// HABITS API
// ============================================

export async function getHabits(date?: string): Promise<HabitsResponse> {
  const params = date ? `?date=${date}` : '';
  return apiFetch<HabitsResponse>(`/habits${params}`);
}

export async function createHabit(data: CreateHabitInput): Promise<Habit> {
  return apiFetch<Habit>('/habits', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHabit(id: string, data: Partial<CreateHabitInput>): Promise<Habit> {
  return apiFetch<Habit>(`/habits/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteHabit(id: string): Promise<void> {
  await apiFetch(`/habits/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleHabit(id: string, date?: string): Promise<HabitToggleResponse> {
  return apiFetch<HabitToggleResponse>(`/habits/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

export async function reorderHabits(order: string[]): Promise<void> {
  await apiFetch('/habits/reorder', {
    method: 'POST',
    body: JSON.stringify({ order }),
  });
}

// ============================================
// EXPORT API
// ============================================

export async function exportData(format: 'json' | 'csv' = 'json'): Promise<Blob> {
  const initData = getInitData();
  const timezone = getBrowserTimezone();
  
  const response = await fetch(`${API_BASE}/user/export?format=${format}`, {
    headers: {
      'X-Telegram-Init-Data': initData,
      'X-Timezone': timezone,
    },
  });
  
  if (!response.ok) {
    throw new Error('Export failed');
  }
  
  return response.blob();
}

// ============================================
// EXPORTS
// ============================================

export const api = {
  user: {
    getCurrent: getCurrentUser,
    getStats: getUserStats,
    syncTimezone,
    getSettings: getUserSettings,
    updateSettings: updateUserSettings,
  },
  entries: {
    getAll: getEntries,
    get: getEntry,
    create: createEntry,
    delete: deleteEntry,
    update: updateEntry,
    getAudio: getEntryAudio,
  },
  subscription: {
    getPlans: getSubscriptionPlans,
    createInvoice,
    getCryptoPrices,
    createCryptoInvoice,
    getCardPrices,
    createCardPayment,
  },
  habits: {
    getAll: getHabits,
    create: createHabit,
    update: updateHabit,
    delete: deleteHabit,
    toggle: toggleHabit,
    reorder: reorderHabits,
  },
  export: {
    download: exportData,
  },
};

export default api;

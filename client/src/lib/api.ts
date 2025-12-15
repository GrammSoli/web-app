import type { User, JournalEntry, UserStats, PaginatedResponse } from '@/types/api';
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

// ============================================
// EXPORTS
// ============================================

export const api = {
  user: {
    getCurrent: getCurrentUser,
    getStats: getUserStats,
    syncTimezone,
  },
  entries: {
    getAll: getEntries,
    get: getEntry,
    create: createEntry,
    delete: deleteEntry,
  },
  subscription: {
    getPlans: getSubscriptionPlans,
    createInvoice,
  },
};

export default api;

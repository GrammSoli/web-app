/**
 * API Types - shared between frontend and backend
 */

// User
export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscriptionTier: 'free' | 'basic' | 'premium';
  subscriptionExpiresAt?: string;
  subscriptionEndDate?: string; // Alias for subscriptionExpiresAt
  balanceStars: number;
  totalEntriesCount: number;
  totalVoiceCount: number;
  isAdmin: boolean;
  dateCreated: string;
  
  // Stats from API /me
  stats?: {
    totalEntries: number;
    totalVoice: number;
    todayEntries: number;
    todayVoice: number;
  };
  
  // Limits from API /me
  limits?: {
    dailyEntries: number;
    voiceAllowed: boolean;
    voiceMinutesDaily: number;
  };
  
  // Additional fields for ProfilePage (legacy)
  totalEntries?: number;
  streakDays?: number;
  entriesThisMonth?: number;
}

// Journal Entry
export interface JournalEntry {
  id: string;
  userId: string;
  textContent: string;
  isVoice: boolean;
  voiceDurationSeconds?: number;
  voiceFileId?: string;
  moodScore?: number;
  moodLabel?: string;
  tags: string[];
  aiSummary?: string;
  aiSuggestions?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  dateCreated: string;
}

// Stats
export interface UserStats {
  totalEntries: number;
  todayEntries: number;
  todayVoice: number;
  dailyLimit: number | null;
  voiceLimit: number | null;
  averageMood: number;
  currentStreak: number;
  longestStreak: number;
  moodTrend: 'up' | 'down' | 'stable';
  weeklyMoods: Array<{
    date: string;
    score: number;
  }>;
}

// Subscription
export interface SubscriptionPlan {
  tier: 'basic' | 'premium';
  name: string;
  priceStars: number;
  features: string[];
  limits: {
    dailyEntries: number | null;
    voiceMinutesDaily: number | null;
  };
}

// API Responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

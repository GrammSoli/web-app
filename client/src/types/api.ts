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
  balanceStars: number;
  totalEntriesCount: number;
  totalVoiceCount: number;
  isAdmin: boolean;
  dateCreated: string;
  timezone?: string;
  
  // Settings
  settings?: UserSettings;
  
  // Stats from API /me
  stats?: {
    totalEntries: number;
    totalVoice: number;
    todayEntries: number;
    todayVoice: number;
    averageMood?: number;
  };
  
  // Limits from API /me
  limits?: {
    dailyEntries: number;
    voiceAllowed: boolean;
    voiceMinutesDaily: number;
  };
  
  // Additional fields for ProfilePage
  streakDays?: number;
}

// User Settings
export interface UserSettings {
  timezone: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
  privacyBlurDefault: boolean;
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
  tier?: 'free' | 'basic' | 'premium';
  totalEntries: number;
  todayEntries: number;
  todayVoice: number;
  dailyLimit: number | null;
  voiceLimit: number | null;
  averageMood: number;
  currentStreak: number;
  longestStreak: number;
  moodTrend: 'up' | 'down' | 'stable';
  trendPercentage?: number;
  weeklyMoods: Array<{
    date: string;
    score: number;
  }>;
  monthlyMoods?: Array<{
    date: string;
    score: number;
  }>;
  topTags?: Array<{
    tag: string;
    count: number;
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

// ============================================
// HABITS
// ============================================

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  customDays: number[];
  reminderTime: string | null;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  sortOrder: number;
  isActive: boolean;
  completedToday: boolean;
  completedDates: string[]; // YYYY-MM-DD format
}

export interface HabitsResponse {
  habits: Habit[];
  stats: {
    totalHabits: number;
    completedToday: number;
    maxHabits: number;
    canCreateMore: boolean;
  };
  weekDates: string[];
  completionDots: Record<string, number>;
  freezeInfo?: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export interface HabitToggleResponse {
  completed: boolean;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  allCompleted: boolean; // For triggering confetti
  freezeInfo?: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export interface CreateHabitInput {
  name: string;
  emoji?: string;
  color?: string;
  frequency?: 'daily' | 'weekdays' | 'weekends' | 'custom';
  customDays?: number[];
  reminderTime?: string | null;
}


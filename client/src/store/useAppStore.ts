import { create } from 'zustand';
import type { User, JournalEntry, UserStats, UserSettings } from '@/types/api';
import { api, updateUserSettings } from '@/lib/api';

interface AppState {
  // User
  user: User | null;
  userLoading: boolean;
  userError: string | null;
  
  // Entries
  entries: JournalEntry[];
  entriesLoading: boolean;
  entriesError: string | null;
  hasMoreEntries: boolean;
  entriesPage: number;
  
  // Stats
  stats: UserStats | null;
  statsLoading: boolean;
  
  // Privacy
  privacyBlur: boolean;
  
  // Settings update loading
  settingsUpdating: boolean;
  
  // Computed
  isLoading: boolean;
  
  // Actions
  fetchUser: () => Promise<void>;
  loadUser: () => Promise<void>; // Alias for fetchUser
  fetchEntries: (reset?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  addEntry: (entry: JournalEntry) => void;
  removeEntry: (id: string) => void;
  togglePrivacyBlur: () => void;
  updateSettings: (updates: Partial<UserSettings>) => Promise<boolean>;
  reset: () => void;
}

// Load privacy setting from localStorage
const getInitialPrivacyBlur = () => {
  try {
    return localStorage.getItem('privacyBlur') === 'true';
  } catch {
    return false;
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  user: null,
  userLoading: false,
  userError: null,
  
  entries: [],
  entriesLoading: false,
  entriesError: null,
  hasMoreEntries: true,
  entriesPage: 1,
  
  stats: null,
  statsLoading: false,
  
  privacyBlur: getInitialPrivacyBlur(),
  
  settingsUpdating: false,
  
  // isLoading is a computed alias
  isLoading: false,

  // Fetch current user
  fetchUser: async () => {
    set({ userLoading: true, userError: null });
    try {
      const user = await api.user.getCurrent();
      
      // Sync timezone only once per session to avoid redundant API calls
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const lastSyncedTimezone = sessionStorage.getItem('lastSyncedTimezone');
      
      if (user.settings?.timezone !== browserTimezone && lastSyncedTimezone !== browserTimezone) {
        await api.user.syncTimezone(browserTimezone).catch(() => {
          // Ignore timezone sync errors, will retry on next session
        });
        // Mark timezone as synced for this session
        sessionStorage.setItem('lastSyncedTimezone', browserTimezone);
      }
      
      set({ user, userLoading: false });
    } catch (error) {
      set({ 
        userError: error instanceof Error ? error.message : 'Failed to load user',
        userLoading: false 
      });
    }
  },
  
  // Alias for fetchUser
  loadUser: async () => {
    return get().fetchUser();
  },

  // Fetch entries (with pagination)
  fetchEntries: async (reset = false) => {
    const { entriesPage, entries, entriesLoading } = get();
    
    // Prevent concurrent requests
    if (entriesLoading) return;
    
    const page = reset ? 1 : entriesPage;
    
    set({ entriesLoading: true, entriesError: null });
    
    try {
      const response = await api.entries.getAll({ page, limit: 20 });
      
      // Deduplicate entries by id to prevent duplicates from race conditions
      const newEntries = reset 
        ? response.items 
        : [...entries, ...response.items].filter(
            (entry, index, self) => self.findIndex(e => e.id === entry.id) === index
          );
      
      set({
        entries: newEntries,
        entriesPage: page + 1,
        hasMoreEntries: response.hasMore,
        entriesLoading: false,
      });
    } catch (error) {
      set({
        entriesError: error instanceof Error ? error.message : 'Failed to load entries',
        entriesLoading: false,
      });
    }
  },

  // Fetch stats
  fetchStats: async () => {
    set({ statsLoading: true });
    try {
      const stats = await api.user.getStats();
      set({ stats, statsLoading: false });
    } catch {
      set({ statsLoading: false });
    }
  },

  // Add entry to list (optimistic update)
  addEntry: (entry: JournalEntry) => {
    set(state => ({
      entries: [entry, ...state.entries],
    }));
  },

  // Remove entry from list
  removeEntry: (id: string) => {
    set(state => ({
      entries: state.entries.filter(e => e.id !== id),
    }));
  },

  // Toggle privacy blur mode
  togglePrivacyBlur: () => {
    set(state => {
      const newValue = !state.privacyBlur;
      try {
        localStorage.setItem('privacyBlur', String(newValue));
      } catch {}
      return { privacyBlur: newValue };
    });
  },

  // Update user settings with optimistic update
  updateSettings: async (updates: Partial<UserSettings>) => {
    const { user } = get();
    if (!user?.settings) return false;
    
    // Optimistic update
    const previousSettings = { ...user.settings };
    set({
      user: {
        ...user,
        settings: { ...user.settings, ...updates },
      },
      settingsUpdating: true,
    });
    
    try {
      const updatedSettings = await updateUserSettings(updates);
      // Update with server response
      set(state => ({
        user: state.user ? {
          ...state.user,
          settings: updatedSettings,
        } : null,
        settingsUpdating: false,
      }));
      return true;
    } catch (error) {
      // Rollback on error
      set(state => ({
        user: state.user ? {
          ...state.user,
          settings: previousSettings,
        } : null,
        settingsUpdating: false,
      }));
      console.error('Failed to update settings:', error);
      return false;
    }
  },

  // Reset store
  reset: () => {
    set({
      user: null,
      userLoading: false,
      userError: null,
      entries: [],
      entriesLoading: false,
      entriesError: null,
      hasMoreEntries: true,
      entriesPage: 1,
      stats: null,
      statsLoading: false,
    });
  },
}));

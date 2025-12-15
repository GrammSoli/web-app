import { create } from 'zustand';
import type { User, JournalEntry, UserStats } from '@/types/api';
import { api } from '@/lib/api';

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
  
  // Computed
  isLoading: boolean;
  
  // Actions
  fetchUser: () => Promise<void>;
  loadUser: () => Promise<void>; // Alias for fetchUser
  fetchEntries: (reset?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  addEntry: (entry: JournalEntry) => void;
  removeEntry: (id: string) => void;
  reset: () => void;
}

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
  
  // isLoading is a computed alias
  isLoading: false,

  // Fetch current user
  fetchUser: async () => {
    set({ userLoading: true, userError: null });
    try {
      // Sync timezone first
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.user.syncTimezone(browserTimezone).catch(() => {
        // Ignore timezone sync errors
      });
      
      const user = await api.user.getCurrent();
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
    const { entriesPage, entries } = get();
    const page = reset ? 1 : entriesPage;
    
    set({ entriesLoading: true, entriesError: null });
    
    try {
      const response = await api.entries.getAll({ page, limit: 20 });
      
      set({
        entries: reset ? response.items : [...entries, ...response.items],
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

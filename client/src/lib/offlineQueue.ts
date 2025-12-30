/**
 * Offline Queue for Habit Tracker
 * 
 * Handles offline operations with:
 * - localStorage persistence
 * - Automatic retry with exponential backoff
 * - Sync on network restore
 * - Conflict resolution (last-write-wins for toggles)
 */

// ============================================
// TYPES
// ============================================

export interface QueuedOperation {
  id: string;
  type: 'habit_toggle';
  payload: {
    habitId: string;
    date: string;
    targetState: boolean; // What we want: completed=true or uncompleted=false
  };
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncError?: string;
}

type StateListener = (state: OfflineState) => void;

// ============================================
// CONSTANTS
// ============================================

const STORAGE_KEY = 'habit_offline_queue';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

// ============================================
// QUEUE IMPLEMENTATION
// ============================================

class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private listeners: Set<StateListener> = new Set();
  private isSyncing = false;
  private syncPromise: Promise<void> | null = null;
  private isOnline = navigator.onLine;
  private lastSyncError?: string;

  constructor() {
    this.loadFromStorage();
    this.setupNetworkListeners();
  }

  // ---- State Management ----

  private getState(): OfflineState {
    return {
      isOnline: this.isOnline,
      pendingCount: this.queue.length,
      isSyncing: this.isSyncing,
      lastSyncError: this.lastSyncError,
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  // ---- Persistence ----

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (e) {
      console.error('[OfflineQueue] Failed to load from storage:', e);
      this.queue = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error('[OfflineQueue] Failed to save to storage:', e);
    }
  }

  // ---- Network Listeners ----

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('[OfflineQueue] Network restored');
      this.isOnline = true;
      this.notifyListeners();
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineQueue] Network lost');
      this.isOnline = false;
      this.notifyListeners();
    });

    // Also check on visibility change (user returns to app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        this.isOnline = true;
        this.processQueue();
      }
    });
  }

  // ---- Queue Operations ----

  /**
   * Add or update a toggle operation in the queue
   * Uses deduplication: if same habit+date exists, update targetState
   */
  enqueue(operation: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount'>): void {
    const { habitId, date, targetState } = operation.payload;

    // Find existing operation for same habit+date
    const existingIndex = this.queue.findIndex(
      op => op.type === 'habit_toggle' && 
            op.payload.habitId === habitId && 
            op.payload.date === date
    );

    if (existingIndex !== -1) {
      // Update existing - if toggling back to original, remove from queue
      const existing = this.queue[existingIndex];
      if (existing.payload.targetState !== targetState) {
        // State changed again - remove from queue (back to original)
        this.queue.splice(existingIndex, 1);
        console.log('[OfflineQueue] Removed cancelled operation:', habitId, date);
      }
      // If same state, keep existing (no-op)
    } else {
      // Add new operation
      const newOp: QueuedOperation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: operation.type,
        payload: operation.payload,
        createdAt: Date.now(),
        retryCount: 0,
      };
      this.queue.push(newOp);
      console.log('[OfflineQueue] Enqueued:', newOp.type, habitId, date, '->', targetState);
    }

    this.saveToStorage();
    this.notifyListeners();

    // Try to process immediately if online
    if (this.isOnline) {
      this.processQueue();
    }
  }

  /**
   * Check if there's a pending operation for a habit+date
   * Returns the target state if pending, undefined otherwise
   */
  getPendingState(habitId: string, date: string): boolean | undefined {
    const op = this.queue.find(
      op => op.type === 'habit_toggle' &&
            op.payload.habitId === habitId &&
            op.payload.date === date
    );
    return op?.payload.targetState;
  }

  // ---- Processing ----

  /**
   * Process queue with exponential backoff
   */
  async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isSyncing) {
      return this.syncPromise || Promise.resolve();
    }

    if (this.queue.length === 0) {
      return;
    }

    if (!this.isOnline) {
      return;
    }

    this.isSyncing = true;
    this.lastSyncError = undefined;
    this.notifyListeners();

    this.syncPromise = this.doProcessQueue();
    await this.syncPromise;
    
    this.isSyncing = false;
    this.syncPromise = null;
    this.notifyListeners();
  }

  private async doProcessQueue(): Promise<void> {
    // Process operations in order (FIFO)
    while (this.queue.length > 0 && this.isOnline) {
      const operation = this.queue[0];

      try {
        await this.executeOperation(operation);
        
        // Success - remove from queue
        this.queue.shift();
        this.saveToStorage();
        this.notifyListeners();
        console.log('[OfflineQueue] Synced:', operation.type, operation.payload.habitId);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[OfflineQueue] Failed:', operation.type, errorMessage);

        operation.retryCount++;
        operation.lastError = errorMessage;

        if (operation.retryCount >= MAX_RETRIES) {
          // Max retries reached - remove and notify
          console.error('[OfflineQueue] Max retries reached, dropping:', operation.id);
          this.queue.shift();
          this.lastSyncError = `Не удалось синхронизировать: ${errorMessage}`;
        } else {
          // Wait with exponential backoff before retry
          const delay = Math.min(
            BASE_DELAY_MS * Math.pow(2, operation.retryCount - 1),
            MAX_DELAY_MS
          );
          console.log(`[OfflineQueue] Retry ${operation.retryCount}/${MAX_RETRIES} in ${delay}ms`);
          await this.sleep(delay);
        }

        this.saveToStorage();
        this.notifyListeners();
      }
    }
  }

  private async executeOperation(operation: QueuedOperation): Promise<void> {
    if (operation.type === 'habit_toggle') {
      const { habitId, date } = operation.payload;
      
      // Import dynamically to avoid circular dependency
      const { toggleHabitDirect } = await import('./api');
      await toggleHabitDirect(habitId, date);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---- Force Sync ----

  /**
   * Force immediate sync attempt (for pull-to-refresh)
   */
  async forceSync(): Promise<void> {
    this.isOnline = navigator.onLine;
    if (this.isOnline) {
      await this.processQueue();
    }
  }

  /**
   * Clear all pending operations (use with caution)
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
    this.notifyListeners();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const offlineQueue = new OfflineQueue();

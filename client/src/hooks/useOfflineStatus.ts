/**
 * useOfflineStatus - React hook for network status and offline queue
 * 
 * Provides:
 * - isOnline: current network status
 * - pendingCount: number of queued operations
 * - isSyncing: whether sync is in progress
 * - forceSync: manual sync trigger
 */

import { useState, useEffect, useCallback } from 'react';
import { offlineQueue, type OfflineState } from '@/lib/offlineQueue';

export interface OfflineStatus extends OfflineState {
  forceSync: () => Promise<void>;
  getPendingState: (habitId: string, date: string) => boolean | undefined;
}

export function useOfflineStatus(): OfflineStatus {
  const [state, setState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    pendingCount: 0,
    isSyncing: false,
  });

  useEffect(() => {
    // Subscribe to queue state changes
    const unsubscribe = offlineQueue.subscribe(setState);
    return unsubscribe;
  }, []);

  const forceSync = useCallback(async () => {
    await offlineQueue.forceSync();
  }, []);

  const getPendingState = useCallback((habitId: string, date: string) => {
    return offlineQueue.getPendingState(habitId, date);
  }, []);

  return {
    ...state,
    forceSync,
    getPendingState,
  };
}

export default useOfflineStatus;

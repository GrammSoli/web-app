import { useMemo, useCallback } from 'react';

/**
 * Hook для работы с Telegram WebApp API
 */
export function useTelegram() {
  const webApp = useMemo(() => {
    return window.Telegram?.WebApp;
  }, []);

  const user = useMemo(() => {
    return webApp?.initDataUnsafe?.user;
  }, [webApp]);

  const initData = useMemo(() => {
    return webApp?.initData || '';
  }, [webApp]);

  const colorScheme = useMemo(() => {
    return webApp?.colorScheme || 'light';
  }, [webApp]);

  const platform = useMemo(() => {
    return webApp?.platform || 'unknown';
  }, [webApp]);

  // Haptic feedback
  const haptic = useMemo(() => ({
    light: () => webApp?.HapticFeedback?.impactOccurred('light'),
    medium: () => webApp?.HapticFeedback?.impactOccurred('medium'),
    heavy: () => webApp?.HapticFeedback?.impactOccurred('heavy'),
    impact: () => webApp?.HapticFeedback?.impactOccurred('medium'), // Alias for medium
    success: () => webApp?.HapticFeedback?.notificationOccurred('success'),
    error: () => webApp?.HapticFeedback?.notificationOccurred('error'),
    warning: () => webApp?.HapticFeedback?.notificationOccurred('warning'),
    selection: () => webApp?.HapticFeedback?.selectionChanged(),
  }), [webApp]);

  // Show alert
  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      if (webApp?.showAlert) {
        webApp.showAlert(message, resolve);
      } else {
        alert(message);
        resolve();
      }
    });
  }, [webApp]);

  // Show confirm
  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (webApp?.showConfirm) {
        webApp.showConfirm(message, resolve);
      } else {
        resolve(confirm(message));
      }
    });
  }, [webApp]);

  // Open invoice (for payments)
  const openInvoice = useCallback((url: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> => {
    return new Promise((resolve) => {
      if (webApp?.openInvoice) {
        webApp.openInvoice(url, resolve);
      } else {
        resolve('failed');
      }
    });
  }, [webApp]);

  // Open external link
  const openLink = useCallback((url: string, options?: { try_instant_view?: boolean }) => {
    if (webApp?.openLink) {
      webApp.openLink(url, options);
    } else {
      window.open(url, '_blank');
    }
  }, [webApp]);

  // Open Telegram link (t.me links)
  const openTelegramLink = useCallback((url: string) => {
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }, [webApp]);

  // Main button helpers
  const mainButton = useMemo(() => ({
    show: (text: string, onClick: () => void) => {
      if (!webApp?.MainButton) return;
      webApp.MainButton.setText(text);
      webApp.MainButton.onClick(onClick);
      webApp.MainButton.show();
    },
    hide: () => {
      webApp?.MainButton?.hide();
    },
    showProgress: () => {
      webApp?.MainButton?.showProgress();
    },
    hideProgress: () => {
      webApp?.MainButton?.hideProgress();
    },
    enable: () => {
      webApp?.MainButton?.enable();
    },
    disable: () => {
      webApp?.MainButton?.disable();
    },
  }), [webApp]);

  return {
    webApp,
    user,
    initData,
    colorScheme,
    platform,
    haptic,
    showAlert,
    showConfirm,
    openInvoice,
    openLink,
    openTelegramLink,
    mainButton,
    isReady: !!webApp,
  };
}

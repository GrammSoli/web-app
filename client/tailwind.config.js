/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        // iOS-style backgrounds
        'ios-bg': '#F2F2F7',
        'ios-card': '#FFFFFF',
        'ios-dark-bg': '#1C1C1E',
        'ios-dark-card': '#2C2C2E',
        // Telegram theme colors
        'tg-bg': 'var(--tg-theme-bg-color, #ffffff)',
        'tg-text': 'var(--tg-theme-text-color, #000000)',
        'tg-hint': 'var(--tg-theme-hint-color, #999999)',
        'tg-link': 'var(--tg-theme-link-color, #2678b6)',
        'tg-button': 'var(--tg-theme-button-color, #2678b6)',
        'tg-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
      },
      // Mood colors
      backgroundColor: {
        'mood-1': '#ef4444',
        'mood-2': '#f97316',
        'mood-3': '#f59e0b',
        'mood-4': '#eab308',
        'mood-5': '#a3a3a3',
        'mood-6': '#84cc16',
        'mood-7': '#22c55e',
        'mood-8': '#10b981',
        'mood-9': '#06b6d4',
        'mood-10': '#8b5cf6',
      },
    },
  },
  plugins: [],
};

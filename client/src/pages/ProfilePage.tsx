import { useEffect, ReactNode, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gem, Bell, Download, MessageCircle, RefreshCw, ChevronRight, Star, Crown, Gift, User, Clock, Settings, Globe, Shield, X, Send, Target } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { exportData, getPublicConfig } from '@/lib/api';
import type { UserSettings } from '@/types/api';

// Bottom Sheet Component
function BottomSheet({ 
  isOpen, 
  onClose, 
  title, 
  icon,
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />
      {/* Sheet */}
      <div 
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out animate-slide-up safe-area-bottom"
        style={{ maxHeight: '80vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {icon} {title}
          </h3>
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Divider */}
        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-5" />
        {/* Content */}
        <div className="p-5 pb-10 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 100px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const tierIcons = {
  free: Gift,
  basic: Star,
  premium: Crown,
};

const tierConfig = {
  free: { name: 'Бесплатный', gradient: 'from-gray-400 to-gray-500' },
  basic: { name: 'Basic', gradient: 'from-blue-500 to-cyan-500' },
  premium: { name: 'Premium', gradient: 'from-purple-500 to-pink-500' },
};

// Profile page state management with useReducer
interface ProfileState {
  refreshing: boolean;
  exporting: boolean;
  showSettings: boolean;
  showReminders: boolean;
  showExport: boolean;
}

type ProfileAction =
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'TOGGLE_REMINDERS' }
  | { type: 'TOGGLE_EXPORT' };

function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.payload };
    case 'SET_EXPORTING':
      return { ...state, exporting: action.payload };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'TOGGLE_REMINDERS':
      return { ...state, showReminders: !state.showReminders };
    case 'TOGGLE_EXPORT':
      return { ...state, showExport: !state.showExport };
    default:
      return state;
  }
}

const initialProfileState: ProfileState = {
  refreshing: false,
  exporting: false,
  showSettings: false,
  showReminders: false,
  showExport: false,
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, haptic } = useTelegram();
  const { user: appUser, loadUser, userLoading, updateSettings, settingsUpdating } = useAppStore();
  const [state, dispatch] = useReducer(profileReducer, initialProfileState);
  const [supportLink, setSupportLink] = useState('https://t.me/mindful_support');

  const currentTier = (appUser?.subscriptionTier || 'free') as keyof typeof tierConfig;
  const tierInfo = tierConfig[currentTier];
  const TierIcon = tierIcons[currentTier];
  const isPaid = currentTier !== 'free';
  
  // Get settings from global store
  const settings = appUser?.settings;

  // Channel link state
  const [channelLink, setChannelLink] = useState('https://t.me/mindful_journal_channel');
  
  // Load public config on mount
  useEffect(() => {
    getPublicConfig().then(config => {
      setSupportLink(config.supportLink);
      setChannelLink(config.channelLink);
    });
  }, []);

  const handleRefresh = async () => {
    dispatch({ type: 'SET_REFRESHING', payload: true });
    haptic.impact();
    await loadUser();
    haptic.success();
    dispatch({ type: 'SET_REFRESHING', payload: false });
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (currentTier === 'free') {
      haptic.warning();
      navigate('/premium');
      return;
    }
    
    dispatch({ type: 'SET_EXPORTING', payload: true });
    haptic.impact();
    try {
      const blob = await exportData(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindful-journal-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      haptic.success();
    } catch (error) {
      console.error('Export failed:', error);
      haptic.warning();
    } finally {
      dispatch({ type: 'SET_EXPORTING', payload: false });
    }
  };

  const handleUpdateSetting = async (key: keyof UserSettings, value: unknown) => {
    if (!settings) return;
    
    haptic.light();
    const success = await updateSettings({ [key]: value });
    if (success) {
      haptic.success();
    } else {
      haptic.warning();
    }
  };

  const handleContactSupport = () => {
    haptic.light();
    window.Telegram?.WebApp?.openTelegramLink?.(supportLink) ||
    window.open(supportLink, '_blank');
  };

  return (
    <div className="fade-in min-h-screen">
      <div className="p-4 space-y-4 pt-6">
        
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/25 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          
          <div className="flex items-center gap-4 relative z-10">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/30 flex items-center justify-center text-3xl font-bold overflow-hidden">
              {user?.photo_url ? (
                <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.first_name?.[0] || <User className="w-8 h-8" />
              )}
            </div>
            
            <div className="flex-1">
              <h1 className="text-xl font-bold">
                {user?.first_name} {user?.last_name}
              </h1>
              {user?.username && (
                <p className="text-white/70 text-sm">@{user.username}</p>
              )}
              {/* Tier badge with expiry */}
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white/20 text-sm font-medium backdrop-blur-sm">
                <TierIcon className="w-4 h-4" />
                <span>{tierInfo.name}</span>
                {isPaid && appUser?.subscriptionExpiresAt && (
                  <>
                    <span className="text-white/50">•</span>
                    <span className="text-white/70">до {format(new Date(appUser.subscriptionExpiresAt), 'd MMM', { locale: ru })}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Stats */}
          {appUser && (
            <div className="grid grid-cols-3 gap-3 mt-6 relative z-10">
              <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold">{appUser.stats?.totalEntries || 0}</div>
                <div className="text-xs text-white/70">Записей</div>
              </div>
              <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold">{appUser.streakDays || 0}</div>
                <div className="text-xs text-white/70">Подряд</div>
              </div>
              <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold">{appUser.stats?.averageMood?.toFixed(1) || '—'}</div>
                <div className="text-xs text-white/70">Ср. оценка</div>
              </div>
            </div>
          )}
        </div>





        {/* Menu */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Admin-only: Habits Tracker */}
          {appUser?.isAdmin && (
            <MenuItem 
              icon={<Target className="w-6 h-6 text-indigo-500" />} 
              title="Трекер привычек" 
              subtitle="Бета-тестирование" 
              onClick={() => { haptic.light(); navigate('/habits'); }} 
            />
          )}
          <MenuItem icon={<Gem className="w-6 h-6 text-purple-500" />} title="Premium" subtitle="Открой все возможности" onClick={() => navigate('/premium')} />
          <MenuItem 
            icon={<Settings className="w-6 h-6 text-gray-500" />} 
            title="Настройки" 
            subtitle="Часовой пояс, приватность" 
            onClick={() => { haptic.light(); dispatch({ type: 'TOGGLE_SETTINGS' }); }} 
          />
          <MenuItem 
            icon={<Bell className="w-6 h-6 text-amber-500" />} 
            title="Напоминания" 
            subtitle={settings?.reminderEnabled ? `Ежедневно в ${settings.reminderTime || '20:00'}` : 'Выключены'} 
            onClick={() => { haptic.light(); dispatch({ type: 'TOGGLE_REMINDERS' }); }} 
          />
          <MenuItem 
            icon={<Download className="w-6 h-6 text-blue-500" />} 
            title="Экспорт данных" 
            subtitle={currentTier === 'free' ? 'Только Premium' : 'JSON или CSV'} 
            onClick={() => {
              if (currentTier === 'free') {
                haptic.warning();
                navigate('/premium');
              } else {
                haptic.light();
                dispatch({ type: 'TOGGLE_EXPORT' });
              }
            }} 
          />
          <MenuItem 
            icon={<Send className="w-6 h-6 text-indigo-500" />} 
            title="Канал" 
            subtitle="Новости и обновления" 
            onClick={() => {
              haptic.light();
              window.Telegram?.WebApp?.openTelegramLink(channelLink);
            }} 
          />
          <MenuItem 
            icon={<MessageCircle className="w-6 h-6 text-green-500" />} 
            title="Поддержка" 
            subtitle="Написать нам" 
            onClick={handleContactSupport} 
            last 
          />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleRefresh}
            disabled={userLoading || state.refreshing}
            className="w-full flex items-center justify-center gap-2 py-4 
                       bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700
                       active:bg-gray-50 dark:active:bg-gray-700 transition-colors font-semibold"
          >
            <RefreshCw className={`w-5 h-5 ${state.refreshing || userLoading ? 'animate-spin' : ''}`} />
            {state.refreshing || userLoading ? 'Обновление...' : 'Обновить статус'}
          </button>
        </div>

        {/* App Info */}
        <div className="text-center text-gray-400 text-xs pt-4">
          <p>AI Mindful Journal v1.0.0</p>
          <p className="mt-1">© 2024 Mindful Journal</p>
        </div>
      </div>

      {/* Settings Bottom Sheet */}
      <BottomSheet
        isOpen={state.showSettings}
        onClose={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
        title="Настройки"
        icon={<Settings className="w-5 h-5 text-gray-500" />}
      >
        {!settings ? (
          <div className="text-center text-gray-400 py-8">Загрузка...</div>
        ) : (
          <div className="space-y-6">
            {/* Timezone */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Globe className="w-4 h-4" /> Часовой пояс
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => handleUpdateSetting('timezone', e.target.value)}
                disabled={settingsUpdating}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-white bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="Europe/Moscow">Москва (UTC+3)</option>
                <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
                <option value="Europe/Samara">Самара (UTC+4)</option>
                <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
                <option value="Asia/Omsk">Омск (UTC+6)</option>
                <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
                <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
                <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
                <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
                <option value="Asia/Magadan">Магадан (UTC+11)</option>
                <option value="Asia/Kamchatka">Камчатка (UTC+12)</option>
                <option value="Europe/Kiev">Киев (UTC+2)</option>
                <option value="Europe/Minsk">Минск (UTC+3)</option>
                <option value="Asia/Almaty">Алматы (UTC+6)</option>
                <option value="Asia/Tashkent">Ташкент (UTC+5)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            {/* Privacy default */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Shield className="w-4 h-4" /> Приватность по умолчанию
                </label>
                <button
                  onClick={() => handleUpdateSetting('privacyBlurDefault', !settings.privacyBlurDefault)}
                  disabled={settingsUpdating}
                  role="switch"
                  aria-checked={settings.privacyBlurDefault}
                  aria-label="Приватность по умолчанию"
                  className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 disabled:opacity-50 ${
                    settings.privacyBlurDefault ? 'bg-indigo-500 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 bg-white rounded-full shadow-sm" />
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Записи будут скрыты при открытии приложения
              </p>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Reminders Bottom Sheet */}
      <BottomSheet
        isOpen={state.showReminders}
        onClose={() => dispatch({ type: 'TOGGLE_REMINDERS' })}
        title="Напоминания"
        icon={<Bell className="w-5 h-5 text-amber-500" />}
      >
        {!settings ? (
          <div className="text-center text-gray-400 py-8">Загрузка...</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800 dark:text-white">Ежедневное напоминание</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Получать уведомление каждый день</p>
              </div>
              <button
                onClick={() => handleUpdateSetting('reminderEnabled', !settings.reminderEnabled)}
                disabled={settingsUpdating}
                role="switch"
                aria-checked={settings.reminderEnabled}
                aria-label="Ежедневное напоминание"
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 disabled:opacity-50 ${
                  settings.reminderEnabled ? 'bg-indigo-500 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'
                }`}
              >
                <span className="w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>
            </div>
            
            {settings.reminderEnabled && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Время напоминания
                </label>
                <input
                  type="time"
                  value={settings.reminderTime || '20:00'}
                  onChange={(e) => handleUpdateSetting('reminderTime', e.target.value)}
                  disabled={settingsUpdating}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-white bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
                />
                <p className="text-xs text-gray-400">
                  Напоминание придёт в указанное время по вашему часовому поясу
                </p>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Export Bottom Sheet */}
      <BottomSheet
        isOpen={state.showExport}
        onClose={() => dispatch({ type: 'TOGGLE_EXPORT' })}
        title="Экспорт данных"
        icon={<Download className="w-5 h-5 text-blue-500" />}
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Выберите формат для экспорта всех ваших записей:
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { handleExport('json'); dispatch({ type: 'TOGGLE_EXPORT' }); }}
              disabled={state.exporting}
              className="w-full py-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-semibold active:bg-blue-100 dark:active:bg-blue-900/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {state.exporting ? 'Загрузка...' : 'Скачать JSON'}
            </button>
            <button
              onClick={() => { handleExport('csv'); dispatch({ type: 'TOGGLE_EXPORT' }); }}
              disabled={state.exporting}
              className="w-full py-4 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl font-semibold active:bg-green-100 dark:active:bg-green-900/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {state.exporting ? 'Загрузка...' : 'Скачать CSV'}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Файл будет автоматически скачан на ваше устройство
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

function MenuItem({ 
  icon, title, subtitle, onClick, disabled, last 
}: { 
  icon: ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean; last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-4 p-4 text-left active:bg-gray-50 dark:active:bg-gray-700 transition-colors
                  ${!last ? 'border-b border-gray-100 dark:border-gray-700' : ''} ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      <div className="flex-1">
        <div className="font-semibold text-sm text-gray-700 dark:text-gray-200">{title}</div>
        <div className="text-xs text-gray-400">{subtitle}</div>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600" />
    </button>
  );
}

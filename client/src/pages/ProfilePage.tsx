import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gem, Bell, Download, MessageCircle, RefreshCw, BarChart3, ChevronRight, Star, Crown, Gift, User, Clock, Settings, Globe, Shield, X } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { exportData, getUserSettings, updateUserSettings } from '@/lib/api';
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
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out animate-slide-up safe-area-bottom"
        style={{ maxHeight: '80vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {icon} {title}
          </h3>
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />
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

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, haptic } = useTelegram();
  const { user: appUser, loadUser, userLoading } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const currentTier = (appUser?.subscriptionTier || 'free') as keyof typeof tierConfig;
  const tierInfo = tierConfig[currentTier];
  const TierIcon = tierIcons[currentTier];
  const isPaid = currentTier !== 'free';

  // Load settings when any sheet opens
  useEffect(() => {
    if ((showSettings || showReminders) && !settings) {
      setSettingsLoading(true);
      getUserSettings()
        .then(setSettings)
        .catch(console.error)
        .finally(() => setSettingsLoading(false));
    }
  }, [showSettings, showReminders, settings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    haptic.impact();
    await loadUser();
    haptic.success();
    setRefreshing(false);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (currentTier === 'free') {
      haptic.warning();
      navigate('/premium');
      return;
    }
    
    setExporting(true);
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
      setExporting(false);
    }
  };

  const handleUpdateSetting = async (key: keyof UserSettings, value: unknown) => {
    if (!settings) return;
    
    haptic.light();
    try {
      const updated = await updateUserSettings({ [key]: value });
      setSettings(updated);
      haptic.success();
    } catch (error) {
      console.error('Failed to update setting:', error);
      haptic.warning();
    }
  };

  const handleContactSupport = () => {
    haptic.light();
    window.Telegram?.WebApp?.openTelegramLink?.('https://t.me/mindful_support') ||
    window.open('https://t.me/mindful_support', '_blank');
  };

  // Usage limits from server (fallback to defaults)
  const serverLimit = appUser?.limits?.dailyEntries;
  const defaultLimits: Record<string, { entries: number; label: string }> = {
    free: { entries: 3, label: '3' },
    basic: { entries: 20, label: '20' },
    premium: { entries: Infinity, label: '∞' },
  };
  const limit = serverLimit !== undefined && serverLimit !== null
    ? { entries: serverLimit === -1 ? Infinity : serverLimit, label: serverLimit === -1 ? '∞' : String(serverLimit) }
    : defaultLimits[currentTier];
  const usagePercent = limit.entries === Infinity 
    ? 0 
    : Math.min(((appUser?.stats?.todayEntries || 0) / limit.entries) * 100, 100);

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
              {/* Tier badge */}
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white/20 text-sm font-medium backdrop-blur-sm">
                <TierIcon className="w-4 h-4" />
                <span>{tierInfo.name}</span>
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
                <div className="flex justify-center">
                  <TierIcon className="w-6 h-6" />
                </div>
                <div className="text-xs text-white/70">Тариф</div>
              </div>
            </div>
          )}
        </div>

        {/* Subscription Expiry Card - for paid users */}
        {isPaid && appUser?.subscriptionExpiresAt && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br ${tierInfo.gradient}`}>
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700">Подписка активна до</p>
              <p className="text-lg font-bold text-gray-900">
                {format(new Date(appUser.subscriptionExpiresAt), 'd MMMM yyyy', { locale: ru })}
              </p>
            </div>
            <button 
              onClick={() => navigate('/premium')}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl"
            >
              Продлить
            </button>
          </div>
        )}

        {/* Usage Card */}
        {appUser && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-gray-700 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-500" /> Использование
              </span>
              {currentTier === 'premium' ? (
                <span className="text-sm text-purple-500 font-medium flex items-center gap-1">
                  <Crown className="w-4 h-4" />
                  Безлимит
                </span>
              ) : (
                <span className="text-sm text-gray-400">
                  {appUser.stats?.todayEntries || 0} / {limit.entries}
                </span>
              )}
            </div>
            {currentTier !== 'premium' && (
              <>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${tierInfo.gradient} transition-all`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Записей сегодня</p>
              </>
            )}
            {currentTier === 'premium' && (
              <p className="text-xs text-gray-400">
                У вас нет ограничений на количество записей
              </p>
            )}
          </div>
        )}

        {/* Menu */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <MenuItem icon={<Gem className="w-6 h-6 text-purple-500" />} title="Premium" subtitle="Открой все возможности" onClick={() => navigate('/premium')} />
          <MenuItem 
            icon={<Settings className="w-6 h-6 text-gray-500" />} 
            title="Настройки" 
            subtitle="Часовой пояс, приватность" 
            onClick={() => { haptic.light(); setShowSettings(true); }} 
          />
          <MenuItem 
            icon={<Bell className="w-6 h-6 text-amber-500" />} 
            title="Напоминания" 
            subtitle={settings?.reminderEnabled ? `Ежедневно в ${settings.reminderTime}` : 'Выключены'} 
            onClick={() => { haptic.light(); setShowReminders(true); }} 
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
                setShowExport(true);
              }
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
            disabled={userLoading || refreshing}
            className="w-full flex items-center justify-center gap-2 py-4 
                       bg-white text-gray-700 rounded-2xl shadow-sm border border-gray-100
                       active:bg-gray-50 transition-colors font-semibold"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing || userLoading ? 'animate-spin' : ''}`} />
            {refreshing || userLoading ? 'Обновление...' : 'Обновить статус'}
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
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Настройки"
        icon={<Settings className="w-5 h-5 text-gray-500" />}
      >
        {settingsLoading ? (
          <div className="text-center text-gray-400 py-8">Загрузка...</div>
        ) : settings && (
          <div className="space-y-6">
            {/* Timezone */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Globe className="w-4 h-4" /> Часовой пояс
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => handleUpdateSetting('timezone', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Shield className="w-4 h-4" /> Приватность по умолчанию
                </label>
                <button
                  onClick={() => handleUpdateSetting('privacyBlurDefault', !settings.privacyBlurDefault)}
                  className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                    settings.privacyBlurDefault ? 'bg-indigo-500 justify-end' : 'bg-gray-300 justify-start'
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
        isOpen={showReminders}
        onClose={() => setShowReminders(false)}
        title="Напоминания"
        icon={<Bell className="w-5 h-5 text-amber-500" />}
      >
        {settingsLoading ? (
          <div className="text-center text-gray-400 py-8">Загрузка...</div>
        ) : settings && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">Ежедневное напоминание</p>
                <p className="text-sm text-gray-500">Получать уведомление каждый день</p>
              </div>
              <button
                onClick={() => handleUpdateSetting('reminderEnabled', !settings.reminderEnabled)}
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${
                  settings.reminderEnabled ? 'bg-indigo-500 justify-end' : 'bg-gray-300 justify-start'
                }`}
              >
                <span className="w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>
            </div>
            
            {settings.reminderEnabled && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Время напоминания
                </label>
                <input
                  type="time"
                  value={settings.reminderTime || '20:00'}
                  onChange={(e) => handleUpdateSetting('reminderTime', e.target.value)}
                  className="px-4 py-3 border border-gray-200 rounded-xl text-gray-800 bg-gray-50 text-lg text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  style={{ width: 'calc(100% - 8px)' }}
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
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        title="Экспорт данных"
        icon={<Download className="w-5 h-5 text-blue-500" />}
      >
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Выберите формат для экспорта всех ваших записей:
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { handleExport('json'); setShowExport(false); }}
              disabled={exporting}
              className="w-full py-4 bg-blue-50 text-blue-600 rounded-xl font-semibold active:bg-blue-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {exporting ? 'Загрузка...' : 'Скачать JSON'}
            </button>
            <button
              onClick={() => { handleExport('csv'); setShowExport(false); }}
              disabled={exporting}
              className="w-full py-4 bg-green-50 text-green-600 rounded-xl font-semibold active:bg-green-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {exporting ? 'Загрузка...' : 'Скачать CSV'}
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
      className={`w-full flex items-center gap-4 p-4 text-left active:bg-gray-50 transition-colors
                  ${!last ? 'border-b border-gray-100' : ''} ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      <div className="flex-1">
        <div className="font-semibold text-sm text-gray-700">{title}</div>
        <div className="text-xs text-gray-400">{subtitle}</div>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </button>
  );
}

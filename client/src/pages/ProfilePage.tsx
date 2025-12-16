import { useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gem, Bell, Download, MessageCircle, RefreshCw, LogOut, BarChart3, ChevronRight, Star, Crown, Gift, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';

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

  const currentTier = (appUser?.subscriptionTier || 'free') as keyof typeof tierConfig;
  const tierInfo = tierConfig[currentTier];
  const TierIcon = tierIcons[currentTier];

  const handleRefresh = async () => {
    setRefreshing(true);
    haptic.impact();
    await loadUser();
    haptic.success();
    setRefreshing(false);
  };

  const handleLogout = () => {
    haptic.warning();
    localStorage.clear();
    window.location.reload();
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
                <div className="text-2xl font-bold">{appUser.totalEntries || 0}</div>
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
          <MenuItem icon={<Bell className="w-6 h-6 text-amber-500" />} title="Уведомления" subtitle="Настроить напоминания" onClick={() => haptic.impact()} />
          <MenuItem icon={<Download className="w-6 h-6 text-blue-500" />} title="Экспорт данных" subtitle="Скачать записи" onClick={() => haptic.impact()} disabled={currentTier === 'free'} />
          <MenuItem icon={<MessageCircle className="w-6 h-6 text-green-500" />} title="Поддержка" subtitle="Написать нам" onClick={() => window.open('https://t.me/mindful_support', '_blank')} last />
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

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-4 
                       bg-red-50 text-red-500 rounded-2xl border border-red-100
                       active:bg-red-100 transition-colors font-semibold"
          >
            <LogOut className="w-5 h-5" /> Выйти
          </button>
        </div>

        {/* App Info */}
        <div className="text-center text-gray-400 text-xs pt-4">
          <p>AI Mindful Journal v1.0.0</p>
          <p className="mt-1">© 2024 Mindful Journal</p>
        </div>
      </div>
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

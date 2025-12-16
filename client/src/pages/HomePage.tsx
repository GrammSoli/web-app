import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Flame, FileText, Smile, CalendarDays, BookOpen, User, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTelegram } from '@/hooks/useTelegram';
import EntryCard from '@/components/EntryCard';
import { QUICK_MOOD_OPTIONS } from '@/config/moods';

export default function HomePage() {
  const navigate = useNavigate();
  const { user, haptic } = useTelegram();
  const { 
    entries, 
    entriesLoading, 
    entriesError,
    userError,
    hasMoreEntries,
    stats,
    privacyBlur,
    fetchEntries, 
    fetchStats,
    fetchUser,
    togglePrivacyBlur
  } = useAppStore();

  useEffect(() => {
    fetchUser();
    fetchEntries(true);
    fetchStats();
  }, [fetchUser, fetchEntries, fetchStats]);

  const loadMore = () => {
    if (!entriesLoading && hasMoreEntries) {
      fetchEntries(false);
    }
  };

  const handleQuickMood = (mood: typeof QUICK_MOOD_OPTIONS[0]) => {
    navigate('/new', { state: { mood: { emoji: mood.emoji, score: mood.score, label: mood.label } } });
  };

  const handleToggleBlur = () => {
    haptic.light();
    togglePrivacyBlur();
  };

  const today = format(new Date(), "EEEE, d MMM", { locale: ru });
  const capitalizedDate = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div className="fade-in min-h-screen">
      {/* Content Container */}
      <div className="p-4 space-y-4 pt-6">
        
        {/* Header with date and avatar */}
        <div className="flex justify-between items-end px-1">
          <div>
            <p className="text-gray-400 dark:text-gray-500 text-xs uppercase font-bold tracking-wider">
              {capitalizedDate}
            </p>
            <h1 className="text-3xl font-extrabold text-gray-800 dark:text-white">
              Привет, {user?.first_name || 'друг'}!
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Privacy toggle */}
            <button
              onClick={handleToggleBlur}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${privacyBlur 
                  ? 'bg-indigo-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
            >
              {privacyBlur ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            
            {/* Profile avatar */}
            <button 
              onClick={() => navigate('/profile')}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 
                         overflow-hidden border-2 border-white shadow-lg flex items-center justify-center text-white text-lg font-bold"
            >
              {user?.first_name?.[0] || <User className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Main Mood Card - Gradient with blur effect */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/25 relative overflow-hidden">
          {/* Decorative blur circles */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-8 -mb-8 blur-xl" />
          
          <h3 className="text-lg font-semibold opacity-90 relative z-10">Как настроение?</h3>
          
          <div className="flex justify-between mt-5 relative z-10">
            {QUICK_MOOD_OPTIONS.map((mood) => (
              <button 
                key={mood.score}
                onClick={() => handleQuickMood(mood)}
                className="text-3xl hover:scale-110 active:scale-95 transition-all duration-200 
                           bg-white/20 w-14 h-14 rounded-2xl flex items-center justify-center 
                           backdrop-blur-sm border border-white/20 shadow-inner"
              >
                {mood.emoji}
              </button>
            ))}
          </div>
          
          <p className="text-white/60 text-xs mt-4 text-center relative z-10">
            Нажми на эмодзи чтобы записать
          </p>
        </div>

        {/* Bento Grid - Stats */}
        <div className="grid grid-cols-2 gap-3">
          {/* Streak Card */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <span className="bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0">
              <Flame className="w-6 h-6 text-orange-500" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats?.currentStreak || 0}</p>
              <p className="text-gray-400 text-xs">Дней подряд</p>
            </div>
          </div>
          
          {/* Entries Count Card */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <span className="bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0">
              <FileText className="w-6 h-6 text-blue-500" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats?.totalEntries || 0}</p>
              <p className="text-gray-400 text-xs">Всего записей</p>
            </div>
          </div>
          
          {/* Average Mood Card */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <span className="bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0">
              <Smile className="w-6 h-6 text-green-500" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {stats?.averageMood ? stats.averageMood.toFixed(1) : '—'}
              </p>
              <p className="text-gray-400 text-xs">Ср. настроение</p>
            </div>
          </div>
          
          {/* Today Card */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <span className="bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0">
              <CalendarDays className="w-6 h-6 text-purple-500" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats?.todayEntries || 0}</p>
              <p className="text-gray-400 text-xs">Сегодня</p>
            </div>
          </div>
        </div>

        {/* Recent Entries Section */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-3 px-1">
            <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200">Последние записи</h2>
            {entries && entries.length > 0 && (
              <button 
                onClick={() => navigate('/entries')}
                className="text-blue-500 text-sm font-medium"
              >
                Все записи →
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {(userError || entriesError) ? (
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-red-100 dark:border-red-900/50 text-center">
                <div className="mb-4 flex justify-center">
                  <AlertCircle className="w-16 h-16 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
                  Что-то пошло не так
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  {userError || entriesError}
                </p>
                <button
                  onClick={() => {
                    fetchUser();
                    fetchEntries(true);
                    fetchStats();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  Попробовать снова
                </button>
              </div>
            ) : entries && entries.length === 0 && !entriesLoading ? (
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="mb-4 flex justify-center">
                  <BookOpen className="w-16 h-16 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
                  Пока тишина...
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Самое время записать первую мысль.<br/>
                  Нажми на эмодзи сверху!
                </p>
              </div>
            ) : (
              (entries || []).slice(0, 5).map((entry) => (
                <div 
                  key={entry.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  <EntryCard 
                    entry={entry}
                    onClick={() => navigate(`/entry/${entry.id}`)}
                  />
                </div>
              ))
            )}

            {/* Load more */}
            {hasMoreEntries && entries && entries.length > 5 && (
              <div className="py-2 flex justify-center">
                {entriesLoading ? (
                  <Preloader />
                ) : (
                  <button
                    onClick={loadMore}
                    className="text-blue-500 font-medium px-6 py-2.5 rounded-full 
                               bg-blue-50 dark:bg-blue-900/30 active:bg-blue-100 dark:active:bg-blue-900/50 transition-colors"
                  >
                    Загрузить ещё
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Initial loading */}
        {entriesLoading && (!entries || entries.length === 0) && (
          <div className="flex justify-center py-12">
            <Preloader />
          </div>
        )}
      </div>
    </div>
  );
}

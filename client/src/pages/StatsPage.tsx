import { useEffect, useState, useMemo, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { 
  XAxis, 
  YAxis, 
  ResponsiveContainer,
  Area,
  AreaChart,
  Tooltip
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FileText, Smile, Flame, Trophy, TrendingUp, TrendingDown, ArrowRight, BarChart3, Mic, Crown, Tag, Calendar } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTelegram } from '@/hooks/useTelegram';

type ChartPeriod = 'week' | 'month';

export default function StatsPage() {
  const navigate = useNavigate();
  const { haptic } = useTelegram();
  const { stats, statsLoading, fetchStats, user } = useAppStore();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('week');

  const isFree = !user || user.subscriptionTier === 'free';

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (statsLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Preloader />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="mb-4 flex justify-center">
            <BarChart3 className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-400">Не удалось загрузить статистику</p>
        </div>
      </div>
    );
  }

  // Prepare chart data based on selected period (memoized)
  const chartData = useMemo(() => {
    const rawData = chartPeriod === 'week' ? stats.weeklyMoods : (stats.monthlyMoods || stats.weeklyMoods);
    
    const dayShort: Record<number, string> = {
      0: 'ВС', 1: 'ПН', 2: 'ВТ', 3: 'СР', 4: 'ЧТ', 5: 'ПТ', 6: 'СБ'
    };
    
    const data = (rawData || []).map((item) => {
      const d = new Date(item.date);
      return {
        date: chartPeriod === 'week' ? dayShort[d.getDay()] : format(d, 'd', { locale: ru }),
        score: item.score,
        fullDate: format(d, 'd MMM', { locale: ru }),
      };
    });

    // Fill missing days if needed
    const today = new Date();
    const targetLength = chartPeriod === 'week' ? 7 : 30;
    while (data.length < targetLength) {
      const dayIndex = targetLength - data.length;
      const d = subDays(today, dayIndex);
      data.unshift({
        date: chartPeriod === 'week' ? dayShort[d.getDay()] : format(d, 'd', { locale: ru }),
        score: 0,
        fullDate: format(d, 'd MMM', { locale: ru }),
      });
    }
    
    return data;
  }, [stats.weeklyMoods, stats.monthlyMoods, chartPeriod]);

  const handlePeriodChange = (period: ChartPeriod) => {
    haptic.light();
    setChartPeriod(period);
  };

  return (
    <div className="fade-in min-h-screen relative">
      <div className={`p-4 space-y-4 pt-6 ${isFree ? 'blur-[6px] pointer-events-none select-none' : ''}`}>
        
        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl font-extrabold text-gray-800 dark:text-white">Статистика</h1>
          <p className="text-gray-400 text-sm mt-1">Отслеживай своё настроение</p>
        </div>

        {/* Bento Grid - Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <BentoCard
            value={stats.totalEntries}
            label="Всего записей"
            icon={<FileText className="w-6 h-6 text-blue-500" />}
            iconBg="from-blue-100 to-indigo-100"
          />
          <BentoCard
            value={stats.averageMood.toFixed(1)}
            label="Среднее настроение"
            icon={<Smile className="w-6 h-6 text-green-500" />}
            iconBg="from-green-100 to-emerald-100"
          />
          <BentoCard
            value={stats.currentStreak}
            label="Текущая серия"
            icon={<Flame className="w-6 h-6 text-orange-500" />}
            suffix=" дн."
            iconBg="from-orange-100 to-red-100"
          />
          <BentoCard
            value={stats.longestStreak}
            label="Лучшая серия"
            icon={<Trophy className="w-6 h-6 text-purple-500" />}
            suffix=" дн."
            iconBg="from-purple-100 to-pink-100"
          />
        </div>

        {/* Mood Chart - Wide Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Настроение
            </h2>
            {/* Period Switcher */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              <button
                onClick={() => handlePeriodChange('week')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  chartPeriod === 'week' 
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                Неделя
              </button>
              <button
                onClick={() => handlePeriodChange('month')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  chartPeriod === 'month' 
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                Месяц
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval={chartPeriod === 'month' ? 6 : 0}
              />
              <YAxis 
                domain={[0, 10]} 
                hide 
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-gray-900 text-white rounded-xl px-3 py-2 shadow-lg">
                        <p className="text-xs opacity-70">{data.fullDate}</p>
                        <p className="font-bold">{data.score > 0 ? `${data.score}/10` : '—'}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#moodGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Card with Comparison */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-5 text-white shadow-xl shadow-indigo-500/25 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              {stats.moodTrend === 'up' && <TrendingUp className="w-8 h-8 text-white" />}
              {stats.moodTrend === 'down' && <TrendingDown className="w-8 h-8 text-white" />}
              {stats.moodTrend === 'stable' && <ArrowRight className="w-8 h-8 text-white" />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg flex items-center gap-2">
                {stats.moodTrend === 'up' && 'Настроение улучшается'}
                {stats.moodTrend === 'down' && 'Настроение снижается'}
                {stats.moodTrend === 'stable' && 'Стабильное настроение'}
                {stats.trendPercentage !== undefined && stats.trendPercentage !== 0 && (
                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                    stats.trendPercentage > 0 ? 'bg-green-400/30' : 'bg-red-400/30'
                  }`}>
                    {stats.trendPercentage > 0 ? '+' : ''}{stats.trendPercentage}%
                  </span>
                )}
              </div>
              <p className="text-sm text-white/80 mt-1">
                {stats.moodTrend === 'up' && 'По сравнению с прошлой неделей 💪'}
                {stats.moodTrend === 'down' && 'Уделяй время тому, что радует'}
                {stats.moodTrend === 'stable' && 'Постоянство — это тоже хорошо!'}
              </p>
            </div>
          </div>
        </div>

        {/* Top Tags */}
        <div className="bg-white dark:bg-gray-800/50 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/50 relative overflow-hidden">
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-500" />
            Частые теги
          </h2>
          
          <div className="flex flex-wrap gap-2">
            {(stats.topTags || []).slice(0, 8).map((item) => (
              <span
                key={item.tag}
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50
                           dark:from-blue-900/30 dark:to-indigo-900/30
                           text-blue-600 dark:text-blue-400 text-sm font-medium border border-blue-100 dark:border-blue-800/50 shadow-sm"
              >
                #{item.tag} <span className="text-blue-400 dark:text-blue-500 text-xs">({item.count})</span>
              </span>
            ))}
            {(!stats.topTags || stats.topTags.length === 0) && (
              <p className="text-gray-400 text-sm">Пока нет тегов</p>
            )}
          </div>
        </div>

        {/* Daily Limits */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            Лимиты на сегодня
          </h2>
          <div className="space-y-4">
            <LimitBar
              label="Записи"
              current={stats.todayEntries}
              max={stats.dailyLimit}
              icon={<FileText className="w-4 h-4 text-gray-500" />}
            />
            <LimitBar
              label="Голосовые"
              current={stats.todayVoice}
              max={stats.voiceLimit}
              icon={<Mic className="w-4 h-4 text-gray-500" />}
              suffix=" мин"
            />
          </div>
        </div>
      </div>

      {/* Premium CTA Overlay for Free users */}
      {isFree && (
        <div 
          className="absolute inset-0 flex items-center justify-center z-10"
          onClick={() => { haptic.light(); navigate('/premium'); }}
        >
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border border-purple-100 dark:border-purple-900/50 text-center max-w-xs mx-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Статистика Premium</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Графики настроения, тренды, серии и топ теги доступны с подпиской
            </p>
            <button className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2">
              <Crown className="w-5 h-5" />
              Открыть Premium
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Bento Card Component
function BentoCard({ 
  value, 
  label, 
  icon, 
  suffix = '',
  iconBg = 'from-blue-100 to-indigo-100'
}: { 
  value: string | number; 
  label: string; 
  icon: ReactNode;
  suffix?: string;
  iconBg?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
      <span className={`bg-gradient-to-br ${iconBg} dark:opacity-80 w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0`}>
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}{suffix}</p>
        <p className="text-gray-400 text-xs">{label}</p>
      </div>
    </div>
  );
}

// Limit Bar Component
function LimitBar({ 
  label, 
  current, 
  max,
  icon,
  suffix = ''
}: { 
  label: string; 
  current: number; 
  max: number | null;
  icon: ReactNode;
  suffix?: string;
}) {
  const isUnlimited = max === null || max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</span>
        </div>
        {isUnlimited ? (
          <span className="text-sm font-medium text-purple-500 flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" />
            Безлимит
          </span>
        ) : (
          <span className={`text-sm font-bold ${isNearLimit ? 'text-orange-500' : 'text-gray-500'}`}>
            {current}{suffix} / {max}{suffix}
          </span>
        )}
      </div>
      {!isUnlimited && (
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              isNearLimit 
                ? 'bg-gradient-to-r from-orange-400 to-red-500' 
                : 'bg-gradient-to-r from-blue-400 to-indigo-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

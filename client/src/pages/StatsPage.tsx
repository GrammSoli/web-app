import { useEffect, ReactNode } from 'react';
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
import { FileText, Smile, Flame, Trophy, TrendingUp, TrendingDown, ArrowRight, BarChart3, Mic } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export default function StatsPage() {
  const { stats, statsLoading, fetchStats } = useAppStore();

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
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
          <div className="mb-4 flex justify-center">
            <BarChart3 className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-400">Не удалось загрузить статистику</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = stats.weeklyMoods.map((item) => ({
    date: format(new Date(item.date), 'EEE', { locale: ru }),
    score: item.score,
    fullDate: format(new Date(item.date), 'd MMM', { locale: ru }),
  }));

  // Fill missing days if needed
  const today = new Date();
  while (chartData.length < 7) {
    const dayIndex = 7 - chartData.length;
    chartData.unshift({
      date: format(subDays(today, dayIndex), 'EEE', { locale: ru }),
      score: 0,
      fullDate: format(subDays(today, dayIndex), 'd MMM', { locale: ru }),
    });
  }

  return (
    <div className="fade-in min-h-screen">
      <div className="p-4 space-y-4 pt-6">
        
        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl font-extrabold text-gray-800">Статистика</h1>
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
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Настроение за неделю
          </h2>
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
                tick={{ fill: '#9ca3af', fontSize: 11 }}
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
                        <p className="font-bold">{data.score}/10</p>
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
                strokeWidth={3}
                fill="url(#moodGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Card */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-5 text-white shadow-xl shadow-indigo-500/25 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              {stats.moodTrend === 'up' && <TrendingUp className="w-8 h-8 text-white" />}
              {stats.moodTrend === 'down' && <TrendingDown className="w-8 h-8 text-white" />}
              {stats.moodTrend === 'stable' && <ArrowRight className="w-8 h-8 text-white" />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg">
                {stats.moodTrend === 'up' && 'Настроение улучшается'}
                {stats.moodTrend === 'down' && 'Настроение снижается'}
                {stats.moodTrend === 'stable' && 'Стабильное настроение'}
              </div>
              <p className="text-sm text-white/80 mt-1">
                {stats.moodTrend === 'up' && 'Отличная динамика! Продолжай 💪'}
                {stats.moodTrend === 'down' && 'Уделяй время тому, что радует'}
                {stats.moodTrend === 'stable' && 'Постоянство — это тоже хорошо!'}
              </p>
            </div>
          </div>
        </div>

        {/* Daily Limits */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-500" />
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
            />
          </div>
        </div>
      </div>
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
    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-3">
      <span className={`bg-gradient-to-br ${iconBg} w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0`}>
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}{suffix}</p>
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
  icon
}: { 
  label: string; 
  current: number; 
  max: number | null;
  icon: ReactNode;
}) {
  const isUnlimited = max === null || max === -1;
  const percentage = isUnlimited ? 100 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </div>
        <span className={`text-sm font-bold ${isNearLimit ? 'text-orange-500' : 'text-gray-500'}`}>
          {current} / {isUnlimited ? '∞' : max}
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            isNearLimit 
              ? 'bg-gradient-to-r from-orange-400 to-red-500' 
              : 'bg-gradient-to-r from-blue-400 to-indigo-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

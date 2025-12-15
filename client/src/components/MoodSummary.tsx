import { TrendingUp, TrendingDown, ArrowRight, Flame } from 'lucide-react';
import type { UserStats } from '@/types/api';

interface MoodSummaryProps {
  stats: UserStats;
}

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: ArrowRight,
};

export default function MoodSummary({ stats }: MoodSummaryProps) {
  const trendConfig = {
    up: { text: 'Улучшается', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    down: { text: 'Снижается', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    stable: { text: 'Стабильно', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  }[stats.moodTrend];
  
  const TrendIcon = trendIcons[stats.moodTrend];

  return (
    <div className="p-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Today's entries */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.todayEntries}
            {stats.dailyLimit && (
              <span className="text-sm text-[#8E8E93] font-normal">/{stats.dailyLimit}</span>
            )}
          </div>
          <div className="text-xs text-[#8E8E93] mt-0.5">
            Сегодня
          </div>
        </div>

        {/* Average mood */}
        <div className="text-center border-x border-gray-100 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.averageMood.toFixed(1)}
          </div>
          <div className="text-xs text-[#8E8E93] mt-0.5">
            Ср. настроение
          </div>
        </div>

        {/* Streak */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-1">
            <Flame className="w-5 h-5 text-orange-500" />{stats.currentStreak}
          </div>
          <div className="text-xs text-[#8E8E93] mt-0.5">
            Подряд
          </div>
        </div>
      </div>

      {/* Trend Bar */}
      <div className={`${trendConfig.bg} rounded-2xl p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <TrendIcon className={`w-5 h-5 ${trendConfig.color}`} />
          <div>
            <div className={`text-sm font-semibold ${trendConfig.color}`}>{trendConfig.text}</div>
            <div className="text-xs text-[#8E8E93]">За неделю</div>
          </div>
        </div>
        
        {/* Mini chart */}
        <div className="flex items-end gap-1 h-8">
          {stats.weeklyMoods.slice(-7).map((day, i) => (
            <div
              key={i}
              className="w-2.5 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full transition-all"
              style={{ 
                height: `${Math.max((day.score / 10) * 100, 10)}%`,
                opacity: 0.5 + (i / 12)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

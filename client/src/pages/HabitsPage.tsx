/**
 * HabitsPage - Habit Tracker
 * 
 * Features:
 * - Week strip calendar
 * - Daily progress ring
 * - Habit cards with streaks
 * - Haptic feedback
 * - Confetti on all habits completed
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, subDays, isToday, isSameDay, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, Flame, Check, ChevronLeft, ChevronRight, X, Clock, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTelegram } from '@/hooks/useTelegram';
import { api } from '@/lib/api';
import type { Habit, HabitsResponse, CreateHabitInput } from '@/types/api';
import confetti from 'canvas-confetti';

// ============================================
// COMPONENTS
// ============================================

// Week Strip Calendar
function WeekStrip({ 
  selectedDate, 
  onSelectDate, 
  completionDots 
}: { 
  selectedDate: Date; 
  onSelectDate: (date: Date) => void;
  completionDots: Record<string, number>; // date -> count
}) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 1 }); // Monday
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const goToPrevWeek = () => setWeekStart(subDays(weekStart, 7));
  const goToNextWeek = () => setWeekStart(addDays(weekStart, 7));

  return (
    <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl p-4 shadow-sm">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button 
          onClick={goToPrevWeek}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {format(weekStart, 'MMMM yyyy', { locale: ru })}
        </span>
        <button 
          onClick={goToNextWeek}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Days */}
      <div className="flex justify-between gap-1">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const dotCount = completionDots[dateStr] || 0;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(day)}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                isSelected 
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-105' 
                  : isTodayDate 
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
              }`}
            >
              <span className={`text-[10px] uppercase ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                {format(day, 'EEE', { locale: ru })}
              </span>
              <span className={`text-lg font-semibold ${isSelected ? '' : 'text-gray-800 dark:text-white'}`}>
                {format(day, 'd')}
              </span>
              {/* Completion dots */}
              <div className="flex gap-0.5 mt-1 h-1.5">
                {dotCount > 0 && Array.from({ length: Math.min(dotCount, 4) }).map((_, i) => (
                  <div 
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white/60' : 'bg-green-400'
                    }`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Daily Progress Ring
function ProgressRing({ 
  completed, 
  total 
}: { 
  completed: number; 
  total: number;
}) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const motivationalPhrases = [
    "Маленькие шаги ведут к большим переменам",
    "Каждый день — новая возможность",
    "Привычки формируют характер",
    "Ты на правильном пути!",
    "Постоянство — ключ к успеху",
  ];

  const phrase = total === 0 
    ? "Добавь свою первую привычку!" 
    : completed === total && total > 0
      ? "🎉 Все выполнено! Отличная работа!"
      : motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];

  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 shadow-lg shadow-indigo-500/20">
      <div className="flex items-center gap-6">
        {/* Ring */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-24 h-24 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="6"
            />
            {/* Progress circle */}
            <circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <span className="text-2xl font-bold">{completed}</span>
            <span className="text-xs opacity-80">из {total}</span>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 text-white">
          <h3 className="text-lg font-semibold mb-1">Прогресс дня</h3>
          <p className="text-sm opacity-90 leading-snug">{phrase}</p>
        </div>
      </div>
    </div>
  );
}

// Habit Card
function HabitCard({ 
  habit, 
  onToggle, 
  onDelete,
  isTogglingId,
}: { 
  habit: Habit; 
  onToggle: () => void;
  onDelete: () => void;
  isTogglingId: string | null;
}) {
  const { haptic } = useTelegram();
  const isToggling = isTogglingId === habit.id;

  const handleToggle = () => {
    haptic.medium();
    onToggle();
  };

  return (
    <div 
      className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm transition-all duration-200 ${
        habit.completedToday ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Emoji Icon */}
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: `${habit.color}20` }}
        >
          {habit.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold text-gray-900 dark:text-white truncate ${
            habit.completedToday ? 'line-through text-gray-400' : ''
          }`}>
            {habit.name}
          </h4>
          <div className="flex items-center gap-3 mt-1">
            {/* Streak */}
            {habit.currentStreak > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-medium">{habit.currentStreak}</span>
              </div>
            )}
            {/* Reminder time */}
            {habit.reminderTime && (
              <div className="flex items-center gap-1 text-gray-400">
                <Clock className="w-3 h-3" />
                <span className="text-xs">{habit.reminderTime}</span>
              </div>
            )}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>

        {/* Checkbox */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-90 ${
            habit.completedToday 
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
          } ${isToggling ? 'animate-pulse' : ''}`}
          style={habit.completedToday ? {} : { borderColor: habit.color, borderWidth: 2 }}
        >
          {habit.completedToday ? (
            <Check className="w-6 h-6" />
          ) : (
            <div className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}

// New Habit Modal
function NewHabitModal({ 
  isOpen, 
  onClose, 
  onCreate 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onCreate: (data: CreateHabitInput) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [color, setColor] = useState('#6366f1');
  const [frequency, setFrequency] = useState<'daily' | 'weekdays' | 'weekends'>('daily');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];
  const emojis = ['✨', '💪', '📚', '🧘', '💧', '🏃', '🎯', '💤', '🥗', '🧠', '🎨', '🎵'];

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate({ name, emoji, color, frequency });
      setName('');
      setEmoji('✨');
      setColor('#6366f1');
      setFrequency('daily');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-3xl p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Новая привычка</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Медитация"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              maxLength={100}
            />
          </div>

          {/* Emoji */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Иконка
            </label>
            <div className="flex flex-wrap gap-2">
              {emojis.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                    emoji === e 
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 ring-2 ring-indigo-500' 
                      : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Цвет
            </label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-10 h-10 rounded-xl transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Регулярность
            </label>
            <div className="flex gap-2">
              {[
                { value: 'daily', label: 'Каждый день' },
                { value: 'weekdays', label: 'По будням' },
                { value: 'weekends', label: 'Выходные' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFrequency(opt.value as 'daily' | 'weekdays' | 'weekends')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                    frequency === opt.value
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="w-full py-4 rounded-xl bg-indigo-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 transition-colors"
          >
            {isSubmitting ? 'Создание...' : 'Создать привычку'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Skeleton loading
function HabitCardSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-zinc-800" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 dark:bg-zinc-800 rounded w-32 mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-800 rounded w-20" />
        </div>
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function HabitsPage() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const { haptic } = useTelegram();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState({ totalHabits: 0, completedToday: 0, maxHabits: 6, canCreateMore: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin-only check
  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/');
    }
  }, [user, navigate]);

  // Fetch habits
  const fetchHabits = useCallback(async () => {
    try {
      setError(null);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response: HabitsResponse = await api.habits.getAll(dateStr);
      setHabits(response.habits);
      setStats(response.stats);
    } catch (err) {
      console.error('Failed to fetch habits:', err);
      setError('Не удалось загрузить привычки');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  // Calculate completion dots for week strip
  const completionDots = habits.reduce((acc, habit) => {
    habit.completedDates.forEach(date => {
      acc[date] = (acc[date] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Toggle habit
  const handleToggle = async (habitId: string) => {
    setIsTogglingId(habitId);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await api.habits.toggle(habitId, dateStr);
      
      // Update local state
      setHabits(prev => prev.map(h => 
        h.id === habitId 
          ? { 
              ...h, 
              completedToday: response.completed,
              currentStreak: response.currentStreak,
              longestStreak: response.longestStreak,
              totalCompletions: response.totalCompletions,
              completedDates: response.completed 
                ? [...h.completedDates, dateStr]
                : h.completedDates.filter(d => d !== dateStr),
            }
          : h
      ));

      setStats(prev => ({
        ...prev,
        completedToday: response.completed 
          ? prev.completedToday + 1 
          : prev.completedToday - 1,
      }));

      // Confetti if all completed!
      if (response.allCompleted) {
        haptic.success();
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err) {
      console.error('Failed to toggle habit:', err);
    } finally {
      setIsTogglingId(null);
    }
  };

  // Create habit
  const handleCreate = async (data: CreateHabitInput) => {
    try {
      const newHabit = await api.habits.create(data);
      setHabits(prev => [...prev, newHabit]);
      setStats(prev => ({
        ...prev,
        totalHabits: prev.totalHabits + 1,
        canCreateMore: prev.totalHabits + 1 < prev.maxHabits,
      }));
      haptic.success();
    } catch (err: unknown) {
      const error = err as { limit?: number };
      if (error.limit) {
        alert(`Достигнут лимит: максимум ${error.limit} привычек`);
      }
      throw err;
    }
  };

  // Delete habit
  const handleDelete = async (habitId: string) => {
    if (window.Telegram?.WebApp?.showConfirm) {
      window.Telegram.WebApp.showConfirm('Удалить эту привычку?', async (confirmed) => {
        if (confirmed) {
          try {
            await api.habits.delete(habitId);
            setHabits(prev => prev.filter(h => h.id !== habitId));
            setStats(prev => ({
              ...prev,
              totalHabits: prev.totalHabits - 1,
              canCreateMore: true,
            }));
            haptic.medium();
          } catch (err) {
            console.error('Failed to delete habit:', err);
          }
        }
      });
    } else {
      if (confirm('Удалить привычку?')) {
        await api.habits.delete(habitId);
        setHabits(prev => prev.filter(h => h.id !== habitId));
      }
    }
  };

  // Check admin access
  if (user && !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500">Эта функция пока доступна только для тестирования</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-indigo-500/10 to-transparent px-4 pt-4 pb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Трекер привычек
        </h1>
        
        {/* Week Strip */}
        <WeekStrip 
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          completionDots={completionDots}
        />
      </div>

      <div className="px-4 space-y-4">
        {/* Progress Ring */}
        <ProgressRing 
          completed={stats.completedToday} 
          total={stats.totalHabits} 
        />

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Habits List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <HabitCardSkeleton />
              <HabitCardSkeleton />
              <HabitCardSkeleton />
            </>
          ) : habits.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✨</div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                У тебя пока нет привычек
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
              >
                Добавить первую
              </button>
            </div>
          ) : (
            habits.map(habit => (
              <HabitCard
                key={habit.id}
                habit={habit}
                onToggle={() => handleToggle(habit.id)}
                onDelete={() => handleDelete(habit.id)}
                isTogglingId={isTogglingId}
              />
            ))
          )}
        </div>

        {/* Limit info */}
        {!isLoading && habits.length > 0 && (
          <p className="text-center text-sm text-gray-400">
            {stats.totalHabits} из {stats.maxHabits} привычек
          </p>
        )}
      </div>

      {/* FAB */}
      {stats.canCreateMore && !isLoading && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:bg-indigo-600 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* New Habit Modal */}
      <NewHabitModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
      />

      {/* CSS for modal animation */}
      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

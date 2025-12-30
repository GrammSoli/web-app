/**
 * HabitsPage - Habit Tracker
 * 
 * Features:
 * - Week strip calendar
 * - Daily progress ring
 * - Habit cards with streaks
 * - Drag & drop reordering
 * - Haptic feedback
 * - Confetti on all habits completed
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { Preloader } from 'konsta/react';
import { format, addDays, subDays, isToday, isSameDay, startOfWeek, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  Plus, Flame, Check, ChevronLeft, ChevronRight, X, Clock, Trash2, Lock,
  Sparkles, Dumbbell, BookOpen, PersonStanding, Droplets, Bike, Target, Moon,
  Salad, Brain, Palette, Music, Heart, Pill, Coffee, Cigarette, Bell, CalendarDays,
  Footprints, Smile, Sun, Zap, Leaf, Apple, Pencil, Gamepad2, Languages, Bed,
  Snowflake, GripVertical, WifiOff, RefreshCw,
  type LucideIcon
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/store/useAppStore';
import { useTelegram } from '@/hooks/useTelegram';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { api } from '@/lib/api';
import type { Habit, HabitsResponse, CreateHabitInput } from '@/types/api';
import confetti from 'canvas-confetti';

// ============================================
// ICON MAPPING
// ============================================

// Map icon names to Lucide components
const HABIT_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Dumbbell,
  BookOpen,
  PersonStanding,
  Droplets,
  Bike,
  Target,
  Moon,
  Salad,
  Brain,
  Palette,
  Music,
  Heart,
  Pill,
  Coffee,
  Cigarette,
  Footprints,
  Smile,
  Sun,
  Zap,
  Leaf,
  Apple,
  Pencil,
  Gamepad2,
  Languages,
  Bed,
};

// Icon options for the picker
const ICON_OPTIONS = [
  { name: 'Sparkles' },
  { name: 'Dumbbell' },
  { name: 'BookOpen' },
  { name: 'PersonStanding' },
  { name: 'Droplets' },
  { name: 'Bike' },
  { name: 'Target' },
  { name: 'Moon' },
  { name: 'Salad' },
  { name: 'Brain' },
  { name: 'Palette' },
  { name: 'Music' },
  { name: 'Heart' },
  { name: 'Pill' },
  { name: 'Coffee' },
  { name: 'Cigarette' },
  { name: 'Footprints' },
  { name: 'Smile' },
  { name: 'Sun' },
  { name: 'Zap' },
  { name: 'Leaf' },
  { name: 'Apple' },
  { name: 'Pencil' },
  { name: 'Gamepad2' },
  { name: 'Languages' },
  { name: 'Bed' },
];

// Helper to render habit icon
function HabitIcon({ 
  name, 
  color, 
  size = 'md' 
}: { 
  name: string; 
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = HABIT_ICONS[name] || Sparkles;
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  
  return <Icon className={sizeClass} style={{ color }} />;
}

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
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 capitalize">
          {format(weekStart, 'LLLL yyyy', { locale: ru })}
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
          
          // Short day names: Пн, Вт, Ср, Чт, Пт, Сб, Вс
          const dayOfWeek = day.getDay();
          const shortDayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
          const shortDayName = shortDayNames[dayOfWeek];

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
                {shortDayName}
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

// Motivational phrases (outside component to avoid recreation)
const MOTIVATIONAL_PHRASES = [
  "Шаг за шагом к цели",
  "Каждый день — новый шанс",
  "Ты на верном пути!",
  "Постоянство — ключ к успеху",
];

// Daily Progress Ring
function ProgressRing({ 
  completed, 
  total 
}: { 
  completed: number; 
  total: number;
}) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const circumference = 2 * Math.PI * 28; // radius = 28 (smaller ring)
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Memoize phrase to prevent flashing on re-renders
  const phrase = useMemo(() => {
    if (total === 0) return "Добавь первую привычку!";
    if (completed === total && total > 0) return "🎉 Всё выполнено!";
    return MOTIVATIONAL_PHRASES[Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length)];
  }, [total, completed]);

  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-lg shadow-indigo-500/20">
      <div className="flex items-center gap-4">
        {/* Ring - smaller */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="5"
            />
            {/* Progress circle */}
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <span className="text-lg font-bold leading-none">{completed}/{total}</span>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 text-white">
          <h3 className="text-base font-semibold">Прогресс дня</h3>
          <p className="text-xs opacity-80 leading-tight">{phrase}</p>
        </div>
      </div>
    </div>
  );
}

// Sortable wrapper for HabitCard with drag handle
function SortableHabitCard({
  habit,
  onToggle,
  onEdit,
  onDelete,
  isTogglingId,
  isFutureDate,
  isMissed,
  onFutureTap,
  onMissedTap,
}: {
  habit: Habit;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isTogglingId: string | null;
  isFutureDate?: boolean;
  isMissed?: boolean;
  onFutureTap?: () => void;
  onMissedTap?: () => void;
}) {
  const { haptic } = useTelegram();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id });
  
  // Combined blocked state for future and missed dates
  const isBlocked = isFutureDate || isMissed;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.9 : 1,
  };

  const isToggling = isTogglingId === habit.id;
  const [justCompleted, setJustCompleted] = useState(false);

  const handleToggle = () => {
    if (isFutureDate) {
      haptic.light();
      onFutureTap?.();
      return;
    }
    if (isMissed) {
      haptic.light();
      onMissedTap?.();
      return;
    }
    // Frozen days cannot be toggled (streak was saved by system)
    if (habit.isFrozenToday) {
      haptic.light();
      return;
    }
    haptic.medium();
    if (!habit.completedToday) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 300);
    }
    onToggle();
  };

  const handleEdit = () => {
    haptic.light();
    onEdit();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-3 ${isDragging ? 'scale-[1.02] shadow-xl' : ''}`}
    >
      <div 
        className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm transition-all duration-200 ${
          habit.completedToday ? 'opacity-80' : ''
        } ${isBlocked ? 'opacity-60' : ''} ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
      >
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="touch-none select-none p-1 -ml-1 text-gray-300 dark:text-zinc-600 hover:text-gray-400 dark:hover:text-zinc-500 active:text-indigo-500 transition-colors cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-5 h-5 pointer-events-none" />
          </button>

          {/* Clickable area for editing */}
          <div 
            className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer active:opacity-70"
            onClick={handleEdit}
          >
            {/* Icon */}
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${habit.color}20` }}
            >
              <HabitIcon name={habit.emoji} color={habit.color} size="md" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className={`font-semibold text-gray-900 dark:text-white truncate ${
                habit.completedToday ? 'line-through text-gray-400' : ''
              }`}>
                {habit.name}
              </h4>
              <div className="flex items-center gap-3 mt-0.5">
                {/* Streak */}
                {habit.currentStreak > 0 && (
                  <div className="flex items-center gap-1 text-orange-500">
                    <Flame className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{habit.currentStreak}</span>
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
          </div>

          {/* Delete button (visible on long press / swipe alternative) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              haptic.medium();
              onDelete();
            }}
            className="p-2 text-gray-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Checkbox with animation */}
          <button
            onClick={handleToggle}
            disabled={isToggling}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
              isBlocked 
                ? 'bg-gray-100 dark:bg-zinc-800 cursor-not-allowed opacity-50'
                : habit.isFrozenToday
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : habit.completedToday 
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                    : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700'
            } ${isToggling ? 'animate-pulse' : ''} ${justCompleted ? 'animate-check-pop' : ''}`}
            style={habit.completedToday && !isBlocked && !habit.isFrozenToday ? {} : isBlocked ? {} : habit.isFrozenToday ? {} : { borderColor: habit.color, borderWidth: 2 }}
          >
            {isBlocked ? (
              <Lock className="w-4 h-4 text-gray-400" />
            ) : habit.isFrozenToday ? (
              <Snowflake className="w-5 h-5" />
            ) : habit.completedToday ? (
              <Check className="w-5 h-5" />
            ) : (
              <div className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Live Preview Card for New Habit Modal
function HabitPreviewCard({ 
  name, 
  icon, 
  color 
}: { 
  name: string; 
  icon: string; 
  color: string;
}) {
  const displayName = name.trim() || 'Название привычки';
  
  return (
    <div 
      className="bg-white dark:bg-zinc-800 rounded-2xl p-4 shadow-lg border-2 transition-all duration-300"
      style={{ borderColor: color }}
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300"
          style={{ backgroundColor: `${color}20`, boxShadow: `0 4px 14px ${color}30` }}
        >
          <HabitIcon name={icon} color={color} size="lg" />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {displayName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-orange-500">
              <Flame className="w-4 h-4" />
              <span className="text-sm font-medium">0</span>
            </div>
          </div>
        </div>
        {/* Checkbox */}
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
          style={{ borderColor: color, borderWidth: 2, backgroundColor: 'transparent' }}
        />
      </div>
    </div>
  );
}

// Habit Modal (Create/Edit)
function HabitModal({ 
  isOpen, 
  onClose, 
  onCreate,
  onUpdate,
  editingHabit,
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onCreate: (data: CreateHabitInput) => void;
  onUpdate: (id: string, data: Partial<CreateHabitInput>) => void;
  editingHabit: Habit | null;
}) {
  const isEditMode = !!editingHabit;
  
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Sparkles');
  const [color, setColor] = useState('#6366f1');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // All days by default
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];
  
  // Day names (Mon-Sun, 0=Monday)
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Populate form when editing
  useEffect(() => {
    if (editingHabit) {
      setName(editingHabit.name);
      setIcon(editingHabit.emoji || 'Sparkles');
      setColor(editingHabit.color);
      
      // Reconstruct selected days from frequency
      if (editingHabit.frequency === 'daily') {
        setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      } else if (editingHabit.frequency === 'weekdays') {
        setSelectedDays([0, 1, 2, 3, 4]);
      } else if (editingHabit.frequency === 'weekends') {
        setSelectedDays([5, 6]);
      } else if (editingHabit.customDays) {
        setSelectedDays(editingHabit.customDays);
      }
      
      setReminderEnabled(!!editingHabit.reminderTime);
      setReminderTime(editingHabit.reminderTime || '09:00');
    } else {
      // Reset to defaults for new habit
      setName('');
      setIcon('Sparkles');
      setColor('#6366f1');
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setReminderEnabled(false);
      setReminderTime('09:00');
    }
  }, [editingHabit, isOpen]);

  const toggleDay = (dayIndex: number) => {
    setSelectedDays(prev => {
      if (prev.includes(dayIndex)) {
        // Don't allow removing all days
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== dayIndex);
      }
      return [...prev, dayIndex].sort((a, b) => a - b);
    });
  };

  // Determine frequency type based on selected days
  const getFrequencyData = (): { frequency: 'daily' | 'weekdays' | 'weekends' | 'custom'; customDays?: number[] } => {
    const sorted = [...selectedDays].sort((a, b) => a - b);
    const weekdays = [0, 1, 2, 3, 4]; // Mon-Fri
    const weekends = [5, 6]; // Sat-Sun
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    
    if (JSON.stringify(sorted) === JSON.stringify(allDays)) {
      return { frequency: 'daily' };
    }
    if (JSON.stringify(sorted) === JSON.stringify(weekdays)) {
      return { frequency: 'weekdays' };
    }
    if (JSON.stringify(sorted) === JSON.stringify(weekends)) {
      return { frequency: 'weekends' };
    }
    return { frequency: 'custom', customDays: sorted };
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const { frequency, customDays } = getFrequencyData();
      const data = { 
        name, 
        emoji: icon, // Store icon name in emoji field for backward compatibility
        color, 
        frequency, 
        customDays,
        reminderTime: reminderEnabled ? reminderTime : null, // null to disable reminder
      };
      
      if (isEditMode && editingHabit) {
        await onUpdate(editingHabit.id, data);
      } else {
        await onCreate(data);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />
      {/* Sheet */}
      <div 
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out animate-slide-up safe-area-bottom"
        style={{ maxHeight: '85vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-zinc-600 rounded-full" />
        </div>
        
        {/* Header with Save button */}
        <div className="flex items-center justify-between px-5 py-2">
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'Редактирование' : 'Новая привычка'}
          </h3>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-600 active:bg-indigo-700 transition-colors"
          >
            {isSubmitting ? '...' : 'Сохранить'}
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-10 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          <div className="space-y-5">
            {/* Name Input - clean, no label */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название привычки..."
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-lg"
              maxLength={100}
              autoFocus
            />

            {/* Live Preview Card */}
            <div className="py-2">
              <HabitPreviewCard name={name} icon={icon} color={color} />
            </div>

            {/* Color & Icon Section */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Цвет и иконка
              </p>
              
              {/* Colors - circles with check mark */}
              <div className="flex justify-between px-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      color === c ? 'scale-110' : 'hover:scale-105'
                    }`}
                    style={{ 
                      backgroundColor: c,
                      boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' 
                    }}
                  >
                    {color === c && <Check className="w-5 h-5 text-white" />}
                  </button>
                ))}
              </div>
              
              {/* Icons - grid with Lucide icons */}
              <div className="grid grid-cols-5 gap-2">
                {ICON_OPTIONS.map((opt) => {
                  const IconComponent = HABIT_ICONS[opt.name] || Sparkles;
                  const isSelected = icon === opt.name;
                  return (
                    <button
                      key={opt.name}
                      onClick={() => setIcon(opt.name)}
                      className={`h-11 rounded-xl flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'scale-105' 
                          : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                      style={isSelected ? { 
                        backgroundColor: `${color}20`, 
                        boxShadow: `0 0 0 2px ${color}`,
                      } : {}}
                    >
                      <IconComponent 
                        className="w-5 h-5" 
                        style={{ color: isSelected ? color : 'currentColor' }} 
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frequency - Day circles */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> Дни недели
              </p>
              <div className="flex justify-between">
                {dayNames.map((day, index) => {
                  const isSelected = selectedDays.includes(index);
                  return (
                    <button
                      key={index}
                      onClick={() => toggleDay(index)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        isSelected 
                          ? 'text-white shadow-lg' 
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                      style={isSelected ? { 
                        backgroundColor: color, 
                        boxShadow: `0 4px 12px ${color}40` 
                      } : {}}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                {selectedDays.length === 7 && 'Каждый день'}
                {selectedDays.length === 5 && JSON.stringify([...selectedDays].sort()) === JSON.stringify([0,1,2,3,4]) && 'По будням'}
                {selectedDays.length === 2 && JSON.stringify([...selectedDays].sort()) === JSON.stringify([5,6]) && 'Выходные'}
                {![7, 5, 2].includes(selectedDays.length) || 
                  (selectedDays.length === 5 && JSON.stringify([...selectedDays].sort()) !== JSON.stringify([0,1,2,3,4])) ||
                  (selectedDays.length === 2 && JSON.stringify([...selectedDays].sort()) !== JSON.stringify([5,6]))
                  ? `${selectedDays.length} ${selectedDays.length === 1 ? 'день' : selectedDays.length < 5 ? 'дня' : 'дней'} в неделю` : ''}
              </p>
            </div>

            {/* Reminder - Optional */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Bell className="w-4 h-4" /> Напоминание
                </p>
                <button
                  onClick={() => setReminderEnabled(!reminderEnabled)}
                  className={`w-12 h-7 rounded-full transition-all relative ${
                    reminderEnabled 
                      ? 'bg-indigo-500' 
                      : 'bg-gray-200 dark:bg-zinc-700'
                  }`}
                >
                  <div 
                    className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      reminderEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              {reminderEnabled && (
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-lg"
                  />
                </div>
              )}
              
              {reminderEnabled && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Напоминание придёт в выбранное время по вашему часовому поясу
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Toast notification component
function Toast({ message, isVisible, onClose }: { message: string; isVisible: boolean; onClose: () => void }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-32 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-gray-900 dark:bg-zinc-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3">
        <Lock className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-sm">{message}</p>
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
  const { haptic, disableVerticalSwipes, enableVerticalSwipes } = useTelegram();
  const { isOnline, pendingCount, isSyncing, forceSync } = useOfflineStatus();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState({ totalHabits: 0, completedToday: 0, maxHabits: 6, canCreateMore: true });
  const [freezeInfo, setFreezeInfo] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [completionDots, setCompletionDots] = useState<Record<string, number>>({});

  // Check if selected date is in the future
  const isFutureDate = startOfDay(selectedDate) > startOfDay(new Date());

  // Show toast for future date tap
  const handleFutureTap = useCallback(() => {
    const today = format(new Date(), 'd', { locale: ru });
    setToastMessage(`Будущее еще не наступило. Сегодня ${today}-е — живи в моменте!`);
  }, []);

  // Show toast for missed date tap
  const handleMissedTap = useCallback(() => {
    setToastMessage('Этот день уже пропущен. Привычки нужно выполнять вовремя!');
  }, []);

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
      // Use server-calculated completionDots
      setCompletionDots(response.completionDots || {});
      // Update freeze info
      if (response.freezeInfo) {
        setFreezeInfo(response.freezeInfo);
      }
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

  // Toggle habit (with offline support)
  const handleToggle = async (habitId: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const currentState = habit.completedToday;
    
    // Optimistic update first
    const newCompleted = !currentState;
    setHabits(prev => prev.map(h => 
      h.id === habitId 
        ? { 
            ...h, 
            completedToday: newCompleted,
            completedDates: newCompleted 
              ? [...h.completedDates, dateStr]
              : h.completedDates.filter(d => d !== dateStr),
          }
        : h
    ));
    
    setStats(prev => ({
      ...prev,
      completedToday: newCompleted 
        ? prev.completedToday + 1 
        : prev.completedToday - 1,
    }));
    
    // Update completionDots optimistically
    setCompletionDots(prev => {
      const newDots = { ...prev };
      const currentCount = newDots[dateStr] || 0;
      if (newCompleted) {
        newDots[dateStr] = currentCount + 1;
      } else {
        if (currentCount <= 1) {
          delete newDots[dateStr];
        } else {
          newDots[dateStr] = currentCount - 1;
        }
      }
      return newDots;
    });
    
    setIsTogglingId(habitId);
    try {
      const response = await api.habits.toggle(habitId, dateStr, { currentState });
      
      // If not offline response, update with real server data
      if (!(response as { _offline?: boolean })._offline) {
        setHabits(prev => prev.map(h => 
          h.id === habitId 
            ? { 
                ...h, 
                currentStreak: response.currentStreak,
                longestStreak: response.longestStreak,
                totalCompletions: response.totalCompletions,
              }
            : h
        ));

        // Update freeze info if returned
        if (response.freezeInfo) {
          setFreezeInfo({
            used: response.freezeInfo.used,
            limit: response.freezeInfo.limit,
            remaining: response.freezeInfo.remaining,
          });
        }

        // Confetti if all completed!
        if (response.allCompleted) {
          haptic.success();
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        }
      }
    } catch (err) {
      console.error('Failed to toggle habit:', err);
      // Revert optimistic update on error
      setHabits(prev => prev.map(h => 
        h.id === habitId 
          ? { 
              ...h, 
              completedToday: currentState,
              completedDates: currentState 
                ? [...h.completedDates, dateStr]
                : h.completedDates.filter(d => d !== dateStr),
            }
          : h
      ));
      setStats(prev => ({
        ...prev,
        completedToday: currentState 
          ? prev.completedToday + 1 
          : prev.completedToday - 1,
      }));
      setToastMessage('Не удалось сохранить изменение');
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

  // Update habit
  const handleUpdate = async (habitId: string, data: Partial<CreateHabitInput>) => {
    try {
      const updatedHabit = await api.habits.update(habitId, data);
      setHabits(prev => prev.map(h => 
        h.id === habitId ? { ...h, ...updatedHabit } : h
      ));
      setEditingHabit(null);
      haptic.success();
    } catch (err) {
      console.error('Failed to update habit:', err);
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

  // Drag & drop sensors with delay for touch devices
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activating
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Hold for 200ms before drag starts
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start - disable Telegram's close gesture
  const handleDragStart = () => {
    disableVerticalSwipes();
    haptic.selection();
  };

  // Handle drag cancel - re-enable Telegram's close gesture
  const handleDragCancel = () => {
    enableVerticalSwipes();
  };

  // Handle drag end - reorder habits
  const handleDragEnd = async (event: DragEndEvent) => {
    enableVerticalSwipes(); // Re-enable Telegram's close gesture
    
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      haptic.light();
      
      const oldIndex = habits.findIndex(h => h.id === active.id);
      const newIndex = habits.findIndex(h => h.id === over.id);
      
      // Optimistic update
      const newHabits = arrayMove(habits, oldIndex, newIndex);
      setHabits(newHabits);
      
      // Save to server
      try {
        await api.habits.reorder(newHabits.map(h => h.id));
      } catch (err) {
        console.error('Failed to reorder habits:', err);
        // Revert on error
        setHabits(habits);
        setToastMessage('Не удалось сохранить порядок');
      }
    }
  };

  // Pull-to-refresh handler (also syncs offline queue)
  const handleRefresh = async (): Promise<void> => {
    // First sync any pending offline operations
    await forceSync();
    // Then fetch fresh data
    await fetchHabits();
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
    <PullToRefresh
      onRefresh={handleRefresh}
      pullingContent=""
      refreshingContent={
        <div className="w-full flex justify-center py-4">
          <Preloader className="w-8 h-8 text-indigo-500" />
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 pb-24">
        {/* Header */}
        <div className="bg-gradient-to-b from-indigo-500/10 to-transparent px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Трекер привычек
          </h1>
          {/* Freeze Info Badge */}
          {freezeInfo && freezeInfo.limit > 0 && (
            <button 
              onClick={() => setShowFreezeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-100 dark:bg-cyan-900/40 rounded-full hover:bg-cyan-200 dark:hover:bg-cyan-800/50 transition-colors"
            >
              <Snowflake className="w-4 h-4 text-cyan-500" />
              <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                {freezeInfo.remaining}
              </span>
            </button>
          )}
        </div>
        
        {/* Week Strip */}
        <WeekStrip 
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          completionDots={completionDots}
        />
        
        {/* Offline/Syncing Banner */}
        {(!isOnline || pendingCount > 0) && (
          <div 
            className={`mt-3 px-4 py-2.5 rounded-xl flex items-center justify-between ${
              !isOnline 
                ? 'bg-amber-100 dark:bg-amber-900/30' 
                : isSyncing
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-amber-50 dark:bg-amber-900/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : isSyncing ? (
                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 text-amber-500" />
              )}
              <span className={`text-sm font-medium ${
                !isOnline 
                  ? 'text-amber-700 dark:text-amber-300'
                  : isSyncing
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-amber-600 dark:text-amber-400'
              }`}>
                {!isOnline 
                  ? 'Офлайн режим' 
                  : isSyncing 
                    ? 'Синхронизация...'
                    : `Ожидает синхр.: ${pendingCount}`
                }
              </span>
            </div>
            {isOnline && pendingCount > 0 && !isSyncing && (
              <button
                onClick={() => forceSync()}
                className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
              >
                Синхронизировать
              </button>
            )}
          </div>
        )}
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
              <div className="flex justify-center mb-4">
                <Sparkles className="w-16 h-16 text-amber-400" />
              </div>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={habits.map(h => h.id)}
                strategy={verticalListSortingStrategy}
              >
                {habits.map(habit => (
                  <SortableHabitCard
                    key={habit.id}
                    habit={habit}
                    onToggle={() => handleToggle(habit.id)}
                    onEdit={() => {
                      setEditingHabit(habit);
                      setIsModalOpen(true);
                    }}
                    onDelete={() => handleDelete(habit.id)}
                    isTogglingId={isTogglingId}
                    isFutureDate={isFutureDate}
                    isMissed={habit.isMissed}
                    onFutureTap={handleFutureTap}
                    onMissedTap={handleMissedTap}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Limit info */}
        {!isLoading && habits.length > 0 && (
          <p className="text-center text-sm text-gray-400">
            {isFutureDate ? (
              <span className="flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Просмотр будущего дня
              </span>
            ) : habits.some(h => h.isMissed) ? (
              <span className="flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Просмотр прошлого дня
              </span>
            ) : (
              `${stats.totalHabits} из ${stats.maxHabits} привычек`
            )}
          </p>
        )}
      </div>

      {/* Toast notification */}
      <Toast 
        message={toastMessage || ''} 
        isVisible={!!toastMessage} 
        onClose={() => setToastMessage(null)} 
      />

      {/* FAB */}
      {stats.canCreateMore && !isLoading && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:bg-indigo-600 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Habit Modal (Create/Edit) */}
      <HabitModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingHabit(null);
        }}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        editingHabit={editingHabit}
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
        @keyframes check-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .animate-check-pop {
          animation: check-pop 0.3s ease-out;
        }
        /* Swipeable list full width fix */
        .swipeable-list {
          width: 100% !important;
        }
        .swipeable-list-item {
          width: 100% !important;
        }
        .swipeable-list-item__content {
          width: 100% !important;
        }
        .swipeable-list-item__content > div {
          width: 100% !important;
        }
      `}</style>

      {/* Freeze Info Modal */}
      {showFreezeModal && freezeInfo && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowFreezeModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center">
                <Snowflake className="w-6 h-6 text-cyan-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Заморозка стрика
              </h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              У вас осталось <span className="font-semibold text-cyan-600 dark:text-cyan-400">{freezeInfo.remaining}</span> {freezeInfo.remaining === 1 ? 'заряд' : freezeInfo.remaining < 5 ? 'заряда' : 'зарядов'} из {freezeInfo.limit}. Они спасают вашу серию, если вы забыли отметить привычку.
            </p>
            
            <div className="bg-gray-100 dark:bg-gray-700/50 rounded-xl p-4 mb-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-2">Как это работает:</p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  Пропустили день — заряд автоматически активируется
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  Стрик сохранится, заряд спишется
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  Заряды обновляются каждый месяц
                </li>
              </ul>
            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-5">
              <span>Использовано:</span>
              <span className="font-medium">{freezeInfo.used} / {freezeInfo.limit}</span>
            </div>
            
            <button
              onClick={() => setShowFreezeModal(false)}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-xl transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>,
        document.body
      )}
      </div>
    </PullToRefresh>
  );
}

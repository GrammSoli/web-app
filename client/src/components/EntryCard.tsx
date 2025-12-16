import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { JournalEntry } from '@/types/api';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { Mic, Lightbulb, ChevronRight } from 'lucide-react';

interface EntryCardProps {
  entry: JournalEntry;
  onClick?: () => void;
}

const moodEmojis: Record<number, string> = {
  1: '😢', 2: '😔', 3: '😕', 4: '😐', 5: '🙂',
  6: '😊', 7: '😄', 8: '😁', 9: '🤩', 10: '🥳',
};

const moodGradients: Record<number, string> = {
  1: 'from-red-400 to-red-500',
  2: 'from-orange-400 to-orange-500',
  3: 'from-amber-400 to-amber-500',
  4: 'from-yellow-400 to-yellow-500',
  5: 'from-gray-400 to-gray-500',
  6: 'from-lime-400 to-lime-500',
  7: 'from-green-400 to-green-500',
  8: 'from-emerald-400 to-emerald-500',
  9: 'from-cyan-400 to-cyan-500',
  10: 'from-purple-400 to-purple-500',
};

export default function EntryCard({ entry, onClick }: EntryCardProps) {
  const { haptic } = useTelegram();
  const { privacyBlur } = useAppStore();
  
  const handleClick = () => {
    haptic.light();
    onClick?.();
  };

  const moodScore = entry.moodScore || 5;
  const emoji = moodEmojis[moodScore] || '🙂';
  const gradientClass = moodGradients[moodScore] || 'from-gray-400 to-gray-500';

  // Safe date parsing
  const dateValue = entry.dateCreated || (entry as { createdAt?: string }).createdAt;
  const formattedDate = dateValue 
    ? format(new Date(dateValue), 'd MMM, HH:mm', { locale: ru })
    : 'Сегодня';
  
  // Truncate text
  const maxLength = 100;
  const isTruncated = entry.textContent.length > maxLength;
  const displayText = isTruncated 
    ? entry.textContent.slice(0, maxLength) + '...'
    : entry.textContent;

  return (
    <div
      onClick={handleClick}
      className="p-4 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Mood indicator - gradient circle */}
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${gradientClass} 
                          flex items-center justify-center text-xl shadow-sm`}>
            {emoji}
          </div>
          
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">
              {entry.moodLabel || `Настроение ${moodScore}/10`}
            </div>
            <div className="text-[#8E8E93] text-xs">
              {formattedDate}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice indicator */}
          {entry.isVoice && (
            <div className="flex items-center gap-1 text-[#8E8E93] text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
              <Mic className="w-3 h-3" />
              <span>Голос</span>
            </div>
          )}
          
          {/* Arrow indicator */}
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      </div>

      {/* Content preview */}
      <p className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed transition-all
        ${privacyBlur ? 'blur-sm select-none' : ''}`}>
        {displayText}
        {isTruncated && !privacyBlur && (
          <span className="text-blue-500 font-medium ml-1">Читать далее</span>
        )}
      </p>

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && !privacyBlur && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {entry.tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 
                         text-blue-600 font-medium border border-blue-100 shadow-sm
                         hover:from-blue-100 hover:to-indigo-100 transition-all duration-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* AI Summary (if completed) */}
      {entry.status === 'completed' && entry.aiSummary && !privacyBlur && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-[#8E8E93] italic leading-relaxed flex items-start gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>{entry.aiSummary}</span>
          </p>
        </div>
      )}

      {/* Processing status */}
      {entry.status === 'processing' && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-blue-500 text-xs">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">Анализирую...</span>
          </div>
        </div>
      )}
    </div>
  );
}

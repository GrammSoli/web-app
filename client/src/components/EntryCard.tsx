import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { JournalEntry } from '@/types/api';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { Mic, Lightbulb, ChevronRight } from 'lucide-react';
import { getMoodEmoji, getMoodGradient } from '@/config/moods';
import { MAX_TEXT_PREVIEW_LENGTH } from '@/config/constants';

interface EntryCardProps {
  entry: JournalEntry;
  onClick?: () => void;
}

export default function EntryCard({ entry, onClick }: EntryCardProps) {
  const { haptic } = useTelegram();
  const { privacyBlur, user } = useAppStore();
  const isFree = !user || user.subscriptionTier === 'free';
  
  const handleClick = () => {
    haptic.light();
    onClick?.();
  };

  const moodScore = entry.moodScore || 5;
  const emoji = getMoodEmoji(moodScore);
  const gradientClass = getMoodGradient(moodScore, true);

  // Safe date parsing
  const dateValue = entry.dateCreated || (entry as { createdAt?: string }).createdAt;
  const formattedDate = dateValue 
    ? format(new Date(dateValue), 'd MMM, HH:mm', { locale: ru })
    : 'Сегодня';
  
  // Truncate text
  const isTruncated = entry.textContent.length > MAX_TEXT_PREVIEW_LENGTH;
  const displayText = isTruncated 
    ? entry.textContent.slice(0, MAX_TEXT_PREVIEW_LENGTH) + '...'
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
          <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600" />
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
        <div className="flex flex-wrap gap-1.5 mt-3 relative">
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className={`text-xs px-2.5 py-1 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium
                         ${isFree ? 'blur-[3px] select-none' : ''} transition-all duration-200`}
            >
              #{tag}
            </span>
          ))}
          {isFree && entry.tags.length > 0 && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded-full">Premium</span>
            </span>
          )}
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

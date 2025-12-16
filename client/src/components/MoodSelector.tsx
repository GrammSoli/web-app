import { useState } from 'react';
import { MOOD_SELECTOR_OPTIONS } from '@/config/moods';

interface MoodSelectorProps {
  onSelect?: (mood: { emoji: string; label: string; score: number }) => void;
  selected?: number | null;
}

export default function MoodSelector({ onSelect, selected }: MoodSelectorProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(selected || null);

  const handleSelect = (mood: typeof MOOD_SELECTOR_OPTIONS[0]) => {
    setSelectedScore(mood.score);
    onSelect?.(mood);
  };

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
      {MOOD_SELECTOR_OPTIONS.map((mood) => {
        const isSelected = selectedScore === mood.score;
        return (
          <button
            key={mood.score}
            onClick={() => handleSelect(mood)}
            className={`
              flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl
              transition-all duration-200 active:scale-95
              ${isSelected 
                ? `bg-gradient-to-br ${mood.color} shadow-lg shadow-${mood.color.split('-')[1]}-500/30 scale-110` 
                : 'bg-white/80 dark:bg-white/10 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
              }
            `}
          >
            {mood.emoji}
          </button>
        );
      })}
    </div>
  );
}

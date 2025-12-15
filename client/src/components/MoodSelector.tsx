import { useState } from 'react';

const moods = [
  { emoji: '😢', label: 'Грустно', score: 2, color: 'from-red-400 to-red-500' },
  { emoji: '😔', label: 'Плохо', score: 3, color: 'from-orange-400 to-orange-500' },
  { emoji: '😐', label: 'Нормально', score: 5, color: 'from-gray-400 to-gray-500' },
  { emoji: '🙂', label: 'Хорошо', score: 7, color: 'from-green-400 to-green-500' },
  { emoji: '😊', label: 'Отлично', score: 8, color: 'from-emerald-400 to-emerald-500' },
  { emoji: '🤩', label: 'Супер!', score: 10, color: 'from-purple-400 to-purple-500' },
];

interface MoodSelectorProps {
  onSelect?: (mood: { emoji: string; label: string; score: number }) => void;
  selected?: number | null;
}

export default function MoodSelector({ onSelect, selected }: MoodSelectorProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(selected || null);

  const handleSelect = (mood: typeof moods[0]) => {
    setSelectedScore(mood.score);
    onSelect?.(mood);
  };

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
      {moods.map((mood) => {
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

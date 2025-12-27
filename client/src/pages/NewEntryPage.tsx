import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useNavigate, useLocation } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { Lightbulb, Sparkles, Brain } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { APP_CONFIG } from '@/config/app';
import { MOOD_SELECTOR_OPTIONS } from '@/config/moods';
import { getRandomPlaceholder } from '@/config/constants';

export default function NewEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { haptic, showAlert } = useTelegram();
  const { addEntry } = useAppStore();

  const [text, setText] = useState('');
  const [selectedMood, setSelectedMood] = useState<number | null>(
    (location.state as { mood?: { score: number } })?.mood?.score || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placeholder] = useState(() => getRandomPlaceholder());

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleSubmit = async () => {
    const trimmedText = text.trim();

    if (trimmedText.length < APP_CONFIG.MIN_ENTRY_CHARS) {
      showAlert('Напиши хотя бы пару предложений о своих чувствах');
      return;
    }

    if (trimmedText.length > APP_CONFIG.MAX_ENTRY_CHARS) {
      showAlert(`Слишком длинный текст. Максимум ${APP_CONFIG.MAX_ENTRY_CHARS} символов.`);
      return;
    }

    setIsSubmitting(true);
    haptic.medium();

    try {
      const entry = await api.entries.create({
        textContent: trimmedText,
        ...(selectedMood && { moodScore: selectedMood })
      });

      haptic.success();

      // Celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#3b82f6'] // Indigo, Purple, Pink, Blue
      });

      addEntry(entry);

      // Delay navigation slightly to show confetti
      setTimeout(() => {
        navigate(`/entry/${entry.id}`, { replace: true });
      }, 500);

    } catch (error) {
      haptic.error();
      showAlert(error instanceof Error ? error.message : 'Не удалось сохранить запись');
      setIsSubmitting(false);
    }
  };

  const charCount = text.length;
  const minChars = APP_CONFIG.MIN_ENTRY_CHARS;
  const maxChars = APP_CONFIG.MAX_ENTRY_CHARS;
  const isValid = charCount >= minChars && charCount <= maxChars;
  const isOverLimit = charCount > maxChars;

  return (
    <div className="fade-in min-h-screen flex flex-col">
      {/* Content */}
      <div className="p-4 space-y-4 pt-6 flex-1">

        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl font-extrabold text-gray-800 dark:text-white">Новая запись</h1>
          <p className="text-gray-400 text-sm mt-1">Как ты себя сейчас чувствуешь?</p>
        </div>

        {/* Mood Selector Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Выбери настроение</p>
          <div className="flex justify-between">
            {MOOD_SELECTOR_OPTIONS.map((mood) => (
              <button
                key={mood.score}
                onClick={() => {
                  haptic.light();
                  setSelectedMood(mood.score);
                }}
                className={`text-2xl w-12 h-12 rounded-2xl flex items-center justify-center 
                           transition-all duration-200 
                           ${selectedMood === mood.score
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-500 scale-110 shadow-lg shadow-indigo-500/30'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95'
                  }`}
              >
                {mood.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex-1">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              disabled={isSubmitting}
              maxLength={maxChars + 100}
              className="w-full min-h-[200px] p-5 bg-transparent
                         text-gray-900 dark:text-white placeholder:text-gray-400 resize-none
                         focus:outline-none text-[16px] leading-relaxed"
            />

            {/* Character count */}
            <div className={`absolute bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-full ${isOverLimit
                ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                : isValid
                  ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                  : 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400'
              }`}>
              {charCount} / {minChars}+
            </div>
          </div>
        </div>

        {/* Tip Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl p-4 border border-blue-100 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-1">Совет</h3>
              <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
                Не фильтруй мысли — пиши как есть. ИИ поможет разобраться в эмоциях.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`w-full py-4 rounded-2xl font-bold text-lg 
                     shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2
                     ${isValid
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-500/30'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 shadow-none'
            }
                     disabled:opacity-60 disabled:active:scale-100`}
        >
          {isSubmitting ? (
            <>
              <Preloader className="!w-5 !h-5" />
              <span>Анализирую...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>Отправить на анализ</span>
            </>
          )}
        </button>
      </div>

      {/* Loading overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 mx-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <p className="font-bold text-lg text-gray-800 dark:text-white">Анализирую запись...</p>
            <p className="text-sm text-gray-400">Это займёт пару секунд</p>
          </div>
        </div>
      )}
    </div>
  );
}

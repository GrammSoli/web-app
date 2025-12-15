import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { Lightbulb, Sparkles, Brain } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { APP_CONFIG } from '@/config/app';

const MOOD_EMOJIS = [
  { emoji: '😢', label: 'Грустно', score: 2 },
  { emoji: '😔', label: 'Тоскливо', score: 3 },
  { emoji: '😐', label: 'Нейтрально', score: 5 },
  { emoji: '🙂', label: 'Хорошо', score: 7 },
  { emoji: '😊', label: 'Отлично', score: 8 },
  { emoji: '🤩', label: 'Супер!', score: 9 },
];

const PLACEHOLDER_TEXTS = [
  'Сегодня я чувствую себя...',
  'Меня радует, что...',
  'Сегодня произошло...',
  'Я думаю о том, что...',
  'Мне хочется рассказать о...',
];

export default function NewEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { haptic, mainButton, showAlert } = useTelegram();
  const { addEntry } = useAppStore();
  
  const [text, setText] = useState('');
  const [selectedMood, setSelectedMood] = useState<number | null>(
    (location.state as { mood?: { score: number } })?.mood?.score || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placeholder] = useState(() => 
    PLACEHOLDER_TEXTS[Math.floor(Math.random() * PLACEHOLDER_TEXTS.length)]
  );
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // Handle main button
  useEffect(() => {
    const canSubmit = text.trim().length >= APP_CONFIG.MIN_ENTRY_CHARS;
    
    if (canSubmit) {
      mainButton.show('Отправить', handleSubmit);
      mainButton.enable();
    } else {
      mainButton.hide();
    }

    return () => {
      mainButton.hide();
    };
  }, [text]);

  const handleSubmit = async () => {
    if (text.trim().length < APP_CONFIG.MIN_ENTRY_CHARS) {
      showAlert('Напиши хотя бы пару предложений о своих чувствах');
      return;
    }

    setIsSubmitting(true);
    haptic.medium();
    mainButton.showProgress();

    try {
      const entry = await api.entries.create({ textContent: text.trim() });
      
      haptic.success();
      addEntry(entry);
      navigate(`/entry/${entry.id}`, { replace: true });
      
    } catch (error) {
      haptic.error();
      mainButton.hideProgress();
      showAlert(error instanceof Error ? error.message : 'Не удалось сохранить запись');
      setIsSubmitting(false);
    }
  };

  const charCount = text.length;
  const minChars = APP_CONFIG.MIN_ENTRY_CHARS;
  const isValid = charCount >= minChars;

  return (
    <div className="fade-in min-h-screen flex flex-col">
      {/* Content */}
      <div className="p-4 space-y-4 pt-6 flex-1">
        
        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl font-extrabold text-gray-800">Новая запись</h1>
          <p className="text-gray-400 text-sm mt-1">Как ты себя сейчас чувствуешь?</p>
        </div>

        {/* Mood Selector Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-600 mb-3">Выбери настроение</p>
          <div className="flex justify-between">
            {MOOD_EMOJIS.map((mood, i) => (
              <button 
                key={i}
                onClick={() => {
                  haptic.light();
                  setSelectedMood(mood.score);
                }}
                className={`text-2xl w-12 h-12 rounded-2xl flex items-center justify-center 
                           transition-all duration-200 
                           ${selectedMood === mood.score 
                             ? 'bg-gradient-to-br from-indigo-500 to-purple-500 scale-110 shadow-lg shadow-indigo-500/30' 
                             : 'bg-gray-100 hover:bg-gray-200 active:scale-95'
                           }`}
              >
                {mood.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex-1">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              disabled={isSubmitting}
              className="w-full min-h-[200px] p-5 bg-transparent
                         text-gray-900 placeholder:text-gray-400 resize-none
                         focus:outline-none text-[16px] leading-relaxed"
            />
            
            {/* Character count */}
            <div className={`absolute bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-full ${
              isValid 
                ? 'bg-green-100 text-green-600' 
                : 'bg-orange-100 text-orange-600'
            }`}>
              {charCount} / {minChars}+
            </div>
          </div>
        </div>

        {/* Tip Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-4 border border-blue-100">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-blue-800 mb-1">Совет</h3>
              <p className="text-xs text-blue-600 leading-relaxed">
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
                       : 'bg-gray-200 text-gray-400 shadow-none'
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
          <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 mx-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <p className="font-bold text-lg text-gray-800">Анализирую запись...</p>
            <p className="text-sm text-gray-400">Это займёт пару секунд</p>
          </div>
        </div>
      )}
    </div>
  );
}

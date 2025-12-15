import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowLeft, CalendarDays, Mic, FileText, Tag, Lightbulb, Sprout, Trash2 } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import type { JournalEntry } from '@/types/api';

const moodEmojis: Record<number, string> = {
  1: '😢', 2: '😔', 3: '😕', 4: '😐', 5: '🙂',
  6: '😊', 7: '😄', 8: '😁', 9: '🤩', 10: '🥳',
};

const moodGradients: Record<number, string> = {
  1: 'from-red-500 to-rose-600',
  2: 'from-orange-500 to-red-500',
  3: 'from-amber-500 to-orange-500',
  4: 'from-yellow-500 to-amber-500',
  5: 'from-gray-400 to-gray-500',
  6: 'from-lime-500 to-green-500',
  7: 'from-green-500 to-emerald-500',
  8: 'from-emerald-500 to-teal-500',
  9: 'from-cyan-500 to-blue-500',
  10: 'from-purple-500 to-pink-500',
};

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { haptic, showConfirm, showAlert } = useTelegram();
  const { removeEntry } = useAppStore();
  
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) loadEntry(id);
  }, [id]);

  const loadEntry = async (entryId: string) => {
    try {
      const data = await api.entries.get(entryId);
      setEntry(data);
    } catch (error) {
      showAlert('Не удалось загрузить запись');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm('Удалить эту запись?');
    if (!confirmed || !entry) return;

    setDeleting(true);
    haptic.warning();

    try {
      await api.entries.delete(entry.id);
      removeEntry(entry.id);
      haptic.success();
      navigate('/', { replace: true });
    } catch (error) {
      haptic.error();
      showAlert('Не удалось удалить');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Preloader />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
          <div className="mb-4 flex justify-center">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-400">Запись не найдена</p>
        </div>
      </div>
    );
  }

  const moodScore = entry.moodScore || 5;
  const emoji = moodEmojis[moodScore];
  const gradient = moodGradients[moodScore];
  const formattedDate = format(new Date(entry.dateCreated), "d MMMM yyyy, HH:mm", { locale: ru });

  return (
    <div className="fade-in min-h-screen">
      {/* Mood Header */}
      <div className={`bg-gradient-to-br ${gradient} text-white pt-4 pb-8 px-4 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
        
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-white/80 text-sm mb-6 hover:text-white transition-colors relative z-10"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад</span>
        </button>

        {/* Mood Display */}
        <div className="text-center relative z-10">
          <div className="text-7xl mb-3 drop-shadow-lg">{emoji}</div>
          <div className="text-4xl font-bold mb-1">{moodScore}/10</div>
          <div className="text-white/80 capitalize">
            {entry.moodLabel || 'Настроение'}
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-white/60 text-sm">
            <CalendarDays className="w-4 h-4" />
            <span>{formattedDate}</span>
            {entry.isVoice && (
              <>
                <span className="mx-2">•</span>
                <Mic className="w-4 h-4" />
                <span>Голос</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 -mt-4">
        {/* Content Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-sm text-gray-400 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Запись
          </h3>
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            {entry.textContent}
          </p>
        </div>

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-bold text-sm text-gray-400 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" /> Теги
            </h3>
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-sm font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI Summary */}
        {entry.aiSummary && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-5 border border-blue-100">
            <h3 className="font-bold text-sm text-blue-600 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" /> Резюме ИИ
            </h3>
            <p className="text-blue-800 text-sm leading-relaxed">
              {entry.aiSummary}
            </p>
          </div>
        )}

        {/* AI Suggestions */}
        {entry.aiSuggestions && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-3xl p-5 border border-green-100">
            <h3 className="font-bold text-sm text-green-600 mb-3 flex items-center gap-2">
              <Sprout className="w-4 h-4" /> Рекомендация
            </h3>
            <p className="text-green-800 text-sm leading-relaxed">
              {entry.aiSuggestions}
            </p>
          </div>
        )}

        {/* Processing status */}
        {entry.status === 'processing' && (
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-3xl p-5 border border-yellow-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="font-bold text-yellow-700">Анализируем...</p>
              <p className="text-sm text-yellow-600">Несколько секунд</p>
            </div>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-4 text-red-500 bg-red-50 rounded-2xl font-semibold 
                     border border-red-100 active:bg-red-100 transition-colors disabled:opacity-50
                     flex items-center justify-center gap-2"
        >
          <Trash2 className="w-5 h-5" />
          {deleting ? 'Удаление...' : 'Удалить запись'}
        </button>
      </div>
    </div>
  );
}

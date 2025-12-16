import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowLeft, CalendarDays, Mic, FileText, Tag, Lightbulb, Sprout, Trash2, Pencil, Play, Pause, X, Check, Plus, Lock } from 'lucide-react';
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
  const { removeEntry, user } = useAppStore();
  const isFree = !user || user.subscriptionTier === 'free';
  
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editMood, setEditMood] = useState(5);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Audio player state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (id) loadEntry(id);
  }, [id]);

  const loadEntry = async (entryId: string) => {
    try {
      const data = await api.entries.get(entryId);
      setEntry(data);
      setEditText(data.textContent);
      setEditTags(data.tags || []);
      setEditMood(data.moodScore || 5);
    } catch (error) {
      showAlert('Не удалось загрузить запись');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  const loadAudio = async () => {
    if (!entry || audioUrl) return;
    setAudioLoading(true);
    try {
      const { audioUrl: url } = await api.entries.getAudio(entry.id);
      setAudioUrl(url);
    } catch (error) {
      showAlert('Не удалось загрузить аудио');
    } finally {
      setAudioLoading(false);
    }
  };
  
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };
  
  const handleAudioTimeUpdate = () => {
    if (!audioRef.current) return;
    const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
    setAudioProgress(progress);
  };
  
  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioProgress(0);
  };
  
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * audioRef.current.duration;
  };
  
  const startEditing = () => {
    setEditText(entry?.textContent || '');
    setEditTags(entry?.tags || []);
    setEditMood(entry?.moodScore || 5);
    setNewTag('');
    setIsEditing(true);
    haptic.light();
  };
  
  const cancelEditing = () => {
    setEditText(entry?.textContent || '');
    setEditTags(entry?.tags || []);
    setEditMood(entry?.moodScore || 5);
    setNewTag('');
    setIsEditing(false);
  };
  
  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !editTags.includes(tag) && editTags.length < 10) {
      setEditTags([...editTags, tag]);
      setNewTag('');
      haptic.light();
    }
  };
  
  const removeTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(t => t !== tagToRemove));
    haptic.light();
  };
  
  const saveEdit = async () => {
    if (!entry) {
      setIsEditing(false);
      return;
    }
    
    // Check if anything changed
    const textChanged = editText.trim() !== entry.textContent;
    const tagsChanged = JSON.stringify(editTags.sort()) !== JSON.stringify((entry.tags || []).sort());
    const moodChanged = editMood !== entry.moodScore;
    
    if (!textChanged && !tagsChanged && !moodChanged) {
      setIsEditing(false);
      return;
    }
    
    setSaving(true);
    try {
      const updateData: { textContent?: string; tags?: string[]; moodScore?: number } = {};
      if (textChanged) updateData.textContent = editText.trim();
      if (tagsChanged) updateData.tags = editTags;
      if (moodChanged) updateData.moodScore = editMood;
      
      const updated = await api.entries.update(entry.id, updateData);
      setEntry(updated);
      setIsEditing(false);
      haptic.success();
    } catch (error) {
      haptic.error();
      showAlert('Не удалось сохранить изменения');
    } finally {
      setSaving(false);
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

  const moodScore = isEditing ? editMood : (entry.moodScore || 5);
  const emoji = moodEmojis[moodScore];
  const gradient = moodGradients[moodScore];
  
  // Safe date parsing
  const dateValue = entry.dateCreated || (entry as { createdAt?: string }).createdAt;
  const formattedDate = dateValue 
    ? format(new Date(dateValue), "d MMMM yyyy, HH:mm", { locale: ru })
    : 'Сегодня';

  return (
    <div className="fade-in min-h-screen">
      {/* Mood Header */}
      <div className={`bg-gradient-to-br ${gradient} text-white pt-4 pb-8 px-4 relative overflow-hidden transition-all duration-300`}>
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
            {isEditing ? 'Выберите настроение' : (entry.moodLabel || 'Настроение')}
          </div>
          
          {/* Mood slider when editing */}
          {isEditing && (
            <div className="mt-4 px-4">
              <input
                type="range"
                min="1"
                max="10"
                value={editMood}
                onChange={(e) => {
                  setEditMood(Number(e.target.value));
                  haptic.light();
                }}
                className="w-full h-2 bg-white/30 rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 
                           [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full 
                           [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg
                           [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <div className="flex justify-between text-xs text-white/60 mt-1">
                <span>😢</span>
                <span>🥳</span>
              </div>
            </div>
          )}
          
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
        {/* Audio Player for voice entries */}
        {entry.isVoice && entry.voiceFileId && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-bold text-sm text-gray-400 mb-3 flex items-center gap-2">
              <Mic className="w-4 h-4" /> Оригинальное аудио
            </h3>
            
            {!audioUrl ? (
              <button
                onClick={loadAudio}
                disabled={audioLoading}
                className="w-full py-3 bg-gray-100 rounded-xl flex items-center justify-center gap-2 
                           text-gray-700 active:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {audioLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    <span>Загрузка...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Загрузить аудио</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onTimeUpdate={handleAudioTimeUpdate}
                  onEnded={handleAudioEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center
                               shadow-lg active:scale-95 transition-transform"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  
                  <div 
                    className="flex-1 h-2 bg-gray-200 rounded-full cursor-pointer"
                    onClick={handleProgressClick}
                  >
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-100"
                      style={{ width: `${audioProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 relative">
          {/* Edit button */}
          {!isEditing && (
            <button
              onClick={startEditing}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500
                         hover:bg-gray-200 active:bg-gray-300 transition-colors"
              title="Редактировать"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          
          <h3 className="font-bold text-sm text-gray-400 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Запись
          </h3>
          
          {isEditing ? (
            <div className="space-y-4">
              {/* Text editing */}
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-h-[150px] p-3 border border-gray-200 rounded-xl resize-none
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              
              {/* Tags editing */}
              <div>
                <h4 className="font-bold text-sm text-gray-400 mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Теги
                </h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  {editTags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50
                                 text-blue-600 text-sm font-medium border border-blue-100 shadow-sm
                                 flex items-center gap-1 group"
                    >
                      #{tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 p-0.5 rounded-full bg-blue-100 hover:bg-red-100 hover:text-red-500 
                                   transition-colors opacity-70 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {editTags.length === 0 && (
                    <span className="text-gray-400 text-sm italic">Нет тегов</span>
                  )}
                </div>
                {editTags.length < 10 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value.slice(0, 30))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Новый тег..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={addTag}
                      disabled={!newTag.trim()}
                      className="px-3 py-2 bg-blue-500 text-white rounded-xl disabled:opacity-50
                                 active:bg-blue-600 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Save/Cancel buttons */}
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold
                             active:bg-blue-600 transition-colors disabled:opacity-50
                             flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                  <span>Сохранить</span>
                </button>
                <button
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold
                             active:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap pr-10">
              {entry.textContent}
            </p>
          )}
        </div>

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

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-bold text-sm text-gray-400 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" /> Теги
              {isFree && <span className="text-xs text-purple-500 ml-auto">Premium</span>}
            </h3>
            <div className="flex flex-wrap gap-2 relative">
              {entry.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => !isFree && navigate(`/entries?tag=${encodeURIComponent(tag)}`)}
                  disabled={isFree}
                  className={`px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50
                             text-blue-600 text-sm font-medium border border-blue-100 shadow-sm
                             ${isFree ? 'blur-[4px] select-none cursor-default' : 'hover:from-blue-100 hover:to-indigo-100 hover:shadow active:scale-95'}
                             transition-all duration-200`}
                >
                  #{tag}
                </button>
              ))}
              {isFree && (
                <div 
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  onClick={() => navigate('/premium')}
                >
                  <span className="flex items-center gap-1.5 text-sm text-purple-600 bg-white/90 px-3 py-1.5 rounded-full shadow-sm border border-purple-100">
                    <Lock className="w-3.5 h-3.5" /> Открыть с подпиской
                  </span>
                </div>
              )}
            </div>
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

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { subDays, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { FileText, ArrowLeft, Search, Filter, X, Calendar, Tag, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import EntryCard from '@/components/EntryCard';

type DateFilter = 'all' | 'today' | 'week' | 'month';

export default function EntriesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    entries, 
    entriesLoading, 
    hasMoreEntries, 
    privacyBlur,
    fetchEntries,
    togglePrivacyBlur
  } = useAppStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagParam = searchParams.get('tag');
    return tagParam ? [tagParam] : [];
  });
  const [showAllTags, setShowAllTags] = useState(false);
  
  const MAX_VISIBLE_TAGS = 8;
  
  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (entriesLoading) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreEntries && !searchQuery && !hasActiveFilters) {
        fetchEntries(false);
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [entriesLoading, hasMoreEntries, searchQuery, fetchEntries]);

  // Need to define hasActiveFilters earlier
  const hasActiveFilters = dateFilter !== 'all' || selectedTags.length > 0;

  // Показываем фильтры если пришли с тегом
  useEffect(() => {
    if (searchParams.get('tag')) {
      setShowFilters(true);
    }
  }, []);

  useEffect(() => {
    fetchEntries(true);
  }, [fetchEntries]);

  // Collect all unique tags from entries
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    entries?.forEach(entry => {
      entry.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter(entry => {
      // Text search
      const matchesSearch = !searchQuery || 
        entry.textContent.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.moodLabel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (!matchesSearch) return false;
      
      // Date filter
      const entryDate = new Date(entry.dateCreated || Date.now());
      const now = new Date();
      
      switch (dateFilter) {
        case 'today':
          if (isBefore(entryDate, startOfDay(now)) || isAfter(entryDate, endOfDay(now))) {
            return false;
          }
          break;
        case 'week':
          if (isBefore(entryDate, startOfDay(subDays(now, 7)))) {
            return false;
          }
          break;
        case 'month':
          if (isBefore(entryDate, startOfDay(subDays(now, 30)))) {
            return false;
          }
          break;
      }
      
      // Tags filter
      if (selectedTags.length > 0) {
        const hasMatchingTag = entry.tags?.some(tag => selectedTags.includes(tag));
        if (!hasMatchingTag) return false;
      }
      
      return true;
    });
  }, [entries, searchQuery, dateFilter, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setDateFilter('all');
    setSelectedTags([]);
    setSearchQuery('');
  };

  const dateFilterLabels: Record<DateFilter, string> = {
    all: 'Все время',
    today: 'Сегодня',
    week: 'Неделя',
    month: 'Месяц',
  };

  return (
    <div className="fade-in min-h-screen pb-24">
      <div className="p-4 space-y-4 pt-6">
        
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-800">Все записи</h1>
              <p className="text-gray-400 text-sm">
                {filteredEntries.length} из {entries?.length || 0}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Privacy toggle */}
            <button
              onClick={togglePrivacyBlur}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${privacyBlur 
                  ? 'bg-indigo-500 text-white' 
                  : 'bg-gray-100 text-gray-600'}`}
            >
              {privacyBlur ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${hasActiveFilters 
                  ? 'bg-indigo-500 text-white' 
                  : 'bg-gray-100 text-gray-600'}`}
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по записям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-gray-200 
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       text-gray-800 placeholder-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            {/* Date Filter */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4" />
                Период
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'today', 'week', 'month'] as DateFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDateFilter(filter)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                      ${dateFilter === filter 
                        ? 'bg-indigo-500 text-white' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {dateFilterLabels[filter]}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags Filter */}
            {allTags.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Tag className="w-4 h-4" />
                    Теги
                    <span className="text-gray-400 font-normal">({allTags.length})</span>
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(showAllTags ? allTags : allTags.slice(0, MAX_VISIBLE_TAGS)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                        ${selectedTags.includes(tag) 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      #{tag}
                    </button>
                  ))}
                  {allTags.length > MAX_VISIBLE_TAGS && (
                    <button
                      onClick={() => setShowAllTags(!showAllTags)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-blue-500 hover:bg-gray-100"
                    >
                      {showAllTags ? 'Свернуть' : `+${allTags.length - MAX_VISIBLE_TAGS}`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full py-2 text-sm text-red-500 font-medium hover:bg-red-50 rounded-xl transition-colors"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        {/* Active filters pills */}
        {hasActiveFilters && !showFilters && (
          <div className="flex flex-wrap gap-2">
            {dateFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm">
                <Calendar className="w-3 h-3" />
                {dateFilterLabels[dateFilter]}
                <button onClick={() => setDateFilter('all')} className="ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedTags.map(tag => (
              <span 
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm"
              >
                #{tag}
                <button onClick={() => toggleTag(tag)} className="ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Entries List */}
        <div className="space-y-3">
          {entriesLoading && (!entries || entries.length === 0) ? (
            <div className="flex justify-center py-12">
              <Preloader />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
              <div className="mb-4 flex justify-center">
                <FileText className="w-16 h-16 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">
                {hasActiveFilters || searchQuery ? 'Ничего не найдено' : 'Пока нет записей'}
              </h3>
              <p className="text-gray-400 text-sm">
                {hasActiveFilters || searchQuery 
                  ? 'Попробуйте изменить фильтры или поисковый запрос'
                  : 'Создайте первую запись на главной странице'
                }
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredEntries.map((entry) => (
                <div 
                  key={entry.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <EntryCard 
                    entry={entry}
                    onClick={() => navigate(`/entry/${entry.id}`)}
                  />
                </div>
              ))}

              {/* Infinite scroll trigger */}
              {hasMoreEntries && !searchQuery && !hasActiveFilters && (
                <div ref={loadMoreRef} className="py-4 flex justify-center">
                  {entriesLoading && <Preloader />}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

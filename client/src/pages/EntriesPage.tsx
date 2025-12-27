// TODO: Refactor - extract FilterPanel, EntriesList, and custom hooks (useEntriesFilter)
// This file is 500+ lines and could benefit from decomposition

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Preloader } from 'konsta/react';
import { subDays, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { FileText, Search, Filter, X, Calendar, Tag, Eye, EyeOff, Lock, Sparkles, ArrowUpDown, CalendarRange, ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTelegram } from '@/hooks/useTelegram';
import EntryCard from '@/components/EntryCard';
import SkeletonCard from '@/components/SkeletonCard';
import {
  SwipeableList,
  SwipeableListItem,
  SwipeAction,
  TrailingActions,
  Type as ListType,
} from 'react-swipeable-list';
import 'react-swipeable-list/dist/styles.css';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { FREE_SEARCH_LIMIT, MAX_VISIBLE_TAGS } from '@/config/constants';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';
type SortOrder = 'newest' | 'oldest' | 'mood-high' | 'mood-low';
type SearchMode = 'text' | 'ai';

export default function EntriesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { haptic } = useTelegram();
  const {
    entries,
    entriesLoading,
    hasMoreEntries,
    privacyBlur,
    user,
    fetchEntries,
    removeEntry,
    togglePrivacyBlur
  } = useAppStore();

  const isFree = !user || user.subscriptionTier === 'free';

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagParam = searchParams.get('tag');
    return tagParam ? [tagParam] : [];
  });
  const [showAllTags, setShowAllTags] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [searchMode, setSearchMode] = useState<SearchMode>('text');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Need to define hasActiveFilters earlier
  const hasActiveFilters = dateFilter !== 'all' || selectedTags.length > 0 || sortOrder !== 'newest';

  // Infinite scroll observer - using ref to prevent re-creation
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasActiveFiltersRef = useRef(hasActiveFilters);
  hasActiveFiltersRef.current = hasActiveFilters;

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (entriesLoading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(observedEntries => {
      if (observedEntries[0].isIntersecting && hasMoreEntries && !searchQuery && !hasActiveFiltersRef.current) {
        fetchEntries(false);
      }
    });

    if (node) observerRef.current.observe(node);
  }, [entriesLoading, hasMoreEntries, searchQuery, fetchEntries]);

  // Показываем фильтры если пришли с тегом - only on mount
  const initialTagParam = useRef(searchParams.get('tag'));
  useEffect(() => {
    if (initialTagParam.current) {
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

    // For free users, limit to last N entries for search
    let entriesToSearch = entries;
    if (isFree && searchQuery) {
      entriesToSearch = entries.slice(0, FREE_SEARCH_LIMIT);
    }

    const filtered = entriesToSearch.filter(entry => {
      // Text search (AI search would be server-side for Premium)
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
        case 'custom':
          if (customDateFrom) {
            const fromDate = startOfDay(new Date(customDateFrom));
            if (isBefore(entryDate, fromDate)) return false;
          }
          if (customDateTo) {
            const toDate = endOfDay(new Date(customDateTo));
            if (isAfter(entryDate, toDate)) return false;
          }
          break;
      }

      // Tags filter (only for Premium - free users can't filter by tags)
      if (selectedTags.length > 0 && !isFree) {
        const hasMatchingTag = entry.tags?.some(tag => selectedTags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });

    // Sort entries
    return filtered.sort((a, b) => {
      const dateA = new Date(a.dateCreated || 0).getTime();
      const dateB = new Date(b.dateCreated || 0).getTime();
      const moodA = a.moodScore || 0;
      const moodB = b.moodScore || 0;

      switch (sortOrder) {
        case 'oldest':
          return dateA - dateB;
        case 'mood-high':
          return moodB - moodA;
        case 'mood-low':
          return moodA - moodB;
        case 'newest':
        default:
          return dateB - dateA;
      }
    });
  }, [entries, searchQuery, dateFilter, selectedTags, sortOrder, customDateFrom, customDateTo, isFree]);

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
    setSortOrder('newest');
    setCustomDateFrom('');
    setCustomDateTo('');
  };

  const dateFilterLabels: Record<DateFilter, string> = {
    all: 'Все время',
    today: 'Сегодня',
    week: 'Неделя',
    month: 'Месяц',
    custom: 'Произвольно',
  };

  const sortLabels: Record<SortOrder, string> = {
    'newest': 'Новые',
    'oldest': 'Старые',
    'mood-high': 'Настроение ↑',
    'mood-low': 'Настроение ↓',
  };

  const handlePremiumFeature = () => {
    haptic.light();
    navigate('/premium');
  };

  const handleDelete = async (id: string) => {
    // Confirm delete
    if (window.Telegram?.WebApp?.showConfirm) {
      window.Telegram.WebApp.showConfirm('Удалить эту запись безвозвратно?', async (confirmed) => {
        if (confirmed) {
          try {
            haptic.medium();
            // Optimistic update
            removeEntry(id);
            await api.entries.delete(id);
          } catch (error) {
            // If failed, we should probably reload entries or show error, 
            // but for simple optimistic logic this is 'good enough' for now 
            // or we could refetch.
            console.error('Failed to delete', error);
            fetchEntries(true); // Revert on error
          }
        }
      });
    } else {
      // Fallback for web
      if (confirm('Удалить запись?')) {
        try {
          // Optimistic update
          removeEntry(id);
          await api.entries.delete(id);
        } catch (error) {
          console.error(error);
          fetchEntries(true);
        }
      }
    }
  };

  const trailingActions = (id: string) => (
    <TrailingActions>
      <SwipeAction
        destructive={true}
        onClick={() => handleDelete(id)}
      >
        <div className="bg-red-500 text-white flex items-center justify-center w-20 my-1 rounded-r-2xl ml-[-20px] shadow-sm transform translate-x-1">
          <Trash2 className="w-6 h-6" />
        </div>
      </SwipeAction>
    </TrailingActions>
  );

  return (
    <div className="fade-in min-h-screen pb-24">
      <div className="p-4 space-y-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-800 dark:text-white">Все записи</h1>
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
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              {privacyBlur ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${hasActiveFilters
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search with AI toggle */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={searchMode === 'ai' ? "Умный поиск по смыслу..." : "Поиск по записям..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-24 py-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         text-gray-800 dark:text-white placeholder-gray-400"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {/* AI Search toggle - Premium only */}
              <button
                onClick={() => isFree ? handlePremiumFeature() : setSearchMode(searchMode === 'ai' ? 'text' : 'ai')}
                className={`p-1.5 rounded-lg transition-colors ${searchMode === 'ai'
                  ? 'bg-purple-500 text-white'
                  : isFree
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Free search limit notice */}
          {isFree && searchQuery && (
            <p className="text-xs text-gray-400 px-2 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Поиск по последним {FREE_SEARCH_LIMIT} записям.
              <button onClick={handlePremiumFeature} className="text-purple-500 underline">
                Снять ограничение
              </button>
            </p>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="space-y-3">

            {/* Sort Order - Premium */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2 px-1">
                <ArrowUpDown className="w-3.5 h-3.5" />
                Сортировка
                {isFree && <Lock className="w-3 h-3 text-purple-400" />}
              </div>
              <div className={`flex gap-1.5 overflow-x-auto no-scrollbar ${isFree ? 'opacity-50' : ''}`}>
                {(['newest', 'oldest', 'mood-high', 'mood-low'] as SortOrder[]).map((order) => (
                  <button
                    key={order}
                    onClick={() => isFree ? handlePremiumFeature() : setSortOrder(order)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all
                      ${sortOrder === order
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-600'}`}
                  >
                    {sortLabels[order]}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Filter */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2 px-1">
                <Calendar className="w-3.5 h-3.5" />
                Период
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {(['all', 'today', 'week', 'month'] as DateFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDateFilter(filter)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0
                      ${dateFilter === filter
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-600'}`}
                  >
                    {dateFilterLabels[filter]}
                  </button>
                ))}
                {/* Custom date - Premium */}
                <button
                  onClick={() => isFree ? handlePremiumFeature() : setDateFilter('custom')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 flex-shrink-0
                    ${dateFilter === 'custom'
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-600'}`}
                >
                  <CalendarRange className="w-3 h-3" />
                  {dateFilterLabels.custom}
                  {isFree && <Lock className="w-2.5 h-2.5 text-purple-400" />}
                </button>
              </div>

              {/* Custom date inputs */}
              {dateFilter === 'custom' && !isFree && (
                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="min-w-[130px] flex-1 px-3 py-2 text-xs border border-gray-100 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="min-w-[130px] flex-1 px-3 py-2 text-xs border border-gray-100 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Tags Filter - Premium */}
            {allTags.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700 relative">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <Tag className="w-3.5 h-3.5" />
                    Теги
                    <span className="text-gray-400">({allTags.length})</span>
                    {isFree && <Lock className="w-3 h-3 text-purple-400" />}
                  </div>
                  {selectedTags.length > 0 && !isFree && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-xs text-indigo-500"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <div className={`flex flex-wrap gap-1.5 ${isFree ? 'blur-[2px] pointer-events-none' : ''}`}>
                  {(showAllTags ? allTags : allTags.slice(0, MAX_VISIBLE_TAGS)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => !isFree && toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all
                        ${selectedTags.includes(tag)
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-600'}`}
                    >
                      #{tag}
                    </button>
                  ))}
                  {allTags.length > MAX_VISIBLE_TAGS && !isFree && (
                    <button
                      onClick={() => setShowAllTags(!showAllTags)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                    >
                      {showAllTags ? 'Меньше' : `+${allTags.length - MAX_VISIBLE_TAGS}`}
                    </button>
                  )}
                </div>
                {isFree && (
                  <button
                    onClick={handlePremiumFeature}
                    className="absolute inset-0 flex items-center justify-center"
                  />
                )}
              </div>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full py-2.5 text-xs text-gray-500 dark:text-gray-400 font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Сбросить все фильтры
              </button>
            )}
          </div>
        )}

        {/* Active filters pills */}
        {hasActiveFilters && !showFilters && (
          <div className="flex flex-wrap gap-2">
            {dateFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-sm">
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
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm"
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
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <div className="mb-4 flex justify-center">
                <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
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
              <SwipeableList
                fullSwipe={true}
                type={ListType.IOS}
                className="space-y-3"
              >
                {filteredEntries.map((entry) => (
                  <SwipeableListItem
                    key={entry.id}
                    trailingActions={trailingActions(entry.id)}
                    className="block" // Fix layout
                  >
                    <div
                      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden w-full relative z-10"
                    >
                      <EntryCard
                        entry={entry}
                        onClick={() => navigate(`/entry/${entry.id}`)}
                      />
                    </div>
                  </SwipeableListItem>
                ))}
              </SwipeableList>

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

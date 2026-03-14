/**
 * useMovies — fetches movies from API (AI or TMDB/CSV), caches in Dexie, applies filters.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import type { Movie, GameSettings } from '@/types'
import { fetchMovies, generateAiMovies } from '@/services/api'
import {
  cacheMovies,
  getCachedMovies,
  shuffle,
  prunePlayHistory,
} from '@/db/dexie'
import { useGameStore } from '@/store/gameStore'
import {
  buildSettingsCacheKey,
  getQueueEntry,
  getQueueMovieIds,
  saveQueueFromMovies,
  setQueueMovieIds,
} from '@/services/localMovieCache'

interface UseMoviesReturn {
  loading: boolean
  error: string | null
  source: 'tmdb' | 'csv' | 'ai' | null
  totalMovies: number
  refresh: () => Promise<void>
}

function applyFilters(movies: Movie[], settings: GameSettings): Movie[] {
  let filtered = [...movies]

  // Language filter
  if (settings.languageFilter === 'hindi') {
    filtered = filtered.filter((m) => m.language === 'hi' || m.original_language === 'hi')
  }

  // Era filter
  if (settings.era !== 'all') {
    filtered = filtered.filter((m) => m.era === settings.era)
    // If filter is too restrictive, fall back to full list
    if (filtered.length < 10) filtered = [...movies]
  }

  // Popularity tier
  if (filtered.length >= 30) {
    const sorted = [...filtered].sort((a, b) => b.popularity - a.popularity)
    const total = sorted.length
    if (settings.popularityTier === 'easy') {
      // Top 33%
      filtered = sorted.slice(0, Math.ceil(total * 0.33))
    } else if (settings.popularityTier === 'medium') {
      // Middle 33%
      const start = Math.floor(total * 0.33)
      const end = Math.floor(total * 0.67)
      filtered = sorted.slice(start, end)
    } else {
      // Bottom 33% (hard = obscure)
      filtered = sorted.slice(Math.floor(total * 0.67))
    }
    // Safety: always keep at least 20 movies
    if (filtered.length < 20) filtered = movies
  }

  return shuffle(filtered)
}

export function useMovies(): UseMoviesReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'tmdb' | 'csv' | 'ai' | null>(null)
  const [totalMovies, setTotalMovies] = useState(0)
  const { settings, setMoviePool, serverConfig, setActiveCacheKey } = useGameStore()
  const settingsRef = useRef(settings)
  const hasInitializedRef = useRef(false)
  settingsRef.current = settings

  const { addTokenUsage } = useGameStore()

  const shouldUseAi = useCallback(() => {
    const current = settingsRef.current
    const customOpenAIKey = (current.openaiApiKey ?? '').trim()
    return customOpenAIKey.length > 0 || (serverConfig?.openaiKeyConfigured ?? false)
  }, [serverConfig?.openaiKeyConfigured])

  const setPool = useCallback(
    (movies: Movie[], src: 'tmdb' | 'csv' | 'ai', cacheKey: string, persistQueue: boolean) => {
      setMoviePool(movies)
      setSource(src)
      setTotalMovies(movies.length)
      setActiveCacheKey(cacheKey)
      if (persistQueue) {
        saveQueueFromMovies(cacheKey, movies, src)
      }
    },
    [setMoviePool, setActiveCacheKey],
  )

  const buildPool = useCallback(
    (
      allMovies: Movie[],
      src: 'tmdb' | 'csv' | 'ai',
      cacheKey: string,
      persistQueue: boolean,
    ): Movie[] => {
      const pool =
        src === 'ai' ? shuffle([...allMovies]) : applyFilters(allMovies, settingsRef.current)
      setPool(pool, src, cacheKey, persistQueue)
      return pool
    },
    [setPool],
  )

  const hydrateQueueFromDexie = useCallback(
    async (cacheKey: string): Promise<boolean> => {
      const queueIds = getQueueMovieIds(cacheKey)
      if (queueIds.length === 0) return false

      const cached = await getCachedMovies()
      if (cached.length === 0) return false

      const byId = new Map(cached.map((movie) => [movie.id, movie] as const))
      const hydrated: Movie[] = []
      for (const id of queueIds) {
        const movie = byId.get(id)
        if (movie) hydrated.push(movie)
      }
      if (hydrated.length === 0) {
        setQueueMovieIds(cacheKey, [], getQueueEntry(cacheKey)?.source ?? 'csv')
        return false
      }

      const queueSource = getQueueEntry(cacheKey)?.source ?? hydrated[0]?.source ?? 'csv'
      if (hydrated.length !== queueIds.length) {
        setQueueMovieIds(
          cacheKey,
          hydrated.map((movie) => movie.id),
          queueSource,
        )
      }
      setPool(hydrated, queueSource, cacheKey, false)
      return true
    },
    [setPool],
  )

  const hydrateFromRawCache = useCallback(
    async (cacheKey: string, useAi: boolean): Promise<boolean> => {
      const cached = await getCachedMovies()
      if (cached.length === 0) return false

      const current = settingsRef.current
      const hydratedSource: 'tmdb' | 'csv' | 'ai' = useAi
        ? 'ai'
        : cached.some((movie) => movie.source === 'tmdb')
          ? 'tmdb'
          : 'csv'

      let candidates: Movie[]
      if (useAi) {
        candidates = cached.filter((movie) => movie.source === 'ai')
        if (current.era !== 'all') {
          candidates = candidates.filter((movie) => movie.era === current.era)
        }
        if (current.languageFilter === 'hindi') {
          candidates = candidates.filter(
            (movie) => movie.language === 'hi' || movie.original_language === 'hi',
          )
        }
        candidates = candidates.filter(
          (movie) => !movie.difficulty || movie.difficulty === current.popularityTier,
        )
      } else {
        candidates = cached.filter((movie) => movie.source !== 'ai')
      }

      if (candidates.length === 0) return false
      const pool = buildPool(candidates, hydratedSource, cacheKey, true)
      return pool.length > 0
    },
    [buildPool],
  )

  const fetchAndPopulate = useCallback(
    async (cacheKey: string, useAi: boolean) => {
      const current = settingsRef.current
      const customOpenAIKey = (current.openaiApiKey ?? '').trim()

      if (useAi) {
        try {
          const res = await generateAiMovies({
            model: current.openaiModel || 'gpt-4.1-mini',
            difficulty: current.popularityTier,
            era: current.era,
            language: current.languageFilter,
            batch_size: 15,
            openaiApiKey: customOpenAIKey || undefined,
            tmdbApiKey: (current.tmdbApiKey ?? '').trim() || undefined,
          })
          await cacheMovies(res.movies)
          buildPool(res.movies, 'ai', cacheKey, true)
          addTokenUsage(res.token_usage.prompt_tokens, res.token_usage.completion_tokens)
          return
        } catch (aiErr) {
          console.warn('AI generate failed, falling back to movies API:', aiErr)
        }
      }

      const res = await fetchMovies({
        hindi_only: current.languageFilter === 'hindi',
        pages: 5,
        source: 'auto',
        tmdbApiKey: (current.tmdbApiKey ?? '').trim() || undefined,
      })
      await cacheMovies(res.movies)
      buildPool(res.movies, res.source, cacheKey, true)
    },
    [addTokenUsage, buildPool],
  )

  const ensureMoviesForCurrentSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const useAi = shouldUseAi()
    const cacheKey = buildSettingsCacheKey(settingsRef.current, useAi)

    try {
      const queueHydrated = await hydrateQueueFromDexie(cacheKey)
      if (queueHydrated) return

      const rawHydrated = await hydrateFromRawCache(cacheKey, useAi)
      if (rawHydrated) return

      await fetchAndPopulate(cacheKey, useAi)
    } catch (apiErr) {
      console.warn('Failed to load movies for current settings:', apiErr)
      const queueHydrated = await hydrateQueueFromDexie(cacheKey)
      if (!queueHydrated) {
        setError('Unable to load movies. Please check your connection.')
      }
    } finally {
      setLoading(false)
    }
  }, [fetchAndPopulate, hydrateFromRawCache, hydrateQueueFromDexie, shouldUseAi])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const useAi = shouldUseAi()
    const cacheKey = buildSettingsCacheKey(settingsRef.current, useAi)

    try {
      await fetchAndPopulate(cacheKey, useAi)
    } catch (apiErr) {
      console.warn('API fetch failed, trying settings cache:', apiErr)
      try {
        const hydrated = await hydrateQueueFromDexie(cacheKey)
        if (!hydrated) {
          setError('Unable to load movies. Please check your connection.')
        }
      } catch (cacheErr) {
        setError('Failed to load movies from cache.')
        console.error(cacheErr)
      }
    } finally {
      setLoading(false)
    }
  }, [
    fetchAndPopulate,
    hydrateQueueFromDexie,
    shouldUseAi,
  ])

  // Initial load
  useEffect(() => {
    const init = async () => {
      await prunePlayHistory()
      await ensureMoviesForCurrentSettings()
      hasInitializedRef.current = true
    }
    init().catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-load per-settings queue when filters change.
  useEffect(() => {
    if (!hasInitializedRef.current) return
    ensureMoviesForCurrentSettings().catch(console.error)
  }, [
    settings.era,
    settings.languageFilter,
    settings.popularityTier,
    settings.openaiModel,
    settings.tmdbApiKey,
    settings.openaiApiKey,
    serverConfig?.openaiKeyConfigured,
    ensureMoviesForCurrentSettings,
  ])

  return { loading, error, source, totalMovies, refresh }
}

/**
 * useMovies — fetches movies from API, caches in Dexie, applies filters.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import type { Movie, GameSettings } from '@/types'
import { fetchMovies } from '@/services/api'
import {
  cacheMovies,
  getCachedMovies,
  hasFreshCache,
  shuffle,
  prunePlayHistory,
} from '@/db/dexie'
import { useGameStore } from '@/store/gameStore'

interface UseMoviesReturn {
  loading: boolean
  error: string | null
  source: 'tmdb' | 'csv' | null
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
  const [source, setSource] = useState<'tmdb' | 'csv' | null>(null)
  const [totalMovies, setTotalMovies] = useState(0)
  const { settings, setMoviePool } = useGameStore()
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const loadAndFilter = useCallback(async (allMovies: Movie[], src: 'tmdb' | 'csv') => {
    const filtered = applyFilters(allMovies, settingsRef.current)
    setMoviePool(filtered)
    setSource(src)
    setTotalMovies(filtered.length)
  }, [setMoviePool])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Try API first
      const res = await fetchMovies({
        hindi_only: settings.languageFilter === 'hindi',
        pages: 5,
        source: 'auto',
        tmdbApiKey: settings.tmdbApiKey || undefined,
      })
      await cacheMovies(res.movies)
      await loadAndFilter(res.movies, res.source)
    } catch (apiErr) {
      console.warn('API fetch failed, trying Dexie cache:', apiErr)
      try {
        const cached = await getCachedMovies()
        if (cached.length > 0) {
          await loadAndFilter(cached, cached[0]?.source ?? 'csv')
        } else {
          setError('Unable to load movies. Please check your connection.')
        }
      } catch (cacheErr) {
        setError('Failed to load movies from cache.')
        console.error(cacheErr)
      }
    } finally {
      setLoading(false)
    }
  }, [settings.languageFilter, settings.tmdbApiKey, loadAndFilter])

  // Initial load
  useEffect(() => {
    const init = async () => {
      await prunePlayHistory()
      const fresh = await hasFreshCache()
      if (fresh) {
        const cached = await getCachedMovies()
        await loadAndFilter(cached, cached[0]?.source ?? 'csv')
      } else {
        await refresh()
      }
    }
    init().catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-filter when settings change (without re-fetching from API).
  // When the API key changes, do a full refresh so TMDB is re-tried.
  useEffect(() => {
    const refilter = async () => {
      const cached = await getCachedMovies()
      if (cached.length > 0) {
        await loadAndFilter(cached, cached[0]?.source ?? 'csv')
      }
    }
    refilter().catch(console.error)
  }, [settings.era, settings.languageFilter, settings.popularityTier, loadAndFilter])

  useEffect(() => {
    refresh().catch(console.error)
  }, [settings.tmdbApiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, error, source, totalMovies, refresh }
}

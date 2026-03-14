/**
 * Dexie (IndexedDB) schema for Charades.
 * Stores movies locally to minimize TMDB API calls.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { Movie } from '@/types'

interface CachedMovie extends Movie {
  cachedAt: number // unix ms
}

interface PlayedMovie {
  id?: number
  movieId: string
  sessionId: string
  playedAt: number // unix ms
}

interface AppSetting {
  key: string
  value: string
}

class CharadesDB extends Dexie {
  movies!: EntityTable<CachedMovie, 'id'>
  playHistory!: EntityTable<PlayedMovie, 'id'>
  settings!: EntityTable<AppSetting, 'key'>

  constructor() {
    super('CharadesDB')
    this.version(1).stores({
      movies: 'id, era, language, popularity, source, cachedAt',
      playHistory: '++id, movieId, sessionId, playedAt',
      settings: 'key',
    })
  }
}

export const db = new CharadesDB()

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Cache movies, replacing stale entries */
export async function cacheMovies(movies: Movie[]): Promise<void> {
  const now = Date.now()
  const records: CachedMovie[] = movies.map((m) => ({ ...m, cachedAt: now }))
  await db.movies.bulkPut(records)
}

/** Get all valid (non-expired) cached movies */
export async function getCachedMovies(): Promise<Movie[]> {
  const cutoff = Date.now() - CACHE_TTL_MS
  const records = await db.movies.where('cachedAt').above(cutoff).toArray()
  return records
}

/** Check if we have a valid, non-empty cache */
export async function hasFreshCache(): Promise<boolean> {
  const cutoff = Date.now() - CACHE_TTL_MS
  const count = await db.movies.where('cachedAt').above(cutoff).count()
  return count > 50 // require at least 50 movies
}

/** Record a movie as played in this session */
export async function recordPlayed(movieId: string, sessionId: string): Promise<void> {
  await db.playHistory.add({ movieId, sessionId, playedAt: Date.now() })
}

/** Get IDs of all movies seen in the current session */
export async function getSessionPlayedIds(sessionId: string): Promise<Set<string>> {
  const records = await db.playHistory.where('sessionId').equals(sessionId).toArray()
  return new Set(records.map((r) => r.movieId))
}

/** Clear play history older than 7 days */
export async function prunePlayHistory(): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  await db.playHistory.where('playedAt').below(cutoff).delete()
}

/** Persist an app setting */
export async function saveSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}

/** Read an app setting */
export async function loadSetting(key: string): Promise<string | undefined> {
  const record = await db.settings.get(key)
  return record?.value
}

/** Fisher-Yates shuffle — mutates the array */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

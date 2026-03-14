import type { GameSettings, Movie } from '@/types'

type QueueSource = Movie['source']

interface SettingsQueueEntry {
  movieIds: string[]
  source: QueueSource
  updatedAt: number
}

type SettingsQueueMap = Record<string, SettingsQueueEntry>

const STORAGE_KEY = 'charades-movie-queues-v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readMap(): SettingsQueueMap {
  if (!canUseStorage()) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as SettingsQueueMap
  } catch {
    return {}
  }
}

function writeMap(map: SettingsQueueMap): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }
  return ordered
}

export function buildSettingsCacheKey(settings: GameSettings, useAi: boolean): string {
  const mode = useAi ? 'ai' : 'catalog'
  const model = useAi ? settings.openaiModel || 'gpt-4.1-mini' : 'none'
  return [
    `mode:${mode}`,
    `era:${settings.era}`,
    `lang:${settings.languageFilter}`,
    `difficulty:${settings.popularityTier}`,
    `model:${model}`,
  ].join('|')
}

export function getQueueEntry(cacheKey: string): SettingsQueueEntry | null {
  const map = readMap()
  return map[cacheKey] ?? null
}

export function getQueueMovieIds(cacheKey: string): string[] {
  const entry = getQueueEntry(cacheKey)
  return entry ? [...entry.movieIds] : []
}

export function setQueueMovieIds(
  cacheKey: string,
  movieIds: string[],
  source: QueueSource = 'csv',
): void {
  const map = readMap()
  map[cacheKey] = {
    movieIds: uniqueIds(movieIds),
    source,
    updatedAt: Date.now(),
  }
  writeMap(map)
}

export function saveQueueFromMovies(
  cacheKey: string,
  movies: Movie[],
  source: QueueSource = movies[0]?.source ?? 'csv',
): void {
  setQueueMovieIds(
    cacheKey,
    movies.map((movie) => movie.id),
    source,
  )
}

export function rotateQueueMovie(cacheKey: string, movieId: string): void {
  if (!movieId) return
  const map = readMap()
  const entry = map[cacheKey]
  if (!entry || entry.movieIds.length === 0) return

  const ids = [...entry.movieIds]
  const index = ids.indexOf(movieId)
  if (index < 0) return

  const [selected] = ids.splice(index, 1)
  if (!selected) return
  ids.push(selected)

  map[cacheKey] = { ...entry, movieIds: ids, updatedAt: Date.now() }
  writeMap(map)
}

export function consumeQueueMovie(cacheKey: string, movieId: string): void {
  if (!movieId) return
  const map = readMap()
  const entry = map[cacheKey]
  if (!entry || entry.movieIds.length === 0) return

  const nextIds = entry.movieIds.filter((id) => id !== movieId)
  map[cacheKey] = { ...entry, movieIds: nextIds, updatedAt: Date.now() }
  writeMap(map)
}

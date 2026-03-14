/** Flask API client */
import type { Era, LanguageFilter, Movie, PopularityTier, ServerConfig, TokenUsage } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export async function getServerConfig(): Promise<ServerConfig> {
  const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  const data = (await res.json()) as {
    status?: string
    openai_configured?: boolean
    openai_model?: string
    tmdb_configured?: boolean
  }
  return {
    openaiKeyConfigured: Boolean(data.openai_configured),
    openaiModel: data.openai_model,
    tmdbKeyConfigured: Boolean(data.tmdb_configured),
  }
}

interface MoviesResponse {
  movies: Movie[]
  source: 'tmdb' | 'csv'
  total: number
}

export interface AiMoviesResponse {
  movies: Movie[]
  source: 'ai'
  total: number
  token_usage: TokenUsage
}

export async function fetchMovies(
  params: {
    hindi_only?: boolean
    pages?: number
    source?: 'auto' | 'csv' | 'tmdb'
    tmdbApiKey?: string
    era?: Era
    difficulty?: PopularityTier
  } = {},
): Promise<MoviesResponse> {
  const query = new URLSearchParams()
  if (params.hindi_only) query.set('hindi_only', 'true')
  if (params.pages) query.set('pages', String(params.pages))
  if (params.source) query.set('source', params.source)
  if (params.era && params.era !== 'all') query.set('era', params.era)
  if (params.difficulty) query.set('difficulty', params.difficulty)

  const headers: Record<string, string> = {}
  if (params.tmdbApiKey) headers['X-TMDB-Key'] = params.tmdbApiKey

  const url = `${API_BASE}/api/movies${query.toString() ? '?' + query.toString() : ''}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<MoviesResponse>
}

export async function generateAiMovies(params: {
  model: string
  difficulty: PopularityTier
  era: Era
  language: LanguageFilter
  batch_size?: number
  openaiApiKey?: string
  tmdbApiKey?: string
  /** Movie IDs recently played — backend will exclude them from TMDB results */
  exclude_ids?: string[]
}): Promise<AiMoviesResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (params.openaiApiKey) headers['X-OpenAI-Key'] = params.openaiApiKey
  if (params.tmdbApiKey) headers['X-TMDB-Key'] = params.tmdbApiKey

  const body = {
    model: params.model,
    difficulty: params.difficulty,
    era: params.era,
    language: params.language,
    batch_size: params.batch_size ?? 15,
    exclude_ids: params.exclude_ids ?? [],
  }

  const res = await fetch(`${API_BASE}/api/movies/ai-generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `API error ${res.status}`)
  }
  return res.json() as Promise<AiMoviesResponse>
}

export interface RecordPlayedParams {
  movie_id: string
  title: string
  year?: number | null
  language?: string
  difficulty?: string
  source?: string
  session_id?: string
  action: 'got_it' | 'skipped' | 'timeout'
  played_at?: number
}

/**
 * Record a played movie in the server-side SQLite database.
 * Fire-and-forget — failures are logged but don't affect gameplay.
 */
export async function recordPlayedMovie(params: RecordPlayedParams): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/history/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    // Non-critical: ignore network errors for history recording
  }
}

export async function getServerPlayedIds(daysBack = 30): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/history/played-ids?days_back=${daysBack}&actions=got_it`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { ids: string[] }
    return data.ids ?? []
  } catch {
    return []
  }
}

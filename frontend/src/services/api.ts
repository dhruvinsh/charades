/** Flask API client */
import type { Era, LanguageFilter, Movie, PopularityTier, TokenUsage } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

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

export async function fetchMovies(params: {
  hindi_only?: boolean
  pages?: number
  source?: 'auto' | 'csv' | 'tmdb'
  tmdbApiKey?: string
} = {}): Promise<MoviesResponse> {
  const query = new URLSearchParams()
  if (params.hindi_only) query.set('hindi_only', 'true')
  if (params.pages) query.set('pages', String(params.pages))
  if (params.source) query.set('source', params.source)

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

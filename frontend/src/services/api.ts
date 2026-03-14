/** Flask API client */
import type { Movie } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

interface MoviesResponse {
  movies: Movie[]
  source: 'tmdb' | 'csv'
  total: number
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

/** Shared TypeScript types for Charades */

export interface Movie {
  id: string
  title: string
  year: number | null
  language: string
  original_language: string
  popularity: number
  poster_path: string | null
  source: 'tmdb' | 'csv'
  era: '90s' | '2000s' | '2010s' | '2020s' | 'unknown'
  tmdb_id?: number
}

export type Era = 'all' | '90s' | '2000s' | '2010s' | '2020s'
export type PopularityTier = 'easy' | 'medium' | 'hard'
export type LanguageFilter = 'all' | 'hindi'

export interface GameSettings {
  timerSeconds: number
  era: Era
  languageFilter: LanguageFilter
  popularityTier: PopularityTier
  skipLimit: number | null // null = unlimited
  hintsEnabled: boolean
  tmdbApiKey: string // user-supplied TMDB key (stored in localStorage, sent via header)
}

export interface GameState {
  phase: 'idle' | 'playing' | 'paused' | 'finished'
  currentMovie: Movie | null
  timeLeft: number
  skipsRemaining: number | null
  totalMoviesSeen: number
  sessionId: string
}

export const DEFAULT_SETTINGS: GameSettings = {
  timerSeconds: 120,
  era: 'all',
  languageFilter: 'all',
  popularityTier: 'medium',
  skipLimit: 3,
  hintsEnabled: true,
  tmdbApiKey: '',
}

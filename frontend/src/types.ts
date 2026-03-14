/** Shared TypeScript types for Charades */

export interface AiHints {
  tagline?: string | null
  actor_clue?: string | null
  famous_dialogue?: string | null
}

export interface Movie {
  id: string
  title: string
  year: number | null
  language: string
  original_language: string
  popularity: number
  vote_count?: number
  word_count?: number
  poster_path: string | null
  source: 'tmdb' | 'csv' | 'ai'
  era: '90s' | '2000s' | '2010s' | '2020s' | 'unknown'
  tmdb_id?: number
  difficulty?: 'easy' | 'medium' | 'hard'
  ai_hints?: AiHints
}

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  model: string
}

export interface ServerConfig {
  openaiKeyConfigured: boolean
  openaiModel?: string
  tmdbKeyConfigured?: boolean
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
  tmdbApiKey: string
  openaiApiKey: string
  openaiModel: string
}

export interface GameState {
  /** between = "Got It!" pressed, waiting for player to hit "Next Movie" */
  phase: 'idle' | 'playing' | 'paused' | 'between' | 'finished'
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
  openaiApiKey: '',
  openaiModel: 'gpt-4.1-mini',
}

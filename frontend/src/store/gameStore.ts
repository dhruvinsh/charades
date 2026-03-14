/**
 * Zustand game store — manages all game state.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GameSettings, GameState, Movie, ServerConfig } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

interface GameStore {
  settings: GameSettings
  game: GameState
  moviePool: Movie[]
  activeCacheKey: string | null
  aiTokenUsage: { totalPrompt: number; totalCompletion: number }
  serverConfig: ServerConfig | null

  // Settings actions
  updateSettings: (patch: Partial<GameSettings>) => void
  setServerConfig: (config: ServerConfig | null) => void
  setActiveCacheKey: (cacheKey: string | null) => void

  // Token usage (AI cost counter)
  addTokenUsage: (prompt: number, completion: number) => void
  resetTokenUsage: () => void

  // Pool actions
  setMoviePool: (movies: Movie[]) => void

  // Game lifecycle
  startGame: () => void
  pauseGame: () => void
  resumeGame: () => void
  finishGame: () => void
  resetGame: () => void
  tickTimer: () => void
  skipMovie: () => void
  nextMovie: () => void
}

const makeSessionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const INITIAL_GAME: GameState = {
  phase: 'idle',
  currentMovie: null,
  timeLeft: DEFAULT_SETTINGS.timerSeconds,
  skipsRemaining: DEFAULT_SETTINGS.skipLimit,
  totalMoviesSeen: 0,
  sessionId: makeSessionId(),
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },
      game: { ...INITIAL_GAME },
      moviePool: [],
      activeCacheKey: null,
      aiTokenUsage: { totalPrompt: 0, totalCompletion: 0 },
      serverConfig: null,

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }))
      },

      setServerConfig: (config) => {
        set({ serverConfig: config })
      },

      setActiveCacheKey: (cacheKey) => {
        set({ activeCacheKey: cacheKey })
      },

      addTokenUsage: (prompt, completion) => {
        set((s) => ({
          aiTokenUsage: {
            totalPrompt: s.aiTokenUsage.totalPrompt + prompt,
            totalCompletion: s.aiTokenUsage.totalCompletion + completion,
          },
        }))
      },

      resetTokenUsage: () => {
        set({ aiTokenUsage: { totalPrompt: 0, totalCompletion: 0 } })
      },

      setMoviePool: (movies) => {
        set({ moviePool: movies })
      },

      startGame: () => {
        const { settings, moviePool } = get()
        const movie = moviePool[0] ?? null
        set({
          game: {
            phase: 'playing',
            currentMovie: movie,
            timeLeft: settings.timerSeconds,
            skipsRemaining: settings.skipLimit,
            totalMoviesSeen: movie ? 1 : 0,
            sessionId: makeSessionId(),
          },
        })
      },

      pauseGame: () =>
        set((s) => ({ game: { ...s.game, phase: 'paused' } })),

      resumeGame: () =>
        set((s) => ({ game: { ...s.game, phase: 'playing' } })),

      finishGame: () =>
        set((s) => ({ game: { ...s.game, phase: 'finished' } })),

      resetGame: () => {
        const { settings } = get()
        set({
          game: {
            ...INITIAL_GAME,
            timeLeft: settings.timerSeconds,
            skipsRemaining: settings.skipLimit,
            sessionId: makeSessionId(),
          },
        })
      },

      tickTimer: () => {
        const { game, moviePool } = get()
        if (game.phase !== 'playing') return
        const newTime = game.timeLeft - 1
        if (newTime <= 0) {
          const nextPool = moviePool.length > 0 ? moviePool.slice(1) : moviePool
          set({
            moviePool: nextPool,
            game: { ...game, timeLeft: 0, phase: 'finished' },
          })
        } else {
          set({ game: { ...game, timeLeft: newTime } })
        }
      },

      skipMovie: () => {
        const { game, settings, moviePool } = get()
        if (game.phase !== 'playing') return
        if (settings.skipLimit !== null && (game.skipsRemaining ?? 0) <= 0) return
        if (moviePool.length === 0) return

        const [current, ...rest] = moviePool
        if (!current) return
        const rotatedPool = [...rest, current]
        const nextMovie = rotatedPool[0] ?? null
        set({
          moviePool: rotatedPool,
          game: {
            ...game,
            currentMovie: nextMovie,
            timeLeft: settings.timerSeconds,
            skipsRemaining:
              settings.skipLimit !== null ? Math.max((game.skipsRemaining ?? 0) - 1, 0) : null,
            totalMoviesSeen: game.totalMoviesSeen + 1,
          },
        })
      },

      nextMovie: () => {
        const { game, settings, moviePool } = get()
        if (game.phase !== 'playing') return

        const remainingPool = moviePool.length > 0 ? moviePool.slice(1) : moviePool
        const nextMovie = remainingPool[0] ?? null
        set({
          moviePool: remainingPool,
          game: {
            ...game,
            phase: nextMovie ? 'playing' : 'finished',
            currentMovie: nextMovie,
            timeLeft: settings.timerSeconds,
            totalMoviesSeen: game.totalMoviesSeen + 1,
          },
        })
      },
    }),
    {
      name: 'charades-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings, aiTokenUsage: s.aiTokenUsage }),
    },
  ),
)

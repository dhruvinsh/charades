/**
 * Zustand game store — manages all game state.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GameSettings, GameState, Movie } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

interface GameStore {
  settings: GameSettings
  game: GameState
  moviePool: Movie[]
  poolIndex: number

  // Settings actions
  updateSettings: (patch: Partial<GameSettings>) => void

  // Pool actions
  setMoviePool: (movies: Movie[]) => void
  advancePool: () => void

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
      poolIndex: 0,

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }))
      },

      setMoviePool: (movies) => {
        set({ moviePool: movies, poolIndex: 0 })
      },

      advancePool: () => {
        set((s) => ({ poolIndex: (s.poolIndex + 1) % Math.max(s.moviePool.length, 1) }))
      },

      startGame: () => {
        const { settings, moviePool, poolIndex } = get()
        const movie = moviePool[poolIndex] ?? null
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
          poolIndex: 0,
        })
      },

      tickTimer: () => {
        const { game } = get()
        if (game.phase !== 'playing') return
        const newTime = game.timeLeft - 1
        if (newTime <= 0) {
          set({ game: { ...game, timeLeft: 0, phase: 'finished' } })
        } else {
          set({ game: { ...game, timeLeft: newTime } })
        }
      },

      skipMovie: () => {
        const { game, settings, moviePool, poolIndex } = get()
        if (game.phase !== 'playing') return
        if (settings.skipLimit !== null && (game.skipsRemaining ?? 0) <= 0) return

        const newIndex = (poolIndex + 1) % Math.max(moviePool.length, 1)
        const nextMovie = moviePool[newIndex] ?? null
        set({
          poolIndex: newIndex,
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
        const { game, settings, moviePool, poolIndex } = get()
        if (game.phase !== 'playing') return

        const newIndex = (poolIndex + 1) % Math.max(moviePool.length, 1)
        const nextMovie = moviePool[newIndex] ?? null
        set({
          poolIndex: newIndex,
          game: {
            ...game,
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
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
)

import { useState, useCallback, useEffect, useRef } from 'react'
import Navbar from '@/components/Navbar'
import MovieCard from '@/components/MovieCard'
import Timer from '@/components/Timer'
import Controls from '@/components/Controls'
import SettingsPanel from '@/components/SettingsPanel'
import { useMovies } from '@/hooks/useMovies'
import { useTimer } from '@/hooks/useTimer'
import { useGameStore } from '@/store/gameStore'
import { recordPlayed } from '@/db/dexie'
import { consumeQueueMovie, rotateQueueMovie } from '@/services/localMovieCache'
import { getServerConfig, recordPlayedMovie } from '@/services/api'
import type { Movie } from '@/types'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { loading, error, source, totalMovies, refresh } = useMovies()
  const { playStart, playGotIt } = useTimer()
  const timedOutMarkerRef = useRef<string | null>(null)

  const {
    settings,
    game,
    moviePool,
    activeCacheKey,
    startGame,
    skipMovie,
    nextMovie,
    resetGame,
    setServerConfig,
  } = useGameStore()

  useEffect(() => {
    getServerConfig()
      .then(setServerConfig)
      .catch(() => setServerConfig(null))
  }, [setServerConfig])

  /** Fire-and-forget: record to both local IndexedDB and server SQLite */
  const trackMovie = useCallback(
    (movie: Movie, action: 'got_it' | 'skipped' | 'timeout') => {
      recordPlayed(movie.id, game.sessionId, action).catch(console.error)
      recordPlayedMovie({
        movie_id: movie.id,
        title: movie.title,
        year: movie.year,
        language: movie.language,
        difficulty: movie.difficulty,
        source: movie.source,
        session_id: game.sessionId,
        action,
        played_at: Date.now(),
      })
    },
    [game.sessionId],
  )

  const handleGenerate = useCallback(async () => {
    if (useGameStore.getState().moviePool.length === 0) {
      await refresh()
    }
    if (useGameStore.getState().moviePool.length === 0) return
    startGame()
    playStart()
  }, [refresh, startGame, playStart])

  const handleSkip = useCallback(() => {
    if (game.currentMovie) {
      if (activeCacheKey) {
        rotateQueueMovie(activeCacheKey, game.currentMovie.id)
      }
      trackMovie(game.currentMovie, 'skipped')
    }
    skipMovie()
  }, [activeCacheKey, game, skipMovie, trackMovie])

  const handleGotIt = useCallback(() => {
    if (game.currentMovie) {
      if (activeCacheKey) {
        consumeQueueMovie(activeCacheKey, game.currentMovie.id)
      }
      trackMovie(game.currentMovie, 'got_it')
    }
    playGotIt()
    nextMovie()
    if (useGameStore.getState().moviePool.length === 0) {
      refresh().catch(console.error)
    }
  }, [activeCacheKey, game, nextMovie, refresh, trackMovie, playGotIt])

  // Handle timer running out
  useEffect(() => {
    if (game.phase === 'playing') {
      timedOutMarkerRef.current = null
      return
    }

    if (game.phase !== 'finished' || game.timeLeft > 0 || !game.currentMovie || !activeCacheKey) return

    const marker = `${game.sessionId}:${game.currentMovie.id}`
    if (timedOutMarkerRef.current === marker) return
    timedOutMarkerRef.current = marker

    consumeQueueMovie(activeCacheKey, game.currentMovie.id)
    trackMovie(game.currentMovie, 'timeout')
    if (useGameStore.getState().moviePool.length === 0) {
      refresh().catch(console.error)
    }
  }, [activeCacheKey, game, refresh, trackMovie])

  const handleReset = useCallback(() => {
    resetGame()
  }, [resetGame])

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar
        onSettingsOpen={() => setSettingsOpen(true)}
        onRefresh={refresh}
        loading={loading}
        source={source}
      />

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 pt-20 pb-10 flex flex-col gap-6">
        {/* Welcome heading */}
        <div className="text-center pt-4">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Bollywood Charades
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Act it out — no words, just moves!
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-rose-900/30 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && moviePool.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-slate-400">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading movies…</span>
          </div>
        )}

        {/* Movie card */}
        {(!loading || moviePool.length > 0) && (
          <MovieCard
            movie={game.currentMovie}
            phase={game.phase}
            settings={settings}
            totalSeen={game.totalMoviesSeen}
            timeLeft={game.timeLeft}
            totalTime={settings.timerSeconds}
          />
        )}

        {/* Timer */}
        {(!loading || moviePool.length > 0) && (
          <Timer
            timeLeft={game.timeLeft}
            totalTime={settings.timerSeconds}
            phase={game.phase}
          />
        )}

        {/* Controls */}
        {(!loading || moviePool.length > 0) && (
          <Controls
            game={game}
            settings={settings}
            onGenerate={handleGenerate}
            onSkip={handleSkip}
            onGotIt={handleGotIt}
            onReset={handleReset}
            moviePoolSize={moviePool.length}
          />
        )}

        {/* Instruction */}
        {game.phase === 'idle' && moviePool.length > 0 && (
          <p className="text-center text-xs text-slate-500 px-4">
            Select settings, then press{' '}
            <strong className="text-amber-400">Generate Movie</strong> to start.
            The timer begins immediately.
          </p>
        )}
      </main>

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        source={source}
        totalMovies={totalMovies}
      />
    </div>
  )
}

import type { FC } from 'react'
import { Play, SkipForward, RotateCcw, ThumbsUp, ArrowRight } from 'lucide-react'
import type { GameState, GameSettings } from '@/types'

interface ControlsProps {
  game: GameState
  settings: GameSettings
  onGenerate: () => void
  onSkip: () => void
  onGotIt: () => void
  onNextMovie: () => void
  onReset: () => void
  moviePoolSize: number
}

const Controls: FC<ControlsProps> = ({
  game,
  settings,
  onGenerate,
  onSkip,
  onGotIt,
  onNextMovie,
  onReset,
  moviePoolSize,
}) => {
  const { phase, skipsRemaining } = game
  const isIdle = phase === 'idle'
  const isPlaying = phase === 'playing'
  const isBetween = phase === 'between'
  const isFinished = phase === 'finished'

  const canSkip =
    isPlaying &&
    (settings.skipLimit === null || (skipsRemaining !== null && skipsRemaining > 0))

  const skipLabel =
    settings.skipLimit === null
      ? 'Skip'
      : `Skip (${skipsRemaining ?? 0} left)`

  return (
    <div className="w-full space-y-3">
      {/* Primary action row */}
      {isIdle || isFinished ? (
        <button
          onClick={onGenerate}
          disabled={moviePoolSize === 0}
          className="w-full py-4 rounded-xl font-bold text-lg tracking-wide bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-900 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5 fill-current" />
          {isFinished ? 'Play Again' : 'Generate Movie'}
        </button>
      ) : isBetween ? (
        /* ── Between-movies transition ── */
        <button
          onClick={onNextMovie}
          className="w-full py-4 rounded-xl font-bold text-lg tracking-wide bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-900 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
        >
          Next Movie
          <ArrowRight className="w-5 h-5" />
        </button>
      ) : (
        /* ── Playing ── */
        <div className="flex gap-3">
          {/* Skip */}
          <button
            onClick={onSkip}
            disabled={!canSkip}
            className="flex-1 py-3.5 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 transition-all border border-slate-600/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <SkipForward className="w-4 h-4" />
            {skipLabel}
          </button>

          {/* Got It */}
          <button
            onClick={onGotIt}
            className="flex-1 py-3.5 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            <ThumbsUp className="w-4 h-4" />
            Got It!
          </button>
        </div>
      )}

      {/* Reset button (shown during play / between / finished) */}
      {!isIdle && (
        <button
          onClick={onReset}
          className="w-full py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 border border-slate-700/40"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Round
        </button>
      )}

      {/* Movie pool size indicator */}
      {moviePoolSize > 0 && (
        <p className="text-center text-xs text-slate-500">
          {moviePoolSize} movies in pool
        </p>
      )}
    </div>
  )
}

export default Controls

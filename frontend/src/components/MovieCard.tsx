import type { FC } from 'react'
import { Film, Eye, EyeOff } from 'lucide-react'
import type { Movie, GameSettings } from '@/types'

interface MovieCardProps {
  movie: Movie | null
  phase: 'idle' | 'playing' | 'paused' | 'finished'
  settings: GameSettings
  totalSeen: number
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500'

const PopularityBadge: FC<{ tier: GameSettings['popularityTier'] }> = ({ tier }) => {
  const map = {
    easy: { label: 'Popular', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    medium: { label: 'Classic', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    hard: { label: 'Obscure', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  }
  const { label, color } = map[tier]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
  )
}

const MovieCard: FC<MovieCardProps> = ({ movie, phase, settings, totalSeen }) => {
  const isEmpty = !movie
  const isIdle = phase === 'idle'
  const isFinished = phase === 'finished'

  const wordCount = movie ? movie.title.split(/\s+/).filter(Boolean).length : 0
  const showHints = settings.hintsEnabled && !isIdle && !isEmpty

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl">
      {/* Blurred poster background */}
      {movie?.poster_path && (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage: `url(${TMDB_IMG_BASE}${movie.poster_path})`,
            filter: 'blur(20px) brightness(0.25)',
          }}
        />
      )}

      {/* Card content */}
      <div className="relative z-10 bg-slate-800/80 backdrop-blur-sm border border-slate-600/40 rounded-2xl p-6 min-h-[200px] flex flex-col items-center justify-center gap-4">
        {/* Session counter */}
        {totalSeen > 0 && (
          <div className="absolute top-3 right-4 flex items-center gap-1.5 text-xs text-slate-400">
            <Film className="w-3.5 h-3.5" />
            <span>{totalSeen} seen</span>
          </div>
        )}

        {/* Title area */}
        {isIdle ? (
          <div className="text-center">
            <Film className="w-12 h-12 text-amber-400/40 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Press Generate to get a movie</p>
          </div>
        ) : isFinished ? (
          <div className="text-center space-y-2">
            <p className="text-2xl font-bold text-amber-400">Time's Up!</p>
            {movie && (
              <p className="text-lg text-white font-medium px-4 text-center leading-snug">
                {movie.title}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-2xl sm:text-3xl font-bold text-white text-center leading-snug px-2 tracking-wide">
              {movie?.title ?? '—'}
            </p>

            {/* Hints */}
            {showHints && (
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {settings.hintsEnabled ? (
                  <>
                    <span className="text-xs bg-slate-700/60 text-slate-300 px-2.5 py-1 rounded-full border border-slate-600/40">
                      {wordCount} {wordCount === 1 ? 'word' : 'words'}
                    </span>
                    {movie?.year && (
                      <span className="text-xs bg-slate-700/60 text-slate-300 px-2.5 py-1 rounded-full border border-slate-600/40">
                        {movie.year}
                      </span>
                    )}
                    <PopularityBadge tier={settings.popularityTier} />
                  </>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Hint visibility toggle button (unused in simple mode but exported for extensibility)
export const HintToggle: FC<{ enabled: boolean; onToggle: () => void }> = ({
  enabled,
  onToggle,
}) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors"
  >
    {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    Hints {enabled ? 'On' : 'Off'}
  </button>
)

export default MovieCard

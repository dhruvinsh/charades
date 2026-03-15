import type { FC } from 'react'
import { Clock } from 'lucide-react'

interface TimerProps {
  timeLeft: number
  totalTime: number
  phase: 'idle' | 'playing' | 'paused' | 'between' | 'finished'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const Timer: FC<TimerProps> = ({ timeLeft, totalTime, phase }) => {
  const progress = totalTime > 0 ? timeLeft / totalTime : 1
  const pct = Math.max(0, Math.min(100, progress * 100))

  const isWarning = pct <= 33 && pct > 15
  const isDanger = pct <= 15

  const barColor = isDanger
    ? 'bg-rose-500'
    : isWarning
      ? 'bg-amber-400'
      : 'bg-emerald-500'

  const textColor = isDanger
    ? 'text-rose-400'
    : isWarning
      ? 'text-amber-400'
      : 'text-slate-200'

  const isIdle = phase === 'idle'
  const isFinished = phase === 'finished'
  const isBetween = phase === 'between'

  return (
    <div className="w-full space-y-2">
      {/* Label + time */}
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Clock className="w-4 h-4" />
          {isBetween ? 'Paused' : 'Time Remaining'}
        </span>
        <span
          className={`font-mono text-2xl font-bold tabular-nums transition-colors ${
            isIdle
              ? 'text-slate-600'
              : isFinished
                ? 'text-rose-400'
                : isBetween
                  ? 'text-slate-500'
                  : textColor
          } ${isDanger && phase === 'playing' ? 'animate-pulse' : ''}`}
        >
          {isFinished ? 'TIME UP' : formatTime(isIdle ? totalTime : timeLeft)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isIdle
              ? 'bg-slate-600 w-full'
              : isFinished
                ? 'bg-rose-500 w-0'
                : isBetween
                  ? 'bg-slate-600'
                  : barColor
          }`}
          style={{ width: isIdle ? '100%' : isFinished ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default Timer

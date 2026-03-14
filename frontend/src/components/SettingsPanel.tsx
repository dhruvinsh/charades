import type { FC } from 'react'
import { useState } from 'react'
import { X, Clock, Calendar, Flame, SkipForward, Lightbulb, Globe, KeyRound, Eye, EyeOff, Sparkles } from 'lucide-react'
import type { Era, PopularityTier, LanguageFilter } from '@/types'
import { useGameStore } from '@/store/gameStore'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  source: 'tmdb' | 'csv' | 'ai' | null
  totalMovies: number
}

// Approximate $ per 1M tokens (gpt-4.1-mini: input $0.40, output $1.60)
function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.4 + (completionTokens / 1e6) * 1.6
}

const OPENAI_MODEL_OPTIONS = [
  { label: 'gpt-4.1-mini', value: 'gpt-4.1-mini' },
  { label: 'gpt-4.1-nano', value: 'gpt-4.1-nano' },
  { label: 'gpt-4.1', value: 'gpt-4.1' },
]

const TIMER_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '90s', value: 90 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
]

const ERA_OPTIONS: { label: string; value: Era }[] = [
  { label: 'All', value: 'all' },
  { label: '90s', value: '90s' },
  { label: '2000s', value: '2000s' },
  { label: '2010s', value: '2010s' },
  { label: '2020s', value: '2020s' },
]

const POPULARITY_OPTIONS: { label: string; value: PopularityTier; desc: string }[] = [
  { label: 'Easy', value: 'easy', desc: 'Blockbusters' },
  { label: 'Medium', value: 'medium', desc: 'Popular' },
  { label: 'Hard', value: 'hard', desc: 'Obscure' },
]

const SKIP_OPTIONS: { label: string; value: number | null }[] = [
  { label: '∞', value: null },
  { label: '5', value: 5 },
  { label: '3', value: 3 },
  { label: '1', value: 1 },
  { label: '0', value: 0 },
]

const LANG_OPTIONS: { label: string; value: LanguageFilter }[] = [
  { label: 'All Indian', value: 'all' },
  { label: 'Hindi Only', value: 'hindi' },
]

// Reusable chip group
function ChipGroup<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all border ${
            opt.value === value
              ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-sm'
              : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:border-amber-500/50 hover:text-amber-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Custom timer input
const CustomTimerInput: FC<{
  value: number
  onChange: (v: number) => void
}> = ({ value, onChange }) => {
  const isCustom = !TIMER_OPTIONS.some((o) => o.value === value)
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={10}
        max={600}
        value={isCustom ? value : ''}
        placeholder="Custom (s)"
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!isNaN(v) && v >= 10) onChange(v)
        }}
        className={`w-28 px-3 py-1.5 rounded-lg text-sm bg-slate-700/50 border text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
          isCustom ? 'border-amber-500' : 'border-slate-600/50'
        }`}
      />
      {isCustom && (
        <span className="text-xs text-slate-400">seconds = {Math.floor(value / 60)}m {value % 60}s</span>
      )}
    </div>
  )
}

const SettingRow: FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({
  icon,
  label,
  children,
}) => (
  <div className="space-y-2.5">
    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
      <span className="text-amber-400">{icon}</span>
      {label}
    </div>
    {children}
  </div>
)

const SettingsPanel: FC<SettingsPanelProps> = ({ open, onClose, source, totalMovies }) => {
  const { settings, updateSettings, aiTokenUsage, resetTokenUsage } = useGameStore()
  const [showKey, setShowKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const hasOpenAI = (settings.openaiApiKey ?? '').trim().length > 0
  const usage = aiTokenUsage ?? { totalPrompt: 0, totalCompletion: 0 }
  const estimatedCost = estimateCost(usage.totalPrompt, usage.totalCompletion)

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/60 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Game Settings</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Source badge */}
          {source && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <div
                className={`w-2 h-2 rounded-full ${
                  source === 'ai' ? 'bg-violet-400' : source === 'tmdb' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span className="text-xs text-slate-400">
                {source === 'ai'
                  ? 'AI Engine'
                  : source === 'tmdb'
                    ? 'TMDB live data'
                    : 'Offline CSV fallback'}{' '}
                · <strong className="text-slate-200">{totalMovies}</strong> movies loaded
              </span>
            </div>
          )}

          {/* Timer */}
          <SettingRow icon={<Clock className="w-4 h-4" />} label="Timer Duration">
            <ChipGroup
              options={TIMER_OPTIONS}
              value={settings.timerSeconds}
              onChange={(v) => updateSettings({ timerSeconds: v })}
            />
            <CustomTimerInput
              value={settings.timerSeconds}
              onChange={(v) => updateSettings({ timerSeconds: v })}
            />
          </SettingRow>

          {/* Movie Era */}
          <SettingRow icon={<Calendar className="w-4 h-4" />} label="Movie Era">
            <ChipGroup
              options={ERA_OPTIONS}
              value={settings.era}
              onChange={(v) => updateSettings({ era: v })}
            />
          </SettingRow>

          {/* Language */}
          <SettingRow icon={<Globe className="w-4 h-4" />} label="Language">
            <ChipGroup
              options={LANG_OPTIONS}
              value={settings.languageFilter}
              onChange={(v) => updateSettings({ languageFilter: v })}
            />
          </SettingRow>

          {/* Difficulty */}
          <SettingRow icon={<Flame className="w-4 h-4" />} label="Difficulty">
            <div className="flex gap-2">
              {POPULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateSettings({ popularityTier: opt.value })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border flex flex-col items-center gap-0.5 ${
                    opt.value === settings.popularityTier
                      ? 'bg-amber-500 text-slate-900 border-amber-500'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:border-amber-500/50'
                  }`}
                >
                  <span className="font-bold">{opt.label}</span>
                  <span className={`text-xs ${opt.value === settings.popularityTier ? 'text-slate-800' : 'text-slate-500'}`}>
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </SettingRow>

          {/* Skip limit */}
          <SettingRow icon={<SkipForward className="w-4 h-4" />} label="Skip Limit">
            <ChipGroup
              options={SKIP_OPTIONS}
              value={settings.skipLimit}
              onChange={(v) => updateSettings({ skipLimit: v })}
            />
          </SettingRow>

          {/* Hints */}
          <SettingRow icon={<Lightbulb className="w-4 h-4" />} label="Hints">
            <div className="flex gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  onClick={() => updateSettings({ hintsEnabled: v })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    settings.hintsEnabled === v
                      ? 'bg-amber-500 text-slate-900 border-amber-500'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:border-amber-500/50'
                  }`}
                >
                  {v ? 'Show hints' : 'No hints'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Hints show word count and release year
            </p>
          </SettingRow>

          {/* AI Game Engine */}
          <SettingRow icon={<Sparkles className="w-4 h-4" />} label="AI Game Engine">
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenAIKey ? 'text' : 'password'}
                    value={settings.openaiApiKey ?? ''}
                    onChange={(e) => updateSettings({ openaiApiKey: e.target.value.trim() })}
                    placeholder="OpenAI API key (optional)"
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full px-3 py-1.5 pr-9 rounded-lg text-sm bg-slate-700/50 border border-slate-600/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAIKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    title={showOpenAIKey ? 'Hide key' : 'Show key'}
                  >
                    {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {(settings.openaiApiKey ?? '').trim() && (
                  <button
                    type="button"
                    onClick={() => updateSettings({ openaiApiKey: '' })}
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-700/50 border border-slate-600/50 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                    title="Clear OpenAI key"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-400">Model:</span>
                {OPENAI_MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateSettings({ openaiModel: opt.value })}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                      (settings.openaiModel ?? 'gpt-4.1-mini') === opt.value
                        ? 'bg-amber-500 text-slate-900 border-amber-500'
                        : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-amber-500/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                <span className="text-xs text-slate-400">
                  Tokens: <strong className="text-slate-200">{usage.totalPrompt}</strong> prompt +{' '}
                  <strong className="text-slate-200">{usage.totalCompletion}</strong> completion
                  {estimatedCost > 0 && (
                    <span className="ml-1">
                      (~${estimatedCost.toFixed(4)})
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={resetTokenUsage}
                  className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
                >
                  Reset counter
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {hasOpenAI
                ? 'OpenAI curates movies by difficulty and adds richer hints. TMDB or CSV validates titles.'
                : 'Set an OpenAI key to use the AI game engine. Keys stored locally only.'}
            </p>
          </SettingRow>

          {/* TMDB API Key */}
          <SettingRow icon={<KeyRound className="w-4 h-4" />} label="TMDB API Key">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.tmdbApiKey}
                  onChange={(e) => updateSettings({ tmdbApiKey: e.target.value.trim() })}
                  placeholder="Paste your TMDB API key…"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full px-3 py-1.5 pr-9 rounded-lg text-sm bg-slate-700/50 border border-slate-600/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {settings.tmdbApiKey && (
                <button
                  type="button"
                  onClick={() => updateSettings({ tmdbApiKey: '' })}
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-700/50 border border-slate-600/50 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                  title="Clear API key"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {settings.tmdbApiKey ? (
                <span className="text-emerald-400">Key set — TMDB will be used as data source.</span>
              ) : (
                <>
                  No key set — using offline CSV fallback.{' '}
                  <a
                    href="https://www.themoviedb.org/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    Get a free key
                  </a>
                  . Stored locally in your browser only.
                </>
              )}
            </p>
          </SettingRow>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </>
  )
}

export default SettingsPanel

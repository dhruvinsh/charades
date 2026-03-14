import type { FC } from 'react'
import { Film, RefreshCw, Settings, DatabaseZap, Wifi } from 'lucide-react'

interface NavbarProps {
  onSettingsOpen: () => void
  onRefresh: () => void
  loading: boolean
  source: 'tmdb' | 'csv' | null
}

const Navbar: FC<NavbarProps> = ({ onSettingsOpen, onRefresh, loading, source }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/60 shadow-lg">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 group">
          <Film className="w-6 h-6 text-amber-400 group-hover:rotate-12 transition-transform" />
          <span className="font-bold text-xl tracking-tight text-white font-display">
            Charades
          </span>
          <span className="text-xs text-slate-400 font-mono mt-0.5">v2.0</span>
          {source === 'csv' && (
            <span
              title="TMDB unavailable — using bundled CSV movie list"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium"
            >
              <DatabaseZap className="w-3 h-3" />
              Offline data
            </span>
          )}
          {source === 'tmdb' && (
            <span
              title="Live data from TMDB"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium"
            >
              <Wifi className="w-3 h-3" />
              Live
            </span>
          )}
        </a>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh movie pool"
            className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onSettingsOpen}
            title="Game settings"
            className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  )
}

export default Navbar

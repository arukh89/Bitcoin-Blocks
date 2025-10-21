'use client'

import { useGame } from '../context/GameContext'
import { Badge } from './ui/badge'
import { APP_CONFIG } from '../config/app-config'

export function DatabaseStatusBanner() {
  const { connected, mode } = useGame()

  return (
    <div className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className="bg-purple-500/20 text-purple-300 border-purple-400/50 px-3 py-1.5 text-xs font-bold"
          >
            🔴 REAL-TIME MODE
          </Badge>
          
          <div className="text-xs text-gray-400">
            <span>Connected to live Bitcoin network</span>
          </div>
        </div>

        <Badge 
          variant="outline" 
          className={`${
            connected 
              ? 'bg-green-500/20 text-green-300 border-green-400/50' 
              : 'bg-red-500/20 text-red-300 border-red-400/50'
          } px-3 py-1.5 text-xs font-semibold`}
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>
    </div>
  )
}

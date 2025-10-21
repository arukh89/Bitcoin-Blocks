'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { useGame } from '../context/GameContext'

interface AllPredictionsProps {}

export function AllPredictions({}: AllPredictionsProps): React.ReactElement {
  const { activeRound, getGuessesForRound } = useGame()

  const guesses = activeRound ? getGuessesForRound(activeRound.id) : []
  // Sort by submission time (newest first) for all predictions view
  const sortedGuesses = [...guesses].sort((a, b) => b.submittedAt - a.submittedAt)

  return (
    <Card className="glass-card-dark border-purple-500/30 h-full shadow-3d">
      <CardHeader>
        <CardTitle className="flex flex-col gap-2 text-white text-2xl">
          <div className="flex items-center gap-2">
            <motion.span
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              🌐
            </motion.span>
            All Predictions ({guesses.length})
          </div>
          <div className="flex items-center gap-2 text-xs font-normal">
            <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-400/50">
              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse" />
              Live Updates
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!activeRound ? (
          <motion.div
            className="text-center py-16"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-4xl mb-4">⏳</p>
            <p className="text-gray-400 text-lg font-medium">Waiting for round...</p>
            <p className="text-gray-500 text-sm mt-2">Predictions will appear when round starts</p>
          </motion.div>
        ) : guesses.length === 0 ? (
          <motion.div
            className="text-center py-16"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-4xl mb-4">🎲</p>
            <p className="text-gray-400 text-lg font-medium">No predictions yet</p>
            <p className="text-gray-500 text-sm mt-2">Be the first to guess!</p>
          </motion.div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-gray-800">
            <AnimatePresence mode="popLayout">
              {sortedGuesses.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -50, scale: 0.8 }}
                  animate={{ 
                    opacity: 1, 
                    x: 0, 
                    scale: 1
                  }}
                  exit={{ opacity: 0, x: 50, scale: 0.8 }}
                  transition={{ 
                    duration: 0.3,
                    delay: index * 0.05
                  }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="relative flex items-center justify-between p-4 rounded-xl border backdrop-blur-xl glass-card-dark border-gray-500/30 overflow-hidden shadow-3d-sm hover:shadow-3d-md transition-all"
                >
                  <div className="flex items-center gap-4 relative z-10">
                    <Avatar className="h-12 w-12 ring-2 ring-gray-500/50">
                      <AvatarImage src={entry.pfpUrl} alt={entry.username} />
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold">
                        {entry.username[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div>
                      <p className="font-bold text-white flex items-center gap-2">
                        {entry.username}
                      </p>
                      <p className="text-xs text-gray-400">
                        @{entry.username} • {new Date(entry.submittedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 relative z-10">
                    <Badge 
                      variant="secondary"
                      className="bg-purple-700/50 text-purple-200 border-purple-600/50 px-3 py-1 font-bold"
                    >
                      {entry.guess.toLocaleString()} tx
                    </Badge>
                    
                    <motion.span
                      className="text-2xl"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: index * 0.1 }}
                    >
                      🎲
                    </motion.span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>

    </Card>
  )
}

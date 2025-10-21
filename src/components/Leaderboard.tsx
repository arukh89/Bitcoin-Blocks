'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { useGame } from '../context/GameContext'

interface LeaderboardProps {}

export function Leaderboard({}: LeaderboardProps): React.ReactElement {
  const { activeRound, getGuessesForRound } = useGame()

  const guesses = activeRound ? getGuessesForRound(activeRound.id) : []
  const sortedGuesses = [...guesses].sort((a, b) => {
    if (activeRound && activeRound.actualTxCount !== undefined) {
      const diffA = Math.abs(a.guess - activeRound.actualTxCount)
      const diffB = Math.abs(b.guess - activeRound.actualTxCount)
      if (diffA !== diffB) return diffA - diffB
      return a.submittedAt - b.submittedAt
    }
    return b.submittedAt - a.submittedAt
  })

  // Only show top 3 for leaderboard
  const topGuesses = sortedGuesses.slice(0, 3)
  const isFinished = activeRound ? activeRound.status === 'finished' && activeRound.actualTxCount !== undefined : false

  return (
    <Card className="glass-card-dark border-purple-500/30 h-full shadow-3d">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white text-2xl">
          <motion.span
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🏆
          </motion.span>
          Leaderboard
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
            <p className="text-gray-500 text-sm mt-2">Leaderboard will appear when round starts</p>
          </motion.div>
        ) : guesses.length === 0 ? (
          <motion.div
            className="text-center py-16"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-4xl mb-4">🎯</p>
            <p className="text-gray-400 text-lg font-medium">No entries yet</p>
            <p className="text-gray-500 text-sm mt-2">Leaderboard will appear after predictions</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {topGuesses.map((entry, index) => {
                const isWinner = isFinished && index === 0
                const isTopThree = isFinished && index < 3
                const difference = activeRound && activeRound.actualTxCount !== undefined
                  ? Math.abs(entry.guess - activeRound.actualTxCount)
                  : null

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -50, scale: 0.8 }}
                    animate={{ 
                      opacity: 1, 
                      x: 0, 
                      scale: 1,
                      ...(isWinner && {
                        boxShadow: [
                          "0 0 0px rgba(234, 179, 8, 0)",
                          "0 0 30px rgba(234, 179, 8, 0.6)",
                          "0 0 0px rgba(234, 179, 8, 0)"
                        ]
                      })
                    }}
                    exit={{ opacity: 0, x: 50, scale: 0.8 }}
                    transition={{ 
                      duration: 0.3,
                      delay: index * 0.05,
                      ...(isWinner && { boxShadow: { duration: 2, repeat: Infinity } })
                    }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    className={`relative flex items-center justify-between p-4 rounded-xl border backdrop-blur-xl shadow-3d-sm hover:shadow-3d-md transition-all ${
                      isWinner
                        ? 'glass-card border-2 border-yellow-500/70 bg-gradient-to-r from-yellow-500/30 to-orange-500/30'
                        : isTopThree
                        ? 'glass-card border-purple-400/50 bg-gradient-to-r from-purple-500/20 to-pink-500/20'
                        : 'glass-card-dark border-gray-500/30'
                    } overflow-hidden`}
                  >
                    {/* Background shine effect for winner */}
                    {isWinner && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}

                    <div className="flex items-center gap-4 relative z-10">
                      {/* Rank badge */}
                      <motion.div
                        className={`flex items-center justify-center w-10 h-10 rounded-full font-black text-lg ${
                          isWinner
                            ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/50'
                            : index === 1
                            ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800'
                            : index === 2
                            ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                            : 'bg-gray-700/50 text-gray-400'
                        }`}
                        animate={isWinner ? { rotate: [0, 10, -10, 0] } : {}}
                        transition={{ duration: 0.5, repeat: isWinner ? Infinity : 0 }}
                      >
                        {index === 0 && isFinished ? '👑' : `#${index + 1}`}
                      </motion.div>

                      <Avatar className={`h-12 w-12 ring-2 ${
                        isWinner 
                          ? 'ring-yellow-400 ring-offset-2 ring-offset-black' 
                          : 'ring-gray-500/50'
                      }`}>
                        <AvatarImage src={entry.pfpUrl} alt={entry.username} />
                        <AvatarFallback className={`${
                          isWinner 
                            ? 'bg-gradient-to-br from-yellow-400 to-orange-500' 
                            : 'bg-gradient-to-br from-purple-500 to-pink-500'
                        } text-white font-bold`}>
                          {entry.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div>
                        <p className={`font-bold ${isWinner ? 'text-yellow-300 text-lg' : 'text-white'}`}>
                          @{entry.username}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(entry.submittedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 relative z-10">
                      <Badge 
                        variant={isWinner ? 'default' : 'secondary'}
                        className={`${
                          isWinner 
                            ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-black border-none shadow-lg' 
                            : 'bg-gray-700/50 text-gray-200 border-gray-600/50'
                        } px-3 py-1`}
                      >
                        {entry.guess.toLocaleString()} txs
                      </Badge>
                      
                      {difference !== null && (
                        <Badge 
                          variant="outline" 
                          className={`text-xs px-2 py-1 ${
                            isWinner 
                              ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50 font-bold' 
                              : 'bg-gray-700/30 text-gray-400 border-gray-600/30'
                          }`}
                        >
                          {isWinner ? '🏆 WINNER!' : `±${difference.toLocaleString()}`}
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

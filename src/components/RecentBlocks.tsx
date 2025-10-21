'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

interface BitcoinBlock {
  height: number
  hash: string
  timestamp: number
  tx_count: number
  size: number
}

interface RecentBlocksProps {}

export function RecentBlocks({}: RecentBlocksProps): React.ReactElement {
  const [blocks, setBlocks] = useState<BitcoinBlock[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRecentBlocks = async (): Promise<void> => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/mempool?action=recent-blocks')
        
        if (!response.ok) {
          throw new Error('Failed to fetch blocks')
        }

        const data = await response.json() as BitcoinBlock[]
        setBlocks(data.slice(0, 5)) // Get last 5 blocks
      } catch (err) {
        console.error('Failed to fetch recent blocks:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchRecentBlocks()

    // Refresh every 60 seconds
    const interval = setInterval(fetchRecentBlocks, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatHash = (hash: string): string => {
    return `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}`
  }

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60) // minutes ago
    
    if (diff < 60) {
      return `${diff}m ago`
    } else if (diff < 1440) {
      return `${Math.floor(diff / 60)}h ago`
    } else {
      return `${Math.floor(diff / 1440)}d ago`
    }
  }

  return (
    <Card className="glass-card-dark border-orange-500/50 shadow-3d">
      <CardHeader className="pb-3 border-b border-orange-500/20">
        <CardTitle className="flex items-center gap-3 text-white text-xl">
          <motion.span
            animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-3xl"
          >
            📦
          </motion.span>
          <div className="flex-1">
            <div className="text-lg font-black gradient-text">Recent Bitcoin Blocks</div>
            <div className="text-[10px] text-orange-300 font-normal">Live blockchain data from mempool.space</div>
          </div>
          <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-400/50 text-xs px-3 py-1">
            Last 5 Blocks
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-orange-600 scrollbar-track-gray-800">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="glass-card p-4 rounded-xl min-w-[280px]"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
              >
                <div className="h-4 bg-gray-600/50 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-700/50 rounded w-1/2" />
              </motion.div>
            ))}
          </div>
        ) : error ? (
          <motion.div
            className="glass-card p-8 rounded-2xl text-center space-y-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <p className="text-5xl">⚠️</p>
            <p className="text-red-300 text-base font-bold">Failed to Load Blocks</p>
            <p className="text-gray-400 text-xs">{error}</p>
          </motion.div>
        ) : blocks.length === 0 ? (
          <motion.div
            className="glass-card p-8 rounded-2xl text-center space-y-3"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-5xl">📭</p>
            <p className="text-gray-300 text-base font-medium">No blocks available</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-orange-600 scrollbar-track-gray-800">
              {blocks.map((block, index) => (
                <motion.div
                  key={block.height}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass-card p-4 rounded-xl hover:border-orange-500/50 border border-transparent transition-all duration-300 group relative overflow-hidden min-w-[280px] flex-shrink-0"
                >
                  {/* Hover glow effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/10 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  
                  <div className="relative z-10 space-y-3">
                    {/* Block Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-orange-500/20 text-orange-300 border-orange-400/50 text-xs px-2 py-0.5 font-mono">
                          #{block.height}
                        </Badge>
                        <span className="text-[10px] text-gray-500">{formatTimestamp(block.timestamp)}</span>
                      </div>
                      {index === 0 && (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Badge className="bg-green-500/20 text-green-300 border-green-400/50 text-[10px] px-2 py-0.5">
                            Latest
                          </Badge>
                        </motion.div>
                      )}
                    </div>

                    {/* Transaction Count - BIG & PROMINENT */}
                    <div className="bg-gradient-to-r from-orange-500/10 to-purple-500/10 rounded-lg p-3 border border-orange-500/30">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-xs font-semibold">Total Transactions</span>
                        <motion.span
                          className="text-2xl font-black gradient-text"
                          animate={{
                            textShadow: [
                              "0 0 10px rgba(255,120,0,0.5)",
                              "0 0 20px rgba(255,120,0,0.8)",
                              "0 0 10px rgba(255,120,0,0.5)"
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {block.tx_count.toLocaleString()}
                        </motion.span>
                      </div>
                    </div>

                    {/* Block Details */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500">Block Hash:</span>
                        <span className="text-cyan-300 font-mono">{formatHash(block.hash)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500">Size:</span>
                        <span className="text-purple-300 font-semibold">
                          {(block.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {!loading && !error && blocks.length > 0 && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-center pt-3 border-t border-orange-500/20"
              >
                <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                  Auto-refreshing every 60 seconds
                </p>
              </motion.div>
            )}
          </div>
        )}
      </CardContent>

    </Card>
  )
}

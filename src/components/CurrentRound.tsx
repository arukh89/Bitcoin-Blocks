'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { useGame } from '../context/GameContext'

interface CurrentRoundProps {}

export function CurrentRound({}: CurrentRoundProps): React.ReactElement {
  const { activeRound, connected, errorStates, loadingStates } = useGame()
  const [countdown, setCountdown] = useState<string>('0m 0s')
  const [lastBlockTime, setLastBlockTime] = useState<number | null>(null)
  const [blockNumber, setBlockNumber] = useState<number | null>(null)
  const [txCount, setTxCount] = useState<number | null>(null)
  const [blockDataError, setBlockDataError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState<boolean>(false)

  // Enhanced fetch with retry mechanism and exponential backoff
  const fetchBlockData = useCallback(async (retryCount = 0): Promise<void> => {
    const maxRetries = 3
    const baseDelay = 1000
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await fetch('/api/mempool?action=recent-blocks', {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (data.timestamp) {
        setLastBlockTime(data.timestamp * 1000) // Convert to milliseconds
      }
      if (data.height) {
        setBlockNumber(data.height)
      }
      if (data.tx_count) {
        setTxCount(data.tx_count)
      }
      
      setBlockDataError(null)
      console.log('✅ Block data fetched successfully')
    } catch (error) {
      console.error(`❌ Failed to fetch block data (attempt ${retryCount + 1}):`, error)
      
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount)
        console.log(`🔄 Retrying in ${delay}ms...`)
        setTimeout(() => fetchBlockData(retryCount + 1), delay)
      } else {
        setBlockDataError('Failed to fetch block data. Please check your connection.')
      }
    }
  }, [])

  // Fetch latest block data from mempool.space with enhanced error handling
  useEffect(() => {
    fetchBlockData()
    
    // Update every 60 seconds (reduced from 10s for better performance)
    const interval = setInterval(fetchBlockData, 60000)

    return () => clearInterval(interval)
  }, [fetchBlockData])

  // Enhanced countdown timer with performance optimizations
  useEffect(() => {
    if (!activeRound || !activeRound.duration) return

    let animationFrameId: number
    let lastUpdate = Date.now()

    const updateCountdown = (): void => {
      const now = Date.now()
      const endTime = activeRound.endTime
      const remainingMs = endTime - now
      
      if (remainingMs <= 0) {
        setCountdown('0m 0s')
        return
      }
      
      // Only update if at least 1 second has passed (performance optimization)
      if (now - lastUpdate >= 1000) {
        const remainingSeconds = Math.floor(remainingMs / 1000)
        const minutes = Math.floor(remainingSeconds / 60)
        const seconds = remainingSeconds % 60
        
        setCountdown(`${minutes}m ${seconds}s`)
        lastUpdate = now
      }
      
      animationFrameId = requestAnimationFrame(updateCountdown)
    }

    updateCountdown()

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [activeRound])

  // Get status badge directly from admin panel (database status)
  const getStatusBadge = (): string => {
    if (!activeRound) return 'WAITING'
    return activeRound.status.toUpperCase()
  }

  const getStatusColor = (): string => {
    if (!activeRound) return 'bg-gray-500/20 text-gray-300 border-gray-400/50'
    if (activeRound.status === 'open') return 'bg-green-500/20 text-green-300 border-green-400/50'
    if (activeRound.status === 'closed') return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50'
    if (activeRound.status === 'finished') return 'bg-purple-500/20 text-purple-300 border-purple-400/50'
    return 'bg-gray-500/20 text-gray-300 border-gray-400/50'
  }

  // Memoize status calculations to prevent unnecessary re-renders
  const statusBadge = useMemo(() => getStatusBadge(), [activeRound])
  const statusColor = useMemo(() => getStatusColor(), [activeRound])
  
  // Round number from admin input
  const roundNumber = useMemo(() =>
    activeRound?.roundNumber?.toString() || '—',
    [activeRound?.roundNumber]
  )
  
  // Block number: Prioritize admin input, fallback to latest from mempool
  const displayBlockNumber = useMemo(() =>
    activeRound?.blockNumber || blockNumber || 875420,
    [activeRound?.blockNumber, blockNumber]
  )
  
  const displayTxCount = useMemo(() => txCount || 0, [txCount])

  // Enhanced connecting state with retry functionality
  if (!connected) {
    return (
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <Card className="glass-card-dark border-orange-500/30 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 animate-pulse" />
          <CardContent className="py-6 px-6">
            <motion.div
              className="text-center py-8"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-gray-400 text-sm mb-2">🔌 Connecting to database...</p>
              {errorStates.connection && (
                <p className="text-red-400 text-xs mt-2">{errorStates.connection}</p>
              )}
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // If no active round OR round is closed/finished, show empty state
  if (!activeRound || activeRound.status === 'closed' || activeRound.status === 'finished') {
    return (
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <Card className="glass-card-dark border-gray-500/30 overflow-hidden">
          <CardContent className="py-8 px-6">
            <motion.div
              className="text-center"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <p className="text-xl text-gray-400 mb-2">⏳</p>
              <p className="text-gray-400 text-sm">Waiting for admin to start round...</p>
              <p className="text-gray-500 text-xs mt-2">
                {!activeRound ? 'No active round yet' : 'Round closed - waiting for next round'}
              </p>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // Active round exists with status 'open' - display full round info from admin input
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.35 }}
    >
      <Card className="glass-card-dark border-orange-500/30 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 animate-pulse" />
        
        <CardContent className="py-6 px-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Left: Round Info - Direct from Admin Panel */}
            <div className="flex items-center gap-3">
              <motion.span
                animate={{ rotate: activeRound.status === 'open' ? 360 : 0 }}
                transition={{ duration: 3, repeat: activeRound.status === 'open' ? Infinity : 0, ease: "linear" }}
                className="text-2xl"
              >
                🎮
              </motion.span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg lg:text-xl font-black text-white">
                    Round #{roundNumber}
                  </span>
                  <Badge 
                    variant="default"
                    className={`${statusColor} px-3 py-0.5 text-xs font-bold`}
                  >
                    {statusBadge}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mt-1">Started by admin</p>
              </div>
            </div>

            {/* Middle & Right: Target Block and Timer - Side by Side on Mobile */}
            <div className="flex gap-3 w-full lg:w-auto">
              {/* Target Block Info */}
              <div className="glass-card p-3 lg:p-4 rounded-xl flex-1 relative">
                <div className="text-center space-y-1">
                  <p className="text-[10px] lg:text-xs text-blue-300 font-semibold">🧱 Target Block</p>
                  <motion.p
                    className="text-xl lg:text-2xl font-black text-blue-400 font-mono"
                    key={displayBlockNumber} // Force re-render on block change
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    #{displayBlockNumber.toLocaleString()}
                  </motion.p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-[9px] lg:text-[10px] text-gray-400">Txs: {displayTxCount.toLocaleString()}</p>
                    {blockDataError && (
                      <button
                        onClick={() => {
                          setIsRetrying(true)
                          fetchBlockData().finally(() => setIsRetrying(false))
                        }}
                        className="text-[9px] text-yellow-400 hover:text-yellow-300"
                        disabled={isRetrying}
                      >
                        {isRetrying ? '🔄' : '🔄'}
                      </button>
                    )}
                  </div>
                  {blockDataError && (
                    <p className="text-[8px] text-red-400 mt-1">{blockDataError}</p>
                  )}
                </div>
              </div>

              {/* Timer */}
              <div className="glass-card p-3 lg:p-4 rounded-xl flex-1">
                <div className="text-center">
                  <p className="text-[10px] lg:text-xs text-orange-300 font-semibold mb-1">⏱ Time Left</p>
                  <motion.p
                    className="text-xl lg:text-2xl font-black text-white font-mono"
                    key={countdown} // Force re-render on countdown change
                    animate={{
                      textShadow: activeRound.status === 'open' ? [
                        "0 0 10px rgba(251,146,60,0.5)",
                        "0 0 20px rgba(251,146,60,0.8)",
                        "0 0 10px rgba(251,146,60,0.5)"
                      ] : []
                    }}
                    transition={{ duration: 2, repeat: activeRound.status === 'open' ? Infinity : 0 }}
                  >
                    {countdown}
                  </motion.p>
                  <p className="text-[9px] lg:text-[10px] text-gray-400 mt-1">
                    {activeRound.duration ? `${activeRound.duration}m` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { useGame, isDevAddress } from '../../context/GameContext'
import { useToast } from '../../hooks/use-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { APP_CONFIG } from '../../config/app-config'

export default function AdminPage() {
  const router = useRouter()
  const { user, createRound, endRound, updateRoundResult, activeRound, getGuessesForRound, connected } = useGame()
  const { toast } = useToast()
  const [loading, setLoading] = useState<boolean>(false)

  // Form states
  const [blockNumber, setBlockNumber] = useState<string>('')
  const [jackpotAmount, setJackpotAmount] = useState<string>('5,000')
  const [jackpotCurrency, setJackpotCurrency] = useState<string>('$SECOND')
  const [firstPrize, setFirstPrize] = useState<string>('1,000')
  const [secondPrize, setSecondPrize] = useState<string>('500')
  const [prizeCurrency, setPrizeCurrency] = useState<string>('$SECOND')

  // Redirect if not admin
  useEffect(() => {
    if (user && !isDevAddress(user.address)) {
      router.push('/')
    }
  }, [user, router])

  // Show loading if checking auth
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-black">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    )
  }

  // Only show to admin addresses
  if (!isDevAddress(user.address)) {
    return <></>
  }

  const handleStartRound = async (): Promise<void> => {
    if (!blockNumber) {
      toast({
        title: '⚠️ Missing Block Number',
        description: 'Please enter a target block number',
        variant: 'destructive'
      })
      return
    }

    const blockNum = parseInt(blockNumber)
    if (isNaN(blockNum) || blockNum <= 0) {
      toast({
        title: '⚠️ Invalid Block Number',
        description: 'Please enter a valid positive block number',
        variant: 'destructive'
      })
      return
    }

    const now = Date.now()
    const endTime = now + (24 * 60 * 60 * 1000)
    const prize = `${jackpotAmount} ${jackpotCurrency}`
    const roundNumber = 1 // Default round number, could be dynamic

    try {
      setLoading(true)
      await createRound(roundNumber, now, endTime, prize, blockNum)
      
      // Auto-post to Farcaster in mock mode (simulated)
      if (APP_CONFIG.mode === 'mock') {
        console.log(`🔔 [MOCK] Would post to Farcaster: New Round Started! Block #${blockNum}`)
      } else {
        const message = `🔔 New Round Started!\\n\\nGuess how many transactions will be in the next Bitcoin block ⛏️\\n\\n💰 Jackpot: ${prize}\\n🎯 Target Block: #${blockNum}\\n\\n#BitcoinBlocks`
        await handleAnnounce(message)
      }
      
      toast({
        title: '✅ Round Started',
        description: `Block #${blockNum} prediction is now live!`
      })
      
      setBlockNumber('')
    } catch (error) {
      toast({
        title: '❌ Failed',
        description: error instanceof Error ? error.message : 'Failed to start round',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEndRound = async (): Promise<void> => {
    if (!activeRound) {
      toast({
        title: '⚠️ No Active Round',
        description: 'There is no round to end',
        variant: 'destructive'
      })
      return
    }

    try {
      setLoading(true)
      const success = await endRound(activeRound.id)
      if (success) {
        toast({
          title: '✅ Round Ended',
          description: 'Submissions are now locked - round in wait state'
        })
      } else {
        toast({
          title: '❌ Error',
          description: 'Failed to end round',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Failed to end round',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePostResults = async (): Promise<void> => {
    if (!activeRound || activeRound.status !== 'closed') {
      toast({
        title: '⚠️ Invalid State',
        description: 'Round must be ended/closed first',
        variant: 'destructive'
      })
      return
    }

    if (!activeRound.blockNumber) {
      toast({
        title: '⚠️ No Block Number',
        description: 'Round does not have a target block',
        variant: 'destructive'
      })
      return
    }

    try {
      setLoading(true)
      
      // In mock mode, simulate block data
      if (APP_CONFIG.mode === 'mock') {
        const mockTxCount = Math.floor(Math.random() * 2000) + 2000
        const mockBlockHash = '000000000000000000' + Math.random().toString(36).substring(2, 15)
        
        // Find winners
        const guesses = getGuessesForRound(activeRound.id)
        if (guesses.length === 0) {
          throw new Error('No predictions in this round')
        }

        const sorted = [...guesses].sort((a, b) => {
          const diffA = Math.abs(a.guess - mockTxCount)
          const diffB = Math.abs(b.guess - mockTxCount)
          if (diffA !== diffB) return diffA - diffB
          return a.submittedAt - b.submittedAt
        })

        const winner = sorted[0]
        const runnerUp = sorted[1]

        await updateRoundResult(activeRound.id, mockTxCount, mockBlockHash, winner.address)

        // Log simulated announcement
        console.log(`📊 [MOCK] Would post to Farcaster:`)
        console.log(`Block #${activeRound.blockNumber} had ${mockTxCount.toLocaleString()} transactions.`)
        console.log(`🥇 Winner: @${winner.username}`)
        console.log(`🥈 Runner-Up: ${runnerUp ? `@${runnerUp.username}` : 'N/A'}`)

        toast({
          title: '🎉 Results Posted!',
          description: `Winner: @${winner.username} (Mock Mode)`
        })
      } else {
        // Real-time mode: Fetch from mempool.space
        const blockRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol: 'https',
            origin: 'mempool.space',
            path: `/api/block-height/${activeRound.blockNumber}`,
            method: 'GET',
            headers: {}
          })
        })

        if (!blockRes.ok) {
          throw new Error(`Block #${activeRound.blockNumber} not found yet. Try again later.`)
        }

        const blockHash = await blockRes.text() as string

        const txRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol: 'https',
            origin: 'mempool.space',
            path: `/api/block/${blockHash}/txids`,
            method: 'GET',
            headers: {}
          })
        })

        if (!txRes.ok) {
          throw new Error('Failed to fetch transactions from mempool.space')
        }

        const txids = await txRes.json() as string[]
        const actualTxCount = txids.length

        // Find winners
        const guesses = getGuessesForRound(activeRound.id)
        if (guesses.length === 0) {
          throw new Error('No predictions in this round')
        }

        const sorted = [...guesses].sort((a, b) => {
          const diffA = Math.abs(a.guess - actualTxCount)
          const diffB = Math.abs(b.guess - actualTxCount)
          if (diffA !== diffB) return diffA - diffB
          return a.submittedAt - b.submittedAt
        })

        const winner = sorted[0]
        const runnerUp = sorted[1]

        await updateRoundResult(activeRound.id, actualTxCount, blockHash, winner.address)

        // Auto-post results to Farcaster
        const newJackpot = `${jackpotAmount} ${jackpotCurrency}`
        const message = `📊 Block #${activeRound.blockNumber} had ${actualTxCount.toLocaleString()} transactions.\\n\\n🥇 Winner: @${winner.username}\\n🥈 Runner-Up: ${runnerUp ? `@${runnerUp.username}` : 'N/A'}\\n\\n💰 Jackpot is now: ${newJackpot}\\n\\n#BitcoinBlocks`
        
        await handleAnnounce(message)

        toast({
          title: '🎉 Results Posted!',
          description: `Winner: @${winner.username} - announced on Farcaster`
        })
      }
    } catch (error) {
      toast({
        title: '❌ Failed',
        description: error instanceof Error ? error.message : 'Failed to post results',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAnnounce = async (message: string): Promise<void> => {
    if (!user || !isDevAddress(user.address)) return

    try {
      const response = await fetch('/api/farcaster-announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          address: user.address
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to announce')
      }
    } catch (error) {
      console.error('Announcement error:', error)
    }
  }

  return (
    <main 
      className="min-h-screen relative overflow-hidden py-8 px-4"
      style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #e94560 100%)'
      }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto p-4 pt-20 pb-20 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/')}
              className="text-gray-400 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-black gradient-text flex items-center gap-3">
                🛠️ Admin Panel
              </h1>
              <p className="text-orange-300 text-sm font-medium mt-1">
                Bitcoin Blocks - Dev Controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge 
              variant="outline" 
              className={`${
                APP_CONFIG.mode === 'mock'
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50'
                  : 'bg-green-500/20 text-green-300 border-green-400/50'
              } px-3 py-1.5 text-xs font-semibold`}
            >
              {APP_CONFIG.mode === 'mock' ? '🧪 MOCK MODE' : '🔴 REAL-TIME'}
            </Badge>
            <Badge 
              variant="outline" 
              className={`${
                connected 
                  ? 'glass-card text-green-300 border-green-400/50' 
                  : 'glass-card-dark text-red-300 border-red-400/50'
              } px-3 py-1.5 text-xs font-semibold`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
        </motion.div>

        {/* Active Round Status */}
        {activeRound && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass-card border-2 border-orange-500/50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-gray-400">Active Round</p>
                    <p className="text-xl font-bold text-orange-400">
                      Block #{activeRound.blockNumber || 'N/A'}
                    </p>
                  </div>
                  <Badge 
                    variant="outline"
                    className={`${
                      activeRound.status === 'open' 
                        ? 'bg-green-500/20 text-green-300 border-green-400/50' 
                        : activeRound.status === 'closed'
                        ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50'
                        : 'bg-gray-500/20 text-gray-300 border-gray-400/50'
                    } px-4 py-2 text-sm font-bold uppercase`}
                  >
                    {activeRound.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Start New Round */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card border-2 border-green-500/30">
            <CardHeader className="border-b border-green-500/20 pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <span className="text-2xl">🚀</span>
                <div>
                  <p className="text-white">Start New Round</p>
                  <p className="text-xs text-gray-400 font-normal mt-1">
                    Opens new round for guesses & auto-posts to Farcaster
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Target Block Number</Label>
                <Input
                  type="number"
                  placeholder="e.g., 875420"
                  value={blockNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBlockNumber(e.target.value)}
                  disabled={loading || !connected}
                  className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                />
              </div>

              <Button
                onClick={handleStartRound}
                disabled={loading || !connected}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-6 text-base"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  '🔔 Start Round & Announce'
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* End Current Round */}
        {activeRound && activeRound.status === 'open' && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="glass-card border-2 border-red-500/30">
              <CardHeader className="border-b border-red-500/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="text-2xl">⏹️</span>
                  <div>
                    <p className="text-white">End Current Round</p>
                    <p className="text-xs text-gray-400 font-normal mt-1">
                      Locks submissions & triggers wait state
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="glass-card p-4 rounded-lg border border-gray-600/30">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Target Block:</span>
                    <span className="text-orange-400 font-bold">#{activeRound.blockNumber || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-400">Total Guesses:</span>
                    <span className="text-cyan-400 font-bold">{getGuessesForRound(activeRound.id).length}</span>
                  </div>
                </div>

                <Button
                  onClick={handleEndRound}
                  variant="destructive"
                  disabled={loading || !connected}
                  className="w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 font-bold py-6 text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Ending...
                    </>
                  ) : (
                    '🔒 End Round & Lock Submissions'
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Post Results */}
        {activeRound && activeRound.status === 'closed' && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="glass-card border-2 border-purple-500/30">
              <CardHeader className="border-b border-purple-500/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="text-white">Post Results</p>
                    <p className="text-xs text-gray-400 font-normal mt-1">
                      {APP_CONFIG.mode === 'mock' 
                        ? 'Simulates block data & calculates winners (Mock Mode)'
                        : 'Pulls latest block data from mempool.space & posts formatted summary to Farcaster'
                      }
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Button
                  onClick={handlePostResults}
                  disabled={loading || !connected}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold py-6 text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {APP_CONFIG.mode === 'mock' ? 'Calculating...' : 'Fetching from mempool.space...'}
                    </>
                  ) : (
                    <>📡 {APP_CONFIG.mode === 'mock' ? 'Calculate Results & Finish' : 'Fetch Results & Announce'}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Set Prizes / Currency */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="glass-card border-2 border-blue-500/30">
            <CardHeader className="border-b border-blue-500/20 pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <span className="text-2xl">💰</span>
                <div>
                  <p className="text-white">Set Prizes / Currency</p>
                  <p className="text-xs text-gray-400 font-normal mt-1">
                    Configure jackpot and prize amounts for new rounds
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Jackpot Amount</Label>
                  <Input
                    type="text"
                    placeholder="5,000"
                    value={jackpotAmount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJackpotAmount(e.target.value)}
                    className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Jackpot Currency</Label>
                  <Input
                    type="text"
                    placeholder="$SECOND"
                    value={jackpotCurrency}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJackpotCurrency(e.target.value)}
                    className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">1st Place Prize</Label>
                  <Input
                    type="text"
                    placeholder="1,000"
                    value={firstPrize}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstPrize(e.target.value)}
                    className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">2nd Place Prize</Label>
                  <Input
                    type="text"
                    placeholder="500"
                    value={secondPrize}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecondPrize(e.target.value)}
                    className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Prize Currency</Label>
                <Input
                  type="text"
                  placeholder="$SECOND, BTC, ETH, SATS"
                  value={prizeCurrency}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrizeCurrency(e.target.value)}
                  className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="glass-card p-4 rounded-lg border border-blue-500/30">
                <p className="text-xs text-blue-300">
                  💡 These values will be used when creating new rounds
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info Notes */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="glass-card border-2 border-cyan-500/30">
            <CardContent className="py-4">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">ℹ️</span>
                  <div>
                    <p className="text-sm text-cyan-300 font-bold">
                      Auto-Announcement
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {APP_CONFIG.mode === 'mock' 
                        ? 'In Mock Mode, Farcaster posts are simulated and logged to console.'
                        : 'Starting rounds and posting results will automatically announce on Farcaster with formatted messages.'
                      }
                    </p>
                  </div>
                </div>
                {APP_CONFIG.mode === 'mock' && (
                  <div className="flex items-start gap-2 pt-2 border-t border-cyan-500/20">
                    <span className="text-yellow-400 mt-0.5">🧪</span>
                    <div>
                      <p className="text-sm text-yellow-300 font-bold">
                        Mock Mode Active
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        All operations use simulated data. Switch to Real-Time mode in config for live Bitcoin data.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { useGame, isDevAddress } from '../context/GameContext'
import { useToast } from '../hooks/use-toast'
import { APP_CONFIG } from '../config/app-config'


export function AdminPanel() {
  const { user, createRound, endRound, updateRoundResult, activeRound, rounds, getGuessesForRound, connected, client, prizeConfig } = useGame()
  const { toast } = useToast()
  const [loading, setLoading] = useState<boolean>(false)
  const [checkingBlock, setCheckingBlock] = useState<boolean>(false)
  const [blockAvailable, setBlockAvailable] = useState<boolean>(false)

  // Form states
  const [roundNumber, setRoundNumber] = useState<string>('')
  const [blockNumber, setBlockNumber] = useState<string>('')
  const [duration, setDuration] = useState<string>('10')
  const [jackpotAmount, setJackpotAmount] = useState<string>('')
  const [firstPrize, setFirstPrize] = useState<string>('')
  const [secondPrize, setSecondPrize] = useState<string>('')
  const [prizeCurrency, setPrizeCurrency] = useState<string>('')

  // Load saved prize config on mount
  useEffect(() => {
    if (prizeConfig) {
      setJackpotAmount(String(prizeConfig.jackpotAmount))
      setFirstPrize(String(prizeConfig.firstPlaceAmount))
      setSecondPrize(String(prizeConfig.secondPlaceAmount))
      setPrizeCurrency(prizeConfig.currencyType)
    } else {
      // Set defaults if no config exists
      setJackpotAmount('5000')
      setFirstPrize('1000')
      setSecondPrize('500')
      setPrizeCurrency('$SECOND')
    }
  }, [prizeConfig])

  // Only show to admin users (check already done in parent, but double-check for safety)
  if (!user?.isAdmin) {
    console.log('⚠️ AdminPanel: User is not admin', { user })
    return <></>
  }
  
  console.log('✅ AdminPanel rendered for admin:', {
    user,
    connected,
    hasClient: !!client,
    activeRound
  })

  const handleStartRound = async (): Promise<void> => {
    if (!roundNumber) {
      toast({
        title: '⚠️ Missing Round Number',
        description: 'Please enter a round number',
        variant: 'destructive'
      })
      return
    }

    if (!blockNumber) {
      toast({
        title: '⚠️ Missing Block Number',
        description: 'Please enter a target block number',
        variant: 'destructive'
      })
      return
    }

    if (!duration) {
      toast({
        title: '⚠️ Missing Duration',
        description: 'Please enter round duration in minutes',
        variant: 'destructive'
      })
      return
    }

    const roundNum = parseInt(roundNumber)
    if (isNaN(roundNum) || roundNum <= 0) {
      toast({
        title: '⚠️ Invalid Round Number',
        description: 'Please enter a valid positive round number',
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

    const durationMin = parseInt(duration)
    if (isNaN(durationMin) || durationMin <= 0) {
      toast({
        title: '⚠️ Invalid Duration',
        description: 'Please enter a valid positive duration in minutes',
        variant: 'destructive'
      })
      return
    }

    const now = Date.now()
    const endTime = now + (durationMin * 60 * 1000)
    const prize = `${jackpotAmount} ${prizeCurrency}`

    try {
      setLoading(true)
      await createRound(roundNum, now, endTime, prize, blockNum, durationMin)
      
      // Auto-post to Farcaster
      const farcasterPrize = `${jackpotAmount} ${prizeCurrency}`
      const message = `🔔 Round #${roundNum} Started!\n\nGuess how many transactions will be in the next Bitcoin block ⛏️\n\n💰 Jackpot: ${farcasterPrize}\n🎯 Target Block: #${blockNum}\n⏱ Duration: ${durationMin} minutes\n\n#BitcoinBlocks`
      await handleAnnounce(message)
      
      toast({
        title: '✅ Round Started',
        description: `Round #${roundNum} - Block #${blockNum} - ${durationMin} min`
      })
      
      setRoundNumber('')
      setBlockNumber('')
      setDuration('10')
      
      // Start polling mempool.space for target block
      if (blockNum) {
        pollForTargetBlock(blockNum)
      }
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
    // Find any round with status 'closed' (not just activeRound)
    const closedRound = rounds.find((r: any) => r.status === 'closed')
    
    if (!closedRound) {
      toast({
        title: '⚠️ No Closed Round',
        description: 'End a round first before posting results',
        variant: 'destructive'
      })
      return
    }

    if (!closedRound.blockNumber) {
      toast({
        title: '⚠️ No Block Number',
        description: 'Round does not have a target block',
        variant: 'destructive'
      })
      return
    }

    // Check if there are predictions in this round
    const guesses = getGuessesForRound(closedRound.id)
    if (guesses.length === 0) {
      toast({
        title: '⚠️ No Predictions',
        description: `Round #${closedRound.roundNumber || closedRound.id} has no player predictions. Cannot calculate winners.`,
        variant: 'destructive'
      })
      return
    }

    try {
      setLoading(true)
      
      // In mock mode, simulate block data
      if (APP_CONFIG.mode === 'mock') {
        const simulatedTxCount = Math.floor(Math.random() * 1000) + 2500
        const simulatedHash = `0000000000000000000${Math.random().toString(36).substring(2, 15)}`

        const sorted = [...guesses].sort((a: any, b: any) => {
          const diffA = Math.abs(a.guess - simulatedTxCount)
          const diffB = Math.abs(b.guess - simulatedTxCount)
          if (diffA !== diffB) return diffA - diffB
          return a.submittedAt - b.submittedAt
        })

        const winner = sorted[0]
        const runnerUp = sorted[1]

        await updateRoundResult(closedRound.id, simulatedTxCount, simulatedHash, winner.address)

        const newJackpot = `${jackpotAmount} ${prizeCurrency}`
        const message = `📊 Block #${closedRound.blockNumber} had ${simulatedTxCount.toLocaleString()} transactions.\n\n🥇 Winner: @${winner.username}\n🥈 Runner-Up: ${runnerUp ? `@${runnerUp.username}` : 'N/A'}\n\n💰 Jackpot is now: ${newJackpot}\n\n#BitcoinBlocks`
        
        console.log('[MOCK MODE] Farcaster announcement:', message)
        await handleAnnounce(message)

        toast({
          title: '🎉 Results Posted! (Mock)',
          description: `Winner: @${winner.username} - ${simulatedTxCount} tx simulated`
        })
        return
      }
      
      // Real-time mode: Fetch from mempool.space via proxy
      const blockRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: 'https',
          origin: 'mempool.space',
          path: `/api/block-height/${closedRound.blockNumber}`,
          method: 'GET',
          headers: {}
        })
      })

      if (!blockRes.ok) {
        throw new Error(`Block #${closedRound.blockNumber} not found yet. Try again later.`)
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
      const roundGuesses = getGuessesForRound(closedRound.id)
      if (guesses.length === 0) {
        throw new Error('No predictions in this round')
      }

      const sorted = [...roundGuesses].sort((a: any, b: any) => {
        const diffA = Math.abs(a.guess - actualTxCount)
        const diffB = Math.abs(b.guess - actualTxCount)
        if (diffA !== diffB) return diffA - diffB
        return a.submittedAt - b.submittedAt
      })

      const winner = sorted[0]
      const runnerUp = sorted[1]

      await updateRoundResult(closedRound.id, actualTxCount, blockHash, winner.address)

      // Auto-post results to Farcaster
      const newJackpot = `${jackpotAmount} ${prizeCurrency}`
      const message = `📊 Block #${closedRound.blockNumber} had ${actualTxCount.toLocaleString()} transactions.\n\n🥇 Winner: @${winner.username}\n🥈 Runner-Up: ${runnerUp ? `@${runnerUp.username}` : 'N/A'}\n\n💰 Jackpot is now: ${newJackpot}\n\n#BitcoinBlocks`
      
      await handleAnnounce(message)

      toast({
        title: '🎉 Results Posted!',
        description: `Winner: @${winner.username} - announced on Farcaster`
      })
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

  const handleSavePrizeConfig = async (): Promise<void> => {
    if (!client || !connected) {
      toast({
        title: '⚠️ Not Connected',
        description: 'Please wait for database connection',
        variant: 'destructive'
      })
      return
    }

    // Validate inputs
    const jackpotNum = parseFloat(jackpotAmount.replace(/,/g, ''))
    const firstNum = parseFloat(firstPrize.replace(/,/g, ''))
    const secondNum = parseFloat(secondPrize.replace(/,/g, ''))

    if (isNaN(jackpotNum) || jackpotNum <= 0) {
      toast({
        title: '⚠️ Invalid Jackpot Amount',
        description: 'Please enter a valid positive number',
        variant: 'destructive'
      })
      return
    }

    if (isNaN(firstNum) || firstNum <= 0) {
      toast({
        title: '⚠️ Invalid 1st Place Prize',
        description: 'Please enter a valid positive number',
        variant: 'destructive'
      })
      return
    }

    if (isNaN(secondNum) || secondNum <= 0) {
      toast({
        title: '⚠️ Invalid 2nd Place Prize',
        description: 'Please enter a valid positive number',
        variant: 'destructive'
      })
      return
    }

    if (!prizeCurrency || prizeCurrency.trim() === '') {
      toast({
        title: '⚠️ Missing Currency',
        description: 'Please enter a currency type',
        variant: 'destructive'
      })
      return
    }

    try {
      setLoading(true)
      
      // Save prize configuration using Supabase client
      const { error } = await (client as any)
        .from('prize_configs')
        .insert({
          config_data: {
            jackpotAmount: jackpotNum.toString(),
            firstPlaceAmount: firstNum.toString(),
            secondPlaceAmount: secondNum.toString(),
            currencyType: prizeCurrency.trim(),
            tokenContractAddress: '' // empty for now
          },
          updated_at: Date.now(),
          version: 1 // Will be auto-incremented by DB
        })

      if (error) {
        throw new Error(`Failed to save prize config: ${error.message}`)
      }

      toast({
        title: '✅ Prize Config Saved',
        description: `Jackpot: ${jackpotAmount} ${prizeCurrency}, 1st: ${firstPrize}, 2nd: ${secondPrize} ${prizeCurrency}`
      })
    } catch (error) {
      toast({
        title: '❌ Failed to Save',
        description: error instanceof Error ? error.message : 'Failed to save prize config',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Poll mempool.space to check if target block is available
  const pollForTargetBlock = async (targetBlock: number): Promise<void> => {
    
    setCheckingBlock(true)
    setBlockAvailable(false)
    
    const checkBlock = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol: 'https',
            origin: 'mempool.space',
            path: `/api/block-height/${targetBlock}`,
            method: 'GET',
            headers: {}
          })
        })
        
        if (response.ok) {
          console.log(`✅ Block #${targetBlock} is now available on mempool.space!`)
          return true
        }
        return false
      } catch (error) {
        console.log(`⏳ Block #${targetBlock} not yet available...`)
        return false
      }
    }
    
    // Poll every 30 seconds
    const interval = setInterval(async () => {
      if (!activeRound || activeRound.status !== 'open') {
        clearInterval(interval)
        setCheckingBlock(false)
        return
      }
      
      const available = await checkBlock()
      if (available) {
        setBlockAvailable(true)
        setCheckingBlock(false)
        clearInterval(interval)
        
        // Auto-close round
        if (activeRound && activeRound.status === 'open') {
          toast({
            title: '🎯 Target Block Found!',
            description: `Block #${targetBlock} is available. Auto-closing round...`,
          })
          
          setTimeout(async () => {
            try {
              await handleEndRound()
              toast({
                title: '✅ Round Auto-Closed',
                description: 'Round closed automatically. You can now post results.',
              })
            } catch (error) {
              console.error('Failed to auto-close round:', error)
            }
          }, 2000)
        }
      }
    }, 30000) // Check every 30 seconds
    
    // Initial check
    const available = await checkBlock()
    if (available) {
      setBlockAvailable(true)
      setCheckingBlock(false)
      clearInterval(interval)
    }
  }

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.9 }}
    >
      <Card className="glass-card-dark border-2 border-yellow-500/50 shadow-2xl shadow-yellow-500/20">
        <CardHeader className="pb-3 border-b border-yellow-500/30">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.span
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-3xl"
              >
                🛠️
              </motion.span>
              <div>
                <div className="text-xl font-black gradient-text">Admin Panel</div>
                <div className="text-[10px] text-yellow-300 font-normal">Manage rounds & configure prizes</div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`${
                APP_CONFIG.mode === 'mock'
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50'
                  : 'bg-green-500/20 text-green-300 border-green-400/50'
              } px-3 py-1.5 text-xs font-semibold`}
            >
              {'🔴 REAL-TIME'}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Grid Layout for Admin Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Start New Round */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-green-500/30">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚀</span>
                <h3 className="text-base font-bold text-white">Start New Round</h3>
              </div>
              <p className="text-xs text-gray-400">Opens new round for guesses & auto-posts to Farcaster</p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm font-bold">🔢 Round Number <span className="text-gray-500 font-normal text-xs">(sequential: 1, 2, 3...)</span></Label>
                  <Input
                    type="number"
                    placeholder="Enter: 1, 2, 3, 4, 5... (NOT block number!)"
                    value={roundNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoundNumber(e.target.value)}
                    disabled={loading || !connected}
                    className="bg-gray-800/50 border-gray-600/50 text-white h-12 placeholder:text-gray-500"
                  />
                  <p className="text-[10px] text-green-400">✅ Example: Round 1, Round 2, Round 3</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm font-bold">🧱 Target Block Number <span className="text-gray-500 font-normal text-xs">(from mempool.space)</span></Label>
                  <Input
                    type="number"
                    placeholder="Enter: 919185, 875420... (Bitcoin block height)"
                    value={blockNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBlockNumber(e.target.value)}
                    disabled={loading || !connected}
                    className="bg-gray-800/50 border-gray-600/50 text-white h-12 placeholder:text-gray-500"
                  />
                  <p className="text-[10px] text-cyan-400">✅ Example: Block #919185 (6-digit number)</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm font-bold">⏱ Round Duration <span className="text-gray-500 font-normal text-xs">(in minutes)</span></Label>
                  <Input
                    type="number"
                    placeholder="e.g., 10, 15, 30 minutes"
                    value={duration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDuration(e.target.value)}
                    disabled={loading || !connected}
                    className="bg-gray-800/50 border-gray-600/50 text-white h-12 placeholder:text-gray-500"
                  />
                  <p className="text-[10px] text-orange-400">✅ Default: 10 minutes</p>
                </div>
              </div>

              <Button
                onClick={handleStartRound}
                disabled={loading || !connected}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold h-12"
              >
                {loading ? '⚙️ Starting...' : '🔔 Start Round & Announce'}
              </Button>
            </div>

            {/* Manage Round - Combined End & Post Results */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-purple-500/30">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎮</span>
                <h3 className="text-base font-bold text-white">Manage Round</h3>
              </div>
              <p className="text-xs text-gray-400">
                {'End round or fetch results from mempool.space (auto-closes when target block available)'}
              </p>

              {/* Round Status Info */}
              {activeRound ? (
                <div className="space-y-3">
                  <div className="glass-card-dark p-3 rounded-lg border border-gray-600/30">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Round #:</span>
                      <span className="text-orange-400 font-bold">{activeRound.roundNumber || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-400">Target Block:</span>
                      <span className="text-cyan-400 font-bold">#{activeRound.blockNumber || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-400">Total Guesses:</span>
                      <span className="text-green-400 font-bold">{getGuessesForRound(activeRound.id).length}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-400">Status:</span>
                      <span className={`font-bold ${
                        activeRound.status === 'open' ? 'text-green-400' :
                        activeRound.status === 'closed' ? 'text-yellow-400' :
                        'text-purple-400'
                      }`}>
                        {activeRound.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Block Check Status */}
                  {checkingBlock && (
                    <div className="glass-card-dark p-3 rounded-lg border border-blue-500/30">
                      <p className="text-xs text-blue-300 text-center">
                        🔍 Checking mempool.space for Block #{activeRound.blockNumber}...
                      </p>
                    </div>
                  )}
                  
                  {blockAvailable && (
                    <div className="glass-card-dark p-3 rounded-lg border border-green-500/30">
                      <p className="text-xs text-green-300 text-center">
                        ✅ Block #{activeRound.blockNumber} found on mempool.space!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card-dark p-3 rounded-lg border border-gray-600/30">
                  <p className="text-xs text-gray-400 text-center py-2">
                    ⚠️ No active round
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                {/* End Round Button */}
                <Button
                  onClick={handleEndRound}
                  variant="destructive"
                  disabled={loading || !connected || !activeRound || activeRound.status !== 'open'}
                  className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 font-bold h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '⚙️' : '🔒'}
                  <span className="ml-1 text-xs">
                    {loading ? 'Ending...' : 'End Round'}
                  </span>
                </Button>

                {/* Post Results Button */}
                <Button
                  onClick={handlePostResults}
                  disabled={loading || !connected || !rounds.find((r: any) => r.status === 'closed')}
                  className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '⚙️' : '📡'}
                  <span className="ml-1 text-xs">
                    {loading ? 'Fetching...' : 'Post Results'}
                  </span>
                </Button>
              </div>
              
              {/* Helper Text */}
              <div className="text-[10px] text-gray-500 text-center">
                {!activeRound && !rounds.find((r: any) => r.status === 'closed')
                  ? 'Create a round first' 
                  : activeRound?.status === 'open' 
                  ? 'End round to enable posting results' 
                  : rounds.find((r: any) => r.status === 'closed')
                  ? 'Ready to post results'
                  : 'Results already posted'
                }
              </div>
            </div>

            {/* Set Prizes / Currency */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-blue-500/30 lg:col-span-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <h3 className="text-base font-bold text-white">Set Prizes / Currency</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">Jackpot Amount</Label>
                    <Input
                      type="text"
                      placeholder="5000 (enter numbers only)"
                      value={jackpotAmount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJackpotAmount(e.target.value)}
                      className="bg-gray-800/50 border-gray-600/50 text-white"
                    />
                    <p className="text-[10px] text-gray-400">Enter amount without commas or currency symbols</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">1st Place Prize</Label>
                    <Input
                      type="text"
                      placeholder="1000"
                      value={firstPrize}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstPrize(e.target.value)}
                      className="bg-gray-800/50 border-gray-600/50 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">2nd Place Prize</Label>
                    <Input
                      type="text"
                      placeholder="500"
                      value={secondPrize}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecondPrize(e.target.value)}
                      className="bg-gray-800/50 border-gray-600/50 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Prize Currency</Label>
                <Input
                  type="text"
                  placeholder="$SECOND, USDC, ETH"
                  value={prizeCurrency}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrizeCurrency(e.target.value)}
                  className="bg-gray-800/50 border-gray-600/50 text-white"
                />
              </div>

              

              {/* Save Prize Config Button */}
              <Button
                onClick={handleSavePrizeConfig}
                disabled={loading || !connected}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-bold h-12"
              >
                {loading ? '⚙️ Saving...' : '💾 Save Prize Configuration'}
              </Button>

              <div className="glass-card-dark p-3 rounded-lg border border-blue-500/30">
                <p className="text-xs text-blue-300">
                  💡 Save your prize configuration to database. These values will be used when creating new rounds.
                </p>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div className="glass-card-dark p-4 rounded-xl border border-cyan-500/30">
            <p className="text-sm text-cyan-300">
              <span className="font-bold">ℹ️ Auto-Announcement:</span> Starting rounds and posting results will automatically announce on Farcaster with formatted messages.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

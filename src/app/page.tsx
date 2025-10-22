'use client'
import React from 'react'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'

import { AuthButton } from '@/components/AuthButton'
import { GlobalChat } from '@/components/GlobalChat'
import { AdminPanel } from '@/components/AdminPanel'
import { Countdown } from '@/components/Countdown'
import { GuessForm } from '@/components/GuessForm'
import { Leaderboard } from '@/components/Leaderboard'
import { AllPredictions } from '@/components/AllPredictions'
import { LoadingScreen } from '@/components/LoadingScreen'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { RecentBlocks } from '@/components/RecentBlocks'
import { DatabaseStatusBanner } from '@/components/DatabaseStatusBanner'
import { CurrentRound } from '@/components/CurrentRound'
import { PrizesAndRulesSection } from '@/components/PrizesAndRulesSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGame } from '@/context/GameContext'
import { sdk } from "@farcaster/miniapp-sdk"

export default function Home(): React.ReactElement {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [showAuthDialog, setShowAuthDialog] = useState<boolean>(false)
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false)
  const { activeRound, getGuessesForRound, connected, user, prizeConfig } = useGame()
  
  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (document.readyState !== 'complete') {
          await new Promise(resolve => {
            if (document.readyState === 'complete') {
              resolve(void 0)
            } else {
              window.addEventListener('load', () => resolve(void 0), { once: true })
            }
          })
        }

        await sdk.actions.ready()
        console.log("Farcaster SDK initialized successfully - app fully loaded")
      } catch (error) {
        console.error('Failed to initialize Farcaster SDK:', error)
        setTimeout(async () => {
          try {
            await sdk.actions.ready()
            console.log('Farcaster SDK initialized on retry')
          } catch (retryError) {
            console.error('Farcaster SDK retry failed:', retryError)
          }
        }, 1000)
      }
    }
    initializeFarcaster()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      // Show auth dialog after loading if user not authenticated
      if (!user) {
        setShowAuthDialog(true)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [user])

  const participantCount = activeRound ? getGuessesForRound(activeRound.id).length : 0

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <LoadingScreen key="loading" />}
      </AnimatePresence>



      {!isLoading && (
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #e94560 100%)'
          }}
        >
          <AnimatedBackground />
          
          {/* Database Status Banner - Removed to hide mode indicator */}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30 pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto p-3 sm:p-4 pt-16 sm:pt-20 pb-16 sm:pb-20 space-y-4 sm:space-y-6">
            {/* Header */}
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
              className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6"
            >
              <div className="space-y-2">
                <motion.h1
                  className="text-3xl lg:text-4xl font-black gradient-text flex items-center gap-3 relative z-50"
                  style={{
                    filter: 'none',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    transform: 'translateZ(0)'
                  }}
                >
                  <span
                    className="text-4xl lg:text-5xl"
                    style={{
                      display: 'inline-block',
                      lineHeight: '1',
                      filter: 'contrast(1.2) brightness(1.1)',
                      transform: 'translateZ(0)',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale'
                    }}
                  >
                    🛠️
                  </span>
                  Bitcoin Blocks
                </motion.h1>
                <p className="text-orange-300 text-sm font-medium flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                  Predicting Bitcoin's Next Block
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{
                    scale: connected ? [1, 1.05, 1] : 1,
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Badge 
                    variant="outline" 
                    className={`${
                      connected 
                        ? 'glass-card text-green-300 border-green-400/50 shadow-lg shadow-green-500/20' 
                        : 'glass-card-dark text-red-300 border-red-400/50'
                    } px-3 py-1.5 text-xs font-semibold`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                    {connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </motion.div>
                <AuthButton />
              </div>
            </motion.div>

            {/* Jackpot Hero Section - Compact */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="glass-card border-2 border-yellow-500/50 overflow-hidden relative shadow-3d">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-yellow-500/0 via-yellow-500/20 to-yellow-500/0"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <CardContent className="py-4 sm:py-6 text-center relative z-10">
                  <p className="text-yellow-300 text-xs sm:text-sm font-bold uppercase tracking-wider mb-1">💰 Jackpot</p>
                  <motion.p
                    className="text-3xl sm:text-5xl font-black gradient-text"
                    animate={{
                      textShadow: [
                        "0 0 20px rgba(234,179,8,0.5)",
                        "0 0 40px rgba(234,179,8,0.8)",
                        "0 0 20px rgba(234,179,8,0.5)"
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {prizeConfig ? `${Number(prizeConfig.jackpotAmount).toLocaleString()} ${prizeConfig.currencyType}` : '5,000 $SECOND'}
                  </motion.p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Prizes and Rules Section - Combined */}
            <PrizesAndRulesSection 
              firstPrize={prizeConfig ? Number(prizeConfig.firstPlaceAmount).toLocaleString() : '1,000'}
              secondPrize={prizeConfig ? Number(prizeConfig.secondPlaceAmount).toLocaleString() : '500'}
              currency={prizeConfig?.currencyType || '$SECOND'}
            />

            {/* Current Round - New Simplified Design */}
            <CurrentRound />

            {/* Guess Form, Leaderboard & Chat Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <motion.div
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <GuessForm />
              </motion.div>

              <motion.div
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <Leaderboard />
              </motion.div>

              <motion.div
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <GlobalChat />
              </motion.div>
            </div>

            {/* All Predictions Section - Full Width */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.75 }}
            >
              <AllPredictions />
            </motion.div>

            {/* Recent Bitcoin Blocks - Bottom Section */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <RecentBlocks />
            </motion.div>

            {/* Admin Panel Toggle Button */}
            {user?.isAdmin && (
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.85 }}
                className="flex justify-center"
              >
                <Button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold px-6 py-3 shadow-2xl shadow-yellow-500/30"
                >
                  {showAdminPanel ? '🔼 Hide Admin Panel' : '🛠️ Show Admin Panel'}
                </Button>
              </motion.div>
            )}

            {/* Admin Panel - Conditionally shown */}
            {user?.isAdmin && showAdminPanel && <AdminPanel />}

          </div>
        </motion.main>
      )}
    </>
  )
}

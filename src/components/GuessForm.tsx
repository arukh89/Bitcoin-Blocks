'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { useGame } from '../context/GameContext'
import { useToast } from '../hooks/use-toast'

export function GuessForm(): React.ReactElement {
  const {
    user,
    activeRound,
    submitGuess,
    hasUserGuessed,
    connected,
    loadingStates,
    errorStates,
    optimisticActions
  } = useGame()
  const { toast } = useToast()
  const [guess, setGuess] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Get user's guesses for active round
  const { getGuessesForRound } = useGame()
  
  // Memoize user guesses to prevent unnecessary recalculations
  const userGuesses = useMemo(() => {
    if (!activeRound || !user) return []
    return getGuessesForRound(activeRound.id).filter(g =>
      g.address.toLowerCase() === user.address.toLowerCase()
    )
  }, [activeRound, user, getGuessesForRound])

  // Memoize round status checks
  const isRoundLocked = useMemo(() =>
    activeRound?.status !== 'open',
    [activeRound?.status]
  )
  
  const alreadyGuessed = useMemo(() =>
    user && activeRound ? hasUserGuessed(activeRound.id, user.address) : false,
    [user, activeRound, hasUserGuessed]
  )

  // Enhanced validation with debouncing
  const validateGuess = useCallback((value: string): { isValid: boolean; error: string | null } => {
    if (!value.trim()) {
      return { isValid: false, error: null }
    }

    const guessNum = parseInt(value, 10)
    
    if (isNaN(guessNum)) {
      return { isValid: false, error: 'Must be a valid number' }
    }
    
    if (guessNum < 1 || guessNum > 20000) {
      return { isValid: false, error: 'Must be between 1 and 20,000' }
    }
    
    if (value.includes('.') || value.includes(',')) {
      return { isValid: false, error: 'No decimals allowed' }
    }

    return { isValid: true, error: null }
  }, [])

  // Debounced validation
  useEffect(() => {
    if (!guess) {
      setValidationError(null)
      return
    }

    setIsValidating(true)
    const timer = setTimeout(() => {
      const { isValid, error } = validateGuess(guess)
      setValidationError(error)
      setIsValidating(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [guess, validateGuess])

  // Enhanced input change handler with validation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and limit length
    if (value === '' || /^\d+$/.test(value)) {
      setGuess(value)
    }
  }, [])

  // Enhanced submit handler with optimistic updates
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!user) {
      toast({
        title: '🔐 Authentication Required',
        description: 'Please sign in with Farcaster first',
        variant: 'destructive'
      })
      return
    }

    if (!activeRound) {
      toast({
        title: '⚠️ No Active Round',
        description: 'Wait for a round to start',
        variant: 'destructive'
      })
      return
    }

    if (isRoundLocked) {
      toast({
        title: '❌ Too late! Round is locked.',
        description: 'Submissions are closed for this round',
        variant: 'destructive'
      })
      return
    }

    // Use cached validation result
    const { isValid, error } = validateGuess(guess)
    if (!isValid || error) {
      toast({
        title: '⚠️ Invalid Input',
        description: error || 'Please enter a valid number between 1 and 20,000',
        variant: 'destructive'
      })
      return
    }

    if (alreadyGuessed) {
      toast({
        title: '❌ Already Submitted',
        description: 'One guess per round. Submit before the block is mined.',
        variant: 'destructive'
      })
      return
    }

    const guessNum = parseInt(guess, 10)

    try {
      setLoading(true)
      const success = await submitGuess(activeRound.id, user.address, user.username, guessNum, user.pfpUrl)
      
      if (success) {
        toast({
          title: '✅ Guess Submitted!',
          description: `Your prediction: ${guessNum.toLocaleString()} transactions`
        })
        setGuess('')
        setValidationError(null)
      } else {
        toast({
          title: '❌ Submission Failed',
          description: 'Could not submit prediction. Please try again.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: '⚠️ Error',
        description: error instanceof Error ? error.message : 'Failed to submit prediction',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }, [handleSubmit])

  return (
    <Card className="glass-card-dark border-orange-500/30 h-full shadow-3d">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white text-lg">
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            🔢
          </motion.span>
          Submit Your Guess
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm font-semibold">🎯 Your Prediction</Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={!user ? "Sign in to predict..." : !activeRound ? "Waiting for round..." : "Enter tx count (1-20,000)"}
              value={guess}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={loading || isRoundLocked || !connected || !user || !activeRound || alreadyGuessed}
              required
              className={`h-14 text-lg font-bold text-center bg-gray-800/50 border-2 transition-all rounded-xl ${
                validationError
                  ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/50'
                  : 'border-orange-500/50 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50'
              } text-white placeholder:text-gray-500`}
            />
            
            {/* Validation Error Display */}
            {validationError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-xs mt-1 flex items-center gap-1"
              >
                <span>⚠️</span>
                <span>{validationError}</span>
              </motion.div>
            )}
          </div>

          {/* Status Messages */}
          {!connected ? (
            <motion.div
              className="glass-card p-4 rounded-xl text-center border border-yellow-500/30"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-2xl mb-2">🔌</p>
              <p className="text-yellow-300 text-sm font-medium">Connecting to database...</p>
            </motion.div>
          ) : !user ? (
            <motion.div
              className="glass-card p-4 rounded-xl text-center border border-gray-500/30"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-gray-300 text-sm font-medium">Sign in with Farcaster to participate</p>
            </motion.div>
          ) : !activeRound ? (
            <motion.div
              className="glass-card p-4 rounded-xl text-center border border-yellow-500/30"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-2xl mb-2">⏳</p>
              <p className="text-yellow-300 text-sm font-medium">Waiting for next round to start...</p>
              <p className="text-yellow-400 text-xs mt-2">💡 Admin: Create a round in the Admin Panel below</p>
            </motion.div>
          ) : (
            <>
              <Button
                type="submit"
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || isRoundLocked || !connected || alreadyGuessed || isValidating || !!validationError}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      ⚙️
                    </motion.span>
                    Submitting...
                  </span>
                ) : alreadyGuessed ? (
                  '✅ Already Submitted'
                ) : isRoundLocked ? (
                  '🔒 Round Locked'
                ) : !connected ? (
                  '🔌 Connecting...'
                ) : isValidating ? (
                  '⏳ Validating...'
                ) : (
                  '🚀 Submit Prediction'
                )}
              </Button>

              {isRoundLocked && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card p-3 rounded-lg border border-red-500/30 bg-red-500/10"
                >
                  <p className="text-sm text-red-300 text-center font-semibold">
                    ❌ Round Locked - Submissions Closed
                  </p>
                </motion.div>
              )}

              <div className="glass-card p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <p className="text-xs text-blue-300 text-center">
                  💡 Your prediction will be saved below
                </p>
              </div>
            </>
          )}
        </form>

        {/* User's Own Guess - Highlighted */}
        {user && activeRound && userGuesses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2 pt-4 border-t border-gray-700/50"
          >
            <Label className="text-gray-400 text-xs font-semibold uppercase tracking-wide">✨ Your Prediction</Label>
            <div className="space-y-2">
              {userGuesses.map((g) => (
                <motion.div
                  key={g.id}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="glass-card p-3 rounded-lg border-2 border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-purple-500/10"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🎯</span>
                      <div>
                        <p className="text-orange-200 font-bold text-base">
                          {g.guess.toLocaleString()} transactions
                        </p>
                        <p className="text-gray-400 text-xs">
                          {new Date(g.submittedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-orange-500/20 border border-orange-500/40 rounded text-orange-300 text-xs font-bold">
                      YOU
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Already guessed message - shown when user has submitted */}
        {alreadyGuessed && userGuesses.length === 0 && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card p-4 rounded-xl text-center border-2 border-green-500/50 bg-green-500/10"
          >
            <p className="text-3xl mb-2">✅</p>
            <p className="text-green-300 text-sm font-bold">Guess Submitted!</p>
            <p className="text-green-400 text-xs mt-1">One prediction per round</p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}

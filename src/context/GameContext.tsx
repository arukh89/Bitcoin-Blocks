'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { Round, Guess, Log, User, ChatMessage, PrizeConfiguration } from '../types/game'
import { supabaseAuth, setSupabaseContext } from '../lib/supabase-auth'
import { supabaseDb } from '../lib/supabase-db'
import { connectionMonitor, withSupabaseRetry } from '../lib/supabase-client'
import { errorLogger, logDatabaseError, logNetworkError, logSystemError, logAuthError } from '../lib/error-handling'
import { usePerformanceTracking } from '../hooks/usePerformanceTracking'

// Enhanced GameContext interface with optimistic updates and performance monitoring
interface GameContextType {
  user: User | null
  setUser: (user: User | null) => void
  rounds: Round[]
  guesses: Guess[]
  logs: Log[]
  chatMessages: ChatMessage[]
  activeRound: Round | null
  prizeConfig: PrizeConfiguration | null
  createRound: (roundNumber: number, startTime: number, endTime: number, prize: string, blockNumber?: number, duration?: number) => Promise<void>
  submitGuess: (roundId: string, address: string, username: string, guess: number, pfpUrl: string) => Promise<boolean>
  endRound: (roundId: string) => Promise<boolean>
  updateRoundResult: (roundId: string, actualTxCount: number, blockHash: string, winningAddress: string) => Promise<void>
  getGuessesForRound: (roundId: string) => Guess[]
  hasUserGuessed: (roundId: string, address: string) => boolean
  addChatMessage: (message: ChatMessage) => void
  connected: boolean
  client: any // Supabase client
  mode: 'supabase'
  
  // Enhanced loading states with more granular control
  loadingStates: {
    rounds: boolean
    guesses: boolean
    chatMessages: boolean
    prizeConfig: boolean
    auth: boolean
    connection: boolean
  }
  
  // Enhanced error states with retry capabilities
  errorStates: {
    rounds: string | null
    guesses: string | null
    chatMessages: string | null
    prizeConfig: string | null
    auth: string | null
    connection: string | null
  }
  
  // Optimistic update functions
  optimisticActions: {
    addGuessOptimistically: (guess: Guess) => void
    addChatMessageOptimistically: (message: ChatMessage) => void
    updateRoundOptimistically: (roundId: string, updates: Partial<Round>) => void
  }
  
  // Performance and monitoring
  performance: {
    lastSyncTime: number
    syncCount: number
    errorCount: number
    getConnectionHealth: () => boolean
  }
  
  // Retry functions
  retryActions: {
    retryLoadRounds: () => Promise<void>
    retryLoadChatMessages: () => Promise<void>
    retryConnection: () => Promise<void>
  }
}

const GameContext = createContext<GameContextType | undefined>(undefined)

// Dev admin wallet addresses - updated to use FIDs
export const DEV_ADDRESSES = [
  'fid-250704',
  'fid-1107084'
]

export function isDevAddress(address: string): boolean {
  return DEV_ADDRESSES.some(dev => dev.toLowerCase() === address.toLowerCase())
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { trackInteraction, trackAsyncOperation, trackApiCall, trackError } = usePerformanceTracking('GameContext')
  
  const [user, setUser] = useState<User | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [prizeConfig, setPrizeConfig] = useState<PrizeConfiguration | null>(null)
  const [connected, setConnected] = useState<boolean>(false)

  // Enhanced loading states with more granular control
  const [loadingStates, setLoadingStates] = useState({
    rounds: false,
    guesses: false,
    chatMessages: false,
    prizeConfig: false,
    auth: false,
    connection: false
  })

  // Enhanced error states with retry capabilities
  const [errorStates, setErrorStates] = useState({
    rounds: null as string | null,
    guesses: null as string | null,
    chatMessages: null as string | null,
    prizeConfig: null as string | null,
    auth: null as string | null,
    connection: null as string | null
  })

  // Performance monitoring state
  const [performance, setPerformance] = useState({
    lastSyncTime: Date.now(),
    syncCount: 0,
    errorCount: 0,
    getConnectionHealth: () => connectionMonitor.getConnectionStatus()
  })

  // Refs for optimistic updates and debouncing
  const optimisticUpdatesRef = useRef<{
    guesses: Map<string, Guess>
    chatMessages: Map<string, ChatMessage>
    rounds: Map<string, Partial<Round>>
  }>({
    guesses: new Map(),
    chatMessages: new Map(),
    rounds: new Map()
  })

  const client = supabaseDb
  const mode = 'supabase' as const

  // Only rounds with status 'open' are considered active
  const activeRound = rounds.find(r => r.status === 'open') || null

  // Optimistic update functions
  const optimisticActions = {
    addGuessOptimistically: (guess: Guess) => {
      optimisticUpdatesRef.current.guesses.set(guess.id, guess)
      setGuesses(prev => {
        const exists = prev.find(g => g.id === guess.id)
        if (exists) return prev
        return [guess, ...prev]
      })
    },

    addChatMessageOptimistically: (message: ChatMessage) => {
      optimisticUpdatesRef.current.chatMessages.set(message.id, message)
      setChatMessages(prev => {
        const exists = prev.find(m => m.id === message.id)
        if (exists) return prev
        return [message, ...prev].slice(0, 100) // Keep only latest 100
      })
    },

    updateRoundOptimistically: (roundId: string, updates: Partial<Round>) => {
      optimisticUpdatesRef.current.rounds.set(roundId, updates)
      setRounds(prev => prev.map(round =>
        round.id === roundId ? { ...round, ...updates } : round
      ))
    }
  }

  // Retry functions
  const retryActions = {
    retryLoadRounds: async () => {
      setLoadingStates(prev => ({ ...prev, rounds: true }))
      setErrorStates(prev => ({ ...prev, rounds: null }))
      
      try {
        await withSupabaseRetry(async () => {
          const roundsData = await supabaseDb.getRounds()
          setRounds(roundsData)
          setPerformance(prev => ({
            ...prev,
            lastSyncTime: Date.now(),
            syncCount: prev.syncCount + 1
          }))
        })
      } catch (error) {
        setErrorStates(prev => ({
          ...prev,
          rounds: error instanceof Error ? error.message : 'Failed to load rounds'
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      } finally {
        setLoadingStates(prev => ({ ...prev, rounds: false }))
      }
    },

    retryLoadChatMessages: async () => {
      setLoadingStates(prev => ({ ...prev, chatMessages: true }))
      setErrorStates(prev => ({ ...prev, chatMessages: null }))
      
      try {
        await withSupabaseRetry(async () => {
          const messages = await supabaseDb.getChatMessages(100)
          setChatMessages(messages)
          setPerformance(prev => ({
            ...prev,
            lastSyncTime: Date.now(),
            syncCount: prev.syncCount + 1
          }))
        })
      } catch (error) {
        setErrorStates(prev => ({
          ...prev,
          chatMessages: error instanceof Error ? error.message : 'Failed to load chat messages'
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      } finally {
        setLoadingStates(prev => ({ ...prev, chatMessages: false }))
      }
    },

    retryConnection: async () => {
      setLoadingStates(prev => ({ ...prev, connection: true }))
      setErrorStates(prev => ({ ...prev, connection: null }))
      
      try {
        const isHealthy = await withSupabaseRetry(async () => {
          const connected = connectionMonitor.getConnectionStatus()
          if (typeof connected !== 'boolean') {
            throw new Error('Invalid connection status')
          }
          return connected
        })
        setConnected(isHealthy)
        
        if (isHealthy) {
          // Reload data if connection restored
          await Promise.all([
            retryActions.retryLoadRounds(),
            retryActions.retryLoadChatMessages()
          ])
        }
      } catch (error) {
        setConnected(false)
        setErrorStates(prev => ({
          ...prev,
          connection: error instanceof Error ? error.message : 'Connection failed'
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      } finally {
        setLoadingStates(prev => ({ ...prev, connection: false }))
      }
    }
  }

  // ===========================================
  // INITIALIZATION
  // ===========================================

  useEffect(() => {
    const initializeApp = async (): Promise<void> => {
      try {
        console.log('🚀 Initializing enhanced Bitcoin Blocks App with Supabase...')
        setConnected(false)
        setLoadingStates(prev => ({ ...prev, connection: true, auth: true }))

        // Start connection monitoring
        connectionMonitor.startMonitoring()
        connectionMonitor.addListener((isConnected) => {
          setConnected(isConnected)
          if (!isConnected) {
            setErrorStates(prev => ({
              ...prev,
              connection: 'Connection to Supabase lost'
            }))
          } else {
            setErrorStates(prev => ({ ...prev, connection: null }))
          }
        })

        // Initialize authentication with enhanced error handling
        const authUser = await supabaseAuth.initializeAuth()
        if (authUser) {
          setUser(authUser)
          await setSupabaseContext(authUser)
          console.log('✅ User authenticated:', authUser.username)
        } else {
          console.warn('⚠️ User authentication failed or not available')
          setErrorStates(prev => ({
            ...prev,
            auth: 'Authentication failed. Please try again.'
          }))
        }

        // Load initial data with retry mechanism
        await loadInitialDataWithRetry()

        // Set up enhanced real-time subscriptions
        setupRealtimeSubscriptions()

        setConnected(true)
        setPerformance(prev => ({
          ...prev,
          lastSyncTime: Date.now(),
          syncCount: prev.syncCount + 1
        }))
        console.log('✅ Enhanced app initialized successfully!')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Initialization failed'
        console.error('❌ Failed to initialize app:', error)
        
        // Log the error using our error handling system
        logSystemError(errorMessage, {
          component: 'GameContext',
          action: 'initializeApp',
          userId: user?.address
        }, error)
        
        setConnected(false)
        setErrorStates(prev => ({
          ...prev,
          connection: errorMessage
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      } finally {
        setLoadingStates(prev => ({ ...prev, connection: false, auth: false }))
      }
    }

    initializeApp()

    return () => {
      // Cleanup subscriptions and monitoring
      cleanupSubscriptions()
      connectionMonitor.stopMonitoring()
    }
  }, [])

  // Enhanced initial data loading with retry mechanism
  const loadInitialDataWithRetry = async (): Promise<void> => {
    const maxRetries = 3
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        await loadInitialData()
        return // Success, exit retry loop
      } catch (error) {
        retryCount++
        const isLastRetry = retryCount >= maxRetries
        
        const errorMessage = `Initial data load attempt ${retryCount}/${maxRetries} failed`
        console.warn(`⚠️ ${errorMessage}:`, error)
        
        // Log the retry attempt
        logDatabaseError(errorMessage, {
          component: 'GameContext',
          action: 'loadInitialDataWithRetry',
          additionalData: {
            retryCount,
            isLastRetry
          }
        }, error)
        
        if (isLastRetry) {
          const finalError = new Error(`Failed to load initial data after ${maxRetries} attempts`)
          logDatabaseError(finalError.message, {
            component: 'GameContext',
            action: 'loadInitialDataWithRetry',
            additionalData: {
              finalAttempt: true
            }
          }, finalError)
          throw finalError
        }
        
        // Exponential backoff
        const delay = 1000 * Math.pow(2, retryCount - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // ===========================================
  // ENHANCED DATA LOADING
  // ===========================================

  const loadInitialData = async (): Promise<void> => {
    await Promise.all([
      loadRounds(),
      loadPrizeConfiguration(),
      loadChatMessages()
    ])
  }

  const loadRounds = async (): Promise<void> => {
    await trackAsyncOperation('loadRounds', async () => {
      try {
        setLoadingStates(prev => ({ ...prev, rounds: true }))
        setErrorStates(prev => ({ ...prev, rounds: null }))

        const roundsData = await trackApiCall('getRounds', () =>
          withSupabaseRetry(async () => {
            const data = await supabaseDb.getRounds()
            return data
          })
        )
      
      setRounds(roundsData)

        // Load guesses for active rounds with parallel processing
        const activeRounds = roundsData.filter(r => r.status === 'open')
        if (activeRounds.length > 0) {
          const guessPromises = activeRounds.map(async (round) => {
            const roundGuesses = await trackApiCall('getGuessesForRound', () =>
              withSupabaseRetry(async () => {
                return supabaseDb.getGuessesForRound(round.id)
              })
            )
            return { roundId: round.id, guesses: roundGuesses }
          })

          const guessResults = await Promise.all(guessPromises)
          
          setGuesses(prev => {
            let updatedGuesses = [...prev]
            guessResults.forEach(({ roundId, guesses: roundGuesses }) => {
              updatedGuesses = updatedGuesses.filter(g => g.roundId !== roundId)
              updatedGuesses = [...updatedGuesses, ...roundGuesses]
            })
            return updatedGuesses
          })
        }

        console.log('✅ Enhanced rounds loaded successfully')
        setPerformance(prev => ({
          ...prev,
          lastSyncTime: Date.now(),
          syncCount: prev.syncCount + 1
        }))
        trackInteraction('loadRounds', { roundsCount: roundsData.length })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Error loading rounds:', error)
        
        trackError(error as Error, { action: 'loadRounds' })
        
        // Log the database error
        logDatabaseError(errorMessage, {
          component: 'GameContext',
          action: 'loadRounds',
          userId: user?.address
        }, error)
        
        setErrorStates(prev => ({
          ...prev,
          rounds: errorMessage
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      } finally {
        setLoadingStates(prev => ({ ...prev, rounds: false }))
      }
    })
  }

  const loadPrizeConfiguration = async (): Promise<void> => {
    try {
      setLoadingStates(prev => ({ ...prev, prizeConfig: true }))
      setErrorStates(prev => ({ ...prev, prizeConfig: null }))

      const config = await withSupabaseRetry(async () => {
        return supabaseDb.getPrizeConfiguration()
      })
      
      setPrizeConfig(config)

      console.log('✅ Enhanced prize configuration loaded successfully')
      setPerformance(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        syncCount: prev.syncCount + 1
      }))
    } catch (error) {
      console.error('❌ Error loading prize configuration:', error)
      setErrorStates(prev => ({
        ...prev,
        prizeConfig: error instanceof Error ? error.message : 'Unknown error'
      }))
      setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
    } finally {
      setLoadingStates(prev => ({ ...prev, prizeConfig: false }))
    }
  }

  const loadChatMessages = async (): Promise<void> => {
    try {
      setLoadingStates(prev => ({ ...prev, chatMessages: true }))
      setErrorStates(prev => ({ ...prev, chatMessages: null }))

      const messages = await withSupabaseRetry(async () => {
        return supabaseDb.getChatMessages(100)
      })
      
      setChatMessages(messages)

      console.log('✅ Enhanced chat messages loaded successfully')
      setPerformance(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        syncCount: prev.syncCount + 1
      }))
    } catch (error) {
      console.error('❌ Error loading chat messages:', error)
      setErrorStates(prev => ({
        ...prev,
        chatMessages: error instanceof Error ? error.message : 'Unknown error'
      }))
      setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
    } finally {
      setLoadingStates(prev => ({ ...prev, chatMessages: false }))
    }
  }

  // ===========================================
  // ENHANCED REALTIME SUBSCRIPTIONS
  // ===========================================

  const subscriptions: Array<() => void> = []

  const setupRealtimeSubscriptions = (): void => {
    console.log('🔄 Setting up enhanced realtime subscriptions...')
    
    // Subscribe to rounds changes with enhanced error handling
    const roundsUnsub = supabaseDb.subscribeToRounds((round) => {
      console.log('🔄 Realtime round update:', round)
      
      // Optimistic update check
      const optimisticUpdate = optimisticUpdatesRef.current.rounds.get(round.id)
      if (optimisticUpdate) {
        optimisticUpdatesRef.current.rounds.delete(round.id)
        console.log('✅ Optimistic update confirmed for round:', round.id)
      }
      
      setRounds(prev => {
        const exists = prev.find(r => r.id === round.id)
        if (exists) {
          return prev.map(r => r.id === round.id ? round : r)
        } else {
          return [round, ...prev]
        }
      })

      // If this is a new active round, load its guesses with retry
      if (round.status === 'open') {
        withSupabaseRetry(async () => {
          const roundGuesses = await supabaseDb.getGuessesForRound(round.id)
          setGuesses(prev => {
            const filtered = prev.filter(g => g.roundId !== round.id)
            return [...filtered, ...roundGuesses]
          })
        }).catch(error => {
          console.error('❌ Failed to load guesses for new round:', error)
          setErrorStates(prev => ({
            ...prev,
            guesses: 'Failed to load predictions for new round'
          }))
        })
      }
      
      // Update performance metrics
      setPerformance(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        syncCount: prev.syncCount + 1
      }))
    })
    subscriptions.push(roundsUnsub)

    // Subscribe to guesses changes with optimistic updates
    const guessesUnsub = supabaseDb.subscribeToGuesses((guess) => {
      console.log('🔄 Realtime guess update:', guess)
      
      // Check for optimistic update
      const optimisticGuess = optimisticUpdatesRef.current.guesses.get(guess.id)
      if (optimisticGuess) {
        optimisticUpdatesRef.current.guesses.delete(guess.id)
        console.log('✅ Optimistic guess confirmed:', guess.id)
      }
      
      setGuesses(prev => {
        const exists = prev.find(g => g.id === guess.id)
        if (exists) return prev
        return [guess, ...prev]
      })
      
      // Update performance metrics
      setPerformance(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        syncCount: prev.syncCount + 1
      }))
    })
    subscriptions.push(guessesUnsub)

    // Subscribe to chat messages changes with enhanced filtering
    const chatUnsub = supabaseDb.subscribeToChatMessages((message) => {
      console.log('🔄 Realtime chat message:', message)
      
      // Check for optimistic update
      const optimisticMessage = optimisticUpdatesRef.current.chatMessages.get(message.id)
      if (optimisticMessage) {
        optimisticUpdatesRef.current.chatMessages.delete(message.id)
        console.log('✅ Optimistic chat message confirmed:', message.id)
      }
      
      setChatMessages(prev => {
        const exists = prev.find(m => m.id === message.id)
        if (exists) return prev
        return [message, ...prev].slice(0, 100) // Keep only latest 100 messages
      })
      
      // Update performance metrics
      setPerformance(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        syncCount: prev.syncCount + 1
      }))
    })
    subscriptions.push(chatUnsub)

    // Subscribe to prize config changes with validation
    const prizeUnsub = supabaseDb.subscribeToPrizeConfigs((config) => {
      console.log('🔄 Realtime prize config update:', config)
      
      // Validate config before applying
      if (config && typeof config === 'object') {
        setPrizeConfig(config)
        setPerformance(prev => ({
          ...prev,
          lastSyncTime: Date.now(),
          syncCount: prev.syncCount + 1
        }))
      } else {
        console.warn('⚠️ Invalid prize config received:', config)
      }
    })
    subscriptions.push(prizeUnsub)

    console.log('✅ Enhanced realtime subscriptions set up successfully')
  }

  const cleanupSubscriptions = (): void => {
    subscriptions.forEach(unsub => {
      try {
        unsub()
      } catch (error) {
        console.error('❌ Error cleaning up subscription:', error)
      }
    })
    subscriptions.length = 0 // Clear the array
    console.log('✅ Enhanced realtime subscriptions cleaned up')
  }

  // ===========================================
  // ACTIONS/REDUCERS
  // ===========================================

  const createRound = useCallback(async (
    roundNumber: number,
    startTime: number,
    endTime: number,
    prize: string,
    blockNumber?: number,
    duration?: number
  ): Promise<void> => {
    console.log(`🎮 [SUPABASE] createRound called`, { roundNumber, startTime, endTime, prize, blockNumber, duration, connected })
    
    if (!connected) {
      const error = 'Not connected to database'
      console.error('❌', error)
      throw new Error(error)
    }
    
    try {
      console.log(`📤 [SUPABASE] Creating round...`, { roundNumber, duration, prize, blockNumber })
      
      const round = await supabaseDb.createRound({
        roundNumber,
        startTime,
        endTime,
        prize,
        blockNumber,
        duration
      })
      
      if (!round) {
        throw new Error('Failed to create round')
      }
      
      console.log(`✅ [SUPABASE] Round created successfully!`)
    } catch (error) {
      console.error(`❌ [SUPABASE] Failed to create round:`, error)
      throw error
    }
  }, [connected])

  const submitGuess = useCallback(async (
    roundId: string,
    address: string,
    username: string,
    guess: number,
    pfpUrl: string
  ): Promise<boolean> => {
    return await trackAsyncOperation('submitGuess', async () => {
      if (!connected) {
        console.warn(`⚠️ [SUPABASE] Not connected`)
        return false
      }

      const round = rounds.find(r => r.id === roundId)
      if (!round || round.status !== 'open') {
        console.warn(`⚠️ [SUPABASE] Round not open:`, { roundId, status: round?.status })
        return false
      }

      const now = Date.now()
      if (now >= round.endTime) {
        console.warn(`⚠️ [SUPABASE] Round time expired`)
        return false
      }

      const hasGuessed = guesses.some(g => g.roundId === roundId && g.address.toLowerCase() === address.toLowerCase())
      if (hasGuessed) {
        console.warn(`⚠️ [SUPABASE] User already guessed`)
        return false
      }

      try {
        const userFid = address.replace('fid-', '')
        
        // Create optimistic guess
        const optimisticGuess: Guess = {
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          roundId,
          address,
          username,
          guess,
          pfpUrl,
          submittedAt: Date.now()
        }
        
        // Apply optimistic update
        optimisticActions.addGuessOptimistically(optimisticGuess)
        
        const result = await trackApiCall('submitGuess', () =>
          withSupabaseRetry(async () => {
            return supabaseDb.submitGuess({
              roundId,
              userFid,
              username,
              guessAmount: guess,
              pfpUrl
            })
          })
        )
        
        if (!result) {
          // Remove optimistic update on failure
          setGuesses(prev => prev.filter(g => g.id !== optimisticGuess.id))
          console.error(`❌ [SUPABASE] Failed to submit guess`)
          setErrorStates(prev => ({
            ...prev,
            guesses: 'Failed to submit prediction. Please try again.'
          }))
          setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
          return false
        }
        
        console.log(`✅ [SUPABASE] Guess submitted with optimistic update!`)
        setPerformance(prev => ({
          ...prev,
          lastSyncTime: Date.now(),
          syncCount: prev.syncCount + 1
        }))
        
        trackInteraction('submitGuess', {
          roundId,
          guessAmount: guess,
          success: true
        })
        
        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to submit prediction'
        console.error(`❌ [SUPABASE] Failed to submit guess:`, error)
        
        trackError(error as Error, {
          action: 'submitGuess',
          roundId,
          guessAmount: guess
        })
        
        // Log the database error
        logDatabaseError(errorMessage, {
          component: 'GameContext',
          action: 'submitGuess',
          additionalData: {
            roundId,
            userFid: address.replace('fid-', ''),
            guessAmount: guess
          }
        }, error)
        
        setErrorStates(prev => ({
          ...prev,
          guesses: errorMessage
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
        return false
      }
    })
  }, [connected, rounds, guesses, trackAsyncOperation, trackApiCall, trackInteraction, trackError])

  const endRound = useCallback(async (roundId: string): Promise<boolean> => {
    if (!connected) {
      console.warn(`⚠️ [SUPABASE] Not connected`)
      return false
    }

    const round = rounds.find(r => r.id === roundId)
    if (!round || round.status !== 'open') {
      console.warn(`⚠️ [SUPABASE] Round not open:`, { roundId, status: round?.status })
      return false
    }

    try {
      const success = await supabaseDb.endRound(roundId)
      
      if (!success) {
        console.error(`❌ [SUPABASE] Failed to end round`)
        return false
      }
      
      console.log(`✅ [SUPABASE] Round ended!`)
      return true
    } catch (error) {
      console.error(`❌ [SUPABASE] Failed to end round:`, error)
      return false
    }
  }, [connected, rounds])

  const updateRoundResult = useCallback(async (
    roundId: string,
    actualTxCount: number,
    blockHash: string,
    winningAddress: string
  ): Promise<void> => {
    if (!connected) {
      throw new Error('Not connected to database')
    }
    
    try {
      const success = await supabaseDb.updateRoundResult(roundId, actualTxCount, blockHash, winningAddress)
      
      if (!success) {
        throw new Error('Failed to update round result')
      }
      
      console.log(`✅ [SUPABASE] Round result updated!`)
    } catch (error) {
      console.error(`❌ [SUPABASE] Failed to update round result:`, error)
      throw error
    }
  }, [connected])

  const getGuessesForRound = useCallback((roundId: string): Guess[] => {
    return guesses.filter(g => g.roundId === roundId)
  }, [guesses])

  const hasUserGuessed = useCallback((roundId: string, address: string): boolean => {
    return guesses.some(g => g.roundId === roundId && g.address.toLowerCase() === address.toLowerCase())
  }, [guesses])

  const addChatMessage = useCallback(async (message: ChatMessage): Promise<void> => {
    return await trackAsyncOperation('addChatMessage', async () => {
      console.log(`💬 [SUPABASE] Enhanced addChatMessage called`, { message, connected })
      
      if (!connected) {
        const warning = 'Not connected to database'
        console.warn(`⚠️ [SUPABASE]`, warning)
        setErrorStates(prev => ({ ...prev, chatMessages: warning }))
        throw new Error(warning)
      }
      
      try {
        console.log(`📤 [SUPABASE] Sending enhanced chat message...`)
        
        const userFid = message.address.replace('fid-', '')
        
        // Create optimistic chat message
        const optimisticMessage: ChatMessage = {
          ...message,
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now()
        }
        
        // Apply optimistic update
        optimisticActions.addChatMessageOptimistically(optimisticMessage)
        
        const result = await trackApiCall('addChatMessage', () =>
          withSupabaseRetry(async () => {
            return supabaseDb.addChatMessage({
              userFid,
              username: message.username,
              message: message.message,
              type: message.type,
              roundId: message.roundId,
              pfpUrl: message.pfpUrl
            })
          })
        )
        
        if (!result) {
          // Remove optimistic update on failure
          setChatMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
          throw new Error('Failed to send chat message')
        }
        
        console.log(`✅ [SUPABASE] Enhanced chat message sent with optimistic update!`)
        setPerformance(prev => ({
          ...prev,
          lastSyncTime: Date.now(),
          syncCount: prev.syncCount + 1
        }))
        
        trackInteraction('addChatMessage', {
          messageType: message.type,
          messageLength: message.message.length,
          success: true
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
        console.error(`❌ [SUPABASE] Failed to send chat message:`, error)
        
        trackError(error as Error, {
          action: 'addChatMessage',
          messageType: message.type,
          messageLength: message.message.length
        })
        
        // Log the database error
        logDatabaseError(errorMessage, {
          component: 'GameContext',
          action: 'addChatMessage',
          additionalData: {
            messageType: message.type,
            userFid: message.address.replace('fid-', '')
          }
        }, error)
        
        setErrorStates(prev => ({
          ...prev,
          chatMessages: errorMessage
        }))
        setPerformance(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
        throw error
      }
    })
  }, [connected, trackAsyncOperation, trackApiCall, trackInteraction, trackError])

  // Auto-close rounds when end time is reached
  useEffect(() => {
    if (!activeRound || !connected) return

    const checkRoundEnd = (): void => {
      const now = Date.now()
      if (activeRound.status === 'open' && now >= activeRound.endTime) {
        endRound(activeRound.id).catch(console.error)
      }
    }

    const interval = setInterval(checkRoundEnd, 1000)
    return () => clearInterval(interval)
  }, [activeRound, connected, endRound])

  // Handle user authentication state changes
  const handleUserChange = useCallback(async (newUser: User | null): Promise<void> => {
    setUser(newUser)
    await setSupabaseContext(newUser)
  }, [])

  const value: GameContextType = {
    user,
    setUser: handleUserChange,
    rounds,
    guesses,
    logs,
    chatMessages,
    activeRound,
    prizeConfig,
    createRound,
    submitGuess,
    endRound,
    updateRoundResult,
    getGuessesForRound,
    hasUserGuessed,
    addChatMessage,
    connected,
    client,
    mode,
    loadingStates,
    errorStates,
    optimisticActions,
    performance,
    retryActions
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextType {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}

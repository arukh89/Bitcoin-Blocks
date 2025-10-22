'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Round, Guess, Log, User, ChatMessage, PrizeConfiguration } from '../types/game'
import { supabaseAuth, setSupabaseContext } from '../lib/supabase-auth'
import { supabaseDb } from '../lib/supabase-db'
import { supabase } from '../lib/supabase-client'
import { APP_CONFIG, isMockMode, isRealtimeMode } from '../config/app-config'

// GameContext interface
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
  mode: 'realtime'
}

const GameContext = createContext<GameContextType | undefined>(undefined)

// Dev admin FIDs for validation
export const ADMIN_FIDS = [250704, 1107084]

export function isDevAddress(address: string): boolean {
  // Extract FID from address format (fid-XXXXX)
  const fid = address.replace('fid-', '')
  const fidNum = parseInt(fid)
  
  if (isNaN(fidNum)) {
    return false
  }
  
  return ADMIN_FIDS.includes(fidNum)
}

// Data conversion functions for Supabase
function convertRound(data: any): Round {
  return {
    id: data.id,
    roundNumber: data.round_number,
    startTime: data.start_time,
    endTime: data.end_time,
    prize: data.prize,
    status: data.status,
    blockNumber: data.block_number,
    actualTxCount: data.actual_tx_count,
    winningAddress: data.winning_fid,
    blockHash: data.block_hash,
    createdAt: data.created_at,
    duration: data.duration
  }
}

function convertGuess(data: any): Guess {
  return {
    id: data.id,
    roundId: data.round_id,
    address: data.user_fid,
    username: data.username,
    guess: data.guess_amount,
    pfpUrl: data.pfp_url,
    submittedAt: data.created_at
  }
}

function convertChatMessage(data: any): ChatMessage {
  return {
    id: data.id,
    roundId: data.round_id,
    address: data.user_fid,
    username: data.username,
    message: data.message,
    pfpUrl: data.pfp_url,
    timestamp: data.created_at,
    type: data.type
  }
}

function convertPrizeConfig(data: any): PrizeConfiguration {
  return {
    id: data.id,
    jackpotAmount: data.config_data.jackpotAmount,
    firstPlaceAmount: data.config_data.firstPlaceAmount,
    secondPlaceAmount: data.config_data.secondPlaceAmount,
    currencyType: data.config_data.currencyType,
    tokenContractAddress: data.config_data.tokenContractAddress,
    updatedAt: data.updated_at
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [prizeConfig, setPrizeConfig] = useState<PrizeConfiguration | null>(null)
  const [connected, setConnected] = useState<boolean>(false)

  const client = supabase
  const mode = 'realtime' as const

  // Only rounds with status 'open' are considered active
  const activeRound = rounds.find(r => r.status === 'open') || null

  // ===========================================
  // INITIALIZATION
  // ===========================================

  useEffect(() => {
    const initializeApp = async (): Promise<void> => {
      try {
        console.log(`🚀 Initializing Bitcoin Blocks App in REALTIME mode...`)
        setConnected(false)

        // Initialize authentication
        const authUser = await supabaseAuth.initializeAuth()
        if (authUser) {
          setUser(authUser)
          await setSupabaseContext(authUser)
          console.log('✅ User authenticated:', authUser.username)
        } else {
          console.warn('⚠️ User authentication failed or not available')
        }

        // Load initial data
        await loadInitialData()

        // Set up real-time subscriptions
        setupRealtimeSubscriptions()

        setConnected(true)
        console.log('✅ App initialized successfully!')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Initialization failed'
        console.error('❌ Failed to initialize app:', error)
        setConnected(false)
      }
    }

    initializeApp()

    return () => {
      // Cleanup subscriptions
      cleanupSubscriptions()
    }
  }, [mode])

  // ===========================================
  // DATA LOADING
  // ===========================================

  const loadInitialData = async (): Promise<void> => {
    await Promise.all([
      loadRounds(),
      loadPrizeConfiguration(),
      loadChatMessages()
    ])
  }

  const loadRounds = async (): Promise<void> => {
    try {
      const roundsData = await supabaseDb.getRounds()
      setRounds(roundsData)

      // Load guesses for active rounds
      const activeRounds = roundsData.filter(r => r.status === 'open')
      if (activeRounds.length > 0) {
        const guessPromises = activeRounds.map(async (round) => {
          const roundGuesses = await supabaseDb.getGuessesForRound(round.id)
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

      console.log('✅ Rounds loaded successfully')
    } catch (error) {
      console.error('❌ Error loading rounds:', error)
    }
  }

  const loadPrizeConfiguration = async (): Promise<void> => {
    try {
      const config = await supabaseDb.getPrizeConfiguration()
      setPrizeConfig(config)
      console.log('✅ Prize configuration loaded successfully')
    } catch (error) {
      console.error('❌ Error loading prize configuration:', error)
    }
  }

  const loadChatMessages = async (): Promise<void> => {
    try {
      const messages = await supabaseDb.getChatMessages(100)
      setChatMessages(messages)
      console.log('✅ Chat messages loaded successfully')
    } catch (error) {
      console.error('❌ Error loading chat messages:', error)
    }
  }

  // ===========================================
  // REALTIME SUBSCRIPTIONS
  // ===========================================

  const subscriptions: Array<() => void> = []

  const setupRealtimeSubscriptions = (): void => {
    console.log('🔄 Setting up Supabase realtime subscriptions...')
    
    // Subscribe to rounds changes
    const roundsChannel = supabase
      .channel('rounds_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds'
        },
        (payload) => {
          console.log('🔄 Realtime round update:', payload)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const round = convertRound(payload.new as any)
            
            setRounds(prev => {
              const exists = prev.find(r => r.id === round.id)
              if (exists) {
                return prev.map(r => r.id === round.id ? round : r)
              } else {
                return [round, ...prev]
              }
            })

            // If this is a new active round, load its guesses
            if (round.status === 'open') {
              supabaseDb.getGuessesForRound(round.id).then(roundGuesses => {
                setGuesses(prev => {
                  const filtered = prev.filter(g => g.roundId !== round.id)
                  return [...filtered, ...roundGuesses]
                })
              }).catch(error => {
                console.error('❌ Failed to load guesses for new round:', error)
              })
            }
          }
        }
      )
      .subscribe()

    subscriptions.push(() => supabase.removeChannel(roundsChannel))

    // Subscribe to guesses changes
    const guessesChannel = supabase
      .channel('guesses_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guesses'
        },
        (payload) => {
          console.log('🔄 Realtime guess update:', payload)
          
          const guess = convertGuess(payload.new as any)
          
          setGuesses(prev => {
            const exists = prev.find(g => g.id === guess.id)
            if (exists) return prev
            return [guess, ...prev]
          })
        }
      )
      .subscribe()

    subscriptions.push(() => supabase.removeChannel(guessesChannel))

    // Subscribe to chat messages changes
    const chatChannel = supabase
      .channel('chat_messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        (payload) => {
          console.log('🔄 Realtime chat message:', payload)
          
          const message = convertChatMessage(payload.new as any)
          
          setChatMessages(prev => {
            const exists = prev.find(m => m.id === message.id)
            if (exists) return prev
            return [message, ...prev].slice(0, 100) // Keep only latest 100 messages
          })
        }
      )
      .subscribe()

    subscriptions.push(() => supabase.removeChannel(chatChannel))

    // Subscribe to prize config changes
    const prizeChannel = supabase
      .channel('prize_configs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_configs'
        },
        (payload) => {
          console.log('🔄 Realtime prize config update:', payload)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const config = convertPrizeConfig(payload.new as any)
            
            if (config && typeof config === 'object') {
              setPrizeConfig(config)
            } else {
              console.warn('⚠️ Invalid prize config received:', config)
            }
          }
        }
      )
      .subscribe()

    subscriptions.push(() => supabase.removeChannel(prizeChannel))

    console.log('✅ Supabase realtime subscriptions set up successfully')
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
    console.log('✅ Realtime subscriptions cleaned up')
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
      
      // Realtime mode: create in Supabase
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
      
      const result = await supabaseDb.submitGuess({
        roundId,
        userFid,
        username,
        guessAmount: guess,
        pfpUrl
      })
      
      if (!result) {
        console.error(`❌ [SUPABASE] Failed to submit guess`)
        return false
      }
      
      console.log(`✅ [SUPABASE] Guess submitted successfully!`)
      return true
    } catch (error) {
      console.error(`❌ [SUPABASE] Failed to submit guess:`, error)
      return false
    }
  }, [connected, rounds, guesses])

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
    console.log(`💬 [SUPABASE] addChatMessage called`, { message, connected })
    
    if (!connected) {
      const warning = 'Not connected to database'
      console.warn(`⚠️ [SUPABASE]`, warning)
      throw new Error(warning)
    }
    
    try {
      console.log(`📤 [SUPABASE] Sending chat message...`)
      
      const userFid = message.address.replace('fid-', '')
      
      const result = await supabaseDb.addChatMessage({
        userFid,
        username: message.username,
        message: message.message,
        type: message.type,
        roundId: message.roundId,
        pfpUrl: message.pfpUrl
      })
      
      if (!result) {
        throw new Error('Failed to send chat message')
      }
      
      console.log(`✅ [SUPABASE] Chat message sent successfully!`)
    } catch (error) {
      console.error(`❌ [SUPABASE] Failed to send chat message:`, error)
      throw error
    }
  }, [connected])

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
    mode
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

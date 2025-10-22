import { supabase, supabaseAdmin } from './supabase-singleton'
import type { Round, Guess, ChatMessage, PrizeConfiguration, Log } from '../types/game'
import { logSystemError } from './error-handling'

// Database service for Bitcoin Blocks Mini App
export class SupabaseDatabaseService {
  private static instance: SupabaseDatabaseService
  private queryTimeout = 10000 // 10 seconds

  static getInstance(): SupabaseDatabaseService {
    if (!SupabaseDatabaseService.instance) {
      SupabaseDatabaseService.instance = new SupabaseDatabaseService()
    }
    return SupabaseDatabaseService.instance
  }

  // Helper method for retry logic
  private async retryQuery<T>(
    queryFn: () => Promise<{ data: T | null; error: any }>,
    maxAttempts = 3,
    delay = 1000
  ): Promise<{ data: T | null; error: any }> {
    let lastError: any = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await Promise.race([
          queryFn(),
          new Promise<{ data: null; error: Error }>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), this.queryTimeout)
          )
        ])
        
        if (result.error) {
          lastError = result.error
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay * attempt))
            continue
          }
        }
        
        return result
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt))
        }
      }
    }
    
    return { data: null, error: lastError }
  }

  // Helper method for batch operations
  private async batchQuery<T>(
    queries: Array<() => Promise<{ data: T | null; error: any }>>
  ): Promise<Array<{ data: T | null; error: any }>> {
    try {
      return await Promise.allSettled(
        queries.map(query => this.retryQuery(query))
      ).then(results =>
        results.map(result =>
          result.status === 'fulfilled' ? result.value : { data: null, error: result.reason }
        )
      )
    } catch (error) {
      await logSystemError('Batch query failed', {
        action: 'batch_query',
        additionalData: { queryCount: queries.length }
      }, error as Error)
      
      return queries.map(() => ({ data: null, error }))
    }
  }

  // ===========================================
  // ROUNDS OPERATIONS
  // ===========================================

  async getRounds(limit = 50, status?: string): Promise<Round[]> {
    try {
      const { data, error } = await this.retryQuery(async () => {
        let query = supabase
          .from('rounds')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)

        if (status) {
          query = query.eq('status', status)
        }

        return await query
      })

      if (error) {
        await logSystemError('Error fetching rounds', {
          action: 'fetch_rounds',
          additionalData: { limit, status }
        }, error)
        return []
      }

      return this.transformRounds(data || [])
    } catch (error) {
      await logSystemError('Unexpected error fetching rounds', {
        action: 'fetch_rounds_unexpected',
        additionalData: { limit, status }
      }, error as Error)
      return []
    }
  }

  async getActiveRound(): Promise<Round | null> {
    try {
      const { data, error } = await this.retryQuery(async () =>
        supabase
          .from('rounds')
          .select('*')
          .eq('status', 'open')
          .single()
      )

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        await logSystemError('Error fetching active round', {
          action: 'fetch_active_round'
        }, error)
        return null
      }

      return data ? this.transformRound(data) : null
    } catch (error) {
      await logSystemError('Unexpected error fetching active round', {
        action: 'fetch_active_round_unexpected'
      }, error as Error)
      return null
    }
  }

  // New optimized method for fetching rounds with pagination
  async getRoundsPaginated(page = 1, limit = 20, status?: string): Promise<{
    rounds: Round[]
    totalCount: number
    hasMore: boolean
  }> {
    try {
      const offset = (page - 1) * limit
      
      const [roundsResult, countResult] = await Promise.all([
        this.retryQuery(async () => {
          let query = supabase
            .from('rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (status) {
            query = query.eq('status', status)
          }

          return await query
        }),
        this.retryQuery(async () => {
          let query = supabase
            .from('rounds')
            .select('*', { count: 'exact', head: true })

          if (status) {
            query = query.eq('status', status)
          }

          return await query
        })
      ])

      if (roundsResult.error) {
        await logSystemError('Error fetching paginated rounds', {
          action: 'fetch_rounds_paginated',
          additionalData: { page, limit, status }
        }, roundsResult.error)
      }

      const totalCount = (countResult.data as any)?.count || 0
      const hasMore = offset + limit < totalCount

      return {
        rounds: this.transformRounds(roundsResult.data || []),
        totalCount,
        hasMore
      }
    } catch (error) {
      await logSystemError('Unexpected error fetching paginated rounds', {
        action: 'fetch_rounds_paginated_unexpected',
        additionalData: { page, limit, status }
      }, error as Error)
      
      return {
        rounds: [],
        totalCount: 0,
        hasMore: false
      }
    }
  }

  // New method for fetching rounds with stats
  async getRoundsWithStats(limit = 10): Promise<Array<Round & {
    participationCount: number
    averageGuess: number
  }>> {
    try {
      const { data, error } = await this.retryQuery(async () =>
        supabase
          .from('rounds')
          .select(`
            *,
            guesses(count)
          `)
          .order('created_at', { ascending: false })
          .limit(limit)
      )

      if (error) {
        await logSystemError('Error fetching rounds with stats', {
          action: 'fetch_rounds_stats'
        }, error)
        return []
      }

      return (data || []).map((round: any) => ({
        ...this.transformRound(round),
        participationCount: (round as any).guesses?.[0]?.count || 0,
        averageGuess: 0 // Would need to be calculated with a separate query
      }))
    } catch (error) {
      await logSystemError('Unexpected error fetching rounds with stats', {
        action: 'fetch_rounds_stats_unexpected'
      }, error as Error)
      return []
    }
  }

  async createRound(roundData: {
    roundNumber: number
    startTime: number
    endTime: number
    prize: string
    blockNumber?: number
    duration?: number
  }): Promise<Round | null> {
    try {
      const now = Date.now()
      const { data, error } = await (supabaseAdmin as any)
        .from('rounds')
        .insert({
          round_number: roundData.roundNumber,
          start_time: roundData.startTime,
          end_time: roundData.endTime,
          prize: roundData.prize,
          status: 'open',
          block_number: roundData.blockNumber,
          created_at: now,
          duration: roundData.duration
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating round:', error)
        return null
      }

      const round = this.transformRound(data)
      console.log('✅ Round created successfully:', round)
      
      // Log the action
      await this.logAction('round_created', `Round #${roundData.roundNumber} created`, {
        roundId: round.id,
        roundNumber: roundData.roundNumber,
        prize: roundData.prize
      })

      return round
    } catch (error) {
      console.error('❌ Unexpected error creating round:', error)
      return null
    }
  }

  async updateRound(roundId: string, updates: Partial<Round>): Promise<Round | null> {
    try {
      const { data, error } = await (supabaseAdmin as any)
        .from('rounds')
        .update(this.transformRoundToDb(updates))
        .eq('id', roundId)
        .select()
        .single()

      if (error) {
        console.error('❌ Error updating round:', error)
        return null
      }

      const round = this.transformRound(data)
      console.log('✅ Round updated successfully:', round)
      
      return round
    } catch (error) {
      console.error('❌ Unexpected error updating round:', error)
      return null
    }
  }

  async endRound(roundId: string): Promise<boolean> {
    try {
      const { error } = await (supabaseAdmin as any)
        .from('rounds')
        .update({ status: 'closed' })
        .eq('id', roundId)

      if (error) {
        console.error('❌ Error ending round:', error)
        return false
      }

      console.log('✅ Round ended successfully:', roundId)
      
      // Log the action
      await this.logAction('round_ended', `Round ${roundId} ended`, { roundId })
      
      return true
    } catch (error) {
      console.error('❌ Unexpected error ending round:', error)
      return false
    }
  }

  async updateRoundResult(roundId: string, actualTxCount: number, blockHash: string, winningFid: string): Promise<boolean> {
    try {
      const { error } = await (supabaseAdmin as any)
        .from('rounds')
        .update({
          status: 'finished',
          actual_tx_count: actualTxCount,
          block_hash: blockHash,
          winning_fid: winningFid
        })
        .eq('id', roundId)

      if (error) {
        console.error('❌ Error updating round result:', error)
        return false
      }

      console.log('✅ Round result updated successfully:', roundId)
      
      // Log the action
      await this.logAction('round_finished', `Round ${roundId} finished`, {
        roundId,
        actualTxCount,
        blockHash,
        winningFid
      })
      
      return true
    } catch (error) {
      console.error('❌ Unexpected error updating round result:', error)
      return false
    }
  }

  // ===========================================
  // GUESSES OPERATIONS
  // ===========================================

  async getGuessesForRound(roundId: string): Promise<Guess[]> {
    try {
      const { data, error } = await supabase
        .from('guesses')
        .select('*')
        .eq('round_id', roundId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('❌ Error fetching guesses for round:', error)
        return []
      }

      return this.transformGuesses(data || [])
    } catch (error) {
      console.error('❌ Unexpected error fetching guesses for round:', error)
      return []
    }
  }

  async submitGuess(guessData: {
    roundId: string
    userFid: string
    username: string
    guessAmount: number
    pfpUrl?: string
  }): Promise<Guess | null> {
    try {
      const now = Date.now()
      const { data, error } = await (supabase as any)
        .from('guesses')
        .insert({
          round_id: guessData.roundId,
          user_fid: guessData.userFid,
          guess_amount: guessData.guessAmount,
          created_at: now,
          username: guessData.username,
          pfp_url: guessData.pfpUrl
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error submitting guess:', error)
        return null
      }

      const guess = this.transformGuess(data)
      console.log('✅ Guess submitted successfully:', guess)
      
      // Log the action
      await this.logAction('guess_submitted', `${guessData.username} predicted ${guessData.guessAmount} transactions`, {
        roundId: guessData.roundId,
        userFid: guessData.userFid,
        guessAmount: guessData.guessAmount
      })
      
      return guess
    } catch (error) {
      console.error('❌ Unexpected error submitting guess:', error)
      return null
    }
  }

  async hasUserGuessed(roundId: string, userFid: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('guesses')
        .select('id')
        .eq('round_id', roundId)
        .eq('user_fid', userFid)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error checking if user guessed:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('❌ Unexpected error checking if user guessed:', error)
      return false
    }
  }

  // ===========================================
  // CHAT MESSAGES OPERATIONS
  // ===========================================

  async getChatMessages(limit: number = 100): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('❌ Error fetching chat messages:', error)
        return []
      }

      return this.transformChatMessages(data || [])
    } catch (error) {
      console.error('❌ Unexpected error fetching chat messages:', error)
      return []
    }
  }

  async addChatMessage(messageData: {
    userFid: string
    username: string
    message: string
    type: 'guess' | 'system' | 'winner' | 'chat'
    roundId?: string
    pfpUrl?: string
  }): Promise<ChatMessage | null> {
    try {
      const now = Date.now()
      const { data, error } = await (supabase as any)
        .from('chat_messages')
        .insert({
          user_fid: messageData.userFid,
          username: messageData.username,
          message: messageData.message,
          type: messageData.type,
          created_at: now,
          round_id: messageData.roundId,
          pfp_url: messageData.pfpUrl
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error adding chat message:', error)
        return null
      }

      const message = this.transformChatMessage(data)
      console.log('✅ Chat message added successfully:', message)
      
      return message
    } catch (error) {
      console.error('❌ Unexpected error adding chat message:', error)
      return null
    }
  }

  // ===========================================
  // PRIZE CONFIGURATION OPERATIONS
  // ===========================================

  async getPrizeConfiguration(): Promise<PrizeConfiguration | null> {
    try {
      const { data, error } = await supabase
        .from('prize_configs')
        .select('*')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error fetching prize configuration:', error)
        return null
      }

      return data ? this.transformPrizeConfig(data) : null
    } catch (error) {
      console.error('❌ Unexpected error fetching prize configuration:', error)
      return null
    }
  }

  async updatePrizeConfiguration(configData: {
    jackpotAmount: string
    firstPlaceAmount: string
    secondPlaceAmount: string
    currencyType: string
    tokenContractAddress: string
  }): Promise<PrizeConfiguration | null> {
    try {
      const now = Date.now()
      
      // Get latest version
      const { data: latestConfig } = await (supabase as any)
        .from('prize_configs')
        .select('version')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      const newVersion = (latestConfig?.version || 0) + 1

      const { data, error } = await (supabaseAdmin as any)
        .from('prize_configs')
        .insert({
          config_data: configData,
          updated_at: now,
          version: newVersion
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error updating prize configuration:', error)
        return null
      }

      const config = this.transformPrizeConfig(data)
      console.log('✅ Prize configuration updated successfully:', config)
      
      // Log the action
      await this.logAction('prize_config_updated', 'Prize configuration updated', configData)
      
      return config
    } catch (error) {
      console.error('❌ Unexpected error updating prize configuration:', error)
      return null
    }
  }

  // ===========================================
  // LOGS OPERATIONS
  // ===========================================

  async getLogs(limit: number = 100): Promise<Log[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('❌ Error fetching logs:', error)
        return []
      }

      return this.transformLogs(data || [])
    } catch (error) {
      console.error('❌ Unexpected error fetching logs:', error)
      return []
    }
  }

  // ===========================================
  // LEADERBOARD OPERATIONS
  // ===========================================

  async getLeaderboard(roundId?: string, limit = 50): Promise<Array<{
    rank: number
    userFid: string
    username: string
    pfpUrl?: string
    totalPoints: number
    correctGuesses: number
    totalParticipation: number
    winRate: number
  }>> {
    try {
      if (roundId) {
        // Leaderboard for specific round
        const { data, error } = await this.retryQuery(async () =>
          supabase
            .from('guesses')
            .select(`
              user_fid,
              username,
              pfp_url,
              guess_amount,
              created_at,
              rounds!inner(actual_tx_count)
            `)
            .eq('round_id', roundId)
            .not('rounds.actual_tx_count', 'is', null)
            .order('guess_amount', { ascending: false })
            .limit(limit)
        )

        if (error) {
          await logSystemError('Error fetching round leaderboard', {
            action: 'fetch_leaderboard_round',
            additionalData: { roundId, limit }
          }, error)
          return []
        }

        // Calculate rankings and points
        const guesses = data || []
        const actualTxCount = (guesses[0] as any)?.rounds?.[0]?.actual_tx_count || 0
        
        return guesses.map((guess: any, index: number) => ({
          rank: index + 1,
          userFid: guess.user_fid,
          username: guess.username,
          pfpUrl: guess.pfp_url,
          totalPoints: Math.abs(guess.guess_amount - actualTxCount) === 0 ? 100 : 0,
          correctGuesses: Math.abs(guess.guess_amount - actualTxCount) === 0 ? 1 : 0,
          totalParticipation: 1,
          winRate: Math.abs(guess.guess_amount - actualTxCount) === 0 ? 100 : 0
        }))
      } else {
        // Overall leaderboard
        const { data, error } = await this.retryQuery(async () =>
          supabase
            .from('guesses')
            .select(`
              user_fid,
              username,
              pfp_url,
              guess_amount,
              created_at,
              rounds!inner(actual_tx_count, status)
            `)
            .eq('rounds.status', 'finished')
            .not('rounds.actual_tx_count', 'is', null)
            .order('created_at', { ascending: false })
        )

        if (error) {
          await logSystemError('Error fetching overall leaderboard', {
            action: 'fetch_leaderboard_overall',
            additionalData: { limit }
          }, error)
          return []
        }

        // Aggregate user stats
        const userStats = new Map<string, any>()
        
        ;(data || []).forEach((guess: any) => {
          const fid = guess.user_fid
          const isCorrect = Math.abs(guess.guess_amount - (guess.rounds?.[0]?.actual_tx_count || 0)) === 0
          
          if (!userStats.has(fid)) {
            userStats.set(fid, {
              userFid: fid,
              username: guess.username,
              pfpUrl: guess.pfp_url,
              totalPoints: 0,
              correctGuesses: 0,
              totalParticipation: 0
            })
          }
          
          const stats = userStats.get(fid)
          stats.totalParticipation++
          if (isCorrect) {
            stats.correctGuesses++
            stats.totalPoints += 100
          }
        })

        // Calculate rankings
        return Array.from(userStats.values())
          .map(stats => ({
            ...stats,
            winRate: stats.totalParticipation > 0
              ? Math.round((stats.correctGuesses / stats.totalParticipation) * 100)
              : 0
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints || b.correctGuesses - a.correctGuesses)
          .slice(0, limit)
          .map((stats, index) => ({
            ...stats,
            rank: index + 1
          }))
      }
    } catch (error) {
      await logSystemError('Unexpected error fetching leaderboard', {
        action: 'fetch_leaderboard_unexpected',
        additionalData: { roundId, limit }
      }, error as Error)
      return []
    }
  }

  // ===========================================
  // ANALYTICS OPERATIONS
  // ===========================================

  async getUserStats(userFid: string): Promise<{
    totalRounds: number
    correctGuesses: number
    totalWins: number
    averageGuess: number
    bestGuess: number
    recentActivity: Array<{ roundId: string; guess: number; actual: number; isCorrect: boolean }>
  }> {
    try {
      const { data, error } = await this.retryQuery(async () =>
        supabase
          .from('guesses')
          .select(`
            guess_amount,
            created_at,
            round_id,
            rounds!inner(actual_tx_count, status)
          `)
          .eq('user_fid', userFid)
          .eq('rounds.status', 'finished')
          .not('rounds.actual_tx_count', 'is', null)
          .order('created_at', { ascending: false })
      )

      if (error) {
        await logSystemError('Error fetching user stats', {
          action: 'fetch_user_stats',
          additionalData: { userFid }
        }, error)
        return {
          totalRounds: 0,
          correctGuesses: 0,
          totalWins: 0,
          averageGuess: 0,
          bestGuess: 0,
          recentActivity: []
        }
      }

      const guesses = data || []
      const correctGuesses = guesses.filter((g: any) =>
        Math.abs(g.guess_amount - (g.rounds?.[0]?.actual_tx_count || 0)) === 0
      )
      
      const recentActivity = guesses.slice(0, 10).map((guess: any) => ({
        roundId: guess.round_id,
        guess: guess.guess_amount,
        actual: guess.rounds?.[0]?.actual_tx_count || 0,
        isCorrect: Math.abs(guess.guess_amount - (guess.rounds?.[0]?.actual_tx_count || 0)) === 0
      }))

      return {
        totalRounds: guesses.length,
        correctGuesses: correctGuesses.length,
        totalWins: correctGuesses.length,
        averageGuess: guesses.length > 0
          ? Math.round(guesses.reduce((sum: number, g: any) => sum + g.guess_amount, 0) / guesses.length)
          : 0,
        bestGuess: Math.min(...guesses.map((g: any) =>
          Math.abs(g.guess_amount - (g.rounds?.[0]?.actual_tx_count || 0))
        )),
        recentActivity
      }
    } catch (error) {
      await logSystemError('Unexpected error fetching user stats', {
        action: 'fetch_user_stats_unexpected',
        additionalData: { userFid }
      }, error as Error)
      
      return {
        totalRounds: 0,
        correctGuesses: 0,
        totalWins: 0,
        averageGuess: 0,
        bestGuess: 0,
        recentActivity: []
      }
    }
  }

  async getGameStats(): Promise<{
    totalRounds: number
    activeRounds: number
    totalGuesses: number
    totalUsers: number
    averageParticipation: number
  }> {
    try {
      const [
        roundsResult,
        activeRoundsResult,
        guessesResult,
        usersResult
      ] = await Promise.all([
        this.retryQuery(async () => await supabase.from('rounds').select('*', { count: 'exact', head: true })),
        this.retryQuery(async () => await supabase.from('rounds').select('*', { count: 'exact', head: true }).eq('status', 'open')),
        this.retryQuery(async () => await supabase.from('guesses').select('*', { count: 'exact', head: true })),
        this.retryQuery(async () => await supabase.from('guesses').select('user_fid', { count: 'exact', head: true }))
      ])

      const totalRounds = (roundsResult.data as any)?.count || 0
      const activeRounds = (activeRoundsResult.data as any)?.count || 0
      const totalGuesses = (guessesResult.data as any)?.count || 0
      const totalUsers = (usersResult.data as any)?.count || 0

      return {
        totalRounds,
        activeRounds,
        totalGuesses,
        totalUsers,
        averageParticipation: totalRounds > 0 ? Math.round(totalGuesses / totalRounds) : 0
      }
    } catch (error) {
      await logSystemError('Unexpected error fetching game stats', {
        action: 'fetch_game_stats_unexpected'
      }, error as Error)
      
      return {
        totalRounds: 0,
        activeRounds: 0,
        totalGuesses: 0,
        totalUsers: 0,
        averageParticipation: 0
      }
    }
  }

  private async logAction(action: string, details: string, metadata?: Record<string, any>): Promise<void> {
    try {
      // This would need the current user's FID - for now using a placeholder
      const { error } = await (supabaseAdmin as any)
        .from('audit_logs')
        .insert({
          admin_fid: 'system', // This should be replaced with actual user FID
          action,
          details: {
            message: details,
            ...metadata
          },
          created_at: Date.now()
        })

      if (error) {
        console.warn('⚠️ Error logging action:', error)
      }
    } catch (error) {
      console.warn('⚠️ Unexpected error logging action:', error)
    }
  }

  // ===========================================
  // REALTIME SUBSCRIPTIONS
  // ===========================================

  subscribeToRounds(callback: (round: Round) => void): () => void {
    const channel = supabase
      .channel('rounds_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const round = this.transformRound(payload.new as any)
            callback(round)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  subscribeToGuesses(callback: (guess: Guess) => void): () => void {
    const channel = supabase
      .channel('guesses_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guesses'
        },
        (payload) => {
          const guess = this.transformGuess(payload.new as any)
          callback(guess)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  subscribeToChatMessages(callback: (message: ChatMessage) => void): () => void {
    const channel = supabase
      .channel('chat_messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        (payload) => {
          const message = this.transformChatMessage(payload.new as any)
          callback(message)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  subscribeToPrizeConfigs(callback: (config: PrizeConfiguration) => void): () => void {
    const channel = supabase
      .channel('prize_configs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_configs'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const config = this.transformPrizeConfig(payload.new as any)
            callback(config)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // ===========================================
  // DATA TRANSFORMATION HELPERS
  // ===========================================

  private transformRounds(data: any[]): Round[] {
    return data.map(round => this.transformRound(round))
  }

  private transformRound(data: any): Round {
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

  private transformRoundToDb(round: Partial<Round>): any {
    const dbRound: any = {}
    
    if (round.roundNumber !== undefined) dbRound.round_number = round.roundNumber
    if (round.startTime !== undefined) dbRound.start_time = round.startTime
    if (round.endTime !== undefined) dbRound.end_time = round.endTime
    if (round.prize !== undefined) dbRound.prize = round.prize
    if (round.status !== undefined) dbRound.status = round.status
    if (round.blockNumber !== undefined) dbRound.block_number = round.blockNumber
    if (round.actualTxCount !== undefined) dbRound.actual_tx_count = round.actualTxCount
    if (round.winningAddress !== undefined) dbRound.winning_fid = round.winningAddress
    if (round.blockHash !== undefined) dbRound.block_hash = round.blockHash
    if (round.createdAt !== undefined) dbRound.created_at = round.createdAt
    if (round.duration !== undefined) dbRound.duration = round.duration
    
    return dbRound
  }

  private transformGuesses(data: any[]): Guess[] {
    return data.map(guess => this.transformGuess(guess))
  }

  private transformGuess(data: any): Guess {
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

  private transformChatMessages(data: any[]): ChatMessage[] {
    return data.map(message => this.transformChatMessage(message))
  }

  private transformChatMessage(data: any): ChatMessage {
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

  private transformPrizeConfig(data: any): PrizeConfiguration {
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

  private transformLogs(data: any[]): Log[] {
    return data.map(log => this.transformLog(log))
  }

  private transformLog(data: any): Log {
    return {
      id: data.id,
      eventType: data.action,
      details: data.details.message || data.details,
      timestamp: data.created_at
    }
  }
}

// Export singleton instance
export const supabaseDb = SupabaseDatabaseService.getInstance()
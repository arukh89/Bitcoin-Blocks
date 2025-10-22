import { supabase, supabaseAdmin } from './supabase-singleton'
import type { Round, Guess, ChatMessage, PrizeConfiguration, Log } from '../types/game'
import { logSystemError } from './error-handling'
import { createClient } from '@supabase/supabase-js'

// Enhanced Database service with fallbacks for missing tables
export class SupabaseDatabaseServiceFixed {
  private static instance: SupabaseDatabaseServiceFixed
  private queryTimeout = 10000 // 10 seconds
  private tableStatus = new Map<string, boolean>()

  static getInstance(): SupabaseDatabaseServiceFixed {
    if (!SupabaseDatabaseServiceFixed.instance) {
      SupabaseDatabaseServiceFixed.instance = new SupabaseDatabaseServiceFixed()
    }
    return SupabaseDatabaseServiceFixed.instance
  }

  constructor() {
    this.initializeTableStatus()
  }

  private async initializeTableStatus() {
    // Check which tables exist
    const tables = ['rounds', 'guesses', 'chat_messages', 'prize_configs', 'admin_fids', 'user_sessions', 'audit_logs']
    
    for (const table of tables) {
      try {
        const { error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1)
        
        this.tableStatus.set(table, !error)
      } catch (err) {
        this.tableStatus.set(table, false)
      }
    }
  }

  private async checkTableExists(table: string): Promise<boolean> {
    if (this.tableStatus.has(table)) {
      return this.tableStatus.get(table)!
    }

    try {
      const { error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(1)
      
      const exists = !error
      this.tableStatus.set(table, exists)
      return exists
    } catch (err) {
      this.tableStatus.set(table, false)
      return false
    }
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

  // ===========================================
  // ROUNDS OPERATIONS
  // ===========================================

  async getRounds(limit = 50, status?: string): Promise<Round[]> {
    try {
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.warn('⚠️ Rounds table does not exist')
        return []
      }

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
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.warn('⚠️ Rounds table does not exist')
        return null
      }

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

  async createRound(roundData: {
    roundNumber: number
    startTime: number
    endTime: number
    prize: string
    blockNumber?: number
    duration?: number
  }): Promise<Round | null> {
    try {
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.error('❌ Rounds table does not exist')
        return null
      }

      const now = Date.now()
      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { data, error } = await (supabaseClient
        .from('rounds')
        .insert({
          round_number: roundData.roundNumber,
          start_time: roundData.startTime,
          end_time: roundData.endTime,
          prize: roundData.prize,
          status: 'open',
          block_number: roundData.blockNumber,
          created_at: now,
          duration: roundData.duration || 60 // Default 60 minutes
        }) as any)
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating round:', error)
        return null
      }

      const round = this.transformRound(data)
      console.log('✅ Round created successfully:', round)
      
      // Log the action (if audit_logs exists)
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
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.error('❌ Rounds table does not exist')
        return null
      }

      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { data, error } = await (supabaseClient
        .from('rounds')
        .update(this.transformRoundToDb(updates)) as any)
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
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.error('❌ Rounds table does not exist')
        return false
      }

      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { error } = await (supabaseClient
        .from('rounds')
        .update({ status: 'closed' }) as any)
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
      const tableExists = await this.checkTableExists('rounds')
      if (!tableExists) {
        console.error('❌ Rounds table does not exist')
        return false
      }

      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { error } = await (supabaseClient
        .from('rounds')
        .update({
          status: 'finished',
          actual_tx_count: actualTxCount,
          block_hash: blockHash,
          winning_fid: winningFid
        }) as any)
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
      const tableExists = await this.checkTableExists('guesses')
      if (!tableExists) {
        console.warn('⚠️ Guesses table does not exist')
        return []
      }

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
      const tableExists = await this.checkTableExists('guesses')
      if (!tableExists) {
        console.error('❌ Guesses table does not exist')
        return null
      }

      const now = Date.now()
      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      const { data, error } = await (supabaseClient
        .from('guesses')
        .insert({
          round_id: guessData.roundId,
          user_fid: guessData.userFid,
          guess_amount: guessData.guessAmount,
          created_at: now,
          username: guessData.username,
          pfp_url: guessData.pfpUrl
        }) as any)
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
      const tableExists = await this.checkTableExists('guesses')
      if (!tableExists) {
        console.warn('⚠️ Guesses table does not exist')
        return false
      }

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
  // PRIZE CONFIGURATION OPERATIONS
  // ===========================================

  async getPrizeConfiguration(): Promise<PrizeConfiguration | null> {
    try {
      const tableExists = await this.checkTableExists('prize_configs')
      if (!tableExists) {
        // Return default configuration
        console.warn('⚠️ Prize configs table does not exist, using default')
        return {
          id: 1,
          jackpotAmount: '1000',
          firstPlaceAmount: '500',
          secondPlaceAmount: '250',
          currencyType: 'USD',
          tokenContractAddress: '0x0000000000000000000000000000000000000000',
          updatedAt: Date.now()
        }
      }

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
      const tableExists = await this.checkTableExists('prize_configs')
      if (!tableExists) {
        console.error('❌ Prize configs table does not exist')
        return null
      }

      const now = Date.now()
      
      // Get latest version
      const { data: latestConfig } = await supabase
        .from('prize_configs')
        .select('version')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      const newVersion = ((latestConfig as any)?.version || 0) + 1

      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { data, error } = await (supabaseClient
        .from('prize_configs')
        .insert({
          config_data: configData,
          updated_at: now,
          version: newVersion
        }) as any)
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
  // ADMIN OPERATIONS
  // ===========================================

  async isAdmin(fid: string): Promise<boolean> {
    try {
      const tableExists = await this.checkTableExists('admin_fids')
      if (!tableExists) {
        // Fallback to hardcoded admin list
        const ADMIN_FIDS = ['250704', '1107084']
        return ADMIN_FIDS.includes(fid)
      }

      const { data, error } = await supabase
        .from('admin_fids')
        .select('fid')
        .eq('fid', fid)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error checking admin status:', error)
        return false
      }

      return !!data
    } catch (error) {
      console.error('❌ Unexpected error checking admin status:', error)
      return false
    }
  }

  // ===========================================
  // LOGGING OPERATIONS
  // ===========================================

  private async logAction(action: string, details: string, metadata?: Record<string, any>): Promise<void> {
    try {
      const tableExists = await this.checkTableExists('audit_logs')
      if (!tableExists) {
        console.warn('⚠️ Audit logs table does not exist, skipping logging')
        return
      }

      // This would need the current user's FID - for now using a placeholder
      // Create a new client instance without strict typing
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { error } = await (supabaseClient
        .from('audit_logs')
        .insert({
          admin_fid: 'system', // This should be replaced with actual user FID
          action,
          details: {
            message: details,
            ...metadata
          },
          created_at: Date.now()
        }) as any)

      if (error) {
        console.warn('⚠️ Error logging action:', error)
      }
    } catch (error) {
      console.warn('⚠️ Unexpected error logging action:', error)
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
}

// Export singleton instance
export const supabaseDbFixed = SupabaseDatabaseServiceFixed.getInstance()
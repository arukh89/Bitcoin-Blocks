import { createClient } from '@supabase/supabase-js'

// Singleton pattern to prevent multiple Supabase instances
class SupabaseSingleton {
  private static instance: SupabaseSingleton
  private _supabase: ReturnType<typeof createClient> | null = null
  private _supabaseAdmin: ReturnType<typeof createClient> | null = null

  static getInstance(): SupabaseSingleton {
    if (!SupabaseSingleton.instance) {
      SupabaseSingleton.instance = new SupabaseSingleton()
    }
    return SupabaseSingleton.instance
  }

  // Get or create the main Supabase client
  get supabase() {
    if (!this._supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing required Supabase environment variables')
      }

      this._supabase = createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
            reconnectDelay: 2000,
            maxReconnectAttempts: 10,
            heartbeatIntervalMs: 30000,
            wsCloseTimeout: 5000,
          }
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          debug: process.env.NODE_ENV === 'development',
          flowType: 'pkce'
        },
        global: {
          headers: {
            'x-application-name': 'bitcoin-blocks-miniapp',
            'x-application-version': '1.0.0',
            'x-client-type': 'web',
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'x-xss-protection': '1; mode=block'
          }
        }
      })

      console.log('✅ Supabase client initialized (singleton)')
    }

    return this._supabase
  }

  // Get or create the admin Supabase client
  get supabaseAdmin() {
    if (!this._supabaseAdmin) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing required Supabase environment variables for admin client')
      }

      this._supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          debug: process.env.NODE_ENV === 'development'
        },
        global: {
          headers: {
            'x-application-name': 'bitcoin-blocks-miniapp-admin',
            'x-application-version': '1.0.0',
            'x-client-type': 'admin',
            'x-privilege-level': 'service-role'
          },
        }
      })

      console.log('✅ Supabase admin client initialized (singleton)')
    }

    return this._supabaseAdmin
  }

  // Create role-specific client
  createSupabaseClient(role: 'anon' | 'service' | 'custom', customKey?: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    
    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured')
    }
    
    let key: string
    switch (role) {
      case 'anon':
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!anonKey) {
          throw new Error('Supabase anon key is not configured')
        }
        key = anonKey
        break
      case 'service':
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
          throw new Error('Supabase service role key is not configured')
        }
        key = serviceKey
        break
      case 'custom':
        if (!customKey) {
          throw new Error('Custom role requires a custom key')
        }
        key = customKey
        break
      default:
        throw new Error(`Invalid role: ${role}`)
    }
    
    return createClient(supabaseUrl, key, {
      auth: {
        persistSession: role === 'anon',
        autoRefreshToken: role === 'anon',
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'x-application-name': 'bitcoin-blocks-miniapp',
          'x-client-role': role
        }
      }
    })
  }
}

// Export singleton instance
const supabaseSingleton = SupabaseSingleton.getInstance()

// Export the clients
export const supabase = supabaseSingleton.supabase
export const supabaseAdmin = supabaseSingleton.supabaseAdmin
export const createSupabaseClient = (role: 'anon' | 'service' | 'custom', customKey?: string) => 
  supabaseSingleton.createSupabaseClient(role, customKey)

// Re-export other utilities from the original file
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('id')
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase connection check failed:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('❌ Supabase connection check error:', error)
    return false
  }
}

export async function withSupabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxRetries) {
        console.error(`❌ Supabase operation failed after ${maxRetries} attempts:`, error)
        throw lastError
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1)
      console.warn(`⚠️ Supabase operation attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, error)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

export class SupabaseConnectionMonitor {
  private static instance: SupabaseConnectionMonitor
  private isConnected: boolean = false
  private checkInterval: NodeJS.Timeout | null = null
  private readonly CHECK_INTERVAL = 30000
  private listeners: ((connected: boolean) => void)[] = []
  
  static getInstance(): SupabaseConnectionMonitor {
    if (!SupabaseConnectionMonitor.instance) {
      SupabaseConnectionMonitor.instance = new SupabaseConnectionMonitor()
    }
    return SupabaseConnectionMonitor.instance
  }
  
  startMonitoring(): void {
    if (this.checkInterval) return
    
    this.checkConnection()
    this.checkInterval = setInterval(() => {
      this.checkConnection()
    }, this.CHECK_INTERVAL)
  }
  
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }
  
  private async checkConnection(): Promise<void> {
    const connected = await checkSupabaseConnection()
    
    if (connected !== this.isConnected) {
      this.isConnected = connected
      this.notifyListeners(connected)
      
      if (connected) {
        console.log('✅ Supabase connection restored')
      } else {
        console.warn('⚠️ Supabase connection lost')
      }
    }
  }
  
  private notifyListeners(connected: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(connected)
      } catch (error) {
        console.error('❌ Error in connection listener:', error)
      }
    })
  }
  
  addListener(listener: (connected: boolean) => void): void {
    this.listeners.push(listener)
  }
  
  removeListener(listener: (connected: boolean) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }
  
  getConnectionStatus(): boolean {
    return this.isConnected
  }
}

export const connectionMonitor = SupabaseConnectionMonitor.getInstance()

// Export database types
export type Database = {
  public: {
    Tables: {
      rounds: {
        Row: {
          id: string
          round_number: number
          start_time: number
          end_time: number
          prize: string
          status: 'open' | 'closed' | 'finished'
          block_number?: number
          actual_tx_count?: number
          winning_fid?: string
          block_hash?: string
          created_at: number
          duration?: number
          metadata?: Record<string, any>
        }
        Insert: {
          id: string
          round_number: number
          start_time: number
          end_time: number
          prize: string
          status: 'open' | 'closed' | 'finished'
          block_number?: number
          actual_tx_count?: number
          winning_fid?: string
          block_hash?: string
          created_at: number
          duration?: number
          metadata?: Record<string, any>
        }
        Update: {
          id?: string
          round_number?: number
          start_time?: number
          end_time?: number
          prize?: string
          status?: 'open' | 'closed' | 'finished'
          block_number?: number
          actual_tx_count?: number
          winning_fid?: string
          block_hash?: string
          created_at?: number
          duration?: number
          metadata?: Record<string, any>
        }
      }
      guesses: {
        Row: {
          id: string
          round_id: string
          user_fid: string
          guess_amount: number
          created_at: number
          username: string
          pfp_url?: string
        }
        Insert: {
          id: string
          round_id: string
          user_fid: string
          guess_amount: number
          created_at: number
          username: string
          pfp_url?: string
        }
        Update: {
          id?: string
          round_id?: string
          user_fid?: string
          guess_amount?: number
          created_at?: number
          username?: string
          pfp_url?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          user_fid: string
          message: string
          type: 'guess' | 'system' | 'winner' | 'chat'
          created_at: number
          round_id?: string
          username: string
          pfp_url?: string
          metadata?: Record<string, any>
        }
        Insert: {
          id: string
          user_fid: string
          message: string
          type: 'guess' | 'system' | 'winner' | 'chat'
          created_at: number
          round_id?: string
          username: string
          pfp_url?: string
          metadata?: Record<string, any>
        }
        Update: {
          id?: string
          user_fid?: string
          message?: string
          type?: 'guess' | 'system' | 'winner' | 'chat'
          created_at?: number
          round_id?: string
          username?: string
          pfp_url?: string
          metadata?: Record<string, any>
        }
      }
      prize_configs: {
        Row: {
          id: number
          config_data: {
            jackpotAmount: string
            firstPlaceAmount: string
            secondPlaceAmount: string
            currencyType: string
            tokenContractAddress: string
          }
          updated_at: number
          version: number
        }
        Insert: {
          id: number
          config_data: {
            jackpotAmount: string
            firstPlaceAmount: string
            secondPlaceAmount: string
            currencyType: string
            tokenContractAddress: string
          }
          updated_at: number
          version: number
        }
        Update: {
          id?: number
          config_data?: {
            jackpotAmount: string
            firstPlaceAmount: string
            secondPlaceAmount: string
            currencyType: string
            tokenContractAddress: string
          }
          updated_at?: number
          version?: number
        }
      }
      admin_fids: {
        Row: {
          fid: string
          permissions: Record<string, any>
          created_at: number
          updated_at: number
        }
        Insert: {
          fid: string
          permissions: Record<string, any>
          created_at: number
          updated_at: number
        }
        Update: {
          fid?: string
          permissions?: Record<string, any>
          created_at?: number
          updated_at?: number
        }
      }
      user_sessions: {
        Row: {
          fid: string
          session_data: Record<string, any>
          created_at: number
          expires_at: number
        }
        Insert: {
          fid: string
          session_data: Record<string, any>
          created_at: number
          expires_at: number
        }
        Update: {
          fid?: string
          session_data?: Record<string, any>
          created_at?: number
          expires_at?: number
        }
      }
      audit_logs: {
        Row: {
          id: string
          admin_fid: string
          action: string
          details: Record<string, any>
          created_at: number
        }
        Insert: {
          id: string
          admin_fid: string
          action: string
          details: Record<string, any>
          created_at: number
        }
        Update: {
          id?: string
          admin_fid?: string
          action?: string
          details?: Record<string, any>
          created_at?: number
        }
      }
    }
  }
}
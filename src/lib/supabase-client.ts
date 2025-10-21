import { createClient } from '@supabase/supabase-js'

// Enhanced Supabase client configuration with optimized settings
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Enhanced client configuration for optimal performance and security
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Real-time configuration with optimized settings
  realtime: {
    params: {
      eventsPerSecond: 10, // Optimized for Bitcoin Blocks game
      // Enhanced WebSocket configuration
      reconnectDelay: 2000, // 2 seconds
      maxReconnectAttempts: 10,
      heartbeatIntervalMs: 30000, // 30 seconds
      wsCloseTimeout: 5000, // 5 seconds
    }
  },
  
  // Database configuration with performance optimizations
  db: {
    schema: 'public'
  },
  
  // Enhanced authentication configuration
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Enhanced session management
    debug: process.env.NODE_ENV === 'development',
    // Flow control for auth requests
    flowType: 'pkce'
  },
  
  // Global configuration with enhanced headers and security
  global: {
    headers: {
      'x-application-name': 'bitcoin-blocks-miniapp',
      'x-application-version': '1.0.0',
      'x-client-type': 'web',
      // Security headers
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-xss-protection': '1; mode=block'
    }
  },
  
  // Error handling and retry configuration
  // Note: Custom retry logic is implemented in the withSupabaseRetry function
})

// Enhanced admin client for server-side operations with elevated privileges
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      debug: process.env.NODE_ENV === 'development'
    },
    
    // Enhanced database configuration for admin operations
    db: {
      schema: 'public'
    },
    
    // Global configuration for admin client
    global: {
      headers: {
        'x-application-name': 'bitcoin-blocks-miniapp-admin',
        'x-application-version': '1.0.0',
        'x-client-type': 'admin',
        'x-privilege-level': 'service-role'
      },
    }
  }
)

// Enhanced utility function for creating role-specific clients
export function createSupabaseClient(role: 'anon' | 'service' | 'custom', customKey?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  
  let key: string
  switch (role) {
    case 'anon':
      key = supabaseAnonKey
      break
    case 'service':
      key = process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  
  return createClient(url, key, {
    auth: {
      persistSession: role === 'anon',
      autoRefreshToken: role === 'anon',
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'x-application-name': 'bitcoin-blocks-miniapp',
        'x-client-role': role
      }
    }
  })
}

// Enhanced connection health check utility
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

// Enhanced retry wrapper for Supabase operations
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
      
      const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
      console.warn(`⚠️ Supabase operation attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, error)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

// Enhanced connection monitoring
export class SupabaseConnectionMonitor {
  private static instance: SupabaseConnectionMonitor
  private isConnected: boolean = false
  private checkInterval: NodeJS.Timeout | null = null
  private readonly CHECK_INTERVAL = 30000 // 30 seconds
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

// Export connection monitor instance
export const connectionMonitor = SupabaseConnectionMonitor.getInstance()

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
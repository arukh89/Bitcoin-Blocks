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
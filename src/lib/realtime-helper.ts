// Real-time subscription helper utility
// Created: 2025-10-22
// Purpose: Centralize real-time subscription setup and error handling

import { supabase } from './supabase-singleton'
import { createDatabaseErrorResponse, createNetworkErrorResponse } from './api-response'

// Real-time subscription configuration
export interface RealtimeSubscriptionConfig {
  table: string
  filter?: string
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: any) => void
  onEvent?: (payload: any) => void
  retryAttempts?: number
  retryDelay?: number
}

// Real-time subscription manager class
export class RealtimeSubscriptionManager {
  private subscriptions: Map<string, any> = new Map()
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error' = 'disconnected'
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000 // 1 second base delay

  constructor() {
    // Listen to connection state changes using the channel subscriptions
    // Note: Supabase v2+ uses different event handling
    this.setupConnectionMonitoring()
  }

  private setupConnectionMonitoring(): void {
    // Create a monitoring channel for connection status
    const monitorChannel = supabase.channel('connection-monitor')
    
    monitorChannel
      .on('system', { event: 'connected' }, () => {
        console.log('✅ Supabase realtime connection opened')
        this.connectionStatus = 'connected'
        this.reconnectAttempts = 0
        this.resubscribeAll()
      })
      .on('system', { event: 'disconnected' }, () => {
        console.warn('⚠️ Supabase realtime connection closed')
        this.connectionStatus = 'disconnected'
        this.handleReconnect()
      })
      .on('system', { event: 'error' }, (error: any) => {
        console.error('❌ Supabase realtime connection error:', error)
        this.connectionStatus = 'error'
        this.handleReconnect()
      })
      .subscribe((status) => {
        console.log('🔔 Connection monitor status:', status)
      })
  }

  // Get current connection status
  getConnectionStatus(): string {
    return this.connectionStatus
  }

  // Subscribe to a table with enhanced error handling
  subscribe(
    id: string,
    config: RealtimeSubscriptionConfig
  ): Promise<{ success: boolean; error?: any }> {
    return new Promise((resolve) => {
      try {
        // Check if already subscribed
        if (this.subscriptions.has(id)) {
          console.warn(`⚠️ Subscription ${id} already exists, removing old subscription`)
          this.unsubscribe(id)
        }

        console.log(`🔔 Setting up realtime subscription for ${config.table} with id: ${id}`)

        const channel = supabase
          .channel(`realtime:${id}`)
          .on(
            ('postgres_changes' as any),
            ({
              event: config.event || '*',
              schema: 'public',
              table: config.table,
              filter: config.filter
            } as any),
            (payload: any) => {
              try {
                console.log(`📨 Realtime event received for ${id}:`, payload)
                
                if (config.onEvent) {
                  config.onEvent(payload)
                }
              } catch (error) {
                console.error(`❌ Error handling realtime event for ${id}:`, error)
                if (config.onError) {
                  config.onError(error)
                }
              }
            }
          )
          .subscribe((status, err) => {
            console.log(`🔔 Subscription ${id} status:`, status)
            
            if (err) {
              console.error(`❌ Subscription ${id} error:`, err)
              if (config.onError) {
                config.onError(err)
              }
            }
            
            switch (status) {
              case 'SUBSCRIBED':
                console.log(`✅ Successfully subscribed to ${config.table} with id: ${id}`)
                this.subscriptions.set(id, channel)
                if (config.onConnect) {
                  config.onConnect()
                }
                resolve({ success: true })
                break
                
              case 'TIMED_OUT':
                console.error(`❌ Subscription ${id} timed out`)
                if (config.onError) {
                  config.onError(new Error('Subscription timed out'))
                }
                resolve({ success: false, error: 'SUBSCRIPTION_TIMEOUT' })
                break
                
              case 'CLOSED':
                console.warn(`⚠️ Subscription ${id} was closed`)
                this.subscriptions.delete(id)
                if (config.onDisconnect) {
                  config.onDisconnect()
                }
                resolve({ success: false, error: 'SUBSCRIPTION_CLOSED' })
                break
                
              default:
                console.warn(`⚠️ Unexpected subscription status for ${id}:`, status)
                resolve({ success: false, error: 'UNEXPECTED_STATUS' })
            }
          })

        // Set up subscription timeout
        const timeout = setTimeout(() => {
          if (!this.subscriptions.has(id)) {
            console.error(`❌ Subscription ${id} setup timeout`)
            if (config.onError) {
              config.onError(new Error('Subscription setup timeout'))
            }
            resolve({ success: false, error: 'SETUP_TIMEOUT' })
          }
        }, 10000) // 10 second timeout

        // Clear timeout if subscription succeeds
        const originalOnConnect = config.onConnect
        config.onConnect = () => {
          clearTimeout(timeout)
          if (originalOnConnect) {
            originalOnConnect()
          }
        }

      } catch (error) {
        console.error(`❌ Error setting up subscription ${id}:`, error)
        if (config.onError) {
          config.onError(error)
        }
        resolve({ success: false, error })
      }
    })
  }

  // Unsubscribe from a table
  unsubscribe(id: string): boolean {
    try {
      const channel = this.subscriptions.get(id)
      if (channel) {
        supabase.removeChannel(channel)
        this.subscriptions.delete(id)
        console.log(`✅ Unsubscribed from ${id}`)
        return true
      } else {
        console.warn(`⚠️ No subscription found for ${id}`)
        return false
      }
    } catch (error) {
      console.error(`❌ Error unsubscribing from ${id}:`, error)
      return false
    }
  }

  // Unsubscribe from all subscriptions
  unsubscribeAll(): void {
    console.log(`🔕 Unsubscribing from all ${this.subscriptions.size} subscriptions`)
    
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id)
    }
    
    this.subscriptions.clear()
  }

  // Resubscribe to all active subscriptions
  private async resubscribeAll(): Promise<void> {
    console.log(`🔄 Resubscribing to ${this.subscriptions.size} active subscriptions`)
    
    // Note: This is a simplified implementation
    // In a real scenario, you'd need to store the configs and recreate subscriptions
    // For now, we just log that reconnection happened
    console.log('✅ Realtime connection restored, subscriptions should auto-resume')
  }

  // Handle automatic reconnection
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached, giving up')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff
    
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`)
    
    setTimeout(() => {
      if (this.connectionStatus !== 'connected') {
        console.log('🔄 Attempting to reconnect to Supabase realtime...')
        // Supabase automatically handles reconnection, we just need to wait
      }
    }, delay)
  }

  // Get subscription count
  getSubscriptionCount(): number {
    return this.subscriptions.size
  }

  // Get active subscription IDs
  getActiveSubscriptionIds(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  // Test realtime connectivity
  async testConnectivity(): Promise<{ success: boolean; error?: any }> {
    try {
      const testId = 'connectivity-test'
      
      const result = await this.subscribe(testId, {
        table: 'rounds',
        event: '*',
        retryAttempts: 1,
        retryDelay: 1000,
        onConnect: () => {
          console.log('✅ Connectivity test subscription connected')
        },
        onError: (error) => {
          console.error('❌ Connectivity test subscription error:', error)
        }
      })

      if (result.success) {
        // Clean up test subscription
        setTimeout(() => {
          this.unsubscribe(testId)
        }, 1000)
        
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('❌ Realtime connectivity test failed:', error)
      return { success: false, error }
    }
  }
}

// Singleton instance
export const realtimeManager = new RealtimeSubscriptionManager()

// Helper functions for common subscription patterns

// Subscribe to game rounds
export function subscribeToRounds(
  onRoundUpdate: (payload: any) => void,
  onError?: (error: any) => void
): Promise<{ success: boolean; error?: any }> {
  return realtimeManager.subscribe('rounds', {
    table: 'rounds',
    event: '*',
    onEvent: onRoundUpdate,
    onError: (error) => {
      console.error('❌ Rounds subscription error:', error)
      if (onError) onError(error)
    },
    onConnect: () => {
      console.log('✅ Connected to rounds updates')
    },
    onDisconnect: () => {
      console.warn('⚠️ Disconnected from rounds updates')
    }
  })
}

// Subscribe to guesses
export function subscribeToGuesses(
  onGuessUpdate: (payload: any) => void,
  roundId?: string,
  onError?: (error: any) => void
): Promise<{ success: boolean; error?: any }> {
  const filter = roundId ? `round_id=eq.${roundId}` : undefined
  
  return realtimeManager.subscribe('guesses', {
    table: 'guesses',
    event: '*',
    filter,
    onEvent: onGuessUpdate,
    onError: (error) => {
      console.error('❌ Guesses subscription error:', error)
      if (onError) onError(error)
    },
    onConnect: () => {
      console.log(`✅ Connected to guesses updates${roundId ? ` for round ${roundId}` : ''}`)
    },
    onDisconnect: () => {
      console.warn('⚠️ Disconnected from guesses updates')
    }
  })
}

// Subscribe to chat messages
export function subscribeToChatMessages(
  onMessageUpdate: (payload: any) => void,
  onError?: (error: any) => void
): Promise<{ success: boolean; error?: any }> {
  return realtimeManager.subscribe('chat-messages', {
    table: 'chat_messages',
    event: 'INSERT',
    onEvent: onMessageUpdate,
    onError: (error) => {
      console.error('❌ Chat messages subscription error:', error)
      if (onError) onError(error)
    },
    onConnect: () => {
      console.log('✅ Connected to chat messages')
    },
    onDisconnect: () => {
      console.warn('⚠️ Disconnected from chat messages')
    }
  })
}

// Subscribe to user-specific updates
export function subscribeToUserUpdates(
  userFid: string,
  onUpdate: (payload: any) => void,
  onError?: (error: any) => void
): Promise<{ success: boolean; error?: any }> {
  return realtimeManager.subscribe(`user-${userFid}`, {
    table: 'user_sessions',
    event: '*',
    filter: `fid=eq.${userFid}`,
    onEvent: onUpdate,
    onError: (error) => {
      console.error(`❌ User ${userFid} subscription error:`, error)
      if (onError) onError(error)
    },
    onConnect: () => {
      console.log(`✅ Connected to user ${userFid} updates`)
    },
    onDisconnect: () => {
      console.warn(`⚠️ Disconnected from user ${userFid} updates`)
    }
  })
}

// Utility function to setup all required subscriptions for the game
export async function setupGameSubscriptions(
  userFid: string,
  callbacks: {
    onRoundUpdate?: (payload: any) => void
    onGuessUpdate?: (payload: any) => void
    onMessageUpdate?: (payload: any) => void
    onUserUpdate?: (payload: any) => void
    onError?: (error: any) => void
  }
): Promise<{ success: boolean; errors: any[] }> {
  const errors: any[] = []
  
  try {
    console.log('🔔 Setting up game subscriptions for user:', userFid)

    // Test connectivity first
    const connectivityTest = await realtimeManager.testConnectivity()
    if (!connectivityTest.success) {
      errors.push(connectivityTest.error)
      console.error('❌ Realtime connectivity test failed, skipping subscriptions')
      return { success: false, errors }
    }

    const subscriptions = []

    // Subscribe to rounds
    if (callbacks.onRoundUpdate) {
      subscriptions.push(
        subscribeToRounds(callbacks.onRoundUpdate, callbacks.onError)
      )
    }

    // Subscribe to guesses
    if (callbacks.onGuessUpdate) {
      subscriptions.push(
        subscribeToGuesses(callbacks.onGuessUpdate, undefined, callbacks.onError)
      )
    }

    // Subscribe to chat messages
    if (callbacks.onMessageUpdate) {
      subscriptions.push(
        subscribeToChatMessages(callbacks.onMessageUpdate, callbacks.onError)
      )
    }

    // Subscribe to user updates
    if (callbacks.onUserUpdate) {
      subscriptions.push(
        subscribeToUserUpdates(userFid, callbacks.onUserUpdate, callbacks.onError)
      )
    }

    // Wait for all subscriptions to complete
    const results = await Promise.allSettled(subscriptions)
    
    results.forEach((result, index) => {
      if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
        const error = result.status === 'rejected' ? result.reason : result.value.error
        errors.push(error)
        console.error(`❌ Subscription ${index} failed:`, error)
      }
    })

    const success = errors.length === 0
    console.log(`✅ Game subscriptions setup complete. Success: ${success}, Errors: ${errors.length}`)
    
    return { success, errors }
  } catch (error) {
    console.error('❌ Error setting up game subscriptions:', error)
    errors.push(error)
    return { success: false, errors }
  }
}

// Cleanup function to remove all game subscriptions
export function cleanupGameSubscriptions(): void {
  console.log('🧹 Cleaning up all game subscriptions')
  realtimeManager.unsubscribeAll()
}

// Export the realtime manager for advanced usage
export { realtimeManager as default }
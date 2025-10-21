// Application Configuration
// Switch between mock and real-time mode

export type AppMode = 'mock' | 'supabase'

export const APP_CONFIG = {
  // Current mode: 'mock' or 'supabase'
  // Set to 'mock' for testing with mock data
  // Set to 'supabase' for production with Supabase
  mode: 'supabase' as AppMode,
  
  // Mock mode settings
  mock: {
    autoLogin: true, // Auto-login as admin in mock mode
    adminAddress: 'fid-250704',
    initialRound: {
      prize: '5,000 $SECOND',
      blockNumber: 875420,
      duration: 24 * 60 * 60 * 1000 // 24 hours
    }
  },
  
  // Supabase mode settings
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://masgfwpxfytraiwkvbmg.supabase.co',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    bitcoinApiInterval: 10000, // Fetch Bitcoin data every 10 seconds
    mempoolApiUrl: 'https://mempool.space/api',
    realtime: {
      eventsPerSecond: 10
    }
  }
} as const

export function isMockMode(): boolean {
  return APP_CONFIG.mode === 'mock'
}

export function isSupabaseMode(): boolean {
  return APP_CONFIG.mode === 'supabase'
}

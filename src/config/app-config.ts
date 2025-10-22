// Application Configuration
// Bitcoin Blocks Mini App

export type AppMode = 'mock' | 'realtime'

export const APP_CONFIG = {
  // Current mode: 'realtime' only - mock mode removed
  mode: 'realtime' as AppMode,
  
  // Mock mode settings
  mock: {
    bitcoinApiInterval: 5000, // Simulate Bitcoin data every 5 seconds
    simulatedTxRange: [2000, 4000], // Range for simulated transaction counts
    autoAnnounceToConsole: true // Log Farcaster announcements to console in mock mode
  },
  
  // Realtime mode settings
  realtime: {
    bitcoinApiInterval: 10000, // Fetch Bitcoin data every 10 seconds
    mempoolApiUrl: 'https://mempool.space/api',
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://masgfwpxfytraiwkvbmg.supabase.co',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      eventsPerSecond: 10
    }
  },
  
  // Admin addresses for validation
  adminAddresses: [
    '0xc38B1633E152fC75da3Ff737717c0DA5EF291408',
    '0x09D02D25D0D082f7F2E04b4838cEfe271b2daB09'
  ],
  
  // Admin FIDs for validation
  adminFids: [250704, 1107084]
} as const

export function isMockMode(): boolean {
  return APP_CONFIG.mode === 'mock'
}

export function isRealtimeMode(): boolean {
  return APP_CONFIG.mode === 'realtime'
}

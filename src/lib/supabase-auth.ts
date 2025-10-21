import { supabase, supabaseAdmin } from './supabase-singleton'
import type { User } from '../types/game'

// Enhanced Farcaster authentication helper for Supabase
export class SupabaseAuth {
  private static instance: SupabaseAuth
  private currentUser: User | null = null
  private authPromise: Promise<User | null> | null = null
  private sessionRefreshInterval: NodeJS.Timeout | null = null
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours
  private readonly REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes

  static getInstance(): SupabaseAuth {
    if (!SupabaseAuth.instance) {
      SupabaseAuth.instance = new SupabaseAuth()
    }
    return SupabaseAuth.instance
  }

  // Initialize Farcaster authentication with enhanced error handling
  async initializeAuth(): Promise<User | null> {
    // Return existing promise if auth is already in progress
    if (this.authPromise) {
      return this.authPromise
    }

    this.authPromise = this.performAuthInitialization()
    return this.authPromise
  }

  private async performAuthInitialization(): Promise<User | null> {
    try {
      console.log('🔐 Initializing enhanced Farcaster authentication...')

      // Try to get existing session from localStorage first
      const cachedUser = this.getCachedUser()
      if (cachedUser && !this.isSessionExpired(cachedUser)) {
        console.log('✅ Using cached user session')
        this.currentUser = cachedUser
        
        // Start session refresh interval
        this.startSessionRefresh()
        
        // Validate session with Supabase in background
        this.validateSessionWithSupabase(cachedUser).catch(error => {
          console.warn('⚠️ Background session validation failed:', error)
        })
        
        return cachedUser
      }

      // Initialize Farcaster SDK with enhanced retry mechanism
      const { sdk } = await import('@farcaster/miniapp-sdk')
      
      // Wait for SDK to be ready with exponential backoff
      let retryCount = 0
      const maxRetries = 5
      const baseTimeoutMs = 5000 // 5 seconds base timeout
      
      while (retryCount < maxRetries) {
        try {
          const timeoutMs = baseTimeoutMs * Math.pow(2, retryCount) // Exponential backoff
          
          await Promise.race([
            sdk.actions.ready(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('SDK initialization timeout')), timeoutMs)
            )
          ])
          console.log('✅ Farcaster SDK initialized successfully')
          break
        } catch (error) {
          retryCount++
          const isLastRetry = retryCount >= maxRetries
          
          console.warn(`⚠️ SDK initialization attempt ${retryCount}/${maxRetries} failed:`, error)
          
          if (isLastRetry) {
            throw new Error(`Failed to initialize Farcaster SDK after ${maxRetries} attempts. Last error: ${error}`)
          }
          
          // Exponential backoff with jitter
          const baseDelay = 1000 * retryCount
          const jitter = Math.random() * 1000
          const delay = Math.min(baseDelay + jitter, 10000) // Max 10 seconds
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // Get user context from Farcaster with enhanced timeout and validation
      const context = await Promise.race([
        this.getUserContextWithValidation(sdk),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('User context timeout after 10 seconds')), 10000)
        )
      ])
      
      console.log('📋 Enhanced Farcaster context retrieved:', context)

      if (!context?.user) {
        throw new Error('No user context available from Farcaster SDK')
      }

      // Extract and validate user information
      const fid = context.user.fid
      if (!fid || typeof fid !== 'number' || fid <= 0) {
        throw new Error('Invalid FID received from Farcaster SDK')
      }

      const username = context.user.username || `user-${fid}`
      const displayName = context.user.displayName || username
      const pfpUrl = this.validateAndSanitizePfpUrl(context.user.pfpUrl || '')

      // Check if user is admin with enhanced error handling
      const isAdmin = await this.checkIsAdminWithFallback(fid)

      // Construct enhanced user object
      const user: User = {
        address: `fid-${fid}`,
        username: this.sanitizeUsername(username),
        displayName: this.sanitizeDisplayName(displayName),
        pfpUrl,
        isAdmin,
        createdAt: Date.now(),
        lastActive: Date.now()
      }

      // Cache user session with enhanced metadata
      this.cacheUserWithMetadata(user)

      // Store session in Supabase with retry mechanism
      await this.storeUserSessionWithRetry(fid, user)

      // Start session refresh interval
      this.startSessionRefresh()

      this.currentUser = user
      console.log('✅ Enhanced user authentication successful:', user)
      
      return user
    } catch (error) {
      console.error('❌ Enhanced authentication failed:', error)
      this.currentUser = null
      this.cleanup()
      return null
    } finally {
      this.authPromise = null
    }
  }

  // Enhanced user context retrieval with validation
  private async getUserContextWithValidation(sdk: any): Promise<any> {
    try {
      const context = await sdk.context
      
      // Validate context structure
      if (!context || typeof context !== 'object') {
        throw new Error('Invalid context structure received')
      }

      if (!context.user || typeof context.user !== 'object') {
        throw new Error('Invalid user object in context')
      }

      // Validate required fields
      const { user } = context
      if (!user.fid) {
        throw new Error('Missing FID in user context')
      }

      return context
    } catch (error) {
      console.error('❌ Error retrieving user context:', error)
      throw error
    }
  }

  // Validate and sanitize PFP URL
  private validateAndSanitizePfpUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return ''
    }

    try {
      const urlObj = new URL(url)
      
      // Only allow HTTPS URLs
      if (urlObj.protocol !== 'https:') {
        console.warn('⚠️ Insecure PFP URL protocol detected, using empty URL')
        return ''
      }

      // Check for allowed domains (prevent XSS)
      const allowedDomains = [
        'vercel.app',
        'supabase.co',
        'farcaster.xyz',
        'warpcast.com',
        'ipfs.io',
        'cloudflare-ipfs.com'
      ]
      
      const domain = urlObj.hostname
      const isAllowed = allowedDomains.some(allowed => domain.includes(allowed))
      
      if (!isAllowed) {
        console.warn('⚠️ Untrusted PFP URL domain detected, using empty URL')
        return ''
      }

      return url
    } catch (error) {
      console.warn('⚠️ Invalid PFP URL format, using empty URL:', error)
      return ''
    }
  }

  // Sanitize username
  private sanitizeUsername(username: string): string {
    if (!username || typeof username !== 'string') {
      return 'unknown'
    }

    // Remove potentially harmful characters and limit length
    return username
      .replace(/[<>\"'&]/g, '') // Remove HTML special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50) // Limit to 50 characters
      .trim() || 'unknown'
  }

  // Sanitize display name
  private sanitizeDisplayName(displayName: string): string {
    if (!displayName || typeof displayName !== 'string') {
      return 'Unknown User'
    }

    // Remove potentially harmful characters and limit length
    return displayName
      .replace(/[<>\"'&]/g, '') // Remove HTML special characters
      .substring(0, 100) // Limit to 100 characters
      .trim() || 'Unknown User'
  }

  // Enhanced admin check with fallback
  private async checkIsAdminWithFallback(fid: number): Promise<boolean> {
    try {
      // Primary check: database
      const isAdmin = await this.checkIsAdmin(fid)
      
      if (isAdmin) {
        console.log(`✅ User ${fid} confirmed as admin via database`)
        return true
      }

      // Fallback: hardcoded admin list (for redundancy)
      const ADMIN_FIDS = [250704, 1107084]
      const isHardcodedAdmin = ADMIN_FIDS.includes(fid)
      
      if (isHardcodedAdmin) {
        console.log(`⚠️ User ${fid} is admin via fallback list, updating database...`)
        
        // Update database in background
        this.addAdminToFallbackList(fid).catch(error => {
          console.warn('⚠️ Failed to update admin database:', error)
        })
        
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Error checking admin status:', error)
      return false
    }
  }

  // Add admin to fallback list
  private async addAdminToFallbackList(fid: number): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('admin_fids')
        .upsert({
          fid: fid.toString(),
          permissions: { role: 'admin', permissions: ['all'], source: 'fallback' },
          created_at: Date.now(),
          updated_at: Date.now()
        }, { onConflict: 'fid' })

      if (error) {
        throw error
      }

      console.log(`✅ Admin ${fid} added to database from fallback list`)
    } catch (error) {
      console.error('❌ Failed to add admin to database:', error)
      throw error
    }
  }

  // Check if user is admin by querying admin_fids table with enhanced error handling
  private async checkIsAdmin(fid: number): Promise<boolean> {
    try {
      const { data, error } = await Promise.race([
        supabase
          .from('admin_fids')
          .select('fid, permissions')
          .eq('fid', fid.toString())
          .single(),
        new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Admin check timeout')), 5000)
        )
      ])

      if (error) {
        if ('code' in error && error.code === 'PGRST116') {
          // No rows returned - user is not admin
          return false
        }
        console.warn('⚠️ Error checking admin status:', error)
        return false
      }

      // Additional validation of permissions
      if (data && data.permissions) {
        const permissions = typeof data.permissions === 'string'
          ? JSON.parse(data.permissions)
          : data.permissions
        
        return permissions.role === 'admin' || permissions.permissions?.includes('all')
      }

      return !!data
    } catch (error) {
      console.error('❌ Error checking admin status:', error)
      return false
    }
  }

  // Enhanced user session storage with retry mechanism
  private async storeUserSessionWithRetry(fid: number, user: User): Promise<void> {
    const maxRetries = 3
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        await this.storeUserSession(fid, user)
        return // Success, exit retry loop
      } catch (error) {
        retryCount++
        const isLastRetry = retryCount >= maxRetries
        
        console.warn(`⚠️ User session storage attempt ${retryCount}/${maxRetries} failed:`, error)
        
        if (isLastRetry) {
          console.error('❌ Failed to store user session after all retries:', error)
          return
        }
        
        // Exponential backoff
        const delay = 1000 * Math.pow(2, retryCount - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // Store user session in Supabase with enhanced error handling
  private async storeUserSession(fid: number, user: User): Promise<void> {
    try {
      const sessionData = {
        fid: fid.toString(),
        session_data: {
          ...user,
          sessionId: this.generateSessionId(),
          deviceInfo: this.getDeviceInfo(),
          lastUpdated: Date.now()
        },
        created_at: Date.now(),
        expires_at: Date.now() + this.SESSION_TIMEOUT
      }

      const { error } = await supabaseAdmin
        .from('user_sessions')
        .upsert(sessionData, { onConflict: 'fid' })

      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }

      console.log('✅ User session stored successfully')
    } catch (error) {
      console.error('❌ Error storing user session:', error)
      throw error
    }
  }

  // Generate unique session ID
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  // Get device information for session tracking
  private getDeviceInfo(): Record<string, string> {
    try {
      return {
        userAgent: navigator.userAgent.substring(0, 500), // Limit length
        language: navigator.language || 'unknown',
        platform: navigator.platform || 'unknown',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.warn('⚠️ Error getting device info:', error)
      return {
        userAgent: 'unknown',
        language: 'unknown',
        platform: 'unknown',
        timestamp: new Date().toISOString()
      }
    }
  }

  // Enhanced user caching with metadata
  private cacheUserWithMetadata(user: User): void {
    try {
      const cacheData = {
        user,
        timestamp: Date.now(),
        version: '1.0',
        checksum: this.generateUserChecksum(user)
      }
      
      localStorage.setItem('bitcoin-blocks-user', JSON.stringify(cacheData))
      
      // Also cache in sessionStorage for tab-specific backup
      sessionStorage.setItem('bitcoin-blocks-user-backup', JSON.stringify(cacheData))
    } catch (error) {
      console.warn('⚠️ Error caching user with metadata:', error)
    }
  }

  // Generate checksum for user data integrity
  private generateUserChecksum(user: User): string {
    const dataString = `${user.address}-${user.username}-${user.isAdmin}-${user.lastActive}`
    return btoa(dataString).substring(0, 16)
  }

  // Get cached user from localStorage with validation
  private getCachedUser(): User | null {
    try {
      // Try localStorage first
      let cached = localStorage.getItem('bitcoin-blocks-user')
      
      // Fallback to sessionStorage
      if (!cached) {
        cached = sessionStorage.getItem('bitcoin-blocks-user-backup')
      }
      
      if (!cached) return null

      const cacheData = JSON.parse(cached)
      
      // Validate cache structure
      if (!cacheData.user || !cacheData.timestamp || !cacheData.checksum) {
        console.warn('⚠️ Invalid cache structure detected')
        this.clearCache()
        return null
      }

      // Validate checksum
      const expectedChecksum = this.generateUserChecksum(cacheData.user)
      if (cacheData.checksum !== expectedChecksum) {
        console.warn('⚠️ Cache checksum mismatch, possible tampering')
        this.clearCache()
        return null
      }

      return cacheData.user
    } catch (error) {
      console.warn('⚠️ Error getting cached user:', error)
      this.clearCache()
      return null
    }
  }

  // Clear all cache
  private clearCache(): void {
    try {
      localStorage.removeItem('bitcoin-blocks-user')
      sessionStorage.removeItem('bitcoin-blocks-user-backup')
    } catch (error) {
      console.warn('⚠️ Error clearing cache:', error)
    }
  }

  // Enhanced session expiration check
  private isSessionExpired(user: User): boolean {
    if (!user.lastActive) return true
    
    const now = Date.now()
    const timeSinceLastActive = now - user.lastActive
    
    return timeSinceLastActive > this.SESSION_TIMEOUT
  }

  // Start session refresh interval
  private startSessionRefresh(): void {
    // Clear existing interval
    if (this.sessionRefreshInterval) {
      clearInterval(this.sessionRefreshInterval)
    }

    // Set up new interval
    this.sessionRefreshInterval = setInterval(async () => {
      if (this.currentUser) {
        try {
          await this.refreshSession()
        } catch (error) {
          console.error('❌ Error in session refresh:', error)
        }
      }
    }, this.REFRESH_INTERVAL)
  }

  // Validate session with Supabase
  private async validateSessionWithSupabase(user: User): Promise<void> {
    try {
      const fid = user.address.replace('fid-', '')
      
      const { data, error } = await supabase
        .from('user_sessions')
        .select('expires_at')
        .eq('fid', fid)
        .single()

      if (error) {
        throw new Error(`Session validation failed: ${error.message}`)
      }

      if (data && Date.now() > data.expires_at) {
        console.warn('⚠️ Session expired on server, clearing local cache')
        this.signOut()
      }
    } catch (error) {
      console.warn('⚠️ Session validation error:', error)
      // Don't automatically sign out on validation errors, just log them
    }
  }

  // Cleanup resources
  private cleanup(): void {
    if (this.sessionRefreshInterval) {
      clearInterval(this.sessionRefreshInterval)
      this.sessionRefreshInterval = null
    }
  }

  // Get current user with validation
  getCurrentUser(): User | null {
    if (!this.currentUser) return null
    
    // Additional validation
    if (this.isSessionExpired(this.currentUser)) {
      console.warn('⚠️ Current user session expired')
      this.signOut()
      return null
    }
    
    return this.currentUser
  }

  // Enhanced sign out with cleanup
  async signOut(): Promise<void> {
    try {
      // Clear intervals
      this.cleanup()
      
      // Clear caches
      this.clearCache()
      
      // Clear current user
      this.currentUser = null
      
      // Clear any pending auth promise
      this.authPromise = null
      
      // Optionally clear Supabase session
      await supabase.auth.signOut().catch(error => {
        console.warn('⚠️ Error signing out from Supabase:', error)
      })
      
      console.log('✅ User signed out successfully')
    } catch (error) {
      console.error('❌ Error signing out:', error)
    }
  }

  // Enhanced session refresh
  async refreshSession(): Promise<User | null> {
    if (!this.currentUser) return null

    try {
      const now = Date.now()
      this.currentUser.lastActive = now
      
      // Update cache with new timestamp
      this.cacheUserWithMetadata(this.currentUser)
      
      // Optionally update Supabase session in background
      const fid = parseInt(this.currentUser.address.replace('fid-', ''))
      this.storeUserSession(fid, this.currentUser).catch(error => {
        console.warn('⚠️ Failed to update session in background:', error)
      })
      
      return this.currentUser
    } catch (error) {
      console.error('❌ Error refreshing session:', error)
      return null
    }
  }

  // Enhanced profile update with validation
  async updateProfile(updates: Partial<User>): Promise<User | null> {
    if (!this.currentUser) return null

    try {
      // Validate updates
      const validUpdates = this.validateProfileUpdates(updates)
      
      const updatedUser = {
        ...this.currentUser,
        ...validUpdates,
        lastActive: Date.now()
      }
      
      // Update cache
      this.cacheUserWithMetadata(updatedUser)
      
      // Update Supabase session
      const fid = parseInt(this.currentUser.address.replace('fid-', ''))
      await this.storeUserSession(fid, updatedUser)
      
      this.currentUser = updatedUser
      console.log('✅ User profile updated successfully')
      
      return updatedUser
    } catch (error) {
      console.error('❌ Error updating user profile:', error)
      return null
    }
  }

  // Validate profile updates
  private validateProfileUpdates(updates: Partial<User>): Partial<User> {
    const validUpdates: Partial<User> = {}
    
    if (updates.username !== undefined) {
      validUpdates.username = this.sanitizeUsername(updates.username)
    }
    
    if (updates.displayName !== undefined) {
      validUpdates.displayName = this.sanitizeDisplayName(updates.displayName)
    }
    
    if (updates.pfpUrl !== undefined) {
      validUpdates.pfpUrl = this.validateAndSanitizePfpUrl(updates.pfpUrl)
    }
    
    return validUpdates
  }
}

// Export singleton instance
export const supabaseAuth = SupabaseAuth.getInstance()

// Helper function to set Supabase session context for RLS
export async function setSupabaseContext(user: User | null): Promise<void> {
  if (!user) {
    // Clear context
    await supabase.rpc('reset_config')
    return
  }

  const fid = user.address.replace('fid-', '')
  
  // Set current user context for Row Level Security
  const { error } = await supabase.rpc('set_config', {
    key: 'app.current_fid',
    value: fid
  })

  if (error) {
    console.warn('⚠️ Error setting Supabase context:', error)
  } else {
    console.log('✅ Supabase context set for user:', fid)
  }
}
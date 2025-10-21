import { createClient } from '@farcaster/quick-auth'
import { supabaseAdmin } from './supabase-singleton'
import { logSystemError } from './error-handling'

// Security utilities for Bitcoin Blocks Mini App

// Rate limiting stores
const rateLimitStores = new Map<string, Map<string, { count: number; resetTime: number }>>()

// Admin FIDs with elevated permissions
const ADMIN_FIDS = ['250704', '1107084']

// Security configuration
const SECURITY_CONFIG = {
  // Rate limits (requests per window)
  rateLimits: {
    auth: { maxRequests: 10, windowMs: 60000 }, // 10 per minute
    guess: { maxRequests: 5, windowMs: 300000 }, // 5 per 5 minutes
    chat: { maxRequests: 20, windowMs: 60000 }, // 20 per minute
    admin: { maxRequests: 30, windowMs: 60000 }, // 30 per minute
    default: { maxRequests: 100, windowMs: 60000 } // 100 per minute
  },
  // JWT verification
  jwt: {
    clockTolerance: 30, // 30 seconds
    maxAge: 24 * 60 * 60 // 24 hours
  },
  // Input validation
  validation: {
    maxMessageLength: 500,
    maxUsernameLength: 50,
    minGuessAmount: 1,
    maxGuessAmount: 10000,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 5 * 1024 * 1024 // 5MB
  }
}

/**
 * Rate limiting utility
 */
export function checkRateLimit(
  identifier: string,
  category: keyof typeof SECURITY_CONFIG.rateLimits = 'default',
  customConfig?: { maxRequests: number; windowMs: number }
): { allowed: boolean; remaining: number; resetTime: number } {
  const config = customConfig || SECURITY_CONFIG.rateLimits[category]
  const now = Date.now()
  
  // Get or create store for this category
  if (!rateLimitStores.has(category)) {
    rateLimitStores.set(category, new Map())
  }
  
  const store = rateLimitStores.get(category)!
  const clientData = store.get(identifier)
  
  // Initialize or reset if window has expired
  if (!clientData || now > clientData.resetTime) {
    store.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs
    }
  }
  
  // Check if limit exceeded
  if (clientData.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: clientData.resetTime
    }
  }
  
  // Increment count
  clientData.count++
  
  return {
    allowed: true,
    remaining: config.maxRequests - clientData.count,
    resetTime: clientData.resetTime
  }
}

/**
 * Verify Farcaster JWT token with enhanced security
 */
export async function verifyFarcasterToken(
  token: string,
  domain?: string
): Promise<{ fid: string; valid: boolean; error?: string }> {
  try {
    const client = createClient()
    
    const payload = await client.verifyJwt({
      token,
      domain: domain || process.env.NEXT_PUBLIC_HOST || 'localhost:3000'
    })

    // Additional security checks
    if (!payload.sub || typeof payload.sub !== 'string') {
      return { fid: '', valid: false, error: 'Invalid token payload' }
    }

    // Check token age
    if (payload.exp && Date.now() / 1000 > payload.exp + SECURITY_CONFIG.jwt.clockTolerance) {
      return { fid: '', valid: false, error: 'Token expired' }
    }

    return { fid: payload.sub, valid: true }
  } catch (error) {
    await logSystemError('Token verification failed', {
      action: 'token_verification',
      additionalData: { domain }
    }, error as Error)
    
    return { fid: '', valid: false, error: 'Token verification failed' }
  }
}

/**
 * Check if user is admin
 */
export async function isAdmin(userFid: string): Promise<boolean> {
  try {
    // Quick check against hardcoded list
    if (ADMIN_FIDS.includes(userFid)) {
      return true
    }
    
    // Check database for dynamic admin list
    const { data } = await supabaseAdmin
      .from('admin_fids')
      .select('fid')
      .eq('fid', userFid)
      .single()
    
    return !!data
  } catch (error) {
    await logSystemError('Admin check failed', {
      action: 'admin_check',
      additionalData: { userFid }
    }, error as Error)
    
    return false
  }
}

/**
 * Get user permissions
 */
export async function getUserPermissions(userFid: string): Promise<string[]> {
  try {
    if (await isAdmin(userFid)) {
      const { data } = await supabaseAdmin
        .from('admin_fids')
        .select('permissions')
        .eq('fid', userFid)
        .single()
      
      return data?.permissions || ['read', 'write']
    }
    
    return ['read']
  } catch (error) {
    await logSystemError('Permission check failed', {
      action: 'permission_check',
      additionalData: { userFid }
    }, error as Error)
    
    return []
  }
}

/**
 * Validate and sanitize input
 */
export function validateInput(input: string, type: 'message' | 'username' | 'guess' = 'message'): {
  valid: boolean
  sanitized?: string
  error?: string
} {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Invalid input' }
  }

  const sanitized = input.trim()
  
  switch (type) {
    case 'message':
      if (sanitized.length === 0) {
        return { valid: false, error: 'Message cannot be empty' }
      }
      if (sanitized.length > SECURITY_CONFIG.validation.maxMessageLength) {
        return { valid: false, error: 'Message too long' }
      }
      break
      
    case 'username':
      if (sanitized.length === 0) {
        return { valid: false, error: 'Username cannot be empty' }
      }
      if (sanitized.length > SECURITY_CONFIG.validation.maxUsernameLength) {
        return { valid: false, error: 'Username too long' }
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
        return { valid: false, error: 'Username contains invalid characters' }
      }
      break
      
    case 'guess':
      const num = parseInt(sanitized)
      if (isNaN(num)) {
        return { valid: false, error: 'Invalid number' }
      }
      if (num < SECURITY_CONFIG.validation.minGuessAmount) {
        return { valid: false, error: 'Guess too low' }
      }
      if (num > SECURITY_CONFIG.validation.maxGuessAmount) {
        return { valid: false, error: 'Guess too high' }
      }
      return { valid: true, sanitized: num.toString() }
  }

  // Basic XSS prevention
  const xssSanitized = sanitized
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')

  return { valid: true, sanitized: xssSanitized }
}

/**
 * Validate file upload
 */
export function validateFile(file: File): {
  valid: boolean
  error?: string
} {
  // Check file size
  if (file.size > SECURITY_CONFIG.validation.maxFileSize) {
    return { valid: false, error: 'File too large' }
  }

  // Check MIME type
  if (!SECURITY_CONFIG.validation.allowedMimeTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type' }
  }

  return { valid: true }
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  return result
}

/**
 * Hash sensitive data (simple implementation)
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Check for suspicious activity patterns
 */
export function detectSuspiciousActivity(
  userFid: string,
  action: string,
  metadata?: Record<string, any>
): { suspicious: boolean; reason?: string; score: number } {
  let score = 0
  const reasons: string[] = []

  // Check for rapid successive requests
  const rateLimitResult = checkRateLimit(userFid, 'default', {
    maxRequests: 10,
    windowMs: 10000 // 10 requests in 10 seconds
  })
  
  if (!rateLimitResult.allowed) {
    score += 50
    reasons.push('Rapid requests detected')
  }

  // Check for unusual patterns based on action
  switch (action) {
    case 'guess':
      // Check for guess amount patterns
      if (metadata?.guessAmount && typeof metadata.guessAmount === 'number') {
        if (metadata.guessAmount === 1 || metadata.guessAmount === 9999) {
          score += 20
          reasons.push('Extreme guess amount')
        }
      }
      break
      
    case 'chat':
      // Check for message patterns
      if (metadata?.message && typeof metadata.message === 'string') {
        if (metadata.message.length > 400) {
          score += 10
          reasons.push('Unusually long message')
        }
        
        // Check for spam patterns
        if (/(.)\1{4,}/.test(metadata.message)) {
          score += 30
          reasons.push('Repetitive characters')
        }
      }
      break
  }

  return {
    suspicious: score > 40,
    reason: reasons.length > 0 ? reasons.join(', ') : undefined,
    score
  }
}

/**
 * Content Security Policy headers
 */
export const CSP_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.farcaster.xyz https://mempool.space https://mainnet.base.org https://*.vercel-storage.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
}

/**
 * CORS configuration
 */
export const CORS_CONFIG = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://bitcoin-block.vercel.app']
    : ['http://localhost:3000', 'https://bitcoin-block.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}

/**
 * Cleanup expired rate limit entries
 */
export function cleanupRateLimits(): void {
  const now = Date.now()
  
  rateLimitStores.forEach((store, category) => {
    for (const [key, data] of store.entries()) {
      if (now > data.resetTime) {
        store.delete(key)
      }
    }
  })
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000)
}
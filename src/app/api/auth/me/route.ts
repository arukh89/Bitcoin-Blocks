import { NextRequest, NextResponse } from 'next/server'
import { createClient, Errors } from '@farcaster/quick-auth'
import { supabaseAdmin } from '../../../../lib/supabase-client'
import { supabaseDbFixed } from '../../../../lib/supabase-db-fixed'
import { supabaseAuth } from '../../../../lib/supabase-auth'
import { logSystemError } from '../../../../lib/error-handling'

const client = createClient()

// Rate limiting for auth endpoint
const authRateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkAuthRateLimit(clientIP: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const clientData = authRateLimitStore.get(clientIP)
  
  if (!clientData || now > clientData.resetTime) {
    authRateLimitStore.set(clientIP, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (clientData.count >= maxRequests) {
    return false
  }

  clientData.count++
  return true
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const clientIP = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown'
  
  if (!checkAuthRateLimit(clientIP)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authorization.split(' ')[1]
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    // Verify JWT token with retry logic
    let payload
    let attempts = 0
    const maxAttempts = 3

    while (attempts < maxAttempts) {
      try {
        payload = await client.verifyJwt({
          token,
          domain: process.env.NEXT_PUBLIC_HOST || 'localhost:3000'
        })
        break
      } catch (error) {
        attempts++
        if (attempts >= maxAttempts) throw error
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
      }
    }

    // Fetch user data with caching and retry logic
    let userData
    let userAttempts = 0
    const maxUserAttempts = 3

    while (userAttempts < maxUserAttempts) {
      try {
        const userResponse = await fetch(
          `https://api.farcaster.xyz/v2/user?fid=${payload.sub}`,
          {
            headers: {
              'api-key': process.env.FARCASTER_API_KEY || 'wc_secret_13ae99f53a4f0874277616da7b10bddf6d01a2ea5eac4d8c6380e877_9b6b2830',
              'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
            },
            signal: AbortSignal.timeout(10000)
          }
        )

        if (!userResponse.ok) {
          userData = {
            fid: payload.sub,
            username: `user-${payload.sub}`,
            displayName: `User ${payload.sub}`,
            pfpUrl: '',
            bio: ''
          }
        } else {
          const response = await userResponse.json()
          const user = response.result?.user || response.user
          userData = {
            fid: user.fid || payload.sub,
            username: user.username || `user-${payload.sub}`,
            displayName: user.display_name || user.displayName || `User ${payload.sub}`,
            pfpUrl: user.pfp_url || user.pfpUrl || '',
            bio: user.profile?.bio?.text || user.bio || ''
          }
        }
        break
      } catch (error) {
        userAttempts++
        if (userAttempts >= maxUserAttempts) {
          // Fallback to basic user data
          userData = {
            fid: payload.sub,
            username: `user-${payload.sub}`,
            displayName: `User ${payload.sub}`,
            pfpUrl: '',
            bio: ''
          }
          break
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * userAttempts))
      }
    }

    // Check if user is admin
    const isAdmin = await supabaseDbFixed.isAdmin(userData.fid.toString())
    
    let permissions = ['read', 'write'] // Default permissions
    let adminData = null
    
    // Try to get detailed permissions if table exists
    try {
      const { data } = await supabaseAdmin
        .from('admin_fids')
        .select('fid, permissions')
        .eq('fid', userData.fid.toString())
        .single()
      adminData = data
      permissions = adminData?.permissions || permissions
    } catch (err) {
      console.warn('⚠️ admin_fids table does not exist, using default permissions')
    }

    // Store/update user session in Supabase with error handling
    const sessionData = {
      fid: userData.fid.toString(),
      session_data: {
        address: `fid-${userData.fid}`,
        username: userData.username,
        displayName: userData.displayName,
        pfpUrl: userData.pfpUrl,
        bio: userData.bio,
        isAdmin,
        permissions,
        createdAt: Date.now(),
        lastActive: Date.now()
      },
      created_at: Date.now(),
      expires_at: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      last_ip: clientIP
    }

    try {
      await (supabaseAdmin as any)
        .from('user_sessions')
        .upsert(sessionData, { onConflict: 'fid' })
    } catch (error) {
      // Log error but don't fail the request
      await logSystemError('Failed to store user session', {
        action: 'session_storage',
        additionalData: {
          fid: userData.fid,
          ip: clientIP
        }
      }, error as Error)
    }

    // Log successful authentication (if audit_logs exists)
    try {
      await (supabaseAdmin as any)
        .from('audit_logs')
        .insert({
          admin_fid: userData.fid.toString(),
          action: 'user_login',
          details: {
            ip: clientIP,
            userAgent: request.headers.get('user-agent') || 'unknown',
            timestamp: new Date().toISOString()
          },
          created_at: Date.now()
        })
    } catch (error) {
      // Don't fail the request if logging fails
      console.warn('⚠️ Failed to log user login (audit_logs may not exist):', error)
    }

    return NextResponse.json({
      ...userData,
      address: `fid-${userData.fid}`,
      isAdmin,
      permissions
    })
  } catch (error) {
    await logSystemError('Authentication error', {
      action: 'user_auth',
      additionalData: {
        ip: clientIP,
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    }, error as Error)
    
    if (error instanceof Errors.InvalidTokenError) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { CSP_HEADERS, CORS_CONFIG, checkRateLimit, detectSuspiciousActivity } from './lib/security'
import { logSystemError } from './lib/error-handling'

// Security middleware for Bitcoin Blocks Mini App

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Create response with security headers
  const response = NextResponse.next({
    request: {
      headers: request.headers
    }
  })

  // Apply CSP headers
  Object.entries(CSP_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Get client IP for rate limiting
  const clientIP = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown'

  // Get user agent for logging
  const userAgent = request.headers.get('user-agent') || 'unknown'

  // Rate limiting by endpoint
  const pathname = request.nextUrl.pathname
  let rateLimitCategory: 'auth' | 'guess' | 'chat' | 'admin' | 'default' = 'default'

  if (pathname.startsWith('/api/auth')) {
    rateLimitCategory = 'auth'
  } else if (pathname.startsWith('/api/guess')) {
    rateLimitCategory = 'guess'
  } else if (pathname.startsWith('/api/chat')) {
    rateLimitCategory = 'chat'
  } else if (pathname.startsWith('/api/admin')) {
    rateLimitCategory = 'admin'
  }

  // Check rate limit
  const rateLimitResult = checkRateLimit(clientIP, rateLimitCategory)
  response.headers.set('X-RateLimit-Limit', rateLimitCategory === 'default' ? '100' : 
    rateLimitCategory === 'auth' ? '10' :
    rateLimitCategory === 'guess' ? '5' :
    rateLimitCategory === 'chat' ? '20' :
    rateLimitCategory === 'admin' ? '30' : '100')
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
  response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString())

  if (!rateLimitResult.allowed) {
    // Log rate limit violation
    await logSystemError('Rate limit exceeded', {
      action: 'rate_limit_violation',
      additionalData: {
        ip: clientIP,
        userAgent,
        pathname,
        category: rateLimitCategory
      }
    }, new Error('Rate limit exceeded'))

    return new NextResponse(
      JSON.stringify({ 
        error: 'Rate limit exceeded',
        resetTime: rateLimitResult.resetTime
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
          ...response.headers
        }
      }
    )
  }

  // Detect suspicious activity
  const activityResult = detectSuspiciousActivity(clientIP, pathname, {
    method: request.method,
    userAgent
  })

  if (activityResult.suspicious) {
    await logSystemError('Suspicious activity detected', {
      action: 'suspicious_activity',
      additionalData: {
        ip: clientIP,
        userAgent,
        pathname,
        reason: activityResult.reason,
        score: activityResult.score
      }
    }, new Error(`Suspicious activity: ${activityResult.reason}`))

    // For high scores, block the request
    if (activityResult.score > 60) {
      return new NextResponse(
        JSON.stringify({ 
          error: 'Request blocked due to suspicious activity'
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...response.headers
          }
        }
      )
    }
  }

  // Handle CORS for API routes
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    
    if (CORS_CONFIG.origin.includes(origin || '') || CORS_CONFIG.origin.includes('*')) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*')
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Access-Control-Allow-Methods', CORS_CONFIG.methods.join(', '))
      response.headers.set('Access-Control-Allow-Headers', CORS_CONFIG.allowedHeaders.join(', '))
      response.headers.set('Access-Control-Expose-Headers', CORS_CONFIG.exposedHeaders.join(', '))
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: response.headers
      })
    }
  }

  // Log API requests for monitoring
  if (pathname.startsWith('/api/')) {
    // Don't log in development to reduce noise
    if (process.env.NODE_ENV === 'production') {
      console.log(`API Request: ${request.method} ${pathname} - ${clientIP}`)
    }
  }

  return response
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
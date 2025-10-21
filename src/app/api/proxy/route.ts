import { NextRequest, NextResponse } from 'next/server'

/**
 * Universal proxy API with security headers and request validation
 * 
 * GET /api/proxy?url=<encoded_url>&method=<method>
 * POST /api/proxy?url=<encoded_url>&method=<method>
 * 
 * Security features:
 * - URL whitelist validation
 * - Request size limiting
 * - Response filtering
 * - Rate limiting (basic implementation)
 */

// Allowed domains for proxy requests
const ALLOWED_DOMAINS = [
  'mempool.space',
  'api.farcaster.xyz',
  'api.warpcast.com',
  'mainnet.base.org',
  'vercel.storage'
]

// Maximum response size (5MB)
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024

// Basic rate limiting (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function isUrlAllowed(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return ALLOWED_DOMAINS.includes(urlObj.hostname)
  } catch {
    return false
  }
}

function checkRateLimit(clientIP: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 100 // Max 100 requests per minute

  const clientData = rateLimitStore.get(clientIP)
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitStore.set(clientIP, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (clientData.count >= maxRequests) {
    return false
  }

  clientData.count++
  return true
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request, 'GET')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request, 'POST')
}

async function handleRequest(request: NextRequest, defaultMethod: string): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const encodedUrl = searchParams.get('url')
    const method = searchParams.get('method') || defaultMethod

    if (!encodedUrl) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      )
    }

    // Decode and validate URL
    let targetUrl: string
    try {
      targetUrl = decodeURIComponent(encodedUrl)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL encoding' },
        { status: 400 }
      )
    }

    // Security checks
    if (!isUrlAllowed(targetUrl)) {
      return NextResponse.json(
        { error: 'URL not allowed' },
        { status: 403 }
      )
    }

    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown'
    
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Prepare proxy request
    const proxyOptions: RequestInit = {
      method,
      headers: {
        'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      }
    }

    // Add body for POST requests
    if (method === 'POST') {
      const body = await request.text()
      
      // Limit request size
      if (body.length > MAX_RESPONSE_SIZE) {
        return NextResponse.json(
          { error: 'Request body too large' },
          { status: 413 }
        )
      }

      proxyOptions.body = body
      proxyOptions.headers['Content-Type'] = 'application/json'
    }

    // Add timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout
    proxyOptions.signal = controller.signal

    // Make the proxy request
    const response = await fetch(targetUrl, proxyOptions)
    clearTimeout(timeoutId)

    // Check response size
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: 'Response too large' },
        { status: 413 }
      )
    }

    // Get response data with size limit
    let responseData: string | undefined
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalSize = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        totalSize += value.length
        if (totalSize > MAX_RESPONSE_SIZE) {
          reader.releaseLock()
          return NextResponse.json(
            { error: 'Response too large' },
            { status: 413 }
          )
        }

        chunks.push(value)
      }

      responseData = new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
          const newAcc = new Uint8Array(acc.length + chunk.length)
          newAcc.set(acc)
          newAcc.set(chunk, acc.length)
          return newAcc
        }, new Uint8Array(0))
      )
    }

    // Create response with security headers
    const proxyResponse = new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 minute cache
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    })

    return proxyResponse

  } catch (error) {
    console.error('Proxy error:', error)
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 408 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Proxy request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  })
}
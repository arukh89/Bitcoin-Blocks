import { NextResponse } from 'next/server'
import { logSystemError } from '../../../lib/error-handling'

// Farcaster API key stored securely on backend only
const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY || 'wc_secret_13ae99f53a4f0874277616da7b10bddf6d01a2ea5eac4d8c6380e877_9b6b2830'

interface AnnouncementRequest {
  message: string
  address?: string
  embeds?: Array<{
    url?: string
    [key: string]: any
  }>
}

// Rate limiting for announcements
const announcementRateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkAnnouncementRateLimit(address: string, maxRequests = 5, windowMs = 3600000): boolean {
  // 5 announcements per hour per address
  const now = Date.now()
  const clientData = announcementRateLimitStore.get(address)
  
  if (!clientData || now > clientData.resetTime) {
    announcementRateLimitStore.set(address, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (clientData.count >= maxRequests) {
    return false
  }

  clientData.count++
  return true
}

/**
 * Post announcement to Farcaster feed
 *
 * POST /api/farcaster-announce
 * Body: { message: string, fid?: number, embeds?: Array }
 *
 * Only accessible by admin FIDs: 250704, 1107084
 */
export async function POST(request: Request): Promise<Response> {
  let body: AnnouncementRequest
  
  try {
    body = await request.json()
    const { message, address, embeds } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid message parameter' },
        { status: 400 }
      )
    }

    // Validate message length
    if (message.length > 320) {
      return NextResponse.json(
        { error: 'Message too long (max 320 characters)' },
        { status: 400 }
      )
    }

    // Server-side validation for admin addresses
    const ADMIN_ADDRESSES = ['fid-250704', 'fid-1107084']
    if (!address || !ADMIN_ADDRESSES.includes(address)) {
      await logSystemError('Unauthorized announcement attempt', {
        action: 'unauthorized_announcement',
        additionalData: {
          address,
          message: message.substring(0, 50) + '...'
        }
      }, new Error('Unauthorized user attempted to post announcement'))
      
      return NextResponse.json(
        { error: 'Unauthorized: Only admin users can post announcements' },
        { status: 403 }
      )
    }

    // Rate limiting
    if (!checkAnnouncementRateLimit(address)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: Maximum 5 announcements per hour' },
        { status: 429 }
      )
    }

    // Prepare cast data
    const castData: any = {
      text: message,
      embeds: embeds || []
    }

    // Retry logic for Farcaster API
    let attempts = 0
    const maxAttempts = 3
    let lastError: Error | null = null

    while (attempts < maxAttempts) {
      try {
        const response = await fetch('https://api.warpcast.com/v2/casts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FARCASTER_API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
          },
          body: JSON.stringify(castData),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        })

        if (!response.ok) {
          const errorData = await response.text()
          throw new Error(`Farcaster API returned ${response.status}: ${errorData}`)
        }

        const data = await response.json()

        // Log successful announcement
        await logSystemError('Announcement posted successfully', {
          action: 'announcement_posted',
          additionalData: {
            address,
            messageLength: message.length,
            hasEmbeds: !!(embeds && embeds.length > 0)
          }
        }, new Error('Success log'))

        return NextResponse.json({
          success: true,
          message: 'Announcement posted successfully',
          cast: data.result?.cast || data.cast || data
        })
      } catch (error) {
        lastError = error as Error
        attempts++
        
        if (attempts < maxAttempts) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts))
        }
      }
    }

    // All retries failed
    await logSystemError('Failed to post announcement after retries', {
      action: 'announcement_failed',
      additionalData: {
        address,
        attempts,
        message: message.substring(0, 50) + '...'
      }
    }, lastError || new Error('Unknown error'))

    return NextResponse.json(
      {
        error: 'Failed to post to Farcaster after multiple attempts',
        details: lastError?.message || 'Unknown error',
        success: false
      },
      { status: 503 }
    )
  } catch (error) {
    await logSystemError('Farcaster announce error', {
      action: 'announce_error',
      additionalData: {
        address: body?.address,
        messageLength: body?.message?.length || 0
      }
    }, error as Error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    )
  }
}

/**
 * Get announcement status or configuration
 */
export async function GET(): Promise<Response> {
  return NextResponse.json({
    enabled: true,
    apiKeyConfigured: !!FARCASTER_API_KEY,
    adminAddresses: ['fid-250704', 'fid-1107084']
  })
}

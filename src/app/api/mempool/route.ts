import { NextResponse } from 'next/server'

interface BlockInfo {
  id: string
  height: number
  timestamp: number
  tx_count: number
}

interface TransactionList {
  length: number
}

// Simple in-memory cache (in production, use Redis)
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

// Rate limiting (in production, use a proper rate limiter)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function getFromCache(key: string): any | null {
  const cached = cache.get(key)
  if (!cached) return null
  
  if (Date.now() > cached.timestamp + cached.ttl) {
    cache.delete(key)
    return null
  }
  
  return cached.data
}

function setCache(key: string, data: any, ttlMs: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs
  })
}

function checkRateLimit(clientIP: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now()
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

/**
 * Fetch Bitcoin block data from mempool.space
 * 
 * GET /api/mempool?action=block-at-time&timestamp=<unix_seconds>
 * Returns: { blockHash, txCount, timestamp, height }
 * 
 * GET /api/mempool?action=tx-count&blockHash=<hash>
 * Returns: { txCount }
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // Rate limiting
  const clientIP = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown'
  
  if (!checkRateLimit(clientIP, 60, 60000)) { // 60 requests per minute
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }

  try {
    if (action === 'block-at-time') {
      const timestamp = searchParams.get('timestamp')
      if (!timestamp) {
        return NextResponse.json(
          { error: 'Missing timestamp parameter' },
          { status: 400 }
        )
      }

      // Check cache first
      const cacheKey = `block-at-time-${timestamp}`
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        return NextResponse.json(cachedData)
      }

      // Retry logic for mempool.space API
      let attempts = 0
      const maxAttempts = 3
      let lastError: Error | null = null

      while (attempts < maxAttempts) {
        try {
          // Fetch blocks around the given timestamp
          const response = await fetch(
            `https://mempool.space/api/v1/mining/blocks/timestamp/${timestamp}`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
              },
              signal: AbortSignal.timeout(10000) // 10 second timeout
            }
          )

          if (!response.ok) {
            throw new Error(`mempool.space API returned ${response.status}`)
          }

          const blocks = await response.json() as BlockInfo[]
          
          if (!blocks || blocks.length === 0) {
            return NextResponse.json(
              { error: 'No blocks found after the given timestamp' },
              { status: 404 }
            )
          }

          // Get the first block (closest to the timestamp)
          const block = blocks[0]
          const result = {
            blockHash: block.id,
            txCount: block.tx_count,
            timestamp: block.timestamp,
            height: block.height
          }

          // Cache for 5 minutes
          setCache(cacheKey, result, 5 * 60 * 1000)

          return NextResponse.json(result)
        } catch (error) {
          lastError = error as Error
          attempts++
          
          if (attempts < maxAttempts) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }
      }

      // All retries failed
      return NextResponse.json(
        {
          error: 'Failed to fetch block data after multiple attempts',
          details: lastError?.message || 'Unknown error',
          status: 'pending_result'
        },
        { status: 503 }
      )
    }

    if (action === 'tx-count') {
      const blockHash = searchParams.get('blockHash')
      if (!blockHash) {
        return NextResponse.json(
          { error: 'Missing blockHash parameter' },
          { status: 400 }
        )
      }

      // Check cache first
      const cacheKey = `tx-count-${blockHash}`
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        return NextResponse.json(cachedData)
      }

      // Retry logic
      let attempts = 0
      const maxAttempts = 3
      let lastError: Error | null = null

      while (attempts < maxAttempts) {
        try {
          const response = await fetch(
            `https://mempool.space/api/block/${blockHash}/txids`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
              },
              signal: AbortSignal.timeout(10000)
            }
          )

          if (!response.ok) {
            throw new Error(`mempool.space API returned ${response.status}`)
          }

          const txids = await response.json() as string[]
          const result = { txCount: txids.length }

          // Cache for 10 minutes (block data doesn't change)
          setCache(cacheKey, result, 10 * 60 * 1000)
          
          return NextResponse.json(result)
        } catch (error) {
          lastError = error as Error
          attempts++
          
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch transaction count after multiple attempts',
          details: lastError?.message || 'Unknown error',
          status: 'pending_result'
        },
        { status: 503 }
      )
    }

    if (action === 'recent-blocks') {
      // Check cache first
      const cacheKey = 'recent-blocks'
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        return NextResponse.json(cachedData)
      }

      // Fetch recent Bitcoin blocks with transaction counts
      let attempts = 0
      const maxAttempts = 3
      let lastError: Error | null = null

      while (attempts < maxAttempts) {
        try {
          const response = await fetch(
            'https://mempool.space/api/blocks',
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
              },
              signal: AbortSignal.timeout(10000)
            }
          )

          if (!response.ok) {
            throw new Error(`mempool.space API returned ${response.status}`)
          }

          const blocks = await response.json() as Array<{
            height: number
            id: string
            timestamp: number
            tx_count: number
            size: number
          }>

          const result = blocks.slice(0, 10).map(block => ({
            height: block.height,
            hash: block.id,
            timestamp: block.timestamp,
            tx_count: block.tx_count,
            size: block.size
          }))

          // Cache for 30 seconds
          setCache(cacheKey, result, 30 * 1000)

          return NextResponse.json(result)
        } catch (error) {
          lastError = error as Error
          attempts++
          
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch recent blocks after multiple attempts',
          details: lastError?.message || 'Unknown error'
        },
        { status: 503 }
      )
    }

    if (action === 'recent-txs') {
      // Check cache first
      const cacheKey = 'recent-txs'
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        return NextResponse.json(cachedData)
      }

      // Fetch recent mempool transactions
      let attempts = 0
      const maxAttempts = 3
      let lastError: Error | null = null

      while (attempts < maxAttempts) {
        try {
          const response = await fetch(
            'https://mempool.space/api/mempool/recent',
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Bitcoin-Blocks-Mini-App/1.0'
              },
              signal: AbortSignal.timeout(10000)
            }
          )

          if (!response.ok) {
            throw new Error(`mempool.space API returned ${response.status}`)
          }

          const transactions = await response.json() as Array<{
            txid: string
            fee: number
            vsize: number
            value: number
          }>

          const result = transactions.slice(0, 5)

          // Cache for 10 seconds
          setCache(cacheKey, result, 10 * 1000)

          return NextResponse.json(result)
        } catch (error) {
          lastError = error as Error
          attempts++
          
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch recent transactions after multiple attempts',
          details: lastError?.message || 'Unknown error'
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'Invalid action parameter. Use: block-at-time, tx-count, recent-blocks, or recent-txs' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Mempool API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

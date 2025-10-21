'use server'

import { NextResponse, type NextRequest } from 'next/server'
import { logSystemError } from '../../../lib/error-handling'

// Base Chain RPC URL
const BASE_RPC_URL = 'https://mainnet.base.org'

// Token contract addresses on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
const SECONDS_ADDRESS = '0xaf67e72dc47dcb2d48ecbc56950473d793d70c18' // $SECONDS token

// ERC-20 ABI for balanceOf
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function'
  }
]

// Simple in-memory cache for balances (5 minutes TTL)
const balanceCache = new Map<string, { data: any; timestamp: number }>()

function getFromCache(address: string): any | null {
  const cached = balanceCache.get(address)
  if (!cached) return null
  
  if (Date.now() - cached.timestamp > 5 * 60 * 1000) { // 5 minutes
    balanceCache.delete(address)
    return null
  }
  
  return cached.data
}

function setCache(address: string, data: any): void {
  balanceCache.set(address, {
    data,
    timestamp: Date.now()
  })
}

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(clientIP: string, maxRequests = 20, windowMs = 60000): boolean {
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

// Helper to make JSON-RPC call
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(BASE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message || 'RPC call failed')
  }
  return data.result
}

// Get ETH balance
async function getEthBalance(address: string): Promise<string> {
  const balance = await rpcCall('eth_getBalance', [address, 'latest']) as string
  const balanceInWei = BigInt(balance)
  const balanceInEth = Number(balanceInWei) / 1e18
  return balanceInEth.toFixed(6)
}

// Get ERC-20 token balance
async function getTokenBalance(tokenAddress: string, walletAddress: string, decimals: number = 18): Promise<string> {
  // Encode balanceOf(address) call
  const balanceOfSignature = '0x70a08231' // balanceOf(address)
  const paddedAddress = walletAddress.slice(2).padStart(64, '0')
  const data = balanceOfSignature + paddedAddress

  const balance = await rpcCall('eth_call', [
    {
      to: tokenAddress,
      data
    },
    'latest'
  ]) as string

  const balanceInWei = BigInt(balance)
  const balanceInToken = Number(balanceInWei) / Math.pow(10, decimals)
  return balanceInToken.toFixed(2)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const clientIP = req.headers.get('x-forwarded-for') ||
                  req.headers.get('x-real-ip') ||
                  'unknown'
  
  if (!checkRateLimit(clientIP)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }

  let body: any
  try {
    body = await req.json()
    const { address } = body

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid wallet address' },
        { status: 400 }
      )
    }

    // Handle FID format addresses (convert to dummy address for balance display)
    let targetAddress = address
    if (address.startsWith('fid-')) {
      // For FID addresses, use a dummy address for demonstration
      targetAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b'
      console.log(`🔍 Converting FID ${address} to demo address ${targetAddress}`)
    } else {
      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json(
          { success: false, error: 'Invalid Ethereum address format' },
          { status: 400 }
        )
      }
    }

    // Check cache first
    const cachedData = getFromCache(targetAddress)
    if (cachedData) {
      return NextResponse.json({
        success: true,
        balances: cachedData,
        cached: true
      })
    }

    console.log('🔍 Fetching balances for:', targetAddress)

    // Fetch all balances in parallel with retry logic
    const [ethBalance, usdcBalance, secondsBalance] = await Promise.all([
      getEthBalanceWithRetry(targetAddress).catch(err => {
        console.error('Error fetching ETH balance:', err)
        return '0.000000'
      }),
      getTokenBalanceWithRetry(USDC_ADDRESS, targetAddress, 6).catch(err => {
        console.error('Error fetching USDC balance:', err)
        return '0.00'
      }),
      getTokenBalanceWithRetry(SECONDS_ADDRESS, targetAddress, 18).catch(err => {
        console.error('Error fetching $SECONDS balance:', err)
        return '0.00'
      })
    ])

    const balances = {
      eth: ethBalance,
      usdc: usdcBalance,
      seconds: secondsBalance
    }

    // Cache the results
    setCache(targetAddress, balances)

    console.log('✅ Balances fetched:', balances)

    return NextResponse.json({
      success: true,
      balances,
      cached: false
    })
  } catch (error) {
    await logSystemError('Error fetching balances', {
      action: 'balance_fetch',
      additionalData: {
        address: body?.address || 'unknown',
        ip: clientIP
      }
    }, error as Error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balances'
      },
      { status: 500 }
    )
  }
}

// Enhanced functions with retry logic
async function getEthBalanceWithRetry(address: string, maxAttempts = 3): Promise<string> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getEthBalance(address)
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch ETH balance')
}

async function getTokenBalanceWithRetry(tokenAddress: string, walletAddress: string, decimals: number = 18, maxAttempts = 3): Promise<string> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getTokenBalance(tokenAddress, walletAddress, decimals)
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch token balance')
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase-client'

export async function GET(request: NextRequest) {
  const debugInfo: {
    timestamp: string
    runtime: string
    nodeEnv: string
    environment: {
      NEXT_PUBLIC_SITE_URL: string | undefined
      NEXT_PUBLIC_SUPABASE_URL: string
      SUPABASE_URL: string
    }
    headers: Record<string, string>
    supabaseTest: any
    errors: string[]
    nodeVersion?: string
  } = {
    timestamp: new Date().toISOString(),
    runtime: process.env.NEXT_RUNTIME || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    environment: {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'configured' : 'missing',
    },
    headers: Object.fromEntries(request.headers.entries()),
    supabaseTest: null,
    errors: []
  }

  // Test Supabase connection
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('id')
      .limit(1)
      .single()
    
    debugInfo.supabaseTest = {
      success: !error,
      error: error?.message || null,
      data: data ? 'connected' : 'no data'
    }
  } catch (err) {
    debugInfo.supabaseTest = {
      success: false,
      error: (err as Error).message,
      data: null
    }
    debugInfo.errors.push(`Supabase connection failed: ${(err as Error).message}`)
  }

  // Check for Edge Runtime compatibility issues
  try {
    // This will fail in Edge Runtime if Node.js APIs are used
    const nodeVersion = process.versions?.node
    debugInfo.nodeVersion = nodeVersion || 'not available'
  } catch (err) {
    debugInfo.errors.push(`Node.js API access failed: ${(err as Error).message}`)
    debugInfo.nodeVersion = 'edge runtime restriction'
  }

  return NextResponse.json(debugInfo)
}

export const runtime = 'nodejs' // Force Node.js runtime for debugging
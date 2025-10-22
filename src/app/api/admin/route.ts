import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-client'
import { supabaseDbFixed } from '../../../lib/supabase-db-fixed'
import { logSystemError } from '../../../lib/error-handling'

// Admin API endpoints for Bitcoin Blocks Mini App
// All endpoints require admin authentication

// Rate limiting for admin endpoints (more restrictive)
const adminRateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkAdminRateLimit(adminFid: string, maxRequests = 30, windowMs = 60000): boolean {
  const now = Date.now()
  const clientData = adminRateLimitStore.get(adminFid)
  
  if (!clientData || now > clientData.resetTime) {
    adminRateLimitStore.set(adminFid, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (clientData.count >= maxRequests) {
    return false
  }

  clientData.count++
  return true
}

async function verifyAdmin(request: NextRequest): Promise<{ fid: string; permissions?: string[] } | null> {
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null
    }

    const token = authorization.split(' ')[1]
    if (!token) {
      return null
    }

    // Verify JWT token
    const { createClient } = await import('@farcaster/quick-auth')
    const client = createClient()
    
    const payload = await client.verifyJwt({
      token,
      domain: process.env.NEXT_PUBLIC_HOST || 'localhost:3000'
    })

    // Check if user is admin and get permissions
    const isAdmin = await supabaseDbFixed.isAdmin(payload.sub.toString())
    
    if (!isAdmin) {
      return null
    }

    // Try to get permissions if table exists
    let adminData = null
    try {
      const { data } = await supabaseAdmin
        .from('admin_fids')
        .select('fid, permissions')
        .eq('fid', payload.sub.toString())
        .single()
      adminData = data
    } catch (err) {
      // Table doesn't exist, use default permissions
      adminData = { fid: payload.sub.toString(), permissions: ['read', 'write'] }
    }

    // Check rate limit
    if (!checkAdminRateLimit(adminData.fid)) {
      return null
    }

    return {
      fid: adminData.fid,
      permissions: adminData.permissions || ['read', 'write']
    }
  } catch (error) {
    await logSystemError('Admin verification failed', {
      action: 'admin_verification',
      additionalData: {
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    }, error)
    return null
  }
}

async function logAdminAction(adminFid: string, action: string, details: any, request: NextRequest): Promise<void> {
  try {
    const { error } = await (supabaseAdmin as any)
      .from('audit_logs')
      .insert({
        admin_fid: adminFid,
        action,
        details: {
          ...details,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString()
        },
        created_at: Date.now()
      })
    
    if (error) {
      console.error('Failed to log admin action:', error)
    }
  } catch (error) {
    console.error('Failed to log admin action:', error)
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'stats':
        // Get admin statistics
        const [roundsCount, activeRound, totalGuesses, totalUsers] = await Promise.all([
          supabaseAdmin.from('rounds').select('id', { count: 'exact' }),
          supabaseDbFixed.getActiveRound(),
          supabaseAdmin.from('guesses').select('id', { count: 'exact' }),
          supabaseAdmin.from('user_sessions').select('fid', { count: 'exact' })
        ])

        // Skip error_logs if table doesn't exist
        let recentErrors = { count: 0 }
        try {
          const result = await supabaseAdmin.from('error_logs').select('id', { count: 'exact' }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          recentErrors = result
        } catch (err) {
          console.warn('⚠️ error_logs table does not exist')
        }

        await logAdminAction(admin.fid, 'view_stats', {}, request)

        return NextResponse.json({
          rounds: roundsCount.count || 0,
          activeRound,
          totalGuesses: totalGuesses.count || 0,
          totalUsers: totalUsers.count || 0,
          recentErrors: recentErrors.count || 0
        })

      case 'rounds':
        // Get all rounds with pagination
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '50')
        const status = searchParams.get('status')

        let query = supabaseAdmin
          .from('rounds')
          .select('*')
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (status) {
          query = query.eq('status', status)
        }

        const { data: rounds, error } = await query

        if (error) throw error

        await logAdminAction(admin.fid, 'view_rounds', { page, limit, status }, request)

        return NextResponse.json({ rounds: rounds || [] })

      case 'logs':
        // Get audit logs with pagination
        const logPage = parseInt(searchParams.get('page') || '1')
        const logLimit = parseInt(searchParams.get('limit') || '50')
        const adminFilter = searchParams.get('admin')

        let logs = []
        try {
          let logQuery = supabaseAdmin
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .range((logPage - 1) * logLimit, logPage * logLimit - 1)

          if (adminFilter) {
            logQuery = logQuery.eq('admin_fid', adminFilter)
          }

          const { data: logsData, error: logError } = await logQuery
          if (logError) throw logError
          logs = logsData || []
        } catch (err) {
          console.warn('⚠️ audit_logs table does not exist or error:', err)
          logs = []
        }

        await logAdminAction(admin.fid, 'view_logs', { page: logPage, limit: logLimit, adminFilter }, request)

        return NextResponse.json({ logs })

      case 'users':
        // Get user statistics
        const { data: users } = await supabaseAdmin
          .from('user_sessions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)

        await logAdminAction(admin.fid, 'view_users', {}, request)

        return NextResponse.json({ users: users || [] })

      case 'system-health':
        // Get system health status
        const systemHealth = await getSystemHealth()
        
        await logAdminAction(admin.fid, 'view_system_health', {}, request)

        return NextResponse.json(systemHealth)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    await logSystemError('Admin GET request failed', {
      action: 'admin_get',
      additionalData: {
        adminFid: admin.fid,
        endpoint: action
      }
    }, error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
    const { action } = body

    switch (action) {
      case 'create-round': {
        const { roundNumber, startTime, endTime, prize, blockNumber, duration } = body
        
        if (!roundNumber || !startTime || !endTime || !prize) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const round = await supabaseDbFixed.createRound({
          roundNumber,
          startTime,
          endTime,
          prize,
          blockNumber,
          duration
        })

        if (!round) {
          return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
        }

        // Log admin action
        const { error: logError } = await (supabaseAdmin as any)
          .from('audit_logs')
          .insert({
            admin_fid: admin.fid,
            action: 'create_round',
            details: { roundId: round.id, roundNumber, prize },
            created_at: Date.now()
          })
        
        if (logError) {
          console.error('Failed to log admin action:', logError)
        }

        return NextResponse.json({ success: true, round })
      }

      case 'end-round': {
        const { roundId } = body
        
        if (!roundId) {
          return NextResponse.json({ error: 'Missing roundId' }, { status: 400 })
        }

        const success = await supabaseDbFixed.endRound(roundId)

        if (!success) {
          return NextResponse.json({ error: 'Failed to end round' }, { status: 500 })
        }

        // Log admin action
        const { error: logError2 } = await (supabaseAdmin as any)
          .from('audit_logs')
          .insert({
            admin_fid: admin.fid,
            action: 'end_round',
            details: { roundId },
            created_at: Date.now()
          })
        
        if (logError2) {
          console.error('Failed to log admin action:', logError2)
        }

        return NextResponse.json({ success: true })
      }

      case 'update-round-result': {
        const { roundId, actualTxCount, blockHash, winningAddress } = body
        
        if (!roundId || !actualTxCount || !blockHash || !winningAddress) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        await supabaseDbFixed.updateRoundResult(roundId, actualTxCount, blockHash, winningAddress)

        // Log admin action
        const { error: logError3 } = await (supabaseAdmin as any)
          .from('audit_logs')
          .insert({
            admin_fid: admin.fid,
            action: 'update_round_result',
            details: { roundId, actualTxCount, blockHash, winningAddress },
            created_at: Date.now()
          })
        
        if (logError3) {
          console.error('Failed to log admin action:', logError3)
        }

        return NextResponse.json({ success: true })
      }

      case 'update-prize-config': {
        const { jackpotAmount, firstPlaceAmount, secondPlaceAmount, currencyType, tokenContractAddress } = body
        
        if (!jackpotAmount || !firstPlaceAmount || !secondPlaceAmount || !currencyType) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const config = await supabaseDbFixed.updatePrizeConfiguration({
          jackpotAmount,
          firstPlaceAmount,
          secondPlaceAmount,
          currencyType,
          tokenContractAddress: tokenContractAddress || '0x0000000000000000000000000000000000000000'
        })

        if (!config) {
          return NextResponse.json({ error: 'Failed to update prize configuration' }, { status: 500 })
        }

        // Log admin action
        const { error: logError4 } = await (supabaseAdmin as any)
          .from('audit_logs')
          .insert({
            admin_fid: admin.fid,
            action: 'update_prize_config',
            details: { config },
            created_at: Date.now()
          })
        
        if (logError4) {
          console.error('Failed to log admin action:', logError4)
        }

        return NextResponse.json({ success: true, config })
      }

      case 'batch-create-rounds': {
        const { rounds } = body
        
        if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
          return NextResponse.json({ error: 'Invalid rounds array' }, { status: 400 })
        }

        const results = []
        
        for (const roundData of rounds) {
          const { roundNumber, startTime, endTime, prize, blockNumber, duration } = roundData
          
          if (!roundNumber || !startTime || !endTime || !prize) {
            results.push({ success: false, error: 'Missing required fields', roundNumber })
            continue
          }

          try {
            const round = await supabaseDbFixed.createRound({
              roundNumber,
              startTime,
              endTime,
              prize,
              blockNumber,
              duration
            })

            if (round) {
              results.push({ success: true, round, roundNumber })
            } else {
              results.push({ success: false, error: 'Failed to create round', roundNumber })
            }
          } catch (error) {
            results.push({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              roundNumber
            })
          }
        }

        await logAdminAction(admin.fid, 'batch_create_rounds', {
          requested: rounds.length,
          successful: results.filter(r => r.success).length
        }, request)

        return NextResponse.json({ results })
      }

      case 'batch-end-rounds': {
        const { roundIds } = body
        
        if (!roundIds || !Array.isArray(roundIds) || roundIds.length === 0) {
          return NextResponse.json({ error: 'Invalid roundIds array' }, { status: 400 })
        }

        const results = []
        
        for (const roundId of roundIds) {
          try {
            const success = await supabaseDbFixed.endRound(roundId)
            results.push({ roundId, success })
          } catch (error) {
            results.push({
              roundId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }

        await logAdminAction(admin.fid, 'batch_end_rounds', {
          requested: roundIds.length,
          successful: results.filter(r => r.success).length
        }, request)

        return NextResponse.json({ results })
      }

      case 'delete-error-logs': {
        // Check if admin has delete permissions
        if (!admin.permissions?.includes('delete')) {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }

        const { olderThan } = body // Date string or number of days
        
        if (!olderThan) {
          return NextResponse.json({ error: 'Missing olderThan parameter' }, { status: 400 })
        }

        let cutoffDate: Date
        if (typeof olderThan === 'string') {
          cutoffDate = new Date(olderThan)
        } else {
          cutoffDate = new Date(Date.now() - olderThan * 24 * 60 * 60 * 1000)
        }

        try {
          const { error } = await supabaseAdmin
            .from('error_logs')
            .delete()
            .lt('created_at', cutoffDate.toISOString())

          if (error) throw error
        } catch (err) {
          console.warn('⚠️ error_logs table does not exist or error:', err)
          return NextResponse.json({ error: 'error_logs table not available' }, { status: 400 })
        }

        await logAdminAction(admin.fid, 'delete_error_logs', { cutoffDate: cutoffDate.toISOString() }, request)

        return NextResponse.json({ success: true })
      }

      case 'export-data': {
        const { dataType, format } = body
        
        if (!dataType || !format) {
          return NextResponse.json({ error: 'Missing dataType or format parameter' }, { status: 400 })
        }

        let data = []
        
        switch (dataType) {
          case 'rounds':
            const { data: roundsData } = await supabaseAdmin
              .from('rounds')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(1000)
            data = roundsData || []
            break
            
          case 'guesses':
            const { data: guessesData } = await supabaseAdmin
              .from('guesses')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(5000)
            data = guessesData || []
            break
            
          case 'users':
            const { data: usersData } = await supabaseAdmin
              .from('user_sessions')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(1000)
            data = usersData || []
            break
            
          default:
            return NextResponse.json({ error: 'Invalid dataType' }, { status: 400 })
        }

        await logAdminAction(admin.fid, 'export_data', { dataType, format, count: data.length }, request)

        if (format === 'csv') {
          // Simple CSV conversion (would use a proper CSV library in production)
          const headers = Object.keys(data[0] || {})
          const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
          ].join('\n')

          return new NextResponse(csvContent, {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="${dataType}-${new Date().toISOString().split('T')[0]}.csv"`
            }
          })
        }

        return NextResponse.json({ data })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    await logSystemError('Admin POST request failed', {
      action: 'admin_post',
      additionalData: {
        adminFid: admin.fid,
        endpoint: body?.action || 'unknown'
      }
    }, error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper function to get system health status
async function getSystemHealth() {
  try {
    const [
      dbHealth,
      recentErrors,
      activeConnections,
      externalApiHealth
    ] = await Promise.all([
      // Check database connectivity
      supabaseAdmin.from('rounds').select('id').limit(1),
      // Get recent error count
      supabaseAdmin.from('error_logs').select('id', { count: 'exact' }).gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      // Mock active connections (would come from WebSocket server in production)
      Promise.resolve(25),
      // Check external API health
      Promise.all([
        fetch('https://mempool.space/api/blocks?type=hour', { method: 'HEAD', signal: AbortSignal.timeout(5000) })
          .then(r => ({ api: 'mempool', status: r.ok ? 'healthy' : 'unhealthy' }))
          .catch(() => ({ api: 'mempool', status: 'unhealthy' })),
        fetch('https://api.farcaster.xyz/v2/casts', { method: 'HEAD', signal: AbortSignal.timeout(5000) })
          .then(r => ({ api: 'farcaster', status: r.ok ? 'healthy' : 'unhealthy' }))
          .catch(() => ({ api: 'farcaster', status: 'unhealthy' }))
      ])
    ])

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbHealth.error ? 'unhealthy' : 'healthy',
      recentErrors: recentErrors.count || 0,
      activeConnections,
      externalApis: externalApiHealth.reduce((acc, api) => {
        acc[api.api] = api.status
        return acc
      }, {} as Record<string, string>)
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
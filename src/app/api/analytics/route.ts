import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-client'
import { supabaseDbFixed } from '../../../lib/supabase-db-fixed'
import { logSystemError } from '../../../lib/error-handling'
import PerformanceMonitor from '../../../lib/performance'

/**
 * Analytics API for application metrics and performance data
 * 
 * GET /api/analytics?action=overview
 * GET /api/analytics?action=performance&period=7d
 * GET /api/analytics?action=user-stats&period=30d
 * GET /api/analytics?action=round-stats&period=30d
 * 
 * All endpoints require admin authentication
 */

async function verifyAdmin(request: NextRequest): Promise<{ fid: string } | null> {
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

    // Check if user is admin
    const isAdmin = await supabaseDbFixed.isAdmin(payload.sub.toString())
    
    if (!isAdmin) {
      return null
    }

    return { fid: payload.sub.toString() }
  } catch (error) {
    console.error('Admin verification failed:', error)
    return null
  }
}

function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date()
  const startDate = new Date()

  switch (period) {
    case '1d':
      startDate.setDate(endDate.getDate() - 1)
      break
    case '7d':
      startDate.setDate(endDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(endDate.getDate() - 30)
      break
    case '90d':
      startDate.setDate(endDate.getDate() - 90)
      break
    default:
      startDate.setDate(endDate.getDate() - 7)
  }

  return { startDate, endDate }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const monitor = PerformanceMonitor.getInstance()
  
  return await monitor.measureFunction('api_analytics_get', async () => {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const period = searchParams.get('period') || '7d'

    try {
      switch (action) {
      case 'overview': {
        // Get overall application statistics
        const [
          totalRounds,
          activeRounds,
          totalGuesses,
          totalUsers,
          totalPrizes,
          recentActivity
        ] = await Promise.all([
          supabaseAdmin.from('rounds').select('id', { count: 'exact' }),
          supabaseAdmin.from('rounds').select('id', { count: 'exact' }).eq('status', 'active'),
          supabaseAdmin.from('guesses').select('id', { count: 'exact' }),
          supabaseAdmin.from('user_sessions').select('fid', { count: 'exact' }),
          supabaseAdmin.from('rounds').select('prize_pool').eq('status', 'finished'),
          getRecentActivity(7)
        ])

        const totalPrizeAmount = totalPrizes.data?.reduce((sum, round) => sum + (round.prize_pool || 0), 0) || 0

        return NextResponse.json({
          overview: {
            totalRounds: totalRounds.count || 0,
            activeRounds: activeRounds.count || 0,
            totalGuesses: totalGuesses.count || 0,
            totalUsers: totalUsers.count || 0,
            totalPrizeAmount,
            recentActivity
          }
        })
      }

      case 'performance': {
        // Get performance metrics
        const { startDate, endDate } = getDateRange(period)
        
        const [
          errorRate,
          avgResponseTime,
          uptime,
          apiCalls,
          clientMetrics
        ] = await Promise.all([
          getErrorRate(startDate, endDate),
          getAverageResponseTime(startDate, endDate),
          getUptime(startDate, endDate),
          getApiCallCount(startDate, endDate),
          getClientPerformanceMetrics(period)
        ])

        return NextResponse.json({
          performance: {
            period,
            errorRate,
            avgResponseTime,
            uptime,
            apiCalls,
            clientMetrics
          }
        })
      }

      case 'user-stats': {
        // Get user statistics
        const { startDate, endDate } = getDateRange(period)
        
        const [
          newUsers,
          activeUsers,
          topUsers,
          userRetention
        ] = await Promise.all([
          getNewUsers(startDate, endDate),
          getActiveUsers(startDate, endDate),
          getTopUsers(10),
          getUserRetention(period)
        ])

        return NextResponse.json({
          userStats: {
            period,
            newUsers,
            activeUsers,
            topUsers,
            userRetention
          }
        })
      }

      case 'round-stats': {
        // Get round statistics
        const { startDate, endDate } = getDateRange(period)
        
        const [
          roundsByStatus,
          averageParticipation,
          prizeDistribution,
          roundDuration
        ] = await Promise.all([
          getRoundsByStatus(startDate, endDate),
          getAverageParticipation(startDate, endDate),
          getPrizeDistribution(startDate, endDate),
          getAverageRoundDuration(startDate, endDate)
        ])

        return NextResponse.json({
          roundStats: {
            period,
            roundsByStatus,
            averageParticipation,
            prizeDistribution,
            roundDuration
          }
        })
      }

      case 'real-time': {
        // Get real-time metrics
        const [
          currentRound,
          onlineUsers,
          recentGuesses,
          systemHealth
        ] = await Promise.all([
          supabaseDbFixed.getActiveRound(),
          getOnlineUsers(),
          getRecentGuesses(10),
          getSystemHealth()
        ])

        return NextResponse.json({
          realTime: {
            currentRound,
            onlineUsers,
            recentGuesses,
            systemHealth,
            timestamp: new Date().toISOString()
          }
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
      }
    } catch (error) {
      logSystemError('Analytics API error', {
        action: 'analytics_get',
        userId: admin.fid,
        additionalData: { action, period, error: (error as Error).message }
      }, error as Error)
      
      return NextResponse.json(
        { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
  })
}

// Helper functions for analytics data
async function getRecentActivity(days: number) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data } = await supabaseAdmin
    .from('rounds')
    .select('created_at, status, prize_pool')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  return data || []
}

async function getErrorRate(startDate: Date, endDate: Date): Promise<number> {
  // This would typically query an error logs table
  // For now, return a mock value
  return 0.02 // 2% error rate
}

async function getAverageResponseTime(startDate: Date, endDate: Date): Promise<number> {
  // This would typically query performance monitoring data
  // For now, return a mock value
  return 150 // 150ms average response time
}

async function getUptime(startDate: Date, endDate: Date): Promise<number> {
  // This would typically calculate uptime from monitoring data
  // For now, return a mock value
  return 99.9 // 99.9% uptime
}

async function getApiCallCount(startDate: Date, endDate: Date): Promise<number> {
  // This would typically query API access logs
  // For now, return a mock value
  return 15000 // 15,000 API calls
}

async function getNewUsers(startDate: Date, endDate: Date): Promise<number> {
  const { count } = await supabaseAdmin
    .from('user_sessions')
    .select('fid', { count: 'exact' })
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  return count || 0
}

async function getActiveUsers(startDate: Date, endDate: Date): Promise<number> {
  const { data } = await supabaseAdmin
    .from('guesses')
    .select('user_fid')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  // Count unique users
  const uniqueUsers = new Set(data?.map(guess => guess.user_fid) || [])
  return uniqueUsers.size
}

async function getTopUsers(limit: number) {
  const { data } = await supabaseAdmin
    .from('guesses')
    .select('user_fid')
    .limit(1000) // Get a larger sample for accurate counting

  // Count guesses per user
  const userCounts = data?.reduce((acc, guess) => {
    acc[guess.user_fid] = (acc[guess.user_fid] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  // Sort and return top users
  return Object.entries(userCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([user_fid, count]) => ({ user_fid, count }))
}

async function getUserRetention(period: string): Promise<number> {
  // This would typically calculate retention based on user activity over time
  // For now, return a mock value
  return 0.75 // 75% retention rate
}

async function getRoundsByStatus(startDate: Date, endDate: Date) {
  const { data } = await supabaseAdmin
    .from('rounds')
    .select('status')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  const statusCounts = data?.reduce((acc, round) => {
    acc[round.status] = (acc[round.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return statusCounts || {}
}

async function getAverageParticipation(startDate: Date, endDate: Date): Promise<number> {
  const { data } = await supabaseAdmin
    .from('rounds')
    .select('id')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (!data || data.length === 0) return 0

  const totalParticipation = await Promise.all(
    data.map(async (round) => {
      const { count } = await supabaseAdmin
        .from('guesses')
        .select('id', { count: 'exact' })
        .eq('round_id', round.id)

      return count || 0
    })
  )

  return totalParticipation.reduce((sum, count) => sum + count, 0) / data.length
}

async function getPrizeDistribution(startDate: Date, endDate: Date) {
  const { data } = await supabaseAdmin
    .from('rounds')
    .select('prize_pool')
    .eq('status', 'finished')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  const prizes = data?.map(round => round.prize_pool || 0) || []
  
  return {
    total: prizes.reduce((sum, prize) => sum + prize, 0),
    average: prizes.length > 0 ? prizes.reduce((sum, prize) => sum + prize, 0) / prizes.length : 0,
    min: prizes.length > 0 ? Math.min(...prizes) : 0,
    max: prizes.length > 0 ? Math.max(...prizes) : 0
  }
}

async function getAverageRoundDuration(startDate: Date, endDate: Date): Promise<number> {
  // This would typically calculate average round duration from start/end times
  // For now, return a mock value
  return 3600 // 1 hour in seconds
}

async function getOnlineUsers(): Promise<number> {
  // This would typically check active sessions or websocket connections
  // For now, return a mock value
  return 25
}

async function getRecentGuesses(limit: number) {
  const { data } = await supabaseAdmin
    .from('guesses')
    .select('user_fid, guess_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}

async function getSystemHealth() {
  return {
    database: 'healthy',
    api: 'healthy',
    websocket: 'healthy',
    externalApis: {
      mempool: 'healthy',
      farcaster: 'healthy'
    }
  }
}

// Get client-side performance metrics
async function getClientPerformanceMetrics(period: string) {
  const monitor = PerformanceMonitor.getInstance()
  const { startDate, endDate } = getDateRange(period)
  const timeRangeMs = endDate.getTime() - startDate.getTime()
  
  // Get performance metrics from the monitor
  const pageLoadStats = monitor.getMetricStats('page_load_time', timeRangeMs)
  const apiCallStats = monitor.getMetricStats('api_call_duration', timeRangeMs)
  const memoryStats = monitor.getMetricStats('memory_used', timeRangeMs)
  const longTaskStats = monitor.getMetricStats('long_task_duration', timeRangeMs)
  
  // Get performance summary
  const summary = monitor.getSummary()
  
  return {
    pageLoadTime: pageLoadStats || { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
    apiCallTime: apiCallStats || { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
    memoryUsage: memoryStats || { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
    longTasks: longTaskStats || { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
    summary
  }
}

// POST endpoint to record client-side performance metrics
export async function POST(request: NextRequest): Promise<NextResponse> {
  const monitor = PerformanceMonitor.getInstance()
  
  return await monitor.measureFunction('api_analytics_post', async () => {
    try {
      const body = await request.json()
      const { metrics, events } = body
      
      // Record performance metrics from client
      if (metrics && Array.isArray(metrics)) {
        metrics.forEach((metric: any) => {
          monitor.recordMetric({
            name: metric.name,
            value: metric.value,
            unit: metric.unit || 'ms',
            timestamp: metric.timestamp || Date.now(),
            tags: metric.tags || {}
          })
        })
      }
      
      // Record analytics events
      if (events && Array.isArray(events)) {
        for (const event of events) {
          try {
            const { error } = await supabaseAdmin
              .from('analytics_events')
              .insert({
                event: event.name,
                data: event.data,
                user_fid: event.userId,
                created_at: new Date(event.timestamp || Date.now()).toISOString()
              })
            
            if (error) {
              logSystemError('Failed to record analytics event', {
                action: 'analytics_record',
                additionalData: { error: error.message, event }
              }, new Error(error.message))
            }
          } catch (err) {
            console.warn('⚠️ analytics_events table does not exist or error:', err)
          }
        }
      }
      
      // Record API call metric
      monitor.recordMetric({
        name: 'analytics_api_post',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        tags: {
          metricsCount: metrics?.length || 0,
          eventsCount: events?.length || 0
        }
      })
      
      return NextResponse.json({
        success: true,
        message: 'Analytics data recorded'
      })
      
    } catch (error) {
      logSystemError('Failed to record analytics data', {
        action: 'analytics_post',
        additionalData: { error: (error as Error).message }
      }, error as Error)
      
      return NextResponse.json(
        { error: 'Failed to record analytics data' },
        { status: 500 }
      )
    }
  })
}
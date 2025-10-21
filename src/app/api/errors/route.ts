import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ErrorLogEntry {
  id: string
  message: string
  category: string
  severity: string
  context: Record<string, any>
  stack?: string
  created_at: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
  // Rate limiting check
  const clientIP = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown'
  const rateLimitKey = `error_log_${clientIP}`
    
    // Check if we have a rate limit stored (in a real app, you'd use Redis)
    // For now, we'll just log the error directly
    
    const errorData = await request.json()
    
    // Validate required fields
    if (!errorData.id || !errorData.message || !errorData.category || !errorData.severity) {
      return NextResponse.json(
        { error: 'Missing required error fields' },
        { status: 400 }
      )
    }

    // Sanitize and prepare the error data
    const sanitizedError: ErrorLogEntry = {
      id: errorData.id,
      message: errorData.message.substring(0, 1000), // Limit message length
      category: errorData.category,
      severity: errorData.severity,
      context: {
        ...errorData.context,
        // Sanitize context data
        userAgent: errorData.context?.userAgent?.substring(0, 500) || null,
        url: errorData.context?.url?.substring(0, 1000) || null,
        additionalData: errorData.context?.additionalData || {}
      },
      stack: errorData.stack?.substring(0, 5000) || null, // Limit stack trace length
      created_at: new Date().toISOString()
    }

    // Store error in Supabase
    const { error: dbError } = await supabase
      .from('error_logs')
      .insert([sanitizedError])

    if (dbError) {
      console.error('Failed to store error in database:', dbError)
      // Don't expose database errors to client
      return NextResponse.json(
        { error: 'Failed to log error' },
        { status: 500 }
      )
    }

    // Log to console for debugging
    console.error('Error logged:', {
      id: sanitizedError.id,
      message: sanitizedError.message,
      category: sanitizedError.category,
      severity: sanitizedError.severity
    })

    // For critical errors, you might want to send notifications
    if (sanitizedError.severity === 'critical') {
      await sendCriticalErrorNotification(sanitizedError)
    }

    return NextResponse.json({ 
      success: true, 
      errorId: sanitizedError.id 
    })

  } catch (error) {
    console.error('Error logging service error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // This endpoint should be protected and only accessible by admins
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const severity = searchParams.get('severity')
    const category = searchParams.get('category')

    // Build query
    let query = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    // Add filters if provided
    if (severity) {
      query = query.eq('severity', severity)
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch error logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch error logs' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      errors: data || [],
      total: data?.length || 0
    })

  } catch (error) {
    console.error('Error fetching logs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to send notifications for critical errors
async function sendCriticalErrorNotification(error: ErrorLogEntry): Promise<void> {
  try {
    // In a real implementation, you might send:
    // - Slack notifications
    // - Email alerts
    // - PagerDuty alerts
    // - Discord messages
    
    console.error('🚨 CRITICAL ERROR DETECTED:', {
      id: error.id,
      message: error.message,
      category: error.category,
      context: error.context,
      timestamp: error.created_at
    })

    // Example: Send to webhook (implement as needed)
    // await fetch(process.env.CRITICAL_ERROR_WEBHOOK_URL!, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     text: `🚨 Critical Error: ${error.message}`,
    //     attachments: [{
    //       fields: [
    //         { title: 'Error ID', value: error.id, short: true },
    //         { title: 'Category', value: error.category, short: true },
    //         { title: 'Severity', value: error.severity, short: true },
    //         { title: 'URL', value: error.context.url || 'N/A', short: true }
    //       ]
    //     }]
    //   })
    // })
  } catch (notificationError) {
    console.error('Failed to send critical error notification:', notificationError)
  }
}
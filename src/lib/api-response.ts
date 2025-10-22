// Centralized API response format utility
// Created: 2025-10-22
// Purpose: Standardize error and success responses across the application

// Standard API response structure
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
    category?: 'network' | 'database' | 'authentication' | 'validation' | 'system' | 'user_interface' | 'business_logic'
    severity?: 'low' | 'medium' | 'high' | 'critical'
    timestamp?: number
    requestId?: string
  }
  meta?: {
    timestamp: number
    requestId: string
    version: string
    processingTime?: number
  }
}

// Success response creator
export function createSuccessResponse<T>(
  data: T,
  meta?: Partial<ApiResponse['meta']>
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      requestId: generateRequestId(),
      version: '1.0',
      ...meta
    }
  }
}

// Error response creator
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  category?: ApiResponse['error']['category'],
  severity?: ApiResponse['error']['severity']
): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      category: category || 'system',
      severity: severity || 'medium',
      timestamp: Date.now(),
      requestId: generateRequestId()
    },
    meta: {
      timestamp: Date.now(),
      requestId: generateRequestId(),
      version: '1.0'
    }
  }
}

// Database error response creator
export function createDatabaseErrorResponse(
  error: any,
  operation?: string
): ApiResponse {
  const code = error?.code || 'DATABASE_ERROR'
  const message = error?.message || 'Database operation failed'
  
  return createErrorResponse(
    `DB_${code}`,
    `${operation ? `${operation}: ` : ''}${message}`,
    {
      originalError: error,
      operation,
      hint: error?.hint,
      details: error?.details
    },
    'database',
    error?.severity || 'high'
  )
}

// Authentication error response creator
export function createAuthErrorResponse(
  message: string = 'Authentication failed',
  details?: any
): ApiResponse {
  return createErrorResponse(
    'AUTH_ERROR',
    message,
    details,
    'authentication',
    'high'
  )
}

// Validation error response creator
export function createValidationErrorResponse(
  field: string,
  message: string,
  value?: any
): ApiResponse {
  return createErrorResponse(
    'VALIDATION_ERROR',
    `${field}: ${message}`,
    { field, value },
    'validation',
    'medium'
  )
}

// Network error response creator
export function createNetworkErrorResponse(
  error: any,
  url?: string
): ApiResponse {
  return createErrorResponse(
    'NETWORK_ERROR',
    error?.message || 'Network request failed',
    {
      url,
      status: error?.status,
      statusText: error?.statusText,
      timeout: error?.code === 'ECONNABORTED'
    },
    'network',
    'medium'
  )
}

// Business logic error response creator
export function createBusinessLogicErrorResponse(
  code: string,
  message: string,
  details?: any
): ApiResponse {
  return createErrorResponse(
    `BUSINESS_${code}`,
    message,
    details,
    'business_logic',
    'medium'
  )
}

// Rate limit error response creator
export function createRateLimitErrorResponse(
  retryAfter?: number,
  limit?: number
): ApiResponse {
  return createErrorResponse(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please try again later.',
    {
      retryAfter,
      limit,
      retryAfterSeconds: retryAfter
    },
    'system',
    'medium'
  )
}

// Not found error response creator
export function createNotFoundErrorResponse(
  resource: string,
  identifier?: string
): ApiResponse {
  return createErrorResponse(
    'NOT_FOUND',
    `${resource}${identifier ? ` with identifier ${identifier}` : ''} not found`,
    { resource, identifier },
    'validation',
    'low'
  )
}

// Permission denied error response creator
export function createPermissionDeniedErrorResponse(
  action: string,
  resource?: string
): ApiResponse {
  return createErrorResponse(
    'PERMISSION_DENIED',
    `You do not have permission to ${action}${resource ? ` on ${resource}` : ''}`,
    { action, resource },
    'authentication',
    'high'
  )
}

// Server error response creator
export function createServerErrorResponse(
  error: any,
  operation?: string
): ApiResponse {
  return createErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    {
      originalError: error?.message || error,
      operation,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    },
    'system',
    'critical'
  )
}

// Helper function to generate request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

// Helper function to extract error information from various error types
export function extractErrorInfo(error: any): {
  code: string
  message: string
  category: ApiResponse['error']['category']
  severity: ApiResponse['error']['severity']
} {
  // Supabase errors
  if (error?.code?.startsWith('PGRST')) {
    return {
      code: `SUPABASE_${error.code}`,
      message: error.message || 'Supabase operation failed',
      category: 'database',
      severity: 'high'
    }
  }

  // PostgreSQL errors
  if (error?.code?.startsWith('23')) {
    return {
      code: `POSTGRES_${error.code}`,
      message: error.message || 'Database constraint violation',
      category: 'validation',
      severity: 'medium'
    }
  }

  // Network errors
  if (error?.code === 'ECONNABORTED' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
    return {
      code: `NETWORK_${error.code}`,
      message: error.message || 'Network connection failed',
      category: 'network',
      severity: 'medium'
    }
  }

  // Validation errors
  if (error?.name === 'ValidationError' || error?.code === 'VALIDATION_ERROR') {
    return {
      code: 'VALIDATION_ERROR',
      message: error.message || 'Validation failed',
      category: 'validation',
      severity: 'medium'
    }
  }

  // Authentication errors
  if (error?.code === 'AUTH_ERROR' || error?.status === 401) {
    return {
      code: 'AUTH_ERROR',
      message: error.message || 'Authentication failed',
      category: 'authentication',
      severity: 'high'
    }
  }

  // Default fallback
  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'An unexpected error occurred',
    category: 'system',
    severity: 'medium'
  }
}

// Helper function to convert any error to standardized API response
export function errorToApiResponse(error: any, operation?: string): ApiResponse {
  const errorInfo = extractErrorInfo(error)
  
  switch (errorInfo.category) {
    case 'database':
      return createDatabaseErrorResponse(error, operation)
    case 'authentication':
      return createAuthErrorResponse(errorInfo.message, error)
    case 'validation':
      return createValidationErrorResponse('field', errorInfo.message, error)
    case 'network':
      return createNetworkErrorResponse(error)
    case 'business_logic':
      return createBusinessLogicErrorResponse(errorInfo.code, errorInfo.message, error)
    default:
      return createServerErrorResponse(error, operation)
  }
}

// Helper function to log API responses for debugging
export function logApiResponse(response: ApiResponse, endpoint?: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 API Response ${endpoint ? `for ${endpoint}` : ''}:`, {
      success: response.success,
      requestId: response.meta?.requestId,
      timestamp: response.meta?.timestamp,
      processingTime: response.meta?.processingTime,
      hasError: !!response.error,
      errorCode: response.error?.code,
      errorMessage: response.error?.message
    })
  }
}

// Helper function to measure response time
export function measureResponseTime<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<{ result: T; processingTime: number }> {
  const startTime = Date.now()
  
  return operation().then(result => {
    const processingTime = Date.now() - startTime
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ ${operationName || 'Operation'} completed in ${processingTime}ms`)
    }
    
    return { result, processingTime }
  })
}

// Express.js middleware helper (if using Express)
export function createApiResponseHandler(
  handler: (req: any, res: any) => Promise<ApiResponse>
) {
  return async (req: any, res: any) => {
    const startTime = Date.now()
    const requestId = generateRequestId()
    
    try {
      const response = await handler(req, res)
      const processingTime = Date.now() - startTime
      
      // Add processing time to response meta
      if (response.meta) {
        response.meta.processingTime = processingTime
        response.meta.requestId = requestId
      }
      
      logApiResponse(response, req.path)
      
      const statusCode = response.success ? 200 : 
        response.error?.severity === 'critical' ? 500 :
        response.error?.severity === 'high' ? 400 :
        response.error?.category === 'authentication' ? 401 :
        response.error?.category === 'validation' ? 422 : 400
      
      res.status(statusCode).json(response)
    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorResponse = errorToApiResponse(error, req.path)
      
      if (errorResponse.meta) {
        errorResponse.meta.processingTime = processingTime
        errorResponse.meta.requestId = requestId
      }
      
      logApiResponse(errorResponse, req.path)
      
      const statusCode = errorResponse.error?.severity === 'critical' ? 500 : 400
      res.status(statusCode).json(errorResponse)
    }
  }
}
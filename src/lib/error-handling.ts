/**
 * Centralized Error Handling and Logging System
 * Provides structured error handling with different severity levels
 * and integration with monitoring services
 */

import { useCallback } from 'react'

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  USER_INTERFACE = 'user_interface',
  BUSINESS_LOGIC = 'business_logic'
}

export interface ErrorContext {
  userId?: string
  sessionId?: string
  component?: string
  action?: string
  timestamp: number
  url?: string
  userAgent?: string
  additionalData?: Record<string, any>
}

export interface StructuredError {
  id: string
  message: string
  category: ErrorCategory
  severity: ErrorSeverity
  context: ErrorContext
  stack?: string
  originalError?: Error | unknown
}

class ErrorLogger {
  private static instance: ErrorLogger
  private errors: StructuredError[] = []
  private maxErrors = 100 // Keep only last 100 errors in memory
  private shouldLogToConsole = process.env.NODE_ENV === 'development'
  private shouldLogToService = process.env.NEXT_PUBLIC_ERROR_LOGGING === 'true'

  private constructor() {
    // Set up global error handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.handleGlobalError.bind(this))
      window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this))
    }
  }

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger()
    }
    return ErrorLogger.instance
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getContext(): Partial<ErrorContext> {
    if (typeof window === 'undefined') {
      return { timestamp: Date.now() }
    }

    return {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    }
  }

  private handleGlobalError(event: ErrorEvent): void {
    this.logError(
      event.message || 'Unknown error',
      ErrorCategory.SYSTEM,
      ErrorSeverity.HIGH,
      {
        ...this.getContext(),
        component: 'global',
        additionalData: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      },
      event.error
    )
  }

  private handleUnhandledRejection(event: PromiseRejectionEvent): void {
    this.logError(
      'Unhandled promise rejection',
      ErrorCategory.SYSTEM,
      ErrorSeverity.HIGH,
      {
        ...this.getContext(),
        component: 'promise',
        additionalData: {
          reason: event.reason
        }
      },
      event.reason
    )
  }

  public logError(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: Partial<ErrorContext> = {},
    originalError?: Error | unknown
  ): string {
    const errorId = this.generateErrorId()
    const structuredError: StructuredError = {
      id: errorId,
      message,
      category,
      severity,
      context: {
        timestamp: Date.now(),
        ...this.getContext(),
        ...context
      },
      stack: originalError instanceof Error ? originalError.stack : undefined,
      originalError
    }

    // Add to in-memory log
    this.errors.push(structuredError)
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }

    // Log to console in development
    if (this.shouldLogToConsole) {
      this.logErrorToConsole(structuredError)
    }

    // Send to error logging service (if available)
    if (this.shouldLogToService) {
      this.sendToErrorService(structuredError).catch(err => {
        console.error('Failed to send error to logging service:', err)
      })
    }

    // Store in localStorage for debugging
    try {
      const storedErrors = JSON.parse(localStorage.getItem('error_logs') || '[]')
      storedErrors.push(structuredError)
      // Keep only last 50 errors in localStorage
      if (storedErrors.length > 50) {
        storedErrors.splice(0, storedErrors.length - 50)
      }
      localStorage.setItem('error_logs', JSON.stringify(storedErrors))
    } catch (err) {
      console.warn('Failed to store error in localStorage:', err)
    }

    return errorId
  }

  private logErrorToConsole(error: StructuredError): void {
    const { severity, message, category, context, stack } = error
    const emoji = this.getSeverityEmoji(severity)
    
    console.group(`${emoji} [${severity.toUpperCase()}] ${category}: ${message}`)
    console.log('Context:', context)
    if (stack) {
      console.log('Stack trace:', stack)
    }
    console.groupEnd()
  }

  private getSeverityEmoji(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW: return '🟡'
      case ErrorSeverity.MEDIUM: return '🟠'
      case ErrorSeverity.HIGH: return '🔴'
      case ErrorSeverity.CRITICAL: return '💀'
      default: return '⚪'
    }
  }

  private async sendToErrorService(error: StructuredError): Promise<void> {
    try {
      // Only try to send if the API endpoint exists
      const response = await fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(error)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (err) {
      console.error('Failed to send error to service:', err)
      // Don't re-throw to avoid infinite loops
    }
  }

  public getErrors(limit?: number): StructuredError[] {
    return limit ? this.errors.slice(-limit) : [...this.errors]
  }

  public clearErrors(): void {
    this.errors = []
  }

  public getErrorStats(): Record<ErrorSeverity, number> {
    const stats = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0
    }

    this.errors.forEach(error => {
      stats[error.severity]++
    })

    return stats
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance()

// Convenience functions for common error types
export const logNetworkError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.NETWORK, ErrorSeverity.HIGH, context, error)
}

export const logDatabaseError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.DATABASE, ErrorSeverity.HIGH, context, error)
}

export const logAuthError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, context, error)
}

export const logValidationError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, context, error)
}

export const logSystemError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, context, error)
}

export const logUIError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.USER_INTERFACE, ErrorSeverity.LOW, context, error)
}

export const logBusinessError = (message: string, context?: Partial<ErrorContext>, error?: Error | unknown) => {
  return errorLogger.logError(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, context, error)
}

// React Error Boundary Hook
export const useErrorHandler = () => {
  const handleError = useCallback((error: Error | unknown, context?: Partial<ErrorContext>) => {
    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    errorLogger.logError(
      message,
      ErrorCategory.USER_INTERFACE,
      ErrorSeverity.HIGH,
      { ...context, component: 'ReactComponent' },
      error
    )
  }, [])

  return { handleError }
}

// Async Error Wrapper
export const withErrorHandling = async <T>(
  asyncFn: () => Promise<T>,
  context: Partial<ErrorContext>,
  category: ErrorCategory = ErrorCategory.SYSTEM,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): Promise<{ data?: T; error?: string; errorId?: string }> => {
  try {
    const data = await asyncFn()
    return { data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown async error'
    const errorId = errorLogger.logError(
      message,
      category,
      severity,
      context,
      error
    )
    return { error: message, errorId }
  }
}
import { useEffect, useRef, useCallback } from 'react'
import { usePerformanceMonitor } from '../lib/performance'
import { logSystemError } from '../lib/error-handling'

// React hook for tracking component performance and user interactions
export function usePerformanceTracking(componentName: string) {
  const monitor = usePerformanceMonitor()
  const renderStartTime = useRef<number | undefined>(undefined)
  const interactionCount = useRef(0)

  // Track component render time
  useEffect(() => {
    renderStartTime.current = performance.now()
    
    return () => {
      if (renderStartTime.current) {
        const renderTime = performance.now() - renderStartTime.current
        monitor.recordMetric({
          name: 'component_render_time',
          value: Math.round(renderTime),
          unit: 'ms',
          timestamp: Date.now(),
          tags: { component: componentName }
        })
      }
    }
  }, [componentName, monitor])

  // Track user interactions
  const trackInteraction = useCallback((action: string, data?: any) => {
    interactionCount.current += 1
    
    monitor.recordMetric({
      name: 'user_interaction',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { 
        component: componentName,
        action,
        interactionCount: interactionCount.current.toString()
      }
    })

    // Log interaction for analytics
    try {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [{
            name: 'user_interaction',
            data: {
              component: componentName,
              action,
              interactionCount: interactionCount.current,
              ...data
            },
            timestamp: Date.now()
          }]
        })
      }).catch(error => {
        logSystemError('Failed to send interaction analytics', {
          action: 'analytics_send',
          additionalData: { componentName, action, error: error.message }
        }, error)
      })
    } catch (error) {
      logSystemError('Error tracking user interaction', {
        action: 'interaction_tracking',
        additionalData: { componentName, action }
      }, error as Error)
    }
  }, [componentName, monitor])

  // Track async operations
  const trackAsyncOperation = useCallback(async <T>(
    operationName: string,
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> => {
    return await monitor.measureFunction(
      `${componentName}_${operationName}`,
      operation,
      { component: componentName, operation: operationName, ...tags }
    )
  }, [componentName, monitor])

  // Track API calls
  const trackApiCall = useCallback(async <T>(
    apiName: string,
    apiCall: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> => {
    return await monitor.measureFunction(
      `api_${apiName}`,
      apiCall,
      { component: componentName, api: apiName, ...tags }
    )
  }, [componentName, monitor])

  // Track form submissions
  const trackFormSubmission = useCallback((
    formName: string,
    formData: any,
    success: boolean,
    error?: Error
  ) => {
    monitor.recordMetric({
      name: 'form_submission',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: {
        component: componentName,
        form: formName,
        success: success.toString()
      }
    })

    // Send to analytics
    try {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [{
            name: 'form_submission',
            data: {
              component: componentName,
              form: formName,
              success,
              error: error?.message,
              fieldCount: Object.keys(formData).length
            },
            timestamp: Date.now()
          }]
        })
      }).catch(error => {
        logSystemError('Failed to send form analytics', {
          action: 'analytics_send',
          additionalData: { componentName, formName, error: error.message }
        }, error)
      })
    } catch (error) {
      logSystemError('Error tracking form submission', {
        action: 'form_tracking',
        additionalData: { componentName, formName }
      }, error as Error)
    }
  }, [componentName, monitor])

  // Track errors
  const trackError = useCallback((error: Error, context?: any) => {
    monitor.recordMetric({
      name: 'component_error',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: {
        component: componentName,
        errorType: error.constructor.name,
        errorMessage: error.message
      }
    })

    logSystemError(`Error in ${componentName}`, {
      action: 'component_error',
      additionalData: { componentName, context, error: error.message }
    }, error)
  }, [componentName, monitor])

  // Track page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      monitor.recordMetric({
        name: 'page_visibility_change',
        value: document.hidden ? 0 : 1,
        unit: 'count',
        timestamp: Date.now(),
        tags: {
          component: componentName,
          state: document.hidden ? 'hidden' : 'visible'
        }
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [componentName, monitor])

  return {
    trackInteraction,
    trackAsyncOperation,
    trackApiCall,
    trackFormSubmission,
    trackError
  }
}

// Hook for tracking page-level performance
export function usePagePerformance(pageName: string) {
  const monitor = usePerformanceMonitor()

  useEffect(() => {
    // Track page load time
    const trackPageLoad = () => {
      if (typeof window !== 'undefined' && 'performance' in window) {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        
        if (navigation) {
          const loadTime = navigation.loadEventEnd - navigation.loadEventStart
          const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart
          
          monitor.recordMetric({
            name: 'page_load_time',
            value: Math.round(loadTime),
            unit: 'ms',
            timestamp: Date.now(),
            tags: { page: pageName }
          })

          monitor.recordMetric({
            name: 'dom_content_loaded_time',
            value: Math.round(domContentLoaded),
            unit: 'ms',
            timestamp: Date.now(),
            tags: { page: pageName }
          })

          // Send to analytics
          fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              metrics: [
                {
                  name: 'page_load_time',
                  value: Math.round(loadTime),
                  unit: 'ms',
                  timestamp: Date.now(),
                  tags: { page: pageName }
                },
                {
                  name: 'dom_content_loaded_time',
                  value: Math.round(domContentLoaded),
                  unit: 'ms',
                  timestamp: Date.now(),
                  tags: { page: pageName }
                }
              ]
            })
          }).catch(error => {
            logSystemError('Failed to send page load metrics', {
              action: 'analytics_send',
              additionalData: { pageName, error: error.message }
            }, error)
          })
        }
      }
    }

    // Track page load after a short delay to ensure metrics are available
    const timer = setTimeout(trackPageLoad, 1000)
    return () => clearTimeout(timer)
  }, [pageName, monitor])

  // Track route changes
  const trackRouteChange = useCallback((from: string, to: string) => {
    monitor.recordMetric({
      name: 'route_change',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { from, to, page: pageName }
    })

    // Send to analytics
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{
          name: 'route_change',
          data: { from, to, page: pageName },
          timestamp: Date.now()
        }]
      })
    }).catch(error => {
      logSystemError('Failed to send route change analytics', {
        action: 'analytics_send',
        additionalData: { pageName, from, to, error: error.message }
      }, error)
    })
  }, [pageName, monitor])

  return {
    trackRouteChange
  }
}

// Hook for tracking real-time connection performance
export function useRealtimePerformance() {
  const monitor = usePerformanceMonitor()
  const connectionStartTime = useRef<number | undefined>(undefined)
  const reconnectCount = useRef(0)

  const trackConnectionStart = useCallback(() => {
    connectionStartTime.current = performance.now()
  }, [])

  const trackConnectionEstablished = useCallback(() => {
    if (connectionStartTime.current) {
      const connectionTime = performance.now() - connectionStartTime.current
      
      monitor.recordMetric({
        name: 'realtime_connection_time',
        value: Math.round(connectionTime),
        unit: 'ms',
        timestamp: Date.now()
      })
    }
  }, [monitor])

  const trackConnectionLost = useCallback(() => {
    monitor.recordMetric({
      name: 'realtime_connection_lost',
      value: 1,
      unit: 'count',
      timestamp: Date.now()
    })
  }, [monitor])

  const trackReconnection = useCallback(() => {
    reconnectCount.current += 1
    
    monitor.recordMetric({
      name: 'realtime_reconnection',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { attemptCount: reconnectCount.current.toString() }
    })
  }, [monitor])

  const trackMessageReceived = useCallback((messageType: string, messageSize: number) => {
    monitor.recordMetric({
      name: 'realtime_message_received',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { type: messageType }
    })

    monitor.recordMetric({
      name: 'realtime_message_size',
      value: messageSize,
      unit: 'bytes',
      timestamp: Date.now(),
      tags: { type: messageType }
    })
  }, [monitor])

  const trackMessageSent = useCallback((messageType: string, messageSize: number) => {
    monitor.recordMetric({
      name: 'realtime_message_sent',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { type: messageType }
    })

    monitor.recordMetric({
      name: 'realtime_message_size_sent',
      value: messageSize,
      unit: 'bytes',
      timestamp: Date.now(),
      tags: { type: messageType }
    })
  }, [monitor])

  return {
    trackConnectionStart,
    trackConnectionEstablished,
    trackConnectionLost,
    trackReconnection,
    trackMessageReceived,
    trackMessageSent
  }
}
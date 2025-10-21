import { logSystemError } from './error-handling'

// Performance monitoring utilities for Bitcoin Blocks Mini App

interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'bytes' | 'count' | 'percent'
  timestamp: number
  tags?: Record<string, string>
}

interface PerformanceEntry {
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, any>
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetric[] = []
  private entries: Map<string, PerformanceEntry> = new Map()
  private observers: PerformanceObserver[] = []

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  // Start timing an operation
  startTimer(name: string, metadata?: Record<string, any>): void {
    this.entries.set(name, {
      name,
      startTime: performance.now(),
      metadata
    })
  }

  // End timing an operation and record the duration
  endTimer(name: string, tags?: Record<string, string>): number | null {
    const entry = this.entries.get(name)
    if (!entry) {
      console.warn(`Timer '${name}' was not started`)
      return null
    }

    const endTime = performance.now()
    const duration = endTime - entry.startTime

    this.recordMetric({
      name: `${name}_duration`,
      value: Math.round(duration),
      unit: 'ms',
      timestamp: Date.now(),
      tags: {
        ...entry.metadata,
        ...tags
      }
    })

    this.entries.delete(name)
    return duration
  }

  // Record a custom metric
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric)
    
    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }

    // Log significant metrics
    if (metric.value > (metric.unit === 'ms' ? 1000 : metric.unit === 'percent' ? 90 : 1000000)) {
      logSystemError(`High ${metric.name} detected`, {
        action: 'performance_alert',
        additionalData: {
          metric: metric.name,
          value: metric.value,
          unit: metric.unit,
          tags: metric.tags
        }
      }, new Error(`Performance threshold exceeded: ${metric.name} = ${metric.value}${metric.unit}`))
    }
  }

  // Measure function execution time
  async measureFunction<T>(
    name: string,
    fn: () => Promise<T> | T,
    tags?: Record<string, string>
  ): Promise<T> {
    this.startTimer(name, tags)
    
    try {
      const result = await fn()
      this.endTimer(name, { ...tags, success: 'true' })
      return result
    } catch (error) {
      this.endTimer(name, { ...tags, success: 'false', error: (error as Error).message })
      throw error
    }
  }

  // Get metrics by name
  getMetrics(name?: string, limit = 100): PerformanceMetric[] {
    let metrics = this.metrics
    
    if (name) {
      metrics = metrics.filter(m => m.name === name)
    }
    
    return metrics
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  // Get metric statistics
  getMetricStats(name: string, timeRange = 3600000): {
    count: number
    min: number
    max: number
    avg: number
    p50: number
    p95: number
    p99: number
  } | null {
    const now = Date.now()
    const metrics = this.metrics.filter(
      m => m.name === name && m.timestamp > now - timeRange
    )

    if (metrics.length === 0) {
      return null
    }

    const values = metrics.map(m => m.value).sort((a, b) => a - b)
    const count = values.length
    const min = values[0]
    const max = values[count - 1]
    const avg = values.reduce((sum, val) => sum + val, 0) / count
    
    const p50 = values[Math.floor(count * 0.5)]
    const p95 = values[Math.floor(count * 0.95)]
    const p99 = values[Math.floor(count * 0.99)]

    return { count, min, max, avg, p50, p95, p99 }
  }

  // Initialize performance observers
  initializeObservers(): void {
    if (typeof window === 'undefined') return

    // Observe navigation timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming
            
            this.recordMetric({
              name: 'page_load_time',
              value: Math.round(navEntry.loadEventEnd - navEntry.loadEventStart),
              unit: 'ms',
              timestamp: Date.now()
            })

            this.recordMetric({
              name: 'dom_content_loaded',
              value: Math.round(navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart),
              unit: 'ms',
              timestamp: Date.now()
            })
          }
        }
      })
      
      navObserver.observe({ entryTypes: ['navigation'] })
      this.observers.push(navObserver)
    } catch (error) {
      console.warn('Failed to initialize navigation observer:', error)
    }

    // Observe resource timing
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming
            
            this.recordMetric({
              name: 'resource_load_time',
              value: Math.round(resource.responseEnd - resource.requestStart),
              unit: 'ms',
              timestamp: Date.now(),
              tags: {
                resource_type: this.getResourceType(resource.name),
                resource_size: resource.transferSize?.toString() || 'unknown'
              }
            })
          }
        }
      })
      
      resourceObserver.observe({ entryTypes: ['resource'] })
      this.observers.push(resourceObserver)
    } catch (error) {
      console.warn('Failed to initialize resource observer:', error)
    }

    // Observe long tasks
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask') {
            this.recordMetric({
              name: 'long_task_duration',
              value: Math.round(entry.duration),
              unit: 'ms',
              timestamp: Date.now()
            })
          }
        }
      })
      
      longTaskObserver.observe({ entryTypes: ['longtask'] })
      this.observers.push(longTaskObserver)
    } catch (error) {
      console.warn('Failed to initialize long task observer:', error)
    }
  }

  // Get resource type from URL
  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script'
    if (url.includes('.css')) return 'stylesheet'
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.gif') || url.includes('.webp')) return 'image'
    if (url.includes('.woff') || url.includes('.ttf')) return 'font'
    if (url.includes('/api/')) return 'api'
    return 'other'
  }

  // Monitor memory usage (if available)
  monitorMemory(): void {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory
      
      this.recordMetric({
        name: 'memory_used',
        value: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        unit: 'bytes',
        timestamp: Date.now()
      })

      this.recordMetric({
        name: 'memory_total',
        value: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        unit: 'bytes',
        timestamp: Date.now()
      })

      this.recordMetric({
        name: 'memory_limit',
        value: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
        unit: 'bytes',
        timestamp: Date.now()
      })
    }
  }

  // Get performance summary
  getSummary(): {
    metrics: Record<string, any>
    alerts: PerformanceMetric[]
    recommendations: string[]
  } {
    const now = Date.now()
    const recentMetrics = this.metrics.filter(m => m.timestamp > now - 300000) // Last 5 minutes
    
    const summary: Record<string, any> = {}
    const alerts: PerformanceMetric[] = []
    const recommendations: string[] = []

    // Analyze key metrics
    const pageLoadTimes = recentMetrics.filter(m => m.name === 'page_load_time')
    if (pageLoadTimes.length > 0) {
      const avgLoadTime = pageLoadTimes.reduce((sum, m) => sum + m.value, 0) / pageLoadTimes.length
      summary.avgPageLoadTime = Math.round(avgLoadTime)
      
      if (avgLoadTime > 3000) {
        alerts.push(...pageLoadTimes.filter(m => m.value > 3000))
        recommendations.push('Consider optimizing page load performance')
      }
    }

    const apiCallTimes = recentMetrics.filter(m => m.name.includes('_duration') && m.name.includes('api'))
    if (apiCallTimes.length > 0) {
      const avgApiTime = apiCallTimes.reduce((sum, m) => sum + m.value, 0) / apiCallTimes.length
      summary.avgApiTime = Math.round(avgApiTime)
      
      if (avgApiTime > 1000) {
        alerts.push(...apiCallTimes.filter(m => m.value > 1000))
        recommendations.push('API calls are slow, consider optimization')
      }
    }

    const memoryMetrics = recentMetrics.filter(m => m.name === 'memory_used')
    if (memoryMetrics.length > 0) {
      const latestMemory = memoryMetrics[memoryMetrics.length - 1]
      summary.currentMemoryUsage = latestMemory.value
      
      if (latestMemory.value > 50) { // 50MB
        alerts.push(latestMemory)
        recommendations.push('High memory usage detected')
      }
    }

    const longTasks = recentMetrics.filter(m => m.name === 'long_task_duration')
    if (longTasks.length > 0) {
      summary.longTaskCount = longTasks.length
      summary.maxLongTaskDuration = Math.max(...longTasks.map(m => m.value))
      
      if (longTasks.length > 5) {
        recommendations.push('Multiple long tasks detected, consider code optimization')
      }
    }

    return {
      metrics: summary,
      alerts,
      recommendations
    }
  }

  // Cleanup
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
    this.metrics = []
    this.entries.clear()
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance()

  return {
    startTimer: monitor.startTimer.bind(monitor),
    endTimer: monitor.endTimer.bind(monitor),
    measureFunction: monitor.measureFunction.bind(monitor),
    recordMetric: monitor.recordMetric.bind(monitor),
    getMetrics: monitor.getMetrics.bind(monitor),
    getMetricStats: monitor.getMetricStats.bind(monitor),
    getSummary: monitor.getSummary.bind(monitor),
    monitorMemory: monitor.monitorMemory.bind(monitor)
  }
}

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  const monitor = PerformanceMonitor.getInstance()
  monitor.initializeObservers()
  
  // Monitor memory every 30 seconds
  setInterval(() => {
    monitor.monitorMemory()
  }, 30000)
}

export default PerformanceMonitor
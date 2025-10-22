'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { usePerformanceTracking, usePagePerformance } from '../hooks/usePerformanceTracking'
import { useGame } from '../context/GameContext'

interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  status: 'good' | 'warning' | 'critical'
}

interface PerformanceAlert {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
  timestamp: number
  metric?: string
}

export function PerformanceDashboard() {
  const { trackInteraction } = usePerformanceTracking('PerformanceDashboard')
  const { connected } = useGame()
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([])
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  // Fetch performance data
  const fetchPerformanceData = async () => {
    try {
      trackInteraction('fetchPerformanceData')
      
      const response = await fetch('/api/analytics?action=performance&period=1h', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Process metrics
        const processedMetrics: PerformanceMetric[] = []
        
        // Page load time
        if (data.performance?.clientMetrics?.pageLoadTime?.avg) {
          processedMetrics.push({
            name: 'Page Load Time',
            value: Math.round(data.performance.clientMetrics.pageLoadTime.avg),
            unit: 'ms',
            timestamp: Date.now(),
            status: data.performance.clientMetrics.pageLoadTime.avg > 3000 ? 'critical' : 
                     data.performance.clientMetrics.pageLoadTime.avg > 1500 ? 'warning' : 'good'
          })
        }
        
        // API response time
        if (data.performance?.clientMetrics?.apiCallTime?.avg) {
          processedMetrics.push({
            name: 'API Response Time',
            value: Math.round(data.performance.clientMetrics.apiCallTime.avg),
            unit: 'ms',
            timestamp: Date.now(),
            status: data.performance.clientMetrics.apiCallTime.avg > 1000 ? 'critical' : 
                     data.performance.clientMetrics.apiCallTime.avg > 500 ? 'warning' : 'good'
          })
        }
        
        // Memory usage
        if (data.performance?.clientMetrics?.memoryUsage?.avg) {
          processedMetrics.push({
            name: 'Memory Usage',
            value: Math.round(data.performance.clientMetrics.memoryUsage.avg),
            unit: 'MB',
            timestamp: Date.now(),
            status: data.performance.clientMetrics.memoryUsage.avg > 100 ? 'critical' : 
                     data.performance.clientMetrics.memoryUsage.avg > 50 ? 'warning' : 'good'
          })
        }
        
        // Connection health
        processedMetrics.push({
          name: 'Connection Health',
          value: connected ? 100 : 0,
          unit: '%',
          timestamp: Date.now(),
          status: connected ? 'good' : 'critical'
        })
        
        
        setMetrics(processedMetrics)
        
        // Generate alerts from performance summary
        const newAlerts: PerformanceAlert[] = []
        
        if (data.performance?.clientMetrics?.summary?.alerts) {
          data.performance.clientMetrics.summary.alerts.forEach((alert: any, index: number) => {
            newAlerts.push({
              id: `alert-${Date.now()}-${index}`,
              type: alert.value > 3000 ? 'error' : 'warning',
              message: `${alert.name}: ${alert.value}${alert.unit}`,
              timestamp: Date.now(),
              metric: alert.name
            })
          })
        }
        
        
        if (!connected) {
          newAlerts.push({
            id: `connection-${Date.now()}`,
            type: 'error',
            message: 'Database connection lost',
            timestamp: Date.now()
          })
        }
        
        setAlerts(newAlerts.slice(0, 5)) // Keep only latest 5 alerts
        setLastRefresh(Date.now())
      }
    } catch (error) {
      console.error('Failed to fetch performance data:', error)
      trackInteraction('fetchPerformanceDataError', { error: (error as Error).message })
    }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchPerformanceData()
    
    const interval = setInterval(fetchPerformanceData, 30000)
    return () => clearInterval(interval)
  }, [connected])

  const getStatusColor = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'critical': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getAlertIcon = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'info': return 'ℹ️'
      default: return '📊'
    }
  }

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => {
            setIsExpanded(true)
            trackInteraction('openPerformanceDashboard')
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg"
          size="sm"
        >
          📊
        </Button>
        {alerts.length > 0 && (
          <Badge className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full px-1 py-0 text-xs">
            {alerts.length}
          </Badge>
        )}
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-96 overflow-hidden">
      <Card className="shadow-xl border-2">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm font-medium">Performance Monitor</CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={fetchPerformanceData}
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
              >
                🔄
              </Button>
              <Button
                onClick={() => {
                  setIsExpanded(false)
                  trackInteraction('closePerformanceDashboard')
                }}
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
              >
                ✕
              </Button>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Last updated: {new Date(lastRefresh).toLocaleTimeString()}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3 max-h-80 overflow-y-auto">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric, index) => (
              <div key={index} className="bg-gray-50 p-2 rounded">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{metric.name}</span>
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(metric.status)}`} />
                </div>
                <div className="text-lg font-bold">
                  {metric.value}
                  <span className="text-xs text-gray-500 ml-1">{metric.unit}</span>
                </div>
              </div>
            ))}
          </div>
          
          {/* Alerts Section */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-red-600">Alerts</h4>
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-red-50 border border-red-200 p-2 rounded">
                  <div className="flex items-start gap-2">
                    <span>{getAlertIcon(alert.type)}</span>
                    <div className="flex-1">
                      <p className="text-xs text-red-800">{alert.message}</p>
                      <p className="text-xs text-red-600 mt-1">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Connection Status */}
          <div className="bg-gray-50 p-2 rounded">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Database Connection</span>
              <Badge variant={connected ? "default" : "destructive"} className="text-xs">
                {connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          </div>
          
        </CardContent>
      </Card>
    </div>
  )
}
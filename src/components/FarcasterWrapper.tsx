'use client'

import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import { supabaseAuth } from '../lib/supabase-auth'

interface FarcasterWrapperProps {
  children: React.ReactNode
}

export default function FarcasterWrapper({ children }: FarcasterWrapperProps): React.ReactElement {
  const { user, setUser } = useGame()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const initializeFarcaster = async (): Promise<void> => {
      try {
        console.log('🔧 Initializing Farcaster wrapper...')
        
        // Only initialize if user is not already authenticated
        if (!user) {
          const authUser = await supabaseAuth.initializeAuth()
          
          if (authUser) {
            setUser(authUser)
            console.log('✅ User authenticated via Farcaster wrapper:', authUser)
          }
        } else {
          console.log('✅ User already authenticated:', user)
        }
        
        setIsInitializing(false)
      } catch (error) {
        console.error('❌ Error in Farcaster wrapper initialization:', error)
        setIsInitializing(false)
      }
    }

    initializeFarcaster()
  }, [user, setUser])

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Initializing Farcaster...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
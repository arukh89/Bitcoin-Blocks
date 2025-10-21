'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface LoadingScreenProps {}

export function LoadingScreen({}: LoadingScreenProps): React.ReactElement {
  const [progress, setProgress] = useState<number>(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 2
      })
    }, 30)

    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-orange-900"
    >
      <div className="absolute inset-0 overflow-hidden">
        {/* Animated grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 to-transparent"
             style={{
               backgroundImage: `
                 linear-gradient(rgba(255, 120, 0, 0.1) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 120, 0, 0.1) 1px, transparent 1px)
               `,
               backgroundSize: '50px 50px'
             }} />
        
        {/* Floating particles */}
        {typeof window !== 'undefined' && [...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-orange-400 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              opacity: 0
            }}
            animate={{
              y: [null, Math.random() * window.innerHeight],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center space-y-8">
        {/* Bitcoin chain logo animation */}
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.1, 1]
          }}
          transition={{
            rotate: { duration: 3, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity }
          }}
          className="mx-auto w-24 h-24 flex items-center justify-center"
        >
          <div className="text-6xl">🛠️</div>
        </motion.div>

        {/* App title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-5xl font-bold text-white mb-2">
            Bitcoin Blocks
          </h1>
          <p className="text-orange-300 text-lg">Predicting Bitcoin's Future</p>
        </motion.div>

        {/* Progress bar */}
        <div className="w-80 mx-auto">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden backdrop-blur-sm">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <motion.p
            className="text-white text-sm mt-2"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {progress < 30 && "Connecting to blockchain..."}
            {progress >= 30 && progress < 60 && "Loading real-time data..."}
            {progress >= 60 && progress < 90 && "Initializing game state..."}
            {progress >= 90 && "Ready to predict!"}
          </motion.p>
        </div>

        {/* Blockchain blocks animation */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 bg-orange-500 rounded"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2
              }}
            />
          ))}
        </div>
      </div>

    </motion.div>
  )
}

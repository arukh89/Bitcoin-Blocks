'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface CountdownProps {
  endTime: number
  onComplete?: () => void
}

export function Countdown({ endTime, onComplete }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0)

  useEffect(() => {
    const calculateTimeLeft = (): void => {
      const now = Date.now()
      const difference = endTime - now
      setTimeLeft(Math.max(0, difference))

      if (difference <= 0 && onComplete) {
        onComplete()
      }
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 100)

    return () => clearInterval(interval)
  }, [endTime, onComplete])

  const hours = Math.floor(timeLeft / (1000 * 60 * 60))
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)
  const milliseconds = Math.floor((timeLeft % 1000) / 10)

  const isUrgent = timeLeft < 60000 && timeLeft > 0 // Less than 1 minute

  return (
    <div className="flex items-center justify-center gap-2">
      <TimeUnit value={hours} label="H" isUrgent={isUrgent} />
      <Separator isUrgent={isUrgent} />
      <TimeUnit value={minutes} label="M" isUrgent={isUrgent} />
      <Separator isUrgent={isUrgent} />
      <TimeUnit value={seconds} label="S" isUrgent={isUrgent} highlight />
      <Separator isUrgent={isUrgent} />
      <TimeUnit value={milliseconds} label="MS" small isUrgent={isUrgent} />
    </div>
  )
}

interface TimeUnitProps {
  value: number
  label: string
  small?: boolean
  highlight?: boolean
  isUrgent?: boolean
}

function TimeUnit({ value, label, small, highlight, isUrgent }: TimeUnitProps) {
  const displayValue = value.toString().padStart(2, '0')
  
  return (
    <motion.div
      className="flex flex-col items-center"
      animate={isUrgent && highlight ? {
        scale: [1, 1.1, 1],
      } : {}}
      transition={{
        duration: 1,
        repeat: isUrgent && highlight ? Infinity : 0
      }}
    >
      <motion.div
        key={value}
        initial={{ scale: 1.2, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`${
          small ? 'text-base' : 'text-2xl md:text-3xl'
        } font-black tabular-nums ${
          isUrgent 
            ? 'text-red-400' 
            : highlight 
            ? 'text-orange-400' 
            : 'text-white'
        } relative`}
        style={{
          textShadow: isUrgent 
            ? '0 0 10px rgba(239, 68, 68, 0.5)' 
            : highlight 
            ? '0 0 10px rgba(251, 146, 60, 0.5)'
            : '0 0 5px rgba(255, 255, 255, 0.3)'
        }}
      >
        {displayValue}
        
        {/* Glowing effect for urgent state */}
        {isUrgent && (
          <motion.div
            className="absolute inset-0 rounded-lg"
            animate={{
              boxShadow: [
                '0 0 10px rgba(239, 68, 68, 0.5)',
                '0 0 20px rgba(239, 68, 68, 0.8)',
                '0 0 10px rgba(239, 68, 68, 0.5)'
              ]
            }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </motion.div>
      
      <div className={`text-xs mt-1 font-semibold ${
        isUrgent 
          ? 'text-red-300' 
          : 'text-gray-400'
      }`}>
        {label}
      </div>
    </motion.div>
  )
}

function Separator({ isUrgent }: { isUrgent?: boolean }) {
  return (
    <motion.div
      className={`text-2xl font-bold ${isUrgent ? 'text-red-400' : 'text-gray-500'}`}
      animate={isUrgent ? {
        opacity: [1, 0.3, 1]
      } : {}}
      transition={{
        duration: 0.8,
        repeat: isUrgent ? Infinity : 0
      }}
    >
      :
    </motion.div>
  )
}

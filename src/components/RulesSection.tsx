'use client'
import React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from './ui/card'

interface RulesSectionProps {}

export function RulesSection({}: RulesSectionProps): React.ReactElement {
  const rules = [
    {
      emoji: '📦',
      title: 'Goal',
      icon: '🧠',
      description: 'Guess the number of transactions in the next Bitcoin block.'
    },
    {
      emoji: '📦',
      title: 'Winning',
      icon: '🥇',
      description: 'Closest guesses win 1st and 2nd prizes.'
    },
    {
      emoji: '📦',
      title: 'Submissions',
      icon: '🔢',
      description: 'One guess per player. Must be submitted before the block is mined.'
    },
    {
      emoji: '📦',
      title: 'Tie-breaking',
      icon: '⏱',
      description: 'In a tie, the earliest correct guess wins.'
    }
  ]

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-bold text-orange-300 flex items-center gap-2">
        <span>📜</span>
        Rules
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {rules.map((rule, index) => (
          <motion.div
            key={rule.title}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 + index * 0.1 }}
          >
            <Card className="glass-card border border-purple-500/30 h-full hover:border-purple-400/50 transition-all">
              <CardContent className="p-6 text-center space-y-3">
                <div className="text-4xl">{rule.icon}</div>
                <h3 className="text-lg font-bold text-orange-200">{rule.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {rule.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-center"
      >
        <Card className="glass-card-dark border border-blue-500/30 inline-block">
          <CardContent className="py-3 px-6">
            <p className="text-sm text-blue-300">
              📡 Blockchain data pulled from <span className="font-bold text-blue-200">mempool.space</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

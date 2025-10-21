'use client'
import type React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from './ui/card'

interface PrizesAndRulesSectionProps {
  firstPrize?: string
  secondPrize?: string
  currency?: string
}

export function PrizesAndRulesSection({
  firstPrize = '1,000',
  secondPrize = '500',
  currency = '$SECOND'
}: PrizesAndRulesSectionProps): React.ReactElement {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.35 }}
      className="w-full"
    >
      <Card className="glass-card border border-orange-500/30 shadow-3d overflow-hidden">
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Prizes Section - Compact */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
              <span className="text-base">🏆</span>
              Prizes
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {/* 1st Place */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#111111]/50 border border-yellow-500/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">🥇</span>
                  <span className="text-xs font-semibold text-yellow-400">1st</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#EAEAEA]">
                    {firstPrize} <span className="text-green-400 text-xs">{currency}</span>
                  </p>
                </div>
              </div>

              {/* 2nd Place */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#111111]/50 border border-gray-500/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">🥈</span>
                  <span className="text-xs font-semibold text-gray-300">2nd</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#EAEAEA]">
                    {secondPrize} <span className="text-green-400 text-xs">{currency}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700/50" />

          {/* Rules Section - Ultra Compact */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-orange-300 flex items-center gap-1.5">
              <span className="text-base">📜</span>
              Rules
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="text-center p-2 rounded-lg glass-card-dark border border-purple-500/20">
                <div className="text-lg mb-0.5">🧠</div>
                <p className="text-[10px] font-semibold text-orange-200">Guess tx count</p>
              </div>
              <div className="text-center p-2 rounded-lg glass-card-dark border border-purple-500/20">
                <div className="text-lg mb-0.5">🥇</div>
                <p className="text-[10px] font-semibold text-orange-200">Closest wins</p>
              </div>
              <div className="text-center p-2 rounded-lg glass-card-dark border border-purple-500/20">
                <div className="text-lg mb-0.5">🔢</div>
                <p className="text-[10px] font-semibold text-orange-200">One guess/player</p>
              </div>
              <div className="text-center p-2 rounded-lg glass-card-dark border border-purple-500/20">
                <div className="text-lg mb-0.5">⏱</div>
                <p className="text-[10px] font-semibold text-orange-200">Earliest wins ties</p>
              </div>
            </div>
          </div>

          {/* Data Source Badge */}
          <div className="text-center pt-1">
            <div className="inline-block px-3 py-1 rounded-full glass-card-dark border border-blue-500/30">
              <p className="text-[10px] text-blue-300">
                📡 Data: <span className="font-bold text-blue-200">mempool.space</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

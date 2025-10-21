'use client'

import type React from 'react'

interface PrizesSectionProps {
  firstPrize?: string
  secondPrize?: string
  currency?: string
}

export default function PrizesSection({
  firstPrize = '1,000',
  secondPrize = '500',
  currency = '$SECOND'
}: PrizesSectionProps): React.ReactElement {
  return (
    <div className="w-full animate-fade-in">
      <div className="rounded-lg border border-green-500/30 bg-[#1a1a1a]/80 backdrop-blur-sm p-6 shadow-3d">
        <h2 className="text-2xl font-bold text-[#EAEAEA] mb-4 flex items-center gap-2">
          🏆 Prizes This Round
        </h2>
        
        <div className="space-y-3">
          {/* 1st Place */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-[#111111]/50 border border-yellow-500/30 hover:border-yellow-500/50 transition-all shadow-3d-sm hover:shadow-3d-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🥇</span>
              <span className="text-lg font-semibold text-yellow-400">1st Place</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#EAEAEA]">
                {firstPrize} <span className="text-green-400">{currency}</span>
              </p>
            </div>
          </div>

          {/* 2nd Place */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-[#111111]/50 border border-gray-500/30 hover:border-gray-400/50 transition-all shadow-3d-sm hover:shadow-3d-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🥈</span>
              <span className="text-lg font-semibold text-gray-300">2nd Place</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#EAEAEA]">
                {secondPrize} <span className="text-green-400">{currency}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

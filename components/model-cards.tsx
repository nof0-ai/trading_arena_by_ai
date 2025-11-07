"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"

interface BotLeaderboardEntry {
  botId: string
  botName: string
  model: string
  icon: string
  modelImage: string
  color: string
  totalValue: number
  unrealizedPnl: number
  change: number
  totalTradedAmount: number
  isTestnet: boolean
}

export function ModelCards() {
  const [leaderboard, setLeaderboard] = useState<BotLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isInitialLoadRef = useRef(true)

  const loadLeaderboard = async (isInitial = false) => {
    // Only show loading state on initial load
    if (isInitial) {
      setIsLoading(true)
    }

    const response = await fetch("/api/public-bots?type=leaderboard")
    if (response.ok) {
      const data = await response.json()
      setLeaderboard(data.leaderboard || [])
    } else {
      console.error("[ModelCards] Failed to load leaderboard")
      setLeaderboard([])
    }

    // Only clear loading state on initial load
    if (isInitial) {
      setIsLoading(false)
      isInitialLoadRef.current = false
    }
  }

  useEffect(() => {
    // Initial load with loading state
    loadLeaderboard(true)

    // Refresh every 1 minute without loading state
    const interval = setInterval(() => {
      loadLeaderboard(false)
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="border-2 border-black bg-white p-4">
              <div className="flex items-center justify-center mb-2">
                <span className="text-3xl">⏳</span>
              </div>
              <div className="text-[10px] font-mono text-center text-muted-foreground mb-1 leading-tight">
                Loading...
              </div>
              <div className="text-lg font-mono font-bold text-center mb-1">$---</div>
              <div className="text-xs font-mono font-bold text-center text-muted-foreground">--%</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (leaderboard.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className="text-center font-mono text-sm text-muted-foreground">
          No active bots found
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {leaderboard.slice(0, 7).map((bot) => (
          <div key={bot.botId} className="border-2 border-black bg-white p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-center mb-2">
              <Image
                src={bot.modelImage}
                alt={`${bot.model} logo`}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            </div>
            {bot.isTestnet && (
              <div className="flex justify-center mb-2">
                <span className="font-mono text-[10px] font-bold uppercase border border-black px-2 py-0.5 bg-yellow-100 text-black">
                  TESTNET
                </span>
              </div>
            )}
            <div className="text-[10px] font-mono text-center text-muted-foreground mb-1 leading-tight">
              {bot.model.toUpperCase()}
            </div>
            <div className="text-lg font-mono font-bold text-center mb-1">
              ${bot.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div
              className={`text-xs font-mono font-bold text-center ${bot.change >= 0 ? "text-accent" : "text-destructive"}`}
            >
              {bot.change >= 0 ? "+" : ""}
              {bot.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

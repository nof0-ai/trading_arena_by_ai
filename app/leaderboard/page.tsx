"use client"

import { Header } from "@/components/header"
import Image from "next/image"
import { useState, useEffect } from "react"

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

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<BotLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadLeaderboard = async () => {
      setIsLoading(true)
      const response = await fetch("/api/public-bots?type=leaderboard")
      if (response.ok) {
        const data = await response.json()
        setLeaderboard(data.leaderboard || [])
      } else {
        console.error("[Leaderboard] Failed to load leaderboard")
        setLeaderboard([])
      }
      setIsLoading(false)
    }

    loadLeaderboard()
    const interval = setInterval(loadLeaderboard, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-mono mb-2">LEADERBOARD</h1>
          <p className="text-sm font-mono text-muted-foreground">
            Top performing trading bots ranked by total value
          </p>
        </div>

        {isLoading ? (
          <div className="border-2 border-black bg-white p-8">
            <div className="text-center font-mono text-muted-foreground">
              Loading leaderboard...
            </div>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="border-2 border-black bg-white p-8">
            <div className="text-center font-mono text-muted-foreground">
              No active bots found
            </div>
          </div>
        ) : (
          <div className="border-2 border-black bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b-2 border-black bg-gray-100">
                  <tr className="font-mono text-xs font-bold">
                    <th className="px-4 py-3 text-left">RANK</th>
                    <th className="px-4 py-3 text-left">BOT</th>
                    <th className="px-4 py-3 text-left">MODEL</th>
                    <th className="px-4 py-3 text-right">TOTAL VALUE</th>
                    <th className="px-4 py-3 text-right">UNREALIZED PNL</th>
                    <th className="px-4 py-3 text-right">CHANGE</th>
                    <th className="px-4 py-3 text-right">TRADED AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((bot, index) => (
                    <tr
                      key={bot.botId}
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm font-bold">
                        #{index + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Image
                            src={bot.modelImage}
                            alt={`${bot.model} logo`}
                            width={28}
                            height={28}
                            className="h-7 w-7 object-contain"
                          />
                          <span className="font-mono text-sm font-bold">{bot.botName}</span>
                          {bot.isTestnet ? (
                            <span className="font-mono text-[10px] font-bold uppercase border border-black px-2 py-0.5 bg-yellow-100 text-black">
                              TESTNET
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {bot.model}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-right">
                        ${bot.totalValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono text-sm text-right ${
                          bot.unrealizedPnl >= 0 ? "text-accent" : "text-destructive"
                        }`}
                      >
                        {bot.unrealizedPnl >= 0 ? "+" : ""}
                        ${bot.unrealizedPnl.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono text-sm font-bold text-right ${
                          bot.change >= 0 ? "text-accent" : "text-destructive"
                        }`}
                      >
                        {bot.change >= 0 ? "+" : ""}
                        {bot.change.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground text-right">
                        ${bot.totalTradedAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}


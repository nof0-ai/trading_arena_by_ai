"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"

interface CryptoPrice {
  symbol: string
  icon: string
  price: number
  change: number
}

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

export function PriceTicker() {
  const [prices, setPrices] = useState<CryptoPrice[]>([
    { symbol: "BTC", icon: "₿", price: 110986.5, change: 2.45 },
    { symbol: "ETH", icon: "Ξ", price: 3943.85, change: -1.23 },
    { symbol: "SOL", icon: "◎", price: 197.9, change: 5.67 },
    { symbol: "BNB", icon: "◆", price: 1116.75, change: 1.89 },
    { symbol: "DOGE", icon: "Ð", price: 0.1942, change: -3.45 },
    { symbol: "XRP", icon: "✕", price: 2.51, change: 4.12 },
  ])

  const [topModel, setTopModel] = useState({
    name: "DEEPSEEK CHAT V3.1",
    icon: "◆",
    value: 18945.47,
    change: 89.41,
    isTestnet: false,
    image: "/deepseek-color.png",
  })
  const [bottomModel, setBottomModel] = useState({
    name: "GEMINI 2.5 PRO",
    icon: "◆",
    value: 3003.51,
    change: -69.96,
    isTestnet: false,
    image: "/gemini-color.png",
  })
  const isInitialLoadRef = useRef(true)

  const loadBotData = async (isInitial = false) => {
    const response = await fetch("/api/public-bots?type=leaderboard")
    if (response.ok) {
      const result = await response.json()
      const leaderboard: BotLeaderboardEntry[] = result.leaderboard || []
      
      if (leaderboard.length > 0) {
        // Get highest bot (first in sorted leaderboard)
        const highest = leaderboard[0]
        setTopModel({
          name: `${highest.model}`,
          icon: highest.icon,
          value: highest.totalValue,
          change: highest.change,
          isTestnet: highest.isTestnet,
          image: highest.modelImage,
        })

        // Get lowest bot (last in sorted leaderboard)
        const lowest = leaderboard[leaderboard.length - 1]
        setBottomModel({
          name: `${lowest.model}`,
          icon: lowest.icon,
          value: lowest.totalValue,
          change: lowest.change,
          isTestnet: lowest.isTestnet,
          image: lowest.modelImage,
        })
      }
    } else {
      console.error("[PriceTicker] Failed to load leaderboard")
    }
  }

  useEffect(() => {
    // Initial load
    loadBotData(true)
    isInitialLoadRef.current = false

    // Refresh every 1 minute
    const interval = setInterval(() => {
      loadBotData(false)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices((prev) =>
        prev.map((p) => ({
          ...p,
          price: p.price * (1 + (Math.random() - 0.5) * 0.002),
          change: p.change + (Math.random() - 0.5) * 0.2,
        })),
      )
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="border-b-2 border-black bg-secondary/30 overflow-hidden">
      <div className="flex items-center">
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-scroll">
            {[...prices, ...prices, ...prices].map((crypto, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-4 py-2 border-r-2 border-black whitespace-nowrap font-mono text-xs"
              >
                <span className="text-base">{crypto.icon}</span>
                <span className="font-bold">{crypto.symbol}</span>
                <span className="font-bold">${crypto.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex border-l-2 border-black bg-white">
          <div className="px-4 py-2 border-r-2 border-black">
            <div className="text-[10px] text-muted-foreground font-mono mb-0.5">HIGHEST:</div>
            <div className="text-xs font-mono font-bold flex items-center gap-2">
              <Image
                src={topModel.image}
                alt={`${topModel.name} logo`}
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
              <span>{topModel.name}</span>
              {topModel.isTestnet && (
                <span className="font-mono text-[9px] font-bold uppercase border border-black px-1.5 py-0.5 bg-yellow-100 text-black">
                  TESTNET
                </span>
              )}
            </div>
            <div className="text-xs font-mono font-bold flex items-center gap-2">
              <span className="text-accent">${topModel.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-accent">{topModel.change >= 0 ? "+" : ""}{topModel.change.toFixed(2)}%</span>
            </div>
          </div>
          <div className="px-4 py-2">
            <div className="text-[10px] text-muted-foreground font-mono mb-0.5">LOWEST:</div>
            <div className="text-xs font-mono font-bold flex items-center gap-2">
              <Image
                src={bottomModel.image}
                alt={`${bottomModel.name} logo`}
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
              <span>{bottomModel.name}</span>
              {bottomModel.isTestnet && (
                <span className="font-mono text-[9px] font-bold uppercase border border-black px-1.5 py-0.5 bg-yellow-100 text-black">
                  TESTNET
                </span>
              )}
            </div>
            <div className="text-xs font-mono font-bold flex items-center gap-2">
              <span className="text-destructive">${bottomModel.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-destructive">{bottomModel.change >= 0 ? "+" : ""}{bottomModel.change.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

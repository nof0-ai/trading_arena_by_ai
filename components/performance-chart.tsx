"use client"

import { useEffect, useState, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts"

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

interface ChartDataPoint {
  time: string
  [botName: string]: string | number
}

export function PerformanceChart() {
  const [viewMode, setViewMode] = useState<"$" | "%">("$")
  const [timeRange, setTimeRange] = useState<"ALL" | "72H">("72H")
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [topBots, setTopBots] = useState<BotLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const historyRef = useRef<Map<string, Array<{ time: number; value: number }>>>(new Map())
  const isInitialLoadRef = useRef(true)

  const loadLeaderboard = async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true)
    }

    const response = await fetch("/api/public-bots?type=leaderboard")
    if (response.ok) {
      const result = await response.json()
      const leaderboard: BotLeaderboardEntry[] = result.leaderboard || []
      
      // Get top 10 bots
      const top10 = leaderboard.slice(0, 10)
      setTopBots(top10)

      // Store current values in history
      const now = Date.now()
      const cutoffTime = timeRange === "72H" ? now - 72 * 60 * 60 * 1000 : 0

      top10.forEach((bot) => {
        if (!historyRef.current.has(bot.botName)) {
          historyRef.current.set(bot.botName, [])
        }
        const history = historyRef.current.get(bot.botName)!
        history.push({ time: now, value: bot.totalValue })
        
        // Remove old data points based on time range
        const filtered = history.filter((point) => point.time >= cutoffTime)
        historyRef.current.set(bot.botName, filtered)
      })

      // Generate chart data from history
      const allTimes = new Set<number>()
      historyRef.current.forEach((history) => {
        history.forEach((point) => allTimes.add(point.time))
      })

      const sortedTimes = Array.from(allTimes).sort((a, b) => a - b)
      const chartData: ChartDataPoint[] = sortedTimes.map((time) => {
        const date = new Date(time)
        const timeStr = `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
        
        const point: ChartDataPoint = { time: timeStr }
        top10.forEach((bot) => {
          const history = historyRef.current.get(bot.botName) || []
          const valuePoint = history.find((p) => p.time === time)
          if (valuePoint) {
            point[bot.botName] = valuePoint.value
          }
        })
        return point
      })

      setData(chartData)
    } else {
      console.error("[PerformanceChart] Failed to load leaderboard")
    }

    if (isInitial) {
      setIsLoading(false)
      isInitialLoadRef.current = false
    }
  }

  useEffect(() => {
    // Initial load
    loadLeaderboard(true)

    // Refresh every 1 minute
    const interval = setInterval(() => {
      loadLeaderboard(false)
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // Update chart data when time range changes
  useEffect(() => {
    if (!isInitialLoadRef.current && topBots.length > 0) {
      const now = Date.now()
      const cutoffTime = timeRange === "72H" ? now - 72 * 60 * 60 * 1000 : 0

      // Filter history based on time range
      historyRef.current.forEach((history, botName) => {
        const filtered = history.filter((point) => point.time >= cutoffTime)
        historyRef.current.set(botName, filtered)
      })

      // Regenerate chart data
      const allTimes = new Set<number>()
      historyRef.current.forEach((history) => {
        history.forEach((point) => allTimes.add(point.time))
      })

      const sortedTimes = Array.from(allTimes).sort((a, b) => a - b)
      const chartData: ChartDataPoint[] = sortedTimes.map((time) => {
        const date = new Date(time)
        const timeStr = `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
        
        const point: ChartDataPoint = { time: timeStr }
        topBots.forEach((bot) => {
          const history = historyRef.current.get(bot.botName) || []
          const valuePoint = history.find((p) => p.time === time)
          if (valuePoint) {
            point[bot.botName] = valuePoint.value
          }
        })
        return point
      })

      setData(chartData)
    }
  }, [timeRange, topBots])

  // Color palette for top 10 bots
  const colors = [
    "#6366f1", // indigo
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#f97316", // orange
    "#10b981", // green
    "#3b82f6", // blue
    "#ef4444", // red
    "#f59e0b", // amber
    "#06b6d4", // cyan
    "#84cc16", // lime
  ]

  if (isLoading) {
    return (
      <div className="relative h-[500px] flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-sm text-gray-600">Loading chart data...</div>
        </div>
      </div>
    )
  }

  if (topBots.length === 0) {
    return (
      <div className="relative h-[500px] flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-sm text-gray-600">No public bots found</div>
        </div>
      </div>
    )
  }

  // Calculate max value for Y axis
  const maxValue = Math.max(
    ...data.flatMap((point) =>
      topBots.map((bot) => (point[bot.botName] as number) || 0)
    ),
    10000
  )
  const yAxisMax = Math.ceil(maxValue / 5000) * 5000

  return (
    <div className="relative">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setViewMode("$")}
          className={`w-8 h-8 border-2 border-black font-mono font-bold text-sm ${
            viewMode === "$" ? "bg-black text-white" : "bg-white hover:bg-secondary"
          }`}
        >
          $
        </button>
        <button
          onClick={() => setViewMode("%")}
          className={`w-8 h-8 border-2 border-black font-mono font-bold text-sm ${
            viewMode === "%" ? "bg-black text-white" : "bg-white hover:bg-secondary"
          }`}
        >
          %
        </button>
      </div>

      <div className="text-center pt-4 pb-2">
        <h2 className="font-mono text-sm font-bold tracking-wider">TOTAL ACCOUNT VALUE (TOP 10 PUBLIC BOTS)</h2>
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setTimeRange("ALL")}
          className={`px-4 py-1.5 border-2 border-black font-mono font-bold text-xs ${
            timeRange === "ALL" ? "bg-black text-white" : "bg-white hover:bg-secondary"
          }`}
        >
          ALL
        </button>
        <button
          onClick={() => setTimeRange("72H")}
          className={`px-4 py-1.5 border-2 border-black font-mono font-bold text-xs ${
            timeRange === "72H" ? "bg-black text-white" : "bg-white hover:bg-secondary"
          }`}
        >
          72H
        </button>
      </div>

      <div className="h-[500px] pt-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="0" stroke="#000000" strokeWidth={1} opacity={0.1} />
            <XAxis
              dataKey="time"
              stroke="#000000"
              style={{ fontSize: "10px", fontFamily: "Geist Mono, monospace" }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              stroke="#000000"
              style={{ fontSize: "10px", fontFamily: "Geist Mono, monospace" }}
              tickLine={false}
              domain={[0, yAxisMax]}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                border: "2px solid black",
                fontFamily: "monospace",
                fontSize: "12px",
                backgroundColor: "white",
              }}
              formatter={(value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <Legend
              wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }}
              iconType="line"
            />
            {topBots.map((bot, index) => (
              <Line
                key={bot.botId}
                type="monotone"
                dataKey={bot.botName}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={false}
                name={`${bot.icon} ${bot.botName} (${bot.model})${bot.isTestnet ? " [TESTNET]" : ""}`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="pixel-watermark">Nof0.ai</div>
    </div>
  )
}

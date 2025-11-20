"use client"

import { useEffect, useState } from "react"
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
  history: Array<{ time: number; value: number }>
}

interface ChartDataPoint {
  time: string
  [botName: string]: string | number
}

function buildChartData(
  bots: BotLeaderboardEntry[],
  mode: "$" | "%",
  range: "ALL" | "72H"
): ChartDataPoint[] {
  if (bots.length === 0) {
    return []
  }

  const now = Date.now()
  const cutoff =
    range === "72H" ? now - 72 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY

  const sortedHistories = new Map<
    string,
    Array<{ time: number; value: number }>
  >()
  const baselines = new Map<string, number>()
  const timeSet = new Set<number>()

  bots.forEach((bot) => {
    const history = Array.isArray(bot.history) ? bot.history : []
    const filtered = history
      .filter(
        (point) =>
          point &&
          typeof point.time === "number" &&
          typeof point.value === "number" &&
          point.time >= cutoff,
      )
      .map((point) => ({
        time: point.time,
        value: point.value,
      }))
      .sort((a, b) => a.time - b.time)

    filtered.forEach((point) => timeSet.add(point.time))
    sortedHistories.set(bot.botName, filtered)
    baselines.set(bot.botName, filtered.length > 0 ? filtered[0].value : 0)
  })

  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b)
  if (sortedTimes.length === 0) {
    return []
  }

  const indices = new Map<string, number>()
  const lastValueMap = new Map<string, number>()
  bots.forEach((bot) => indices.set(bot.botName, 0))

  const chartData: ChartDataPoint[] = []

  for (const time of sortedTimes) {
    const label = new Date(time).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const point: ChartDataPoint = { time: label }

    bots.forEach((bot) => {
      const history = sortedHistories.get(bot.botName) ?? []
      let index = indices.get(bot.botName) ?? 0

      while (index < history.length && history[index].time <= time) {
        lastValueMap.set(bot.botName, history[index].value)
        index += 1
      }

      indices.set(bot.botName, index)
      const lastValue = lastValueMap.get(bot.botName)
      if (lastValue === undefined) {
        return
      }

      if (mode === "%") {
        const baseline = baselines.get(bot.botName) ?? 0
        if (Math.abs(baseline) > 1e-8) {
          point[bot.botName] = ((lastValue - baseline) / Math.abs(baseline)) * 100
        } else {
          point[bot.botName] = 0
        }
      } else {
        point[bot.botName] = lastValue
      }
    })

    chartData.push(point)
  }

  return chartData
}

export function PerformanceChart() {
  const [viewMode, setViewMode] = useState<"$" | "%">("$")
  const [timeRange, setTimeRange] = useState<"ALL" | "72H">("72H")
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [topBots, setTopBots] = useState<BotLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadLeaderboard = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true)
    }

    try {
    const response = await fetch("/api/public-bots?type=leaderboard")
    if (response.ok) {
      const result = await response.json()
        const leaderboard: BotLeaderboardEntry[] = (result.leaderboard || []).map(
          (entry: BotLeaderboardEntry) => ({
            ...entry,
            history: Array.isArray(entry.history) ? entry.history : [],
          }),
        )
      const top10 = leaderboard.slice(0, 10)
      setTopBots(top10)
    } else {
      console.error("[PerformanceChart] Failed to load leaderboard")
        setTopBots([])
      }
    } catch (error) {
      console.error("[PerformanceChart] Error loading leaderboard:", error)
      setTopBots([])
    } finally {
      if (showLoading) {
      setIsLoading(false)
      }
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

  useEffect(() => {
    setData(buildChartData(topBots, viewMode, timeRange))
  }, [topBots, viewMode, timeRange])

  // Update chart data when time range changes
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

  const numericValues = data.flatMap((point) =>
    topBots
      .map((bot) => {
        const value = point[bot.botName]
        return typeof value === "number" ? value : null
      })
      .filter((v): v is number => v !== null),
  )

  const maxValue =
    numericValues.length > 0
      ? Math.max(...numericValues)
      : viewMode === "%"
        ? 0
        : 10000
  const minValue =
    numericValues.length > 0
      ? Math.min(...numericValues)
      : viewMode === "%"
        ? 0
        : 0

  // Calculate domain with 10% padding above and below
  const range = maxValue - minValue || 1
  const padding = range * 0.1
  const domainMin = minValue - padding
  const domainMax = maxValue + padding

  const yAxisDomain =
    viewMode === "%"
      ? [
          domainMin === domainMax ? -10 : domainMin,
          domainMin === domainMax ? 10 : domainMax,
        ]
      : [
          domainMin < 0 ? 0 : domainMin,
          domainMax,
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
          <div className="font-mono text-sm text-gray-600">No public bots Trading</div>
        </div>
      </div>
    )
  }

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
              domain={yAxisDomain as [number, number]}
              tickFormatter={(value) =>
                viewMode === "%"
                  ? `${value.toFixed(0)}%`
                  : `$${value.toLocaleString()}`
              }
            />
            <Tooltip
              contentStyle={{
                border: "2px solid black",
                fontFamily: "monospace",
                fontSize: "12px",
                backgroundColor: "white",
              }}
              formatter={(value: number) =>
                viewMode === "%"
                  ? `${value.toFixed(2)}%`
                  : `$${value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
              }
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

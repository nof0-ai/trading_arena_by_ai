"use client"

import { useState, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { getBotPerformance, type BotPerformanceData } from "@/lib/bot-performance"

interface BotPerformanceProps {
  botId: string
}

export function BotPerformance({ botId }: BotPerformanceProps) {
  const [performanceData, setPerformanceData] = useState<BotPerformanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!botId) return

    async function loadPerformance() {
      setIsLoading(true)
      const data = await getBotPerformance(botId)
      setPerformanceData(data)
      setIsLoading(false)
    }

    loadPerformance()
  }, [botId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <div className="text-4xl">⏳</div>
          <div className="font-mono text-sm text-gray-600">Loading performance data...</div>
        </div>
      </div>
    )
  }

  if (!performanceData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <div className="text-4xl">⚠️</div>
          <div className="font-mono text-sm text-gray-600">Failed to load performance data</div>
        </div>
      </div>
    )
  }

  // Format account history for chart
  const chartData = performanceData.accountHistory.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
    value: item.value,
  }))

  // Format recent trades for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="space-y-6">
     
   
      {/* Performance Chart */}
      {chartData.length > 0 && (
        <div className="border-2 border-black bg-white p-4">
          <h3 className="font-bold font-mono mb-4 text-sm">ACCOUNT VALUE HISTORY</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" style={{ fontSize: "12px", fontFamily: "monospace" }} />
              <YAxis style={{ fontSize: "12px", fontFamily: "monospace" }} />
              <Tooltip
                contentStyle={{
                  border: "2px solid black",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              />
              <Line type="monotone" dataKey="value" stroke="#000" strokeWidth={2} dot={{ fill: "#000", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trading Strategy */}
      <div className="border-2 border-black bg-white p-4">
        <h3 className="font-bold font-mono mb-3 text-sm">TRADING STRATEGY</h3>
        <p className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">{performanceData.prompt}</p>
      </div>

      {/* Recent Trades */}
      <div className="border-2 border-black bg-white p-4">
        <h3 className="font-bold font-mono mb-4 text-sm">RECENT TRADES</h3>
        {performanceData.recentTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-500 font-mono text-sm">No trades found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead className="border-b-2 border-black">
                <tr className="text-left">
                  <th className="pb-2 font-bold">TIME</th>
                  <th className="pb-2 font-bold">PAIR</th>
                  <th className="pb-2 font-bold">SIDE</th>
                  <th className="pb-2 font-bold">ENTRY</th>
                  <th className="pb-2 font-bold">EXIT</th>
                  <th className="pb-2 font-bold">P&L</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.recentTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-200">
                    <td className="py-3">{formatTime(trade.time)}</td>
                    <td className="py-3">{trade.coin}</td>
                    <td className={`py-3 font-bold ${trade.side === "LONG" ? "text-green-600" : "text-red-600"}`}>
                      {trade.side}
                    </td>
                    <td className="py-3">${trade.entryPx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3">${trade.exitPx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`py-3 font-bold ${trade.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

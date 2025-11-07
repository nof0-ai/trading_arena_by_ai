"use client"

import { useEffect, useRef, useState } from "react"
import { createBrowserClient } from "@/lib/supabase/client"

interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TradeData {
  time: number
  price: number
  side: "BUY" | "SELL"
}

interface KlineChartProps {
  coin: string
  interval?: string
  height?: number
  botId?: string
}

export function KlineChart({ coin, interval = "5m", height = 400, botId }: KlineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [candles, setCandles] = useState<CandleData[]>([])
  const [trades, setTrades] = useState<TradeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()

    const loadCandles = async () => {
      setLoading(true)
      setError(null)

      const endTime = Date.now()
      // Query 1 minute data directly
      const oneMinuteAgo = endTime - 6000 * 1000

      // Query price_candles table for last 1 minute
      const { data, error: queryError } = await supabase
        .from("price_candles")
        .select("*")
        .eq("coin", coin)
        .eq("interval", "5m")
        .gte("time", oneMinuteAgo)
        .lte("time", endTime)
        .order("time", { ascending: true })
      console.log('data',data)
      if (queryError) {
        setError(`Failed to load chart data: ${queryError.message}`)
        console.error("[KlineChart] Error loading candles:", queryError)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError("No candle data available")
        setLoading(false)
        return
      }

      // Convert database format to CandleData format
      const formattedCandles: CandleData[] = data.map((candle) => ({
        time: Number(candle.time),
        open: Number.parseFloat(candle.open),
        high: Number.parseFloat(candle.high),
        low: Number.parseFloat(candle.low),
        close: Number.parseFloat(candle.close),
        volume: Number.parseFloat(candle.volume),
      }))

      setCandles(formattedCandles)

      // Load trades if botId is provided
      if (botId) {
        const { data: tradesData, error: tradesError } = await supabase
          .from("trades")
          .select("price, side, created_at")
          .eq("bot_id", botId)
          .eq("coin", coin)
          .eq("status", "FILLED")
          .gte("created_at", new Date(oneMinuteAgo).toISOString())
          .lte("created_at", new Date(endTime).toISOString())
          .order("created_at", { ascending: true })

        if (tradesError) {
          console.error("[KlineChart] Error loading trades:", tradesError)
        } else if (tradesData) {
          const formattedTrades: TradeData[] = tradesData.map((trade) => ({
            time: new Date(trade.created_at).getTime(),
            price: Number.parseFloat(String(trade.price)),
            side: trade.side as "BUY" | "SELL",
          }))
          setTrades(formattedTrades)
        }
      } else {
        setTrades([])
      }

      setLoading(false)
    }

    loadCandles()
  }, [coin, interval, botId])

  // Calculate chart dimensions
  const maxPrice = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : 0
  const minPrice = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : 0
  const priceRange = maxPrice - minPrice || 1
  const padding = priceRange * 0.1

  const getY = (price: number) => {
    return ((maxPrice + padding - price) / (priceRange + padding * 2)) * height
  }

  if (loading) {
    return (
      <div className="border-2 border-black bg-white p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="font-mono text-sm text-gray-600">LOADING CHART DATA...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-2 border-black bg-white p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="font-mono text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  const candleWidth = Math.max(2, Math.min(10, (chartContainerRef.current?.offsetWidth || 800) / candles.length - 2))

  return (
    <div className="border-2 border-black bg-white">
      <div className="border-b-2 border-black px-4 py-2 flex items-center justify-between">
        <div className="font-mono text-sm font-bold">
          {coin} / {interval.toUpperCase()}
        </div>
        {candles.length > 0 && (
          <div className="flex items-center gap-4 font-mono text-xs">
            <span>O: {candles[candles.length - 1].open.toFixed(2)}</span>
            <span>H: {candles[candles.length - 1].high.toFixed(2)}</span>
            <span>L: {candles[candles.length - 1].low.toFixed(2)}</span>
            <span className="font-bold">C: {candles[candles.length - 1].close.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div ref={chartContainerRef} className="p-4 overflow-x-auto">
        <svg width="100%" height={height} className="bg-gray-50">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = ratio * height
            const price = maxPrice + padding - ratio * (priceRange + padding * 2)
            const svgWidth = chartContainerRef.current?.offsetWidth || 800
            return (
              <g key={ratio}>
                <line x1="0" y1={y} x2={svgWidth} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x="5" y={y - 5} fontSize="10" fill="#6b7280" fontFamily="monospace">
                  {price.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Candles */}
          {candles.map((candle, index) => {
            const x = index * (candleWidth + 2) + 50
            const isGreen = candle.close >= candle.open
            const color = isGreen ? "#10b981" : "#ef4444"
            const bodyTop = getY(Math.max(candle.open, candle.close))
            const bodyBottom = getY(Math.min(candle.open, candle.close))
            const bodyHeight = Math.max(1, bodyBottom - bodyTop)

            // Find trades that occurred during this candle's time window
            // Candle time represents the start of the 1-minute period
            const candleStartTime = candle.time
            const candleEndTime = candleStartTime + 60000 // 1 minute in milliseconds
            const candleTrades = trades.filter(
              (trade) => trade.time >= candleStartTime && trade.time < candleEndTime
            )

            return (
              <g key={index}>
                {/* Wick */}
                <line
                  x1={x + candleWidth / 2}
                  y1={getY(candle.high)}
                  x2={x + candleWidth / 2}
                  y2={getY(candle.low)}
                  stroke={color}
                  strokeWidth="1"
                />
                {/* Body */}
                <rect x={x} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} />
                {/* Trade markers */}
                {candleTrades.map((trade, tradeIndex) => {
                  const tradeY = getY(trade.price)
                  const isBuy = trade.side === "BUY"
                  const markerColor = isBuy ? "#10b981" : "#ef4444"
                  const markerSize = 6
                  const offsetX = tradeIndex * (markerSize + 2) - (candleTrades.length - 1) * (markerSize + 2) / 2

                  return (
                    <g key={tradeIndex}>
                      {/* Marker circle */}
                      <circle
                        cx={x + candleWidth / 2 + offsetX}
                        cy={tradeY}
                        r={markerSize}
                        fill={markerColor}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                      {/* Arrow indicator */}
                      <polygon
                        points={`${x + candleWidth / 2 + offsetX},${tradeY - markerSize - 2} ${x + candleWidth / 2 + offsetX - 3},${tradeY - markerSize - 6} ${x + candleWidth / 2 + offsetX + 3},${tradeY - markerSize - 6}`}
                        fill={markerColor}
                        stroke="white"
                        strokeWidth="0.5"
                        style={{ display: isBuy ? "block" : "none" }}
                      />
                      <polygon
                        points={`${x + candleWidth / 2 + offsetX},${tradeY + markerSize + 2} ${x + candleWidth / 2 + offsetX - 3},${tradeY + markerSize + 6} ${x + candleWidth / 2 + offsetX + 3},${tradeY + markerSize + 6}`}
                        fill={markerColor}
                        stroke="white"
                        strokeWidth="0.5"
                        style={{ display: isBuy ? "none" : "block" }}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

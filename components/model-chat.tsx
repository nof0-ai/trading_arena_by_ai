"use client"

import { useState, useEffect } from "react"
import { MessageSquare, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle2, XCircle } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import { ShareButton } from "@/components/share-button"

interface ModelChatProps {
  botId: string
}

interface Trade {
  id: string
  side: "BUY" | "SELL"
  price: number
  quantity: number | null
  status: string
  executed_at: string | null
  order_id: string | null
  error_message: string | null
}

interface Analysis {
  id: string
  coin: string
  price: number
  trend: "bullish" | "bearish" | "neutral"
  analysis: string
  recommendation: "buy" | "sell" | "hold"
  confidence: number
  candle_time: number
  created_at: string
  trade: Trade | null
}

export function ModelChat({ botId }: ModelChatProps) {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(false)

  useEffect(() => {
    if (!botId) return

    async function loadAnalyses() {
      setIsLoading(true)
      setError(null)

      const supabase = createBrowserClient()

      // Check if bot is public
      const { data: botData } = await supabase
        .from("encrypted_bots")
        .select("is_public")
        .eq("id", botId)
        .single()

      if (botData) {
        setIsPublic(botData.is_public || false)
      }

      // Fetch analyses with their trades
      const { data: analysesData, error: fetchError } = await supabase
        .from("price_analyses")
        .select("*")
        .eq("bot_id", botId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (fetchError) {
        console.error("[ModelChat] Error fetching analyses:", fetchError)
        setError(fetchError.message)
        setIsLoading(false)
        return
      }

      // Fetch trades for these analyses
      if (analysesData && analysesData.length > 0) {
        const analysisIds = analysesData.map((a) => a.id)
        const { data: tradesData, error: tradesError } = await supabase
          .from("trades")
          .select("*")
          .in("analysis_id", analysisIds)

        if (tradesError) {
          console.error("[ModelChat] Error fetching trades:", tradesError)
        }

        // Map trades to analyses
        const analysesWithTrades: Analysis[] = analysesData.map((analysis) => {
          const trade = tradesData?.find((t) => t.analysis_id === analysis.id) || null
          return {
            ...analysis,
            trade: trade
              ? {
                  id: trade.id,
                  side: trade.side as "BUY" | "SELL",
                  price: parseFloat(trade.price.toString()),
                  quantity: trade.quantity ? parseFloat(trade.quantity.toString()) : null,
                  status: trade.status,
                  executed_at: trade.executed_at,
                  order_id: trade.order_id,
                  error_message: trade.error_message,
                }
              : null,
          }
        })

        setAnalyses(analysesWithTrades)
      } else {
        setAnalyses([])
      }

      setIsLoading(false)
    }

    loadAnalyses()
  }, [botId])

  const formatTime = (timestamp: number | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "bullish":
        return <TrendingUp className="size-4 text-green-600" />
      case "bearish":
        return <TrendingDown className="size-4 text-red-600" />
      default:
        return <Minus className="size-4 text-gray-600" />
    }
  }

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case "buy":
        return "text-green-600 bg-green-50 border-green-200"
      case "sell":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600"
    if (confidence >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <div className="text-4xl">⏳</div>
          <div className="font-mono text-sm text-gray-600">Loading model analyses...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <AlertCircle className="size-8 text-red-600 mx-auto" />
          <div className="font-mono text-sm text-red-600">Error: {error}</div>
        </div>
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <MessageSquare className="size-8 text-gray-400 mx-auto" />
          <div className="font-mono text-sm text-gray-600">No analyses found</div>
          <div className="font-mono text-xs text-gray-500">The bot will generate analyses when it processes new candles</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-black bg-white p-4">
        <h3 className="font-bold font-mono mb-4 text-sm flex items-center gap-2">
          <MessageSquare className="size-4" />
          RECENT MODEL ANALYSES ({analyses.length})
        </h3>
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {analyses.map((analysis) => (
            <div key={analysis.id} className="border-2 border-gray-300 bg-gray-50 p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-gray-600">{analysis.coin}</span>
                  <span className="font-mono text-xs text-gray-500">${parseFloat(analysis.price.toString()).toFixed(2)}</span>
                  {getTrendIcon(analysis.trend)}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 border-2 font-mono text-xs font-bold ${getRecommendationColor(analysis.recommendation)}`}>
                    {analysis.recommendation.toUpperCase()}
                  </span>
                  <span className={`font-mono text-xs font-bold ${getConfidenceColor(analysis.confidence)}`}>
                    {analysis.confidence}%
                  </span>
                </div>
              </div>

              {/* Time */}
              <div className="text-xs font-mono text-gray-500">
                {formatTime(analysis.created_at || analysis.candle_time)}
              </div>

              {/* Analysis Text */}
              <div className="bg-white border border-gray-200 p-3 rounded">
                <div className="font-mono text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {analysis.analysis}
                </div>
                {isPublic && (
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                    <ShareButton
                      type="analysis"
                      id={analysis.id}
                      title={`AI Analysis for ${analysis.coin} - ${analysis.recommendation.toUpperCase()} recommendation`}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Trend */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-gray-600">Trend:</span>
                <span className={`font-bold ${
                  analysis.trend === "bullish" ? "text-green-600" :
                  analysis.trend === "bearish" ? "text-red-600" :
                  "text-gray-600"
                }`}>
                  {analysis.trend.toUpperCase()}
                </span>
              </div>

              {/* Trade Status */}
              {analysis.trade ? (
                <div className="border-t-2 border-gray-300 pt-3 mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="size-4 text-green-600" />
                    <span className="font-mono text-xs font-bold text-green-600">TRADE EXECUTED</span>
                  </div>
                  <div className="bg-white border border-gray-200 p-3 rounded space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-gray-600">Side:</span>
                        <span className={`ml-2 font-bold ${
                          analysis.trade.side === "BUY" ? "text-green-600" : "text-red-600"
                        }`}>
                          {analysis.trade.side}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <span className={`ml-2 font-bold ${
                          analysis.trade.status === "FILLED" ? "text-green-600" :
                          analysis.trade.status === "FAILED" ? "text-red-600" :
                          "text-yellow-600"
                        }`}>
                          {analysis.trade.status}
                        </span>
                      </div>
                      {analysis.trade.quantity && (
                        <div>
                          <span className="text-gray-600">Quantity:</span>
                          <span className="ml-2 font-bold">{analysis.trade.quantity.toFixed(6)}</span>
                        </div>
                      )}
                      {analysis.trade.quantity && (
                        <div>
                          <span className="text-gray-600">Value:</span>
                          <span className="ml-2 font-bold">${(analysis.trade.quantity * analysis.trade.price).toFixed(2)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Price:</span>
                        <span className="ml-2 font-bold">${analysis.trade.price.toFixed(2)}</span>
                      </div>
                      {analysis.trade.order_id && (
                        <div>
                          <span className="text-gray-600">Order ID:</span>
                          <span className="ml-2 font-bold text-xs">{analysis.trade.order_id}</span>
                        </div>
                      )}
                      {analysis.trade.executed_at && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Executed:</span>
                          <span className="ml-2">{formatTime(analysis.trade.executed_at)}</span>
                        </div>
                      )}
                    </div>
                    {analysis.trade.error_message && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        <span className="text-xs font-mono text-red-600 font-bold">Error:</span>
                        <div className="text-xs font-mono text-red-600 mt-1">{analysis.trade.error_message}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : analysis.recommendation !== "hold" && analysis.confidence >= 70 ? (
                <div className="border-t-2 border-gray-300 pt-3 mt-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="size-4 text-yellow-600" />
                    <span className="font-mono text-xs font-bold text-yellow-600">NO TRADE EXECUTED</span>
                  </div>
                  <div className="text-xs font-mono text-gray-500 mt-1">
                    {analysis.recommendation === "buy" || analysis.recommendation === "sell"
                      ? `Recommendation was ${analysis.recommendation.toUpperCase()} but no trade was executed.`
                      : "Hold recommendation - no trade executed."}
                  </div>
                </div>
              ) : (
                <div className="border-t-2 border-gray-300 pt-3 mt-3">
                  <div className="flex items-center gap-2">
                    <Minus className="size-4 text-gray-400" />
                    <span className="font-mono text-xs font-bold text-gray-400">HOLD - NO TRADE</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


"use client"

import { useState } from "react"
import { Share2 } from "lucide-react"

interface ShareButtonProps {
  type: "bot" | "trade" | "analysis"
  id: string
  title?: string
  className?: string
}

interface ShareMetrics {
  totalPnl?: number
  pnlPercentage?: number
  winRate?: number
  totalTrades?: number
  sharpeRatio?: number
}

interface ShareTrade {
  asset: string
  type: "long" | "short"
  pnl: number
  roiPercentage: number
  holdingTime: string
  priceFrom: number
  priceTo: number
}

interface ShareAnalysis {
  recommendation?: string
  confidence?: number
  message: string
}

interface ShareResponse {
  type: "bot" | "trade" | "analysis"
  botName?: string
  model?: string
  modelIcon?: string
  modelImage?: string
  metrics?: ShareMetrics
  trade?: ShareTrade
  analysis?: ShareAnalysis
}

function formatCurrency(value: number, fractionDigits = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

function formatShareText(data: ShareResponse | null, fallback: string) {
  if (!data) {
    return fallback
  }

  if (data.type === "bot" && data.metrics) {
    const metrics = data.metrics
    return (
      `🤖 ${data.botName || "AI Bot"} performance update\n\n` +
      `Total P&L: ${metrics.totalPnl && metrics.totalPnl >= 0 ? "+" : ""}$${formatCurrency(metrics.totalPnl || 0)}\n` +
      `ROI: ${(metrics.pnlPercentage ?? 0).toFixed(2)}% • Win Rate: ${(metrics.winRate ?? 0).toFixed(1)}%\n` +
      `Trades: ${metrics.totalTrades || 0} • Sharpe: ${(metrics.sharpeRatio ?? 0).toFixed(2)}\n\n` +
      `Built with Alpha Arena`
    )
  }

  if (data.type === "trade" && data.trade) {
    const trade = data.trade
    return (
      `📈 ${data.modelEmoji || "🤖"} ${data.model || "AI"} ${trade.type.toUpperCase()} trade on ${trade.asset}\n\n` +
      `Entry $${formatCurrency(trade.priceFrom)} → Exit $${formatCurrency(trade.priceTo)}\n` +
      `P&L: ${trade.pnl >= 0 ? "+" : ""}$${formatCurrency(trade.pnl)} (${trade.roiPercentage.toFixed(2)}% ROI)\n` +
      `Holding: ${trade.holdingTime}\n\n` +
      `See more on Alpha Arena`
    )
  }

  if (data.type === "analysis" && data.analysis) {
    const analysis = data.analysis
    const snippet = analysis.message.length > 220 ? `${analysis.message.slice(0, 220)}...` : analysis.message
    const metaParts = []
    if (analysis.recommendation) {
      metaParts.push(`Recommendation: ${analysis.recommendation.toUpperCase()}`)
    }
    if (typeof analysis.confidence === "number") {
      metaParts.push(`Confidence: ${analysis.confidence}%`)
    }
    const metaLine = metaParts.length > 0 ? `\n${metaParts.join(" • ")}` : ""
    return (
      `🧠 ${data.modelEmoji || "🤖"} ${data.model || "AI"} Market Analysis\n\n` +
      `${snippet}${metaLine}\n\n` +
      `Dive deeper on Alpha Arena`
    )
  }

  return fallback
}

export function ShareButton({ type, id, title, className = "" }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false)

  const handleShare = () => {
    if (isSharing || typeof window === "undefined") {
      return
    }

    setIsSharing(true)
    const baseUrl = window.location.origin
    const shareUrl = `${baseUrl}/share/${type}/${id}`
    const fallbackText = title || `Check out this AI trading ${type} on Alpha Arena`

    fetch(`/api/share?type=${type}&id=${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ShareResponse | null) => {
        const shareText = formatShareText(data, fallbackText)
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
        window.open(twitterUrl, "_blank", "width=550,height=420")
      })
      .catch((error) => {
        console.error("[ShareButton] Failed to load share data", error)
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fallbackText)}&url=${encodeURIComponent(shareUrl)}`
        window.open(twitterUrl, "_blank", "width=550,height=420")
      })
      .finally(() => {
        setIsSharing(false)
      })
  }

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className={`border-2 border-black px-4 py-2 font-mono text-sm hover:bg-gray-100 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      title="Share on Twitter"
      aria-busy={isSharing}
    >
      <Share2 className="size-4" />
      {isSharing ? "SHARING" : "SHARE"}
    </button>
  )
}


"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, DollarSign, TrendingUp, Target, Zap, BarChart3 } from "lucide-react"
import { ShareButton } from "@/components/share-button"
import type { ShareData, ShareType } from "@/lib/share-data"

interface ShareViewProps {
  type: ShareType
  shareId: string
  data: ShareData
}

function formatCurrency(value: number, fractionDigits = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function ShareView({ type, shareId, data }: ShareViewProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm hover:underline">
            <ArrowLeft className="size-4" />
            Back to Alpha Arena
          </Link>
          <div className="flex items-center gap-3">
            <a
              href={`/share/${type}/${shareId}/opengraph-image`}
              target="_blank"
              rel="noreferrer"
              className="border-2 border-dashed border-black px-4 py-2 font-mono text-xs hover:bg-gray-100"
            >
              Preview Image
            </a>
            <ShareButton type={type} id={shareId} />
          </div>
        </div>

        <div className="bg-white border-2 border-black p-8">
          {data.type === "bot" && data.metrics && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold font-mono mb-2">{data.botName || "AI Trading Bot"}</h1>
                <div className="flex items-center gap-3 text-sm font-mono text-gray-600">
                  {data.modelImage ? (
                    <Image
                      src={data.modelImage}
                      alt={data.model || "Model icon"}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full border border-black/20 bg-white object-contain"
                    />
                  ) : (
                    <span className="text-xl">{data.modelIcon || "🤖"}</span>
                  )}
                  <span>{data.model || "Unknown Model"}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <div className="border-2 border-black p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="size-4 text-gray-600" />
                    <span className="text-xs font-mono text-gray-600">ACCOUNT VALUE</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">
                    ${formatCurrency(data.metrics.accountValue)}
                  </div>
                  <div
                    className={`text-sm font-mono ${data.metrics.totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {data.metrics.totalPnl >= 0 ? "+" : ""}$
                    {formatCurrency(data.metrics.totalPnl)}
                  </div>
                </div>

                <div className="border-2 border-black p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="size-4 text-gray-600" />
                    <span className="text-xs font-mono text-gray-600">TOTAL ROI</span>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${data.metrics.pnlPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {data.metrics.pnlPercentage >= 0 ? "+" : ""}
                    {data.metrics.pnlPercentage.toFixed(2)}%
                  </div>
                  <div className="text-sm font-mono text-gray-600">Since inception</div>
                </div>

                <div className="border-2 border-black p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="size-4 text-gray-600" />
                    <span className="text-xs font-mono text-gray-600">WIN RATE</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">{data.metrics.winRate.toFixed(1)}%</div>
                  <div className="text-sm font-mono text-gray-600">
                    {data.metrics.winningTrades} / {data.metrics.totalTrades} trades
                  </div>
                </div>

                <div className="border-2 border-black p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="size-4 text-gray-600" />
                    <span className="text-xs font-mono text-gray-600">SHARPE</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">{data.metrics.sharpeRatio.toFixed(2)}</div>
                  <div className="text-sm font-mono text-gray-600">Risk-adjusted</div>
                </div>

                <div className="border-2 border-black p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="size-4 text-gray-600" />
                    <span className="text-xs font-mono text-gray-600">TOTAL VOLUME</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">
                    ${formatCurrency(data.metrics.totalVolume)}
                  </div>
                  <div className="text-sm font-mono text-gray-600">Aggregated notional</div>
                </div>
              </div>
            </div>
          )}

          {data.type === "trade" && data.trade && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold font-mono mb-2">AI Trading Alert</h1>
                <div className="flex items-center gap-3 text-sm font-mono text-gray-600">
                  {data.modelImage ? (
                    <Image
                      src={data.modelImage}
                      alt={data.model || "Model icon"}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border border-black/20 bg-white object-contain"
                    />
                  ) : (
                    <span className="text-xl">{data.modelIcon || "🤖"}</span>
                  )}
                  <span>{data.model || "AI"} completed a trade</span>
                </div>
              </div>

              <div className="border-2 border-black p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-mono text-gray-600">Asset:</span>
                    <div className="text-xl font-bold font-mono mt-1">{data.trade.asset}</div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">Type:</span>
                    <div
                      className={`text-xl font-bold font-mono mt-1 ${
                        data.trade.type === "long" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {data.trade.type.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">Entry Price:</span>
                    <div className="text-xl font-bold font-mono mt-1">
                      ${formatCurrency(data.trade.priceFrom)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">Exit Price:</span>
                    <div className="text-xl font-bold font-mono mt-1">
                      ${formatCurrency(data.trade.priceTo)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">Quantity:</span>
                    <div className="text-xl font-bold font-mono mt-1">
                      {data.trade.quantity > 0 ? "+" : ""}
                      {Math.abs(data.trade.quantity).toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">Holding Time:</span>
                    <div className="text-xl font-bold font-mono mt-1">{data.trade.holdingTime}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t-2 border-black pt-4">
                  <div>
                    <span className="text-sm font-mono text-gray-600">NET P&L:</span>
                    <div
                      className={`text-3xl font-bold font-mono mt-2 ${
                        data.trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {data.trade.pnl >= 0 ? "+" : ""}$
                      {formatCurrency(data.trade.pnl)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-mono text-gray-600">RETURN ON INVESTMENT:</span>
                    <div
                      className={`text-3xl font-bold font-mono mt-2 ${
                        data.trade.roiPercentage >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {data.trade.roiPercentage >= 0 ? "+" : ""}
                      {data.trade.roiPercentage.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data.type === "analysis" && data.analysis && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold font-mono mb-2">AI Market Analysis</h1>
                <div className="flex items-center gap-3 text-sm font-mono text-gray-600">
                  {data.modelImage ? (
                    <Image
                      src={data.modelImage}
                      alt={data.model || "Model icon"}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full border border-black/20 bg-white object-contain"
                    />
                  ) : (
                    <span className="text-xl">{data.modelIcon || "🤖"}</span>
                  )}
                  <span>{data.model || "AI"} Analysis</span>
                </div>
              </div>

              <div className="border-2 border-black p-6 space-y-4">
                <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed">{data.analysis.message}</div>
                {(data.analysis.recommendation || typeof data.analysis.confidence === "number") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t-2 border-black pt-4">
                    {data.analysis.recommendation && (
                      <div>
                        <span className="text-sm font-mono text-gray-600">Recommendation:</span>
                        <div className="text-xl font-bold font-mono mt-2">
                          {data.analysis.recommendation.toUpperCase()}
                        </div>
                      </div>
                    )}
                    {typeof data.analysis.confidence === "number" && (
                      <div>
                        <span className="text-sm font-mono text-gray-600">Confidence:</span>
                        <div className="text-xl font-bold font-mono mt-2">{data.analysis.confidence}%</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t-2 border-gray-300 text-center">
            <p className="font-mono text-sm text-gray-600">
              Powered by <span className="font-bold">Alpha Arena</span> — AI Trading Platform
            </p>
            <Link href="/" className="text-accent font-mono text-sm hover:underline mt-2 inline-block">
              Create your own AI trading bot →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

import { ImageResponse } from "next/og"
import { getShareData, type ShareType } from "@/lib/share-data"

export const runtime = "edge"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const validTypes: ShareType[] = ["bot", "trade", "analysis"]
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function resolveAssetPath(asset?: string) {
  if (!asset) return undefined
  if (asset.startsWith("http://") || asset.startsWith("https://")) {
    return asset
  }
  if (asset.startsWith("/")) {
    return `${appBaseUrl}${asset}`
  }
  return `${appBaseUrl}/${asset}`
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercentage(value: number) {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function defaultImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #020617, #1e293b)",
          color: "#f8fafc",
          fontSize: 42,
          fontFamily: "monospace",
          letterSpacing: -1,
        }}
      >
        <div>Alpha Arena</div>
        <div style={{ fontSize: 24, marginTop: 16, opacity: 0.7 }}>AI Trading Share Card</div>
      </div>
    ),
    size,
  )
}

export default async function Image({ params }: { params: { type: string; id: string } }) {
  const { type, id } = params

  if (!validTypes.includes(type as ShareType)) {
    return defaultImage()
  }

  const data = await getShareData(type as ShareType, id)
  if (!data) {
    return defaultImage()
  }

  const baseStyle = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    padding: "60px",
    background: "linear-gradient(135deg, #020617 0%, #0f172a 45%, #1e293b 100%)",
    color: "#f8fafc",
    fontFamily: "monospace",
  }

  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 40,
    fontWeight: 700,
  }

  const subHeaderStyle = {
    fontSize: 24,
    fontWeight: 400,
    opacity: 0.8,
    marginTop: 10,
  }

  const badgeStyle = (background: string, color: string) => ({
    padding: "10px 18px",
    borderRadius: "9999px",
    fontSize: 22,
    fontWeight: 600,
    background,
    color,
  })

  const footerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 22,
    opacity: 0.8,
  }

  if (data.type === "bot" && data.metrics) {
    const metrics = data.metrics
    return new ImageResponse(
      (
        <div style={baseStyle}>
          <div>
            <div style={headerStyle}>
              <span>Alpha Arena</span>
              {resolveAssetPath(data.modelImage) ? (
                <img
                  src={resolveAssetPath(data.modelImage)}
                  width={72}
                  height={72}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "9999px",
                    border: "2px solid rgba(255,255,255,0.2)",
                    backgroundColor: "#0f172a",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span>{data.modelIcon || "🤖"}</span>
              )}
            </div>
            <div style={subHeaderStyle}>{data.botName || "AI Trading Bot"}</div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 20, opacity: 0.7 }}>TOTAL ROI</div>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 700,
                  color: metrics.pnlPercentage >= 0 ? "#4ade80" : "#f87171",
                }}
              >
                {formatPercentage(metrics.pnlPercentage)}
              </div>
              <div style={{ fontSize: 20, opacity: 0.6 }}>since inception</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 20, opacity: 0.7 }}>TOTAL P&L</div>
              <div style={{ fontSize: 56, fontWeight: 700 }}>{formatCurrency(metrics.totalPnl)}</div>
              <div style={{ fontSize: 20, opacity: 0.6 }}>Account value {formatCurrency(metrics.accountValue)}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 20, opacity: 0.7 }}>WIN RATE</div>
              <div style={{ fontSize: 56, fontWeight: 700 }}>{metrics.winRate.toFixed(1)}%</div>
              <div style={{ fontSize: 20, opacity: 0.6 }}>
                {metrics.winningTrades} / {metrics.totalTrades} trades · Sharpe {metrics.sharpeRatio.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={footerStyle}>
            <div>Volume traded {formatCurrency(metrics.totalVolume)}</div>
            <div style={badgeStyle("rgba(74, 222, 128, 0.15)", "#4ade80")}>LIVE ROI CARD</div>
            <div>alphaarena.ai</div>
          </div>
        </div>
      ),
      size,
    )
  }

  if (data.type === "trade" && data.trade) {
    const trade = data.trade
    return new ImageResponse(
      (
        <div style={baseStyle}>
          <div>
            <div style={headerStyle}>
              <span>Alpha Arena</span>
              {resolveAssetPath(data.modelImage) ? (
                <img
                  src={resolveAssetPath(data.modelImage)}
                  width={72}
                  height={72}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "9999px",
                    border: "2px solid rgba(255,255,255,0.2)",
                    backgroundColor: "#0f172a",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span>{data.modelIcon || "🤖"}</span>
              )}
            </div>
            <div style={subHeaderStyle}>{data.model || "AI Model"}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 56, fontWeight: 700 }}>{trade.asset}</div>
            <div style={{ fontSize: 28, opacity: 0.8 }}>
              {trade.type.toUpperCase()} trade · Holding {trade.holdingTime}
            </div>

            <div style={{ display: "flex", gap: 32, fontSize: 28 }}>
              <div>
                <div style={{ opacity: 0.6, marginBottom: 6 }}>ENTRY</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(trade.priceFrom)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.6, marginBottom: 6 }}>EXIT</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(trade.priceTo)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.6, marginBottom: 6 }}>P&L</div>
                <div
                  style={{
                    fontWeight: 600,
                    color: trade.pnl >= 0 ? "#4ade80" : "#f87171",
                  }}
                >
                  {trade.pnl >= 0 ? "+" : ""}
                  {formatCurrency(trade.pnl)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <div style={{ fontSize: 26, opacity: 0.7 }}>ROI</div>
              <div
                style={{
                  fontSize: 92,
                  fontWeight: 700,
                  color: trade.roiPercentage >= 0 ? "#4ade80" : "#f87171",
                }}
              >
                {formatPercentage(trade.roiPercentage)}
              </div>
            </div>
          </div>

          <div style={footerStyle}>
            <div>Quantity {Math.abs(trade.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
            <div style={badgeStyle("rgba(59, 130, 246, 0.2)", "#60a5fa")}>AUTONOMOUS EXECUTION</div>
            <div>alphaarena.ai</div>
          </div>
        </div>
      ),
      size,
    )
  }

  if (data.type === "analysis" && data.analysis) {
    const analysis = data.analysis
    const snippet = analysis.message.length > 320 ? `${analysis.message.slice(0, 320)}...` : analysis.message
    const badgeLabel = analysis.recommendation ? analysis.recommendation.toUpperCase() : "AI INSIGHT"
    return new ImageResponse(
      (
        <div style={baseStyle}>
          <div>
            <div style={headerStyle}>
              <span>Alpha Arena</span>
              {resolveAssetPath(data.modelImage) ? (
                <img
                  src={resolveAssetPath(data.modelImage)}
                  width={72}
                  height={72}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "9999px",
                    border: "2px solid rgba(255,255,255,0.2)",
                    backgroundColor: "#0f172a",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span>{data.modelIcon || "🤖"}</span>
              )}
            </div>
            <div style={subHeaderStyle}>{data.model || "AI Model"} Analysis</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={badgeStyle("rgba(244, 114, 182, 0.2)", "#f472b6")}>{badgeLabel}</div>
            <div style={{ fontSize: 28, lineHeight: 1.5, opacity: 0.95 }}>{snippet}</div>
            {typeof analysis.confidence === "number" && (
              <div style={{ fontSize: 26, opacity: 0.7 }}>Confidence {analysis.confidence}%</div>
            )}
          </div>

          <div style={footerStyle}>
            <div>Generated at {new Date(analysis.time).toLocaleString()}</div>
            <div style={badgeStyle("rgba(34, 197, 94, 0.2)", "#22c55e")}>REAL-TIME STRATEGY</div>
            <div>alphaarena.ai</div>
          </div>
        </div>
      ),
      size,
    )
  }

  return defaultImage()
}

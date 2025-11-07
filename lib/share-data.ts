import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export type ShareType = "bot" | "trade" | "analysis"

const modelAssets: Record<string, { icon: string; image: string }> = {
   
  gpt: { icon: "🟢", image: "/openai.png" },
  claude: { icon: "🟠", image: "/claude-color.png" },
  gemini: { icon: "🔷", image: "/gemini-color.png" },
  grok: { icon: "⚫", image: "/grok.png" },
  deepseek: { icon: "🔵", image: "/deepseek-color.png" },
  qwen: { icon: "🟣", image: "/qwen-color.png" },
}

const defaultModelMetadata: { icon: string; image: string } = {
  icon: "🤖",
  image: "/placeholder-logo.png",
}

function normalizeAssetPath(asset: string | undefined) {
  if (!asset) {
    return defaultModelMetadata.image
  }

  const trimmed = asset.trim()
  if (trimmed.length === 0) {
    return defaultModelMetadata.image
  }

  const lower = trimmed.toLowerCase()
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return trimmed
  }

  const withoutPublicPrefix = trimmed.replace(/^public\//i, "")
  const withoutLeadingSlash = withoutPublicPrefix.replace(/^\/+/, "")

  return `/${withoutLeadingSlash}`
}

function getModelMetadata(model: string | undefined) {
  if (!model) return defaultModelMetadata
  const modelLower = model.toLowerCase()
  for (const [key, value] of Object.entries(modelAssets)) {
    if (modelLower.includes(key)) {
      return {
        icon: value.icon,
        image: normalizeAssetPath(value.image),
      }
    }
  }
  return {
    icon: defaultModelMetadata.icon,
    image: normalizeAssetPath(defaultModelMetadata.image),
  }
}

export interface ShareBotMetrics {
  accountValue: number
  totalPnl: number
  pnlPercentage: number
  winRate: number
  winningTrades: number
  totalTrades: number
  sharpeRatio: number
  totalVolume: number
}

export interface ShareTradeData {
  asset: string
  type: "long" | "short"
  priceFrom: number
  priceTo: number
  quantity: number
  pnl: number
  roiPercentage: number
  holdingTime: string
  time: number
}

export interface ShareAnalysisData {
  message: string
  recommendation?: string
  confidence?: number
  time: number
}

export interface ShareData {
  type: ShareType
  botName?: string
  model?: string
  modelIcon?: string
  modelImage?: string
  metrics?: ShareBotMetrics
  trade?: ShareTradeData
  analysis?: ShareAnalysisData
}

function getSupabaseServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration for share data")
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

interface CompletedTrade {
  id: string
  time: number
  coin: string
  side: "LONG" | "SHORT"
  entryPx: number
  exitPx: number
  pnl: number
  notional: number
}

function calculateCompletedTrades(trades: any[]): CompletedTrade[] {
  const tradePairs = new Map<string, Array<{ side: string; price: number; quantity: number; time: number; id: string }>>()

  for (const trade of trades) {
    const coin = trade.coin
    if (!tradePairs.has(coin)) {
      tradePairs.set(coin, [])
    }
    const quantity = trade.quantity !== null && trade.quantity !== undefined ? parseFloat(trade.quantity.toString()) : 0
    tradePairs.get(coin)!.push({
      side: trade.side,
      price: parseFloat(trade.price),
      quantity,
      time: new Date(trade.executed_at).getTime(),
      id: trade.id,
    })
  }

  const completedTrades: CompletedTrade[] = []

  for (const [coin, coinTrades] of tradePairs.entries()) {
    coinTrades.sort((a, b) => a.time - b.time)

    let position: { side: string; price: number; quantity: number; time: number; id: string } | null = null

    for (const trade of coinTrades) {
      if (!position) {
        position = trade
      } else {
        if ((position.side === "BUY" && trade.side === "SELL") || (position.side === "SELL" && trade.side === "BUY")) {
          const entryPx = position.price
          const exitPx = trade.price
          const closedQuantity = Math.min(Math.abs(position.quantity), Math.abs(trade.quantity))
          const pnl =
            position.side === "BUY"
              ? (exitPx - entryPx) * closedQuantity
              : (entryPx - exitPx) * closedQuantity
          const notional = Math.abs(entryPx * closedQuantity)

          completedTrades.push({
            id: `${position.id}-${trade.id}`,
            time: trade.time,
            coin,
            side: position.side === "BUY" ? "LONG" : "SHORT",
            entryPx,
            exitPx,
            pnl,
            notional,
          })

          if (Math.abs(position.quantity) > Math.abs(trade.quantity)) {
            position.quantity = position.side === "BUY" ? position.quantity - trade.quantity : position.quantity + trade.quantity
          } else if (Math.abs(trade.quantity) > Math.abs(position.quantity)) {
            const remainingQuantity: number =
              trade.side === "BUY" ? trade.quantity - position.quantity : trade.quantity + position.quantity
            position = {
              ...trade,
              quantity: remainingQuantity,
            }
          } else {
            position = null
          }
        } else {
          position = trade
        }
      }
    }
  }

  return completedTrades
}

export async function getShareData(type: ShareType, id: string): Promise<ShareData | null> {
  const supabase = getSupabaseServiceClient()

  if (type === "bot") {
    const { data: botData, error: botError } = await supabase
      .from("encrypted_bots")
      .select("id, encrypted_config, is_public")
      .eq("id", id)
      .single()

    if (botError || !botData || !botData.is_public) {
      return null
    }

    const config = JSON.parse(botData.encrypted_config)
    const model = config.model || "Unknown"
    const { icon: modelIcon, image: modelImage } = getModelMetadata(model)

    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .eq("bot_id", id)
      .eq("status", "FILLED")
      .order("executed_at", { ascending: false })

    const tradesData = trades || []
    const completedTrades = calculateCompletedTrades(tradesData)

    const totalPnl = completedTrades.reduce((sum, trade) => sum + trade.pnl, 0)
    const totalNotional = completedTrades.reduce((sum, trade) => sum + trade.notional, 0)
    const winningTrades = completedTrades.filter((trade) => trade.pnl > 0).length
    const winRate = completedTrades.length > 0 ? (winningTrades / completedTrades.length) * 100 : 0

    const returns = completedTrades.map((trade) => trade.pnl)
    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0
    const variance =
      returns.length > 0
        ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        : 0
    const stdDev = Math.sqrt(variance)
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0

    const pnlPercentage = totalNotional > 0 ? (totalPnl / totalNotional) * 100 : 0
    const accountValue = Math.max(0, totalNotional + totalPnl)

    return {
      type: "bot",
      botName: config.name || "Unknown Bot",
      model: model.toUpperCase(),
      modelIcon,
      modelImage,
      metrics: {
        accountValue,
        totalPnl,
        pnlPercentage,
        winRate,
        winningTrades,
        totalTrades: tradesData.length,
        sharpeRatio,
        totalVolume: totalNotional,
      },
    }
  }

  if (type === "trade") {
    const tradeIdParts = id.split("-")
    if (tradeIdParts.length < 2) {
      return null
    }

    const [entryTradeId, exitTradeId] = tradeIdParts

    const { data: entryTrade } = await supabase
      .from("trades")
      .select("*, bot_id")
      .eq("id", entryTradeId)
      .single()

    const { data: exitTrade } = await supabase
      .from("trades")
      .select("*")
      .eq("id", exitTradeId)
      .single()

    if (!entryTrade || !exitTrade) {
      return null
    }

    const { data: botData } = await supabase
      .from("encrypted_bots")
      .select("encrypted_config, is_public")
      .eq("id", entryTrade.bot_id)
      .single()

    if (!botData || !botData.is_public) {
      return null
    }

    const config = JSON.parse(botData.encrypted_config)
    const model = config.model || "Unknown"
    const { icon: modelIcon, image: modelImage } = getModelMetadata(model)

    const entryPx = parseFloat(entryTrade.price)
    const exitPx = parseFloat(exitTrade.price)
    const entryQuantity =
      entryTrade.quantity !== null && entryTrade.quantity !== undefined
        ? parseFloat(entryTrade.quantity.toString())
        : 0
    const exitQuantity =
      exitTrade.quantity !== null && exitTrade.quantity !== undefined
        ? parseFloat(exitTrade.quantity.toString())
        : 0
    const closedQuantity = Math.min(Math.abs(entryQuantity), Math.abs(exitQuantity))

    const pnl =
      entryTrade.side === "BUY"
        ? (exitPx - entryPx) * closedQuantity
        : (entryPx - exitPx) * closedQuantity

    const roiPercentage = (() => {
      if (!Number.isFinite(entryPx) || entryPx === 0) return 0
      const change = exitPx - entryPx
      const ratio = (change / entryPx) * 100
      return entryTrade.side === "BUY" ? ratio : -ratio
    })()

    const entryTime = new Date(entryTrade.executed_at).getTime()
    const exitTime = new Date(exitTrade.executed_at).getTime()
    const holdingTimeMs = exitTime - entryTime
    const hours = Math.floor(holdingTimeMs / (1000 * 60 * 60))
    const minutes = Math.floor((holdingTimeMs % (1000 * 60 * 60)) / (1000 * 60))
    const holdingTime = hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M`

    return {
      type: "trade",
      botName: config.name || "Unknown Bot",
      model: model.toUpperCase(),
      modelIcon,
      modelImage,
      trade: {
        asset: entryTrade.coin,
        type: entryTrade.side === "BUY" ? "long" : "short",
        priceFrom: entryPx,
        priceTo: exitPx,
        quantity: entryTrade.side === "BUY" ? closedQuantity : -closedQuantity,
        pnl,
        roiPercentage,
        holdingTime,
        time: exitTime,
      },
    }
  }

  if (type === "analysis") {
    const { data: analysis } = await supabase
      .from("price_analyses")
      .select("*, bot_id")
      .eq("id", id)
      .single()

    if (!analysis) {
      return null
    }

    const { data: botData } = await supabase
      .from("encrypted_bots")
      .select("encrypted_config, is_public")
      .eq("id", analysis.bot_id)
      .single()

    if (!botData || !botData.is_public) {
      return null
    }

    const config = JSON.parse(botData.encrypted_config)
    const model = config.model || "Unknown"
    const { icon: modelIcon, image: modelImage } = getModelMetadata(model)

    return {
      type: "analysis",
      botName: config.name || "Unknown Bot",
      model: model.toUpperCase(),
      modelIcon,
      modelImage,
      analysis: {
        message: analysis.analysis || "",
        recommendation: analysis.recommendation || undefined,
        confidence: analysis.confidence ?? undefined,
        time: new Date(analysis.created_at).getTime(),
      },
    }
  }

  return null
}

export function getModelIcon(model: string | undefined): string {
  return getModelMetadata(model).icon
}

export function getModelImage(model: string | undefined): string {
  return getModelMetadata(model).image
}

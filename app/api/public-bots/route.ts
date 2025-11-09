import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getModelIcon, getModelImage, getModelProvider } from "@/lib/share-data"
import { getModelDisplayName } from "@/lib/model-info"
import { computePerformanceFromTrades, type PerformanceTradeInput } from "@/lib/performance-metrics"

type TradeComputation = ReturnType<typeof computePerformanceFromTrades>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Initialize Supabase client with service role for public access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("[public-bots API] Missing Supabase environment variables")
}

interface TradeRecord {
  id: string
  coin: string
  side: string
  price: number
  quantity: number | null
  leverage: number | null
  executed_at: string | null
  analysis_id: string | null
}

interface CandleRecord {
  coin: string
  time: number
  close: number
}

interface TimelinePoint {
  time: number
  value: number
}

interface BotPerformanceComputation {
  totalValue: number
  unrealizedPnl: number
  totalTradedAmount: number
  history: TimelinePoint[]
  metrics: TradeComputation["metrics"]
  accountHistory: Array<{ date: string; value: number }>
  recentTrades: TradeComputation["recentTrades"]
  realizedPnl: number
}

function toFiniteNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toTimestamp(value: string | null): number {
  if (!value) {
    return Number.NaN
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

interface CompletedTrade {
  id: string
  botId: string
  botName: string
  model: string
  modelIcon: string
  modelImage: string
  type: "long" | "short"
  asset: string
  time: number
  priceFrom: number
  priceTo: number
  quantity: number
  notionalFrom: number
  notionalTo: number
  holdingTime: string
  pnl: number
  isTestnet: boolean
  entryAnalysisId: string | null
  exitAnalysisId: string | null
  entryAnalysis?: string | null
  exitAnalysis?: string | null
  entryRecommendation?: string | null
  exitRecommendation?: string | null
  entryConfidence?: number | null
  exitConfidence?: number | null
}

interface ModelChat {
  id: string
  botId: string
  model: string
  modelIcon: string
  modelImage: string
  time: number
  message: string
  isTestnet: boolean
}

interface BotPosition {
  id: string
  botId: string
  botName: string
  model: string
  modelIcon: string
  modelImage: string
  side: "LONG" | "SHORT"
  coin: string
  coinIcon: string
  leverage: string
  notional: number
  unrealizedPnl: number
  isTestnet: boolean
}

interface BotLeaderboardEntry {
  botId: string
  botName: string
  model: string
  icon: string
  color: string
  totalValue: number
  unrealizedPnl: number
  change: number
  totalTradedAmount: number
  isTestnet: boolean
  modelImage: string
  history: Array<{ time: number; value: number }>
}

function buildPerformanceTimeline(
  trades: TradeRecord[],
  candlesByCoin: Map<string, CandleRecord[]>,
  currentPrices: Record<string, number>,
  startTime: number,
  endTime: number
): { history: TimelinePoint[]; realizedPnl: number; totalTradedAmount: number } {
  const sanitizedStart = Number.isFinite(startTime) ? startTime : 0
  let sanitizedEnd = Number.isFinite(endTime) ? endTime : Date.now()
  if (sanitizedEnd <= sanitizedStart) {
    sanitizedEnd = sanitizedStart + 1
  }

  const sortedTrades = trades
    .map((trade) => {
      const timestampValue = toTimestamp(trade.executed_at)
      const time = Number.isNaN(timestampValue) ? sanitizedStart : timestampValue
      const quantity = toFiniteNumber(trade.quantity)
      const price = toFiniteNumber(trade.price)
      if (quantity <= 0 || price <= 0) {
        return null
      }
      const side = trade.side === "SELL" ? "SELL" : "BUY"
      return {
        id: trade.id,
        coin: trade.coin,
        side: side as "BUY" | "SELL",
        price,
        quantity,
        time,
      }
    })
    .filter(
      (
        item,
      ): item is {
        id: string
        coin: string
        side: "BUY" | "SELL"
        price: number
        quantity: number
        time: number
      } => Boolean(item),
    )
    .sort((a, b) => a.time - b.time)

  const timeSet = new Set<number>()
  timeSet.add(sanitizedStart)
  timeSet.add(sanitizedEnd)

  candlesByCoin.forEach((candles) => {
    for (const candle of candles) {
      if (candle.time >= sanitizedStart && candle.time <= sanitizedEnd) {
        timeSet.add(candle.time)
      }
    }
  })

  for (const trade of sortedTrades) {
    if (trade.time >= sanitizedStart && trade.time <= sanitizedEnd) {
      timeSet.add(trade.time)
    }
  }

  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b)

  const positions = new Map<string, { quantity: number; avgPrice: number }>()
  const pointerState = new Map<string, { index: number; lastPrice: number | null }>()

  candlesByCoin.forEach((candles, coin) => {
    pointerState.set(coin, { index: 0, lastPrice: null })
    candles.sort((a, b) => a.time - b.time)
  })

  const history: TimelinePoint[] = []
  let realizedPnl = 0
  let totalTradedAmount = 0
  let tradeIndex = 0

  for (const time of sortedTimes) {
    while (tradeIndex < sortedTrades.length && sortedTrades[tradeIndex].time <= time) {
      const trade = sortedTrades[tradeIndex]
      const price = trade.price
      const quantity = trade.quantity
      totalTradedAmount += Math.abs(quantity * price)

      const existing = positions.get(trade.coin) ?? { quantity: 0, avgPrice: 0 }
      const position = { ...existing }
      if (trade.side === "BUY") {
        let remaining = quantity
        if (position.quantity < 0) {
          const closingQty = Math.min(Math.abs(position.quantity), remaining)
          realizedPnl += (position.avgPrice - price) * closingQty
          position.quantity += closingQty
          remaining -= closingQty
          if (Math.abs(position.quantity) < 1e-8) {
            position.quantity = 0
            position.avgPrice = 0
          }
        }
        if (remaining > 0) {
          const currentQty = position.quantity > 0 ? position.quantity : 0
          const currentValue = currentQty > 0 ? position.avgPrice * currentQty : 0
          const newQty = currentQty + remaining
          const newValue = currentValue + price * remaining
          position.quantity = newQty
          position.avgPrice = newQty > 0 ? newValue / newQty : 0
        }
      } else {
        let remaining = quantity
        if (position.quantity > 0) {
          const closingQty = Math.min(position.quantity, remaining)
          realizedPnl += (price - position.avgPrice) * closingQty
          position.quantity -= closingQty
          remaining -= closingQty
          if (Math.abs(position.quantity) < 1e-8) {
            position.quantity = 0
            position.avgPrice = 0
          }
        }
        if (remaining > 0) {
          const currentQty = position.quantity < 0 ? Math.abs(position.quantity) : 0
          const currentValue = currentQty > 0 ? position.avgPrice * currentQty : 0
          const newQty = currentQty + remaining
          const newValue = currentValue + price * remaining
          position.quantity = -newQty
          position.avgPrice = newQty > 0 ? newValue / newQty : 0
        }
      }

      if (Math.abs(position.quantity) < 1e-8) {
        positions.delete(trade.coin)
      } else {
        positions.set(trade.coin, position)
      }

      tradeIndex += 1
    }

    let unrealizedPnl = 0

    for (const [coin, position] of positions.entries()) {
      const candles = candlesByCoin.get(coin) ?? []
      const pointer = pointerState.get(coin)
      if (pointer) {
        while (pointer.index < candles.length && candles[pointer.index].time <= time) {
          pointer.lastPrice = candles[pointer.index].close
          pointer.index += 1
        }
      }

      let price = pointer?.lastPrice ?? null

      if ((price === null || price <= 0) && time >= sanitizedEnd) {
        const fallbackPrice = toFiniteNumber(currentPrices[coin])
        price = fallbackPrice > 0 ? fallbackPrice : null
      }

      if (price === null || price <= 0) {
        continue
      }

      if (position.quantity > 0) {
        unrealizedPnl += (price - position.avgPrice) * position.quantity
      } else if (position.quantity < 0) {
        const absQty = Math.abs(position.quantity)
        unrealizedPnl += (position.avgPrice - price) * absQty
      }
    }

    const value = realizedPnl + unrealizedPnl
    history.push({ time, value })
  }

  if (history.length === 1) {
    history.push({ time: sanitizedEnd, value: history[0].value })
  }

  return {
    history,
    realizedPnl,
    totalTradedAmount,
  }
}

function calculateBotPerformance(
  trades: TradeRecord[],
  currentPrices: Record<string, number>,
  candlesByCoin: Map<string, CandleRecord[]>,
  startTime: number,
  endTime: number
): BotPerformanceComputation {
  const performanceInputs: PerformanceTradeInput[] = trades
    .map((trade) => {
      const timestampValue = toTimestamp(trade.executed_at)
      const timestamp = Number.isNaN(timestampValue) ? endTime : timestampValue
      return {
        id: trade.id,
        coin: trade.coin,
        side: (trade.side === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
        price: toFiniteNumber(trade.price),
        quantity: toFiniteNumber(trade.quantity),
        timestamp,
      }
    })
    .filter(
      (input) =>
        input.quantity > 0 &&
        input.price > 0 &&
        Number.isFinite(input.timestamp),
    )

  const tradeMetrics = computePerformanceFromTrades(performanceInputs)
  const timeline = buildPerformanceTimeline(trades, candlesByCoin, currentPrices, startTime, endTime)
  const history = timeline.history.length > 0 ? timeline.history : [
    { time: endTime, value: tradeMetrics.metrics.totalPnl },
  ]
  const accountValue = history[history.length - 1]?.value ?? tradeMetrics.metrics.totalPnl
  const baseValue = history[0]?.value ?? 0
  const realizedPnl = timeline.realizedPnl
  const unrealizedPnl = accountValue - realizedPnl

  const adjustedMetrics = { ...tradeMetrics.metrics }
  adjustedMetrics.accountValue = accountValue
  adjustedMetrics.totalPnl = accountValue
  adjustedMetrics.pnlPercentage =
    Math.abs(baseValue) > 1e-8 ? ((accountValue - baseValue) / Math.abs(baseValue)) * 100 : 0

  const accountHistory = history.map((point) => ({
    date: new Date(point.time).toISOString(),
    value: Number(point.value.toFixed(2)),
  }))

  return {
    totalValue: accountValue,
    unrealizedPnl,
    totalTradedAmount: timeline.totalTradedAmount,
    history,
    metrics: adjustedMetrics,
    accountHistory,
    recentTrades: tradeMetrics.recentTrades,
    realizedPnl,
  }
}

export async function GET(request: Request) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse("ok", { headers: corsHeaders })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500, headers: corsHeaders }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { searchParams } = new URL(request.url)
  const dataType = searchParams.get("type") || "all" // all, leaderboard, modelchats, positions, completed-trades

  try {
    // Get all bots (status is stored in encrypted_config JSON, not as a column)
    const { data: allBots, error: botsError } = await supabase
      .from("encrypted_bots")
      .select("id, encrypted_config, is_public")

    if (botsError || !allBots) {
      console.error("[public-bots API] Error fetching bots:", botsError)
      return NextResponse.json(
        { error: "Failed to fetch bots" },
        { status: 500, headers: corsHeaders }
      )
    }

    // Filter bots: must be public and active
    const bots = allBots.filter((bot) => {
      if (!bot.is_public) return false
      try {
        const config = JSON.parse(bot.encrypted_config)
        return config.status === "active"
      } catch {
        return false
      }
    })

    if (bots.length === 0) {
      return NextResponse.json(
        {
          leaderboard: [],
          modelChats: [],
          positions: [],
          completedTrades: [],
        },
        { headers: corsHeaders }
      )
    }

    const botIds = bots.map((b) => b.id)

    // Create bot info map
    const botInfoMap = new Map<
      string,
      {
        name: string
        model: string
        icon: string
        modelImage: string
        color: string
      }
    >()

    // Collect API wallet IDs
    const apiWalletIds: string[] = []
    const botApiWalletMap = new Map<string, string>()

    const providerColors: Record<string, string> = {
      "openai": "bg-green-500",
      "anthropic": "bg-orange-500",
      "google": "bg-blue-500",
      "x-ai": "bg-gray-800",
      "deepseek": "bg-blue-600",
      "qwen": "bg-purple-600",
    }

    for (const bot of bots) {
      try {
        const config = JSON.parse(bot.encrypted_config)
        const rawModel = typeof config.model === "string" ? config.model : ""

        const icon = getModelIcon(rawModel)
        const modelImage = getModelImage(rawModel)
        const provider = getModelProvider(rawModel)
        const color = provider ? providerColors[provider] ?? "bg-gray-500" : "bg-gray-500"
        const displayModel = getModelDisplayName(rawModel) ?? rawModel.trim()

        botInfoMap.set(bot.id, {
          name: config.name || "Unknown Bot",
          model: displayModel,
          icon,
          modelImage,
          color,
        })

        if (config.apiWalletId) {
          apiWalletIds.push(config.apiWalletId)
          botApiWalletMap.set(bot.id, config.apiWalletId)
        }
      } catch (error) {
        botInfoMap.set(bot.id, {
          name: "Unknown Bot",
          model: "",
          icon: getModelIcon(undefined),
          modelImage: getModelImage(undefined),
          color: "bg-gray-500",
        })
      }
    }

    // Get API wallet network info
    const apiWalletNetworkMap = new Map<string, boolean>()
    if (apiWalletIds.length > 0) {
      const { data: apiWallets } = await supabase
        .from("api_wallets")
        .select("id, is_testnet")
        .in("id", apiWalletIds)

      if (apiWallets) {
        for (const wallet of apiWallets) {
          apiWalletNetworkMap.set(wallet.id, wallet.is_testnet || false)
        }
      }
    }

    // Get all filled trades
    const { data: trades, error: tradesError } = await supabase
      .from("trades")
      .select("id, bot_id, coin, side, price, quantity, leverage, executed_at, analysis_id")
      .in("bot_id", botIds)
      .eq("status", "FILLED")
      .order("executed_at", { ascending: true })

    if (tradesError) {
      console.error("[public-bots API] Error fetching trades:", tradesError)
      return NextResponse.json(
        { error: "Failed to fetch trades" },
        { status: 500, headers: corsHeaders }
      )
    }

    const tradesData = trades || []

    // Get all unique coins
    const allCoins = new Set<string>()
    for (const trade of tradesData) {
      allCoins.add(trade.coin)
    }

    const now = Date.now()
    const historyWindowMs = 3 * 24 * 60 * 60 * 1000
    const historyStart = now - historyWindowMs

    let candlesByCoin: Map<string, CandleRecord[]> = new Map()
    if (allCoins.size > 0) {
      const { data: candleRows, error: candlesError } = await supabase
        .from("price_candles")
        .select("coin, time, close")
        .in("coin", Array.from(allCoins))
        .eq("interval", "5m")
        .gte("time", historyStart)
        .lte("time", now)
        .order("time", { ascending: true })

      if (candlesError) {
        console.error("[public-bots API] Error fetching price candles:", candlesError)
      } else if (candleRows) {
        const grouped = new Map<string, CandleRecord[]>()
        for (const row of candleRows) {
          const coin = row.coin
          const timeValue =
            typeof row.time === "number"
              ? row.time
              : Number.parseFloat(String(row.time))
          const closeValue = toFiniteNumber(row.close)
          if (!Number.isFinite(timeValue) || closeValue <= 0) {
            continue
          }
          const bucket = grouped.get(coin) ?? []
          bucket.push({ coin, time: timeValue, close: closeValue })
          grouped.set(coin, bucket)
        }
        grouped.forEach((bucket) => bucket.sort((a, b) => a.time - b.time))
        candlesByCoin = grouped
      }
    }

    // Fetch current prices using direct API calls (avoiding HyperliquidClient in Node.js)
    const mainnetPrices: Record<string, number> = {}
    const testnetPrices: Record<string, number> = {}

    // Fetch mainnet prices
    try {
      const mainnetResponse = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
      })

      if (mainnetResponse.ok) {
        const mainnetMids = await mainnetResponse.json()
        for (const coin of allCoins) {
          const priceStr = mainnetMids[coin]
          if (priceStr) {
            mainnetPrices[coin] = Number.parseFloat(priceStr)
          }
        }
      }
    } catch (error) {
      console.error("[public-bots API] Error fetching mainnet prices:", error)
    }

    // Fetch testnet prices
    try {
      const testnetResponse = await fetch("https://api.hyperliquid-testnet.xyz/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
      })

      if (testnetResponse.ok) {
        const testnetMids = await testnetResponse.json()
        for (const coin of allCoins) {
          const priceStr = testnetMids[coin]
          if (priceStr) {
            testnetPrices[coin] = Number.parseFloat(priceStr)
          }
        }
      }
    } catch (error) {
      console.error("[public-bots API] Error fetching testnet prices:", error)
    }

    // Group trades by bot
    const tradesByBot = new Map<string, TradeRecord[]>()
    for (const trade of tradesData) {
      if (!tradesByBot.has(trade.bot_id)) {
        tradesByBot.set(trade.bot_id, [])
      }
      tradesByBot.get(trade.bot_id)!.push(trade as TradeRecord)
    }

    const coinIcons: Record<string, string> = {
      BTC: "₿",
      ETH: "Ξ",
      SOL: "◎",
      XRP: "✕",
      DOGE: "Ð",
      BNB: "⬡",
    }

    // Calculate leaderboard
    const leaderboard: BotLeaderboardEntry[] = []
    for (const bot of bots) {
      const botTrades = tradesByBot.get(bot.id) || []
      if (botTrades.length === 0) continue

      const botInfo = botInfoMap.get(bot.id)!
      let isTestnet = false
      const apiWalletId = botApiWalletMap.get(bot.id)
      if (apiWalletId) {
        isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
      }

      const currentPrices = isTestnet ? testnetPrices : mainnetPrices
      const performance = calculateBotPerformance(botTrades, currentPrices, candlesByCoin, historyStart, now)

      const historyPoints = performance.history.map((point) => ({
        time: point.time,
        value: Number(point.value.toFixed(2)),
      }))

      const firstHistoryValue = historyPoints[0]?.value ?? 0
      const fallbackBaseline =
        performance.totalTradedAmount > 0 ? performance.totalTradedAmount : 10000
      const baseline =
        Math.abs(firstHistoryValue) > 1e-8 ? firstHistoryValue : fallbackBaseline
      const change =
        baseline !== 0
          ? ((performance.totalValue - baseline) / Math.abs(baseline)) * 100
          : 0

      leaderboard.push({
        botId: bot.id,
        botName: botInfo.name,
        model: botInfo.model,
        icon: botInfo.icon,
        modelImage: botInfo.modelImage,
        color: botInfo.color,
        totalValue: performance.totalValue,
        unrealizedPnl: performance.unrealizedPnl,
        change,
        totalTradedAmount: performance.totalTradedAmount,
        isTestnet,
        history: historyPoints,
      })

      const metricsPayload: Record<string, number> = {}
      for (const [key, value] of Object.entries(performance.metrics)) {
        metricsPayload[key] = Number(toFiniteNumber(value).toFixed(6))
      }
      metricsPayload.unrealizedPnl = Number(performance.unrealizedPnl.toFixed(6))
      metricsPayload.realizedPnl = Number(performance.realizedPnl.toFixed(6))
      metricsPayload.totalTradedAmount = Number(performance.totalTradedAmount.toFixed(6))
      metricsPayload.totalValue = Number(performance.totalValue.toFixed(6))

      const periodStartIso =
        performance.accountHistory[0]?.date ?? new Date(historyStart).toISOString()
      const periodEndIso =
        performance.accountHistory[performance.accountHistory.length - 1]?.date ??
        new Date(now).toISOString()
      const snapshotPayload = {
        bot_id: bot.id,
        period_start: periodStartIso,
        period_end: periodEndIso,
        computed_at: new Date().toISOString(),
        status: "ready",
        error_message: null,
        metrics: metricsPayload,
        account_history: performance.accountHistory,
        prompt: "",
        recent_trades: performance.recentTrades,
      }

      const { error: snapshotError } = await supabase
        .from("bot_performance_snapshots")
        .insert(snapshotPayload)

      if (snapshotError) {
        console.error(
          `[public-bots API] Failed to insert performance snapshot for bot ${bot.id}:`,
          snapshotError,
        )
      }
    }
    leaderboard.sort((a, b) => b.totalValue - a.totalValue)

    // Get latest model chats
    const { data: analyses } = await supabase
      .from("price_analyses")
      .select("id, bot_id, analysis, recommendation, created_at")
      .in("bot_id", botIds)
      .not("bot_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000)

    const latestByBot = new Map<string, typeof analyses[0]>()
    for (const analysis of analyses || []) {
      if (!analysis.bot_id) continue
      if (!latestByBot.has(analysis.bot_id)) {
        latestByBot.set(analysis.bot_id, analysis)
      }
    }

    const modelChats: ModelChat[] = []
    for (const [botId, analysis] of latestByBot.entries()) {
      const botInfo = botInfoMap.get(botId)
      if (!botInfo) continue

      let isTestnet = false
      const apiWalletId = botApiWalletMap.get(botId)
      if (apiWalletId) {
        isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
      }

      let message = analysis.analysis || ""
      if (!message || message.trim().length === 0) {
        const rec = analysis.recommendation?.toUpperCase() || "HOLD"
        message = `Current recommendation: ${rec}.`
      }

      modelChats.push({
        id: analysis.id,
        botId,
        model: botInfo.model,
        modelIcon: botInfo.icon,
        modelImage: botInfo.modelImage,
        time: new Date(analysis.created_at).getTime(),
        message: message.trim(),
        isTestnet,
      })
    }
    modelChats.sort((a, b) => b.time - a.time)

    // Calculate positions
    const positions: BotPosition[] = []
    for (const bot of bots) {
      const botTrades = tradesByBot.get(bot.id) || []
      if (botTrades.length === 0) continue

      const botInfo = botInfoMap.get(bot.id)!
      let isTestnet = false
      const apiWalletId = botApiWalletMap.get(bot.id)
      if (apiWalletId) {
        isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
      }

      const positionMap = new Map<
        string,
        {
          coin: string
          tradedAmountUsd: number
          totalQuantity: number
          side: "LONG" | "SHORT"
          leverage: number
        }
      >()

      for (const trade of botTrades) {
        const existing = positionMap.get(trade.coin) || {
          coin: trade.coin,
          tradedAmountUsd: 0,
          totalQuantity: 0,
          side: "LONG" as const,
          leverage: trade.leverage || 1,
        }

        const tradePrice = Number.parseFloat(String(trade.price))
        const tradeQuantity =
          trade.quantity !== null && trade.quantity !== undefined
            ? Number.parseFloat(String(trade.quantity))
            : 0
        
        // Calculate USD value from quantity and price
        const tradeSizeUsd = tradeQuantity * tradePrice

        if (trade.side === "BUY") {
          if (existing.totalQuantity === 0 || existing.totalQuantity > 0) {
            existing.tradedAmountUsd += tradeSizeUsd
            existing.totalQuantity += tradeQuantity
            existing.side = "LONG"
          } else if (existing.totalQuantity < 0) {
            const closeQuantity = Math.min(Math.abs(existing.totalQuantity), tradeQuantity)
            existing.totalQuantity += closeQuantity
            existing.tradedAmountUsd -= closeQuantity * tradePrice
            if (Math.abs(existing.totalQuantity) < 0.0001) {
              existing.totalQuantity = 0
              existing.tradedAmountUsd = 0
            }
            if (existing.totalQuantity === 0 && tradeQuantity > closeQuantity) {
              const remainingQuantity = tradeQuantity - closeQuantity
              existing.tradedAmountUsd = remainingQuantity * tradePrice
              existing.totalQuantity = remainingQuantity
              existing.side = "LONG"
            }
          }
        } else if (trade.side === "SELL") {
          if (existing.totalQuantity === 0 || existing.totalQuantity < 0) {
            existing.tradedAmountUsd += tradeSizeUsd
            existing.totalQuantity -= tradeQuantity
            existing.side = "SHORT"
          } else if (existing.totalQuantity > 0) {
            const closeQuantity = Math.min(existing.totalQuantity, tradeQuantity)
            existing.totalQuantity -= closeQuantity
            existing.tradedAmountUsd -= closeQuantity * tradePrice
            if (Math.abs(existing.totalQuantity) < 0.0001) {
              existing.totalQuantity = 0
              existing.tradedAmountUsd = 0
            }
            if (existing.totalQuantity === 0 && tradeQuantity > closeQuantity) {
              const remainingQuantity = tradeQuantity - closeQuantity
              existing.tradedAmountUsd = remainingQuantity * tradePrice
              existing.totalQuantity = -remainingQuantity
              existing.side = "SHORT"
            }
          }
        }

        if (trade.leverage) {
          existing.leverage = trade.leverage
        }

        positionMap.set(trade.coin, existing)
      }

      const currentPrices = isTestnet ? testnetPrices : mainnetPrices
      for (const [coin, posData] of positionMap.entries()) {
        if (Math.abs(posData.totalQuantity) < 0.0001) continue

        const currentPrice = currentPrices[coin] || 0
        if (currentPrice > 0) {
          const absQuantity = Math.abs(posData.totalQuantity)
          const currentAmountUsd = currentPrice * absQuantity
          const tradedAmountUsd = posData.tradedAmountUsd

          let unrealizedPnl: number
          if (posData.side === "LONG") {
            unrealizedPnl = currentAmountUsd - tradedAmountUsd
          } else {
            unrealizedPnl = tradedAmountUsd - currentAmountUsd
          }

          positions.push({
            id: `${bot.id}-${coin}`,
            botId: bot.id,
            botName: botInfo.name,
            model: botInfo.model,
            modelIcon: botInfo.icon,
            modelImage: botInfo.modelImage,
            side: posData.side,
            coin,
            coinIcon: coinIcons[coin] || coin[0],
            leverage: `${posData.leverage}X`,
            notional: currentAmountUsd,
            unrealizedPnl,
            isTestnet,
          })
        }
      }
    }

    // Calculate completed trades
    let completedTrades: CompletedTrade[] = []
    const tradesByBotAndCoin = new Map<string, Map<string, Array<{
      id: string
      side: string
      price: number
      quantity: number
      time: number
      analysisId: string | null
    }>>>()

    for (const trade of tradesData) {
      const botId = trade.bot_id
      const coin = trade.coin

      if (!tradesByBotAndCoin.has(botId)) {
        tradesByBotAndCoin.set(botId, new Map())
      }

      const botTrades = tradesByBotAndCoin.get(botId)!
      if (!botTrades.has(coin)) {
        botTrades.set(coin, [])
      }

      const tradePrice = Number.parseFloat(String(trade.price))
      const tradeQuantity =
        trade.quantity !== null && trade.quantity !== undefined
          ? Number.parseFloat(String(trade.quantity))
          : 0

      botTrades.get(coin)!.push({
        id: trade.id,
        side: trade.side,
        price: tradePrice,
        quantity: tradeQuantity,
        time: new Date(trade.executed_at).getTime(),
        analysisId: trade.analysis_id ?? null,
      })
    }

    for (const [botId, coinTradesMap] of tradesByBotAndCoin.entries()) {
      const botInfo = botInfoMap.get(botId) || {
        name: "Unknown Bot",
        model: "UNKNOWN",
        icon: "🤖",
        color: "bg-gray-500",
      }

      let isTestnet = false
      const apiWalletId = botApiWalletMap.get(botId)
      if (apiWalletId) {
        isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
      }

      for (const [coin, coinTrades] of coinTradesMap.entries()) {
        coinTrades.sort((a, b) => a.time - b.time)

        let position: {
          id: string
          side: string
          price: number
          quantity: number
          time: number
          analysisId: string | null
        } | null = null

        for (const trade of coinTrades) {
          if (!position) {
            position = trade
          } else {
            if (
              (position.side === "BUY" && trade.side === "SELL") ||
              (position.side === "SELL" && trade.side === "BUY")
            ) {
              const entryPx = position.price
              const exitPx = trade.price
              const entryTime = position.time
              const exitTime = trade.time

              const closedQuantity = Math.min(Math.abs(position.quantity), Math.abs(trade.quantity))

              const pnl =
                position.side === "BUY"
                  ? (exitPx - entryPx) * closedQuantity
                  : (entryPx - exitPx) * closedQuantity

              const holdingTimeMs = exitTime - entryTime
              const hours = Math.floor(holdingTimeMs / (1000 * 60 * 60))
              const minutes = Math.floor((holdingTimeMs % (1000 * 60 * 60)) / (1000 * 60))
              const holdingTime = hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M`

              // Calculate notional values from quantity and price
              const notionalFrom = Math.abs(position.quantity) * entryPx
              const notionalTo = closedQuantity * exitPx

              completedTrades.push({
                id: `${position.id}-${trade.id}`,
                botId,
                botName: botInfo.name,
                model: botInfo.model,
                modelIcon: botInfo.icon,
                modelImage: botInfo.modelImage,
                type: position.side === "BUY" ? "long" : "short",
                asset: coin,
                time: exitTime,
                priceFrom: entryPx,
                priceTo: exitPx,
                quantity: position.side === "BUY" ? closedQuantity : -closedQuantity,
                notionalFrom,
                notionalTo,
                holdingTime,
                pnl,
                isTestnet,
                entryAnalysisId: position.analysisId ?? null,
                exitAnalysisId: trade.analysisId ?? null,
              })

              if (Math.abs(position.quantity) > Math.abs(trade.quantity)) {
                // Partial close: reduce position quantity
                position.quantity = position.side === "BUY" 
                  ? position.quantity - trade.quantity
                  : position.quantity + trade.quantity
              } else if (Math.abs(trade.quantity) > Math.abs(position.quantity)) {
                // Full close + new position opened
                const remainingQuantity = trade.side === "BUY"
                  ? trade.quantity - position.quantity
                  : trade.quantity + position.quantity
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
    }

    const analysisIds = new Set<string>()
    for (const trade of completedTrades) {
      if (trade.entryAnalysisId) {
        analysisIds.add(trade.entryAnalysisId)
      }
      if (trade.exitAnalysisId) {
        analysisIds.add(trade.exitAnalysisId)
      }
    }

    const sortedCompletedTrades = [...completedTrades].sort((a, b) => b.time - a.time)
    const perBotTradeLimit = 3
    const perBotCounts = new Map<string, number>()
    const latestCompletedTrades: CompletedTrade[] = []
    const maxCompletedTrades = 200

    for (const trade of sortedCompletedTrades) {
      const count = perBotCounts.get(trade.botId) ?? 0
      if (count >= perBotTradeLimit) {
        continue
      }
      latestCompletedTrades.push(trade)
      perBotCounts.set(trade.botId, count + 1)
      if (latestCompletedTrades.length >= maxCompletedTrades) {
        break
      }
    }

    let completedTradesResponse =
      latestCompletedTrades.length > 0 ? latestCompletedTrades : sortedCompletedTrades.slice(0, 100)

    if (completedTradesResponse.length === 0) {
      const fallbackCounts = new Map<string, number>()
      const fallbackTrades: CompletedTrade[] = []
      const rawTradesSorted = [...tradesData].sort((a, b) => {
        const timeA = Date.parse(a.executed_at ?? "")
        const timeB = Date.parse(b.executed_at ?? "")
        return timeB - timeA
      })

      for (const trade of rawTradesSorted) {
        const botId = trade.bot_id
        const botInfo = botInfoMap.get(botId)
        if (!botInfo) {
          continue
        }
        if (!trade.executed_at) {
          continue
        }
        const timestamp = Date.parse(trade.executed_at)
        if (Number.isNaN(timestamp)) {
          continue
        }
        const count = fallbackCounts.get(botId) ?? 0
        if (count >= perBotTradeLimit) {
          continue
        }
        const quantity = toFiniteNumber(trade.quantity)
        const price = toFiniteNumber(trade.price)
        if (quantity <= 0 || price <= 0) {
          continue
        }

        let isTestnet = false
        const apiWalletId = botApiWalletMap.get(botId)
        if (apiWalletId) {
          isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
        }

        const currentPrice = toFiniteNumber(
          (isTestnet ? testnetPrices[trade.coin] : mainnetPrices[trade.coin]) ?? price,
        )
        const priceTo = currentPrice > 0 ? currentPrice : price
        const signedQuantity = trade.side === "SELL" ? -quantity : quantity
        const notional = Math.abs(quantity * price)
        const pnl =
          trade.side === "SELL"
            ? (price - priceTo) * quantity
            : (priceTo - price) * quantity

        fallbackTrades.push({
          id: trade.id,
          botId,
          botName: botInfo.name,
          model: botInfo.model,
          modelIcon: botInfo.icon,
          modelImage: botInfo.modelImage,
          type: trade.side === "SELL" ? "short" : "long",
          asset: trade.coin,
          time: timestamp,
          priceFrom: price,
          priceTo,
          quantity: signedQuantity,
          notionalFrom: notional,
          notionalTo: Math.abs(quantity * priceTo),
          holdingTime: "—",
          pnl,
          isTestnet,
          entryAnalysisId: trade.analysis_id ?? null,
          exitAnalysisId: null,
        })

        if (trade.analysis_id) {
          analysisIds.add(trade.analysis_id)
        }

        fallbackCounts.set(botId, count + 1)
        if (fallbackTrades.length >= maxCompletedTrades) {
          break
        }
      }

      completedTradesResponse = fallbackTrades
    }

    let completedTradeAnalyses = new Map<
      string,
      { analysis: string | null; recommendation: string | null; confidence: number | null }
    >()

    if (analysisIds.size > 0) {
      const { data: analysisRows, error: completedAnalysisError } = await supabase
        .from("price_analyses")
        .select("id, analysis, recommendation, confidence")
        .in("id", Array.from(analysisIds))

      if (completedAnalysisError) {
        console.error("[public-bots API] Error fetching completed trade analyses:", completedAnalysisError)
      } else if (analysisRows) {
        completedTradeAnalyses = new Map(
          analysisRows.map((row) => [
            row.id,
            {
              analysis: typeof row.analysis === "string" ? row.analysis : null,
              recommendation: typeof row.recommendation === "string" ? row.recommendation : null,
              confidence: row.confidence ?? null,
            },
          ]),
        )
      }
    }

    completedTradesResponse = completedTradesResponse.map((trade) => {
      const entryAnalysis = trade.entryAnalysisId ? completedTradeAnalyses.get(trade.entryAnalysisId) : null
      const exitAnalysis = trade.exitAnalysisId ? completedTradeAnalyses.get(trade.exitAnalysisId) : null

      return {
        ...trade,
        entryAnalysis: entryAnalysis?.analysis ?? null,
        entryRecommendation: entryAnalysis?.recommendation ?? null,
        entryConfidence: entryAnalysis ? toFiniteNumber(entryAnalysis.confidence) : null,
        exitAnalysis: exitAnalysis?.analysis ?? null,
        exitRecommendation: exitAnalysis?.recommendation ?? null,
        exitConfidence: exitAnalysis ? toFiniteNumber(exitAnalysis.confidence) : null,
      }
    })

    console.log("[public-bots] completedTrades summary", {
      totalComputed: sortedCompletedTrades.length,
      perBotLimited: latestCompletedTrades.length,
      returned: completedTradesResponse.length,
      fallbackUsed: sortedCompletedTrades.length === 0,
    })

    // Return data based on type parameter
    if (dataType === "leaderboard") {
      return NextResponse.json({ leaderboard }, { headers: corsHeaders })
    } else if (dataType === "modelchats") {
      return NextResponse.json({ modelChats }, { headers: corsHeaders })
    } else if (dataType === "positions") {
      return NextResponse.json({ positions }, { headers: corsHeaders })
    } else if (dataType === "completed-trades") {
      return NextResponse.json({ completedTrades: completedTradesResponse }, { headers: corsHeaders })
    } else {
      return NextResponse.json(
        {
          leaderboard,
          modelChats,
          positions,
          completedTrades: completedTradesResponse,
        },
        { headers: corsHeaders }
      )
    }
  } catch (error: any) {
    console.error("[public-bots API] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}


import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getModelIcon, getModelImage, getModelProvider } from "@/lib/share-data"
import { getModelDisplayName } from "@/lib/model-info"

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
  coin: string
  side: string
  price: number
  quantity: number | null
  leverage: number | null
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
}

/**
 * Calculate bot performance from trades using real-time prices
 */
async function calculateBotPerformance(
  botId: string,
  trades: TradeRecord[],
  currentPrices: Record<string, number>
): Promise<{
  totalValue: number
  unrealizedPnl: number
  totalTradedAmount: number
}> {
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

  for (const trade of trades) {
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

  let totalUnrealizedPnl = 0
  let totalTradedAmount = 0

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

      totalUnrealizedPnl += unrealizedPnl
      totalTradedAmount += Math.abs(tradedAmountUsd)
    }
  }

  const totalValue = totalTradedAmount + totalUnrealizedPnl

  return {
    totalValue: Math.max(0, totalValue),
    unrealizedPnl: totalUnrealizedPnl,
    totalTradedAmount,
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
      .select("id, bot_id, coin, side, price, quantity, leverage, executed_at")
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
      const performance = await calculateBotPerformance(bot.id, botTrades, currentPrices)

      const baseValue = performance.totalTradedAmount > 0 ? performance.totalTradedAmount : 10000
      const change = baseValue > 0 ? ((performance.totalValue - baseValue) / baseValue) * 100 : 0

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
      })
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
    const completedTrades: CompletedTrade[] = []
    const tradesByBotAndCoin = new Map<string, Map<string, Array<{
      id: string
      side: string
      price: number
      quantity: number
      time: number
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

    completedTrades.sort((a, b) => b.time - a.time)

    // Return data based on type parameter
    if (dataType === "leaderboard") {
      return NextResponse.json({ leaderboard }, { headers: corsHeaders })
    } else if (dataType === "modelchats") {
      return NextResponse.json({ modelChats }, { headers: corsHeaders })
    } else if (dataType === "positions") {
      return NextResponse.json({ positions }, { headers: corsHeaders })
    } else if (dataType === "completed-trades") {
      return NextResponse.json({ completedTrades: completedTrades.slice(0, 100) }, { headers: corsHeaders })
    } else {
      return NextResponse.json(
        {
          leaderboard,
          modelChats,
          positions,
          completedTrades: completedTrades.slice(0, 100),
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


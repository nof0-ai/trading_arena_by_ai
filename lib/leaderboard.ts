import { createBrowserClient } from "@/lib/supabase/client"
import { HyperliquidClient } from "@/lib/hyperliquid-client"
import { getModelIcon, getModelImage } from "@/lib/share-data"

export interface BotLeaderboardEntry {
  botId: string
  botName: string
  model: string
  icon: string
  modelImage: string
  color: string
  totalValue: number // Current total value (tradedAmount + unrealizedPnl)
  unrealizedPnl: number // Total unrealized PnL across all positions
  change: number // Percentage change (based on initial investment or total traded amount)
  totalTradedAmount: number // Total USD invested/received
  isTestnet: boolean
}

interface TradeRecord {
  coin: string
  side: string
  price: number
  quantity: number | null
  leverage: number | null
}

/**
 * Calculate bot performance from trades using real-time prices
 * Similar logic to position-panel.tsx
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
  // Calculate positions from trades using USD-based algorithm
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
        // Closing short position
        const closeQuantity = Math.min(Math.abs(existing.totalQuantity), tradeQuantity)
        existing.totalQuantity += closeQuantity
        existing.tradedAmountUsd -= closeQuantity * tradePrice
        if (Math.abs(existing.totalQuantity) < 0.0001) {
          existing.totalQuantity = 0
          existing.tradedAmountUsd = 0
        }
        // If fully closed and still have remaining, open long
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
        // Closing long position
        const closeQuantity = Math.min(existing.totalQuantity, tradeQuantity)
        existing.totalQuantity -= closeQuantity
        existing.tradedAmountUsd -= closeQuantity * tradePrice
        if (Math.abs(existing.totalQuantity) < 0.0001) {
          existing.totalQuantity = 0
          existing.tradedAmountUsd = 0
        }
        // If fully closed and still have remaining, open short
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

  // Calculate unrealized PnL using current prices
  let totalUnrealizedPnl = 0
  let totalTradedAmount = 0
  let totalCurrentValue = 0

  for (const [coin, posData] of positionMap.entries()) {
    if (Math.abs(posData.totalQuantity) < 0.0001) {
      // No open position, but count traded amount for closed positions
      continue
    }

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
      totalCurrentValue += currentAmountUsd
    }
  }

  // Total value = initial investment + unrealized PnL
  // For simplicity, we use totalTradedAmount as base and add unrealized PnL
  const totalValue = totalTradedAmount + totalUnrealizedPnl

  return {
    totalValue: Math.max(0, totalValue),
    unrealizedPnl: totalUnrealizedPnl,
    totalTradedAmount,
  }
}

/**
 * Get leaderboard of all bots ranked by total value
 */
export async function getBotLeaderboard(): Promise<BotLeaderboardEntry[]> {
  const supabase = createBrowserClient()

  // Get all bots (status is stored in encrypted_config JSON, not as a column)
  const { data: allBots, error: botsError } = await supabase
    .from("encrypted_bots")
    .select("id, encrypted_config, is_public")

  if (botsError || !allBots) {
    console.error("[getBotLeaderboard] Error fetching bots:", botsError)
    return []
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

  // Get all filled trades for all bots
  const botIds = bots.map((b) => b.id)
  const { data: trades, error: tradesError } = await supabase
    .from("trades")
    .select("bot_id, coin, side, price, quantity, leverage")
    .in("bot_id", botIds)
    .eq("status", "FILLED")
    .order("executed_at", { ascending: true })

  if (tradesError || !trades) {
    console.error("[getBotLeaderboard] Error fetching trades:", tradesError)
    return []
  }

  // Group trades by bot
  const tradesByBot = new Map<string, TradeRecord[]>()
  for (const trade of trades) {
    if (!tradesByBot.has(trade.bot_id)) {
      tradesByBot.set(trade.bot_id, [])
    }
    tradesByBot.get(trade.bot_id)!.push(trade as TradeRecord)
  }

  // Get all unique coins to fetch prices
  const allCoins = new Set<string>()
  for (const trade of trades) {
    allCoins.add(trade.coin)
  }

  // Fetch current prices from both mainnet and testnet
  const mainnetPrices: Record<string, number> = {}
  const testnetPrices: Record<string, number> = {}

  try {
    const mainnetClient = new HyperliquidClient({ testnet: false })
    const mainnetMids = await mainnetClient.getAllMids()
    for (const coin of allCoins) {
      const priceStr = mainnetMids[coin]
      if (priceStr) {
        mainnetPrices[coin] = Number.parseFloat(priceStr)
      }
    }
  } catch (error) {
    console.error("[getBotLeaderboard] Error fetching mainnet prices:", error)
  }

  try {
    const testnetClient = new HyperliquidClient({ testnet: true })
    const testnetMids = await testnetClient.getAllMids()
    for (const coin of allCoins) {
      const priceStr = testnetMids[coin]
      if (priceStr) {
        testnetPrices[coin] = Number.parseFloat(priceStr)
      }
    }
  } catch (error) {
    console.error("[getBotLeaderboard] Error fetching testnet prices:", error)
  }

  // Collect all apiWalletIds from bot configs
  const apiWalletIds: string[] = []
  const botApiWalletMap = new Map<string, string>() // botId -> apiWalletId

  for (const bot of bots) {
    try {
      const config = JSON.parse(bot.encrypted_config)
      if (config.apiWalletId) {
        apiWalletIds.push(config.apiWalletId)
        botApiWalletMap.set(bot.id, config.apiWalletId)
      }
    } catch (error) {
      // Skip bots with invalid config
    }
  }

  // Get API wallet info to determine network
  const apiWalletNetworkMap = new Map<string, boolean>() // apiWalletId -> isTestnet
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

  // Calculate performance for each bot
  const leaderboard: BotLeaderboardEntry[] = []

  for (const bot of bots) {
    const botTrades = tradesByBot.get(bot.id) || []
    if (botTrades.length === 0) continue

    // Parse bot config
    let botName = "Unknown Bot"
    let model = "Unknown"
    let icon = getModelIcon(undefined)
    let modelImage = getModelImage(undefined)
    let color = "bg-gray-500"
    let isTestnet = false

    try {
      const config = JSON.parse(bot.encrypted_config)
      botName = config.name || botName
      model = config.model || model

      // Get network from API wallet if available
      if (config.apiWalletId) {
        isTestnet = apiWalletNetworkMap.get(config.apiWalletId) || false
      }

      icon = getModelIcon(model)
      modelImage = getModelImage(model)

      // Map model to icon and color
      const modelColors: Record<string, string> = {
        "gpt-4": "bg-green-500",
        "gpt-5": "bg-green-500",
        claude: "bg-orange-500",
        "claude-sonnet": "bg-orange-500",
        gemini: "bg-blue-500",
        grok: "bg-gray-800",
        deepseek: "bg-blue-600",
        qwen: "bg-purple-600",
      }

      const modelLower = model.toLowerCase()
      for (const [key, value] of Object.entries(modelColors)) {
        if (modelLower.includes(key)) {
          color = value
          break
        }
      }
    } catch (error) {
      console.error(`[getBotLeaderboard] Error parsing config for bot ${bot.id}:`, error)
    }

    // Use appropriate prices based on network
    const currentPrices = isTestnet ? testnetPrices : mainnetPrices

    const performance = await calculateBotPerformance(bot.id, botTrades, currentPrices)

    // Calculate percentage change
    // Use totalTradedAmount as base, or 10000 as default starting value
    const baseValue = performance.totalTradedAmount > 0 ? performance.totalTradedAmount : 10000
    const change = baseValue > 0 ? ((performance.totalValue - baseValue) / baseValue) * 100 : 0

    leaderboard.push({
      botId: bot.id,
      botName,
      model,
      icon,
      modelImage,
      color,
      totalValue: performance.totalValue,
      unrealizedPnl: performance.unrealizedPnl,
      change,
      totalTradedAmount: performance.totalTradedAmount,
      isTestnet,
    })
  }

  // Sort by total value (descending)
  leaderboard.sort((a, b) => b.totalValue - a.totalValue)

  return leaderboard
}


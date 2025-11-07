import { createBrowserClient } from "@/lib/supabase/client"
import { HyperliquidClient } from "@/lib/hyperliquid-client"
import { getModelIcon, getModelImage } from "@/lib/share-data"

export interface BotPosition {
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
}

interface TradeRecord {
  coin: string
  side: string
  price: number
  quantity: number | null
  leverage: number | null
}

// Coin icons mapping
const coinIcons: Record<string, string> = {
  BTC: "₿",
  ETH: "Ξ",
  SOL: "◎",
  XRP: "✕",
  DOGE: "Ð",
  BNB: "⬡",
}

/**
 * Get all open positions for all active bots
 */
export async function getAllBotPositions(): Promise<BotPosition[]> {
  const supabase = createBrowserClient()

  // Get all bots (status is stored in encrypted_config JSON, not as a column)
  const { data: allBots, error: botsError } = await supabase
    .from("encrypted_bots")
    .select("id, encrypted_config, is_public")

  if (botsError || !allBots) {
    console.error("[getAllBotPositions] Error fetching bots:", botsError)
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

  // Create bot info map
  const botInfoMap = new Map<
    string,
    {
      name: string
      model: string
      icon: string
      modelImage: string
    }
  >()

  // Collect API wallet IDs to determine network
  const apiWalletIds: string[] = []
  const botApiWalletMap = new Map<string, string>()

  for (const bot of bots) {
    try {
      const config = JSON.parse(bot.encrypted_config)
      const model = config.model || "Unknown"

      const icon = getModelIcon(model)
      const modelImage = getModelImage(model)

      botInfoMap.set(bot.id, {
        name: config.name || "Unknown Bot",
        model: model.toUpperCase(),
        icon,
        modelImage,
      })

      if (config.apiWalletId) {
        apiWalletIds.push(config.apiWalletId)
        botApiWalletMap.set(bot.id, config.apiWalletId)
      }
    } catch (error) {
      botInfoMap.set(bot.id, {
        name: "Unknown Bot",
        model: "UNKNOWN",
        icon: getModelIcon(undefined),
        modelImage: getModelImage(undefined),
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

  // Get all filled trades for all bots
  const botIds = bots.map((b) => b.id)
  const { data: trades, error: tradesError } = await supabase
    .from("trades")
    .select("bot_id, coin, side, price, quantity, leverage")
    .in("bot_id", botIds)
    .eq("status", "FILLED")
    .order("created_at", { ascending: true })

  if (tradesError || !trades) {
    console.error("[getAllBotPositions] Error fetching trades:", tradesError)
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
    console.error("[getAllBotPositions] Error fetching mainnet prices:", error)
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
    console.error("[getAllBotPositions] Error fetching testnet prices:", error)
  }

  // Calculate positions for each bot (same logic as position-panel.tsx)
  const allPositions: BotPosition[] = []

  for (const bot of bots) {
    const botTrades = tradesByBot.get(bot.id) || []
    if (botTrades.length === 0) continue

    const botInfo = botInfoMap.get(bot.id) || {
      name: "Unknown Bot",
      model: "UNKNOWN",
      icon: "🤖",
    }

    // Determine network
    let isTestnet = false
    const apiWalletId = botApiWalletMap.get(bot.id)
    if (apiWalletId) {
      isTestnet = apiWalletNetworkMap.get(apiWalletId) || false
    }

    // Calculate positions from trades
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

    // Calculate unrealized PnL using current prices
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

        allPositions.push({
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
        })
      }
    }
  }

  return allPositions
}


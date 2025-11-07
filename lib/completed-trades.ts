import { createBrowserClient } from "@/lib/supabase/client"
import { getModelIcon, getModelImage } from "@/lib/share-data"
import { getModelDisplayName } from "@/lib/model-info"

export interface CompletedTrade {
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
}

/**
 * Get all completed trades from all bots
 * A completed trade is a pair of BUY/SELL trades that form a closed position
 */
export async function getAllCompletedTrades(limit = 100): Promise<CompletedTrade[]> {
  const supabase = createBrowserClient()

  // Get all bots (status is stored in encrypted_config JSON, not as a column)
  const { data: allBots, error: botsError } = await supabase
    .from("encrypted_bots")
    .select("id, encrypted_config, is_public")

  if (botsError || !allBots) {
    console.error("[getAllCompletedTrades] Error fetching bots:", botsError)
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
    .select("id, bot_id, coin, side, price, quantity, executed_at")
    .in("bot_id", botIds)
    .eq("status", "FILLED")
    .order("executed_at", { ascending: true })

  if (tradesError || !trades) {
    console.error("[getAllCompletedTrades] Error fetching trades:", tradesError)
    return []
  }

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

  for (const bot of bots) {
    try {
      const config = JSON.parse(bot.encrypted_config)
      const rawModel = typeof config.model === "string" ? config.model : ""

      const icon = getModelIcon(rawModel)
      const modelImage = getModelImage(rawModel)
      const displayModel = getModelDisplayName(rawModel) ?? rawModel.trim()

      botInfoMap.set(bot.id, {
        name: config.name || "Unknown Bot",
        model: displayModel,
        icon,
        modelImage,
      })
    } catch (error) {
      botInfoMap.set(bot.id, {
        name: "Unknown Bot",
        model: "",
        icon: getModelIcon(undefined),
        modelImage: getModelImage(undefined),
      })
    }
  }

  // Group trades by bot and coin
  const tradesByBotAndCoin = new Map<
    string,
    Map<
      string,
      Array<{
        id: string
        side: string
        price: number
        quantity: number
        time: number
      }>
    >
  >()

  for (const trade of trades) {
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

  // Calculate completed trades (pairs of BUY/SELL)
  const completedTrades: CompletedTrade[] = []

  for (const [botId, coinTradesMap] of tradesByBotAndCoin.entries()) {
    const botInfo = botInfoMap.get(botId) || {
      name: "Unknown Bot",
      model: "UNKNOWN",
      icon: "🤖",
    }

    for (const [coin, coinTrades] of coinTradesMap.entries()) {
      // Sort by time
      coinTrades.sort((a, b) => a.time - b.time)

      // Pair BUY with SELL (or SELL with BUY)
      let position: {
        id: string
        side: string
        price: number
        quantity: number
        time: number
      } | null = null

      for (const trade of coinTrades) {
        if (!position) {
          // Open position
          position = trade
        } else {
          // Close position if opposite side
          if (
            (position.side === "BUY" && trade.side === "SELL") ||
            (position.side === "SELL" && trade.side === "BUY")
          ) {
            const entryPx = position.price
            const exitPx = trade.price
            const entryTime = position.time
            const exitTime = trade.time

            // Calculate closed quantity
            const closedQuantity = Math.min(Math.abs(position.quantity), Math.abs(trade.quantity))

            // Calculate PnL
            const pnl =
              position.side === "BUY"
                ? (exitPx - entryPx) * closedQuantity
                : (entryPx - exitPx) * closedQuantity

            // Calculate holding time
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
            })

            // Update position if quantities don't match
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
              // Full close: position fully closed
              position = null
            }
          } else {
            // Same side: treat as new position
            position = trade
          }
        }
      }
    }
  }

  // Sort by time (most recent first) and limit
  completedTrades.sort((a, b) => b.time - a.time)
  return completedTrades.slice(0, limit)
}


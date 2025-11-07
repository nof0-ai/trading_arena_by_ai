"use client"

import { useEffect, useState, useRef } from "react"
import { HyperliquidClient, type UserState } from "@/lib/hyperliquid-client"
import { createBrowserClient } from "@/lib/supabase/client"
import { TrendingUp, TrendingDown } from "lucide-react"

interface PositionPanelProps {
  address: string
  botId?: string
  isTestnet?: boolean
}

interface BotPosition {
  coin: string
  size: number
  side: "LONG" | "SHORT"
  entryPrice: number
  totalValue: number
  unrealizedPnl: number
  leverage: number
}

interface TradeRecord {
  coin: string
  side: string
  price: number
  quantity: number | null
  leverage: number | null
}

export function PositionPanel({ address, botId, isTestnet = false }: PositionPanelProps) {
  const [userState, setUserState] = useState<UserState | null>(null)
  const [botPositions, setBotPositions] = useState<BotPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isInitialLoadRef = useRef(true)

  useEffect(() => {
    if (!address) {
      console.warn("[PositionPanel] No address provided")
      setError("No wallet address provided")
      setLoading(false)
      return
    }

    // Create client instance with correct testnet setting
    const client = new HyperliquidClient({ testnet: isTestnet })
    const supabase = createBrowserClient()

    console.log(`[PositionPanel] Loading positions for address: ${address}`)
    console.log(`[PositionPanel] Bot ID: ${botId || "N/A (showing all wallet positions)"}`)
    console.log(`[PositionPanel] Network: ${isTestnet ? "TESTNET" : "MAINNET"}`)

    const loadPositions = async (showLoading = false) => {
      try {
        if (showLoading || isInitialLoadRef.current) {
          setLoading(true)
        }
        setError(null)

        if (botId) {
          // Load bot-specific positions from trades table
          console.log(`[PositionPanel] Loading bot positions from trades table for bot: ${botId}`)
          if (!botId) {
            throw new Error("botId is required but not provided")
          }

          const { data: trades, error: tradesError } = await supabase
            .from("trades")
            .select("coin, side, price, quantity, leverage")
            .eq("bot_id", botId)
            .eq("status", "FILLED")
            .order("created_at", { ascending: true })

          if (tradesError) {
            throw new Error(`Failed to load trades: ${tradesError.message}`)
          }

          console.log(`[PositionPanel] Found ${trades?.length || 0} trades for bot`)
          if (trades && trades.length > 0) {
            console.log(`[PositionPanel] Sample trade:`, {
              coin: trades[0].coin,
              side: trades[0].side,
              price: trades[0].price,
              quantity: trades[0].quantity,
            })
          }

          // Calculate positions from trades using USD-based algorithm
          // Algorithm:
          // 1. tradedAmount (USD) - total USD invested
          // 2. currentPrice * sum(tradedAmount / entryPrice) = currentAmount (current position value in USD)
          // 3. currentAmount - tradedAmount = profit (unrealized P&L)
          const positionMap = new Map<string, {
            coin: string
            tradedAmountUsd: number // Total USD invested (for LONG) or received (for SHORT)
            totalQuantity: number // Total coin quantity (positive for LONG, negative for SHORT)
            side: "LONG" | "SHORT"
            leverage: number
            entryPrices: Array<{ amount: number; price: number }> // Track each trade for weighted average
          }>()

          if (trades) {
            for (const trade of trades as TradeRecord[]) {
              const existing = positionMap.get(trade.coin) || {
                coin: trade.coin,
                tradedAmountUsd: 0,
                totalQuantity: 0,
                side: "LONG" as const,
                leverage: trade.leverage || 1,
                entryPrices: [],
              }

              const tradePrice = Number.parseFloat(String(trade.price))
              // Use quantity from database
              const tradeQuantity = trade.quantity !== null && trade.quantity !== undefined
                ? Number.parseFloat(String(trade.quantity))
                : 0
              
              // Calculate USD value from quantity and price
              const tradeSizeUsd = tradeQuantity * tradePrice

              if (trade.side === "BUY") {
                if (existing.totalQuantity === 0 || existing.totalQuantity > 0) {
                  // Adding to or opening long position
                  existing.tradedAmountUsd += tradeSizeUsd
                  existing.totalQuantity += tradeQuantity
                  existing.side = "LONG"
                  existing.entryPrices.push({ amount: tradeSizeUsd, price: tradePrice })
                } else if (existing.totalQuantity < 0) {
                  // Closing short position
                  const closeQuantity = Math.min(Math.abs(existing.totalQuantity), tradeQuantity)
                  existing.totalQuantity += closeQuantity
                  existing.tradedAmountUsd -= (closeQuantity * tradePrice) // Reduce USD received from short
                  // Remove corresponding entry prices (FIFO)
                  let remainingToClose = closeQuantity * tradePrice
                  while (remainingToClose > 0 && existing.entryPrices.length > 0) {
                    const lastEntry = existing.entryPrices[existing.entryPrices.length - 1]
                    if (remainingToClose >= lastEntry.amount) {
                      remainingToClose -= lastEntry.amount
                      existing.entryPrices.pop()
                    } else {
                      lastEntry.amount -= remainingToClose
                      remainingToClose = 0
                    }
                  }
                  if (Math.abs(existing.totalQuantity) < 0.0001) {
                    existing.totalQuantity = 0
                    existing.tradedAmountUsd = 0
                    existing.entryPrices = []
                  }
                  // If fully closed and still have remaining, open long
                  if (existing.totalQuantity === 0 && tradeQuantity > closeQuantity) {
                    const remainingQuantity = tradeQuantity - closeQuantity
                    existing.tradedAmountUsd = remainingQuantity * tradePrice
                    existing.totalQuantity = remainingQuantity
                    existing.side = "LONG"
                    existing.entryPrices = [{ amount: existing.tradedAmountUsd, price: tradePrice }]
                  }
                }
              } else if (trade.side === "SELL") {
                if (existing.totalQuantity === 0 || existing.totalQuantity < 0) {
                  // Adding to or opening short position
                  existing.tradedAmountUsd += tradeSizeUsd // USD received from selling
                  existing.totalQuantity -= tradeQuantity // Negative for short
                  existing.side = "SHORT"
                  existing.entryPrices.push({ amount: tradeSizeUsd, price: tradePrice })
                } else if (existing.totalQuantity > 0) {
                  // Closing long position
                  const closeQuantity = Math.min(existing.totalQuantity, tradeQuantity)
                  existing.totalQuantity -= closeQuantity
                  existing.tradedAmountUsd -= (closeQuantity * tradePrice) // Reduce USD invested
                  // Remove corresponding entry prices (FIFO)
                  let remainingToClose = closeQuantity * tradePrice
                  while (remainingToClose > 0 && existing.entryPrices.length > 0) {
                    const firstEntry = existing.entryPrices[0]
                    if (remainingToClose >= firstEntry.amount) {
                      remainingToClose -= firstEntry.amount
                      existing.entryPrices.shift()
                    } else {
                      firstEntry.amount -= remainingToClose
                      remainingToClose = 0
                    }
                  }
                  if (Math.abs(existing.totalQuantity) < 0.0001) {
                    existing.totalQuantity = 0
                    existing.tradedAmountUsd = 0
                    existing.entryPrices = []
                  }
                  // If fully closed and still have remaining, open short
                  if (existing.totalQuantity === 0 && tradeQuantity > closeQuantity) {
                    const remainingQuantity = tradeQuantity - closeQuantity
                    existing.tradedAmountUsd = remainingQuantity * tradePrice
                    existing.totalQuantity = -remainingQuantity
                    existing.side = "SHORT"
                    existing.entryPrices = [{ amount: existing.tradedAmountUsd, price: tradePrice }]
                  }
                }
              }

              // Update leverage
              if (trade.leverage) {
                existing.leverage = trade.leverage
              }

              positionMap.set(trade.coin, existing)
            }
          }

                    // Get current market prices to calculate unrealized PnL using USD-based algorithm
          const positions: BotPosition[] = []
          for (const [coin, posData] of positionMap.entries()) {
            if (Math.abs(posData.totalQuantity) < 0.0001) continue // Skip zero positions

            try {
              // Get current price from Hyperliquid
              const mids = await client.getAllMids()
              const currentPriceStr = mids[coin]
              const currentPrice = currentPriceStr ? Number.parseFloat(currentPriceStr) : 0

              if (currentPrice > 0) {
                const absQuantity = Math.abs(posData.totalQuantity)
                
                // Calculate weighted average entry price
                // avgEntryPrice = tradedAmount / totalQuantity
                const avgEntryPrice = absQuantity > 0 ? posData.tradedAmountUsd / absQuantity : 0
                
                // Algorithm:
                // 1. tradedAmount (USD) = total USD invested/received
                // 2. currentAmount (USD) = currentPrice * sum(tradedAmount / entryPrice)
                //    = currentPrice * totalQuantity
                // 3. profit (USD) = currentAmount - tradedAmount (for LONG)
                //                  = tradedAmount - currentAmount (for SHORT)
                const currentAmountUsd = currentPrice * absQuantity
                const tradedAmountUsd = posData.tradedAmountUsd
                
                let unrealizedPnl: number
                if (posData.side === "LONG") {
                  // LONG: currentAmount - tradedAmount
                  // Example: Invested $1000, bought 0.02 BTC at $50000
                  // Current: 0.02 BTC * $51000 = $1020
                  // Profit: $1020 - $1000 = $20
                  unrealizedPnl = currentAmountUsd - tradedAmountUsd
                } else {
                  // SHORT: tradedAmount - currentAmount
                  // Example: Sold 0.02 BTC at $50000, received $1000
                  // Current: need to buy back 0.02 BTC at $49000 = $980
                  // Profit: $1000 - $980 = $20
                  unrealizedPnl = tradedAmountUsd - currentAmountUsd
                }

                const position: BotPosition = {
                  coin: posData.coin,
                  size: posData.totalQuantity, // Keep quantity for display
                  side: posData.side,
                  entryPrice: avgEntryPrice, // For display only
                  totalValue: currentAmountUsd,
                  unrealizedPnl: unrealizedPnl,
                  leverage: posData.leverage,
                }

                console.log(`[PositionPanel] PnL calculation for ${coin}:`, {
                  side: posData.side,
                  quantity: absQuantity,
                  tradedAmountUsd: tradedAmountUsd,
                  currentAmountUsd: currentAmountUsd,
                  currentPrice: currentPrice,
                  avgEntryPrice: avgEntryPrice,
                  unrealizedPnl: unrealizedPnl,
                })

                positions.push(position)
              }
            } catch (err) {
              console.warn(`[PositionPanel] Failed to get price for ${coin}:`, err)
              // Still add position with zero PnL if price fetch fails
              positions.push({
                coin: posData.coin,
                size: posData.totalQuantity,
                side: posData.side,
                entryPrice: 0,
                totalValue: 0,
                unrealizedPnl: 0,
                leverage: posData.leverage,
              })
            }
          }

          console.log(`[PositionPanel] Calculated ${positions.length} bot positions`)
          setBotPositions(positions)

          // Also load account value from Hyperliquid for display
          try {
            const state = await client.getUserState(address)
        setUserState(state)
      } catch (err) {
            console.warn("[PositionPanel] Failed to load account value from Hyperliquid:", err)
          }
        } else {
          // No botId: load all wallet positions from Hyperliquid API
          console.log(`[PositionPanel] Loading all wallet positions from Hyperliquid API`)
          const state = await client.getUserState(address)
          console.log(`[PositionPanel] User state received:`, {
            assetPositions: state.assetPositions?.length || 0,
            accountValue: state.marginSummary?.accountValue,
          })
          setUserState(state)
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err)
        console.error("[PositionPanel] Error loading positions:", err)
        console.error("[PositionPanel] Address used:", address)
        console.error("[PositionPanel] Bot ID:", botId)
        console.error("[PositionPanel] Network:", isTestnet ? "TESTNET" : "MAINNET")
        setError(`Failed to load positions: ${errorMsg}`)
      } finally {
        if (showLoading || isInitialLoadRef.current) {
          setLoading(false)
        }
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false
        }
      }
    }

    // Initial load with loading state
    loadPositions(true)

    // Set up real-time subscriptions and periodic refresh
    const cleanupFunctions: Array<() => void> = []

    if (botId) {
      // For bot-specific positions: use Supabase Realtime + periodic price refresh
      console.log(`[PositionPanel] Setting up realtime subscription for bot: ${botId}`)
      
      // Subscribe to trades table changes via Supabase Realtime
      const tradesChannel = supabase
        .channel(`trades:bot:${botId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trades",
            filter: `bot_id=eq.${botId}`,
          },
          (payload) => {
            console.log("[PositionPanel] Trade change detected:", payload.eventType)
            // Silently refresh positions when trades change
            loadPositions(false)
          }
        )
        .subscribe()

      cleanupFunctions.push(() => {
        supabase.removeChannel(tradesChannel)
      })

      // Refresh prices every 5 seconds (for unrealized PnL updates)
      const priceInterval = setInterval(() => {
        loadPositions(false)
      }, 5000)

      cleanupFunctions.push(() => {
        clearInterval(priceInterval)
      })
    } else {
      // For wallet-wide positions: use WebSocket + periodic refresh
      const ws = client.createWebSocket()
      ws.onopen = () => {
        client.subscribeToUserEvents(ws, address)
      }
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.channel === "user") {
          // Silently reload positions on user events
          loadPositions(false)
        }
      }

      cleanupFunctions.push(() => {
        ws.close()
      })

      // Refresh every 10 seconds
      const interval = setInterval(() => {
        loadPositions(false)
      }, 10000)

      cleanupFunctions.push(() => {
        clearInterval(interval)
      })
    }

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [address, botId, isTestnet])

  if (loading) {
    return (
      <div className="border-2 border-black bg-white p-4">
        <div className="font-mono text-sm text-gray-600">LOADING POSITIONS...</div>
      </div>
    )
  }

  if (error || !userState) {
    return (
      <div className="border-2 border-black bg-white p-4">
        <div className="font-mono text-sm text-red-600 mb-2">{error || "No data available"}</div>
        {address && (
          <div className="font-mono text-xs text-gray-500">
            wallet: {address.slice(0, 8)}...{address.slice(-6)}
          </div>
        )}
      </div>
    )
  }

  // Use bot positions if available, otherwise use wallet positions
  const hasBotPositions = botId && botPositions.length > 0
  const positions = hasBotPositions
    ? []
    : userState
      ? userState.assetPositions.filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
      : []

  return (
    <div className="border-2 border-black bg-white">
      <div className="border-b-2 border-black px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-sm font-bold">POSITIONS</h3>
          <div className="flex items-center gap-2">
            {isTestnet && (
              <span className="font-mono text-xs px-2 py-1 bg-yellow-100 text-yellow-800 border border-yellow-300">
                TESTNET
              </span>
            )}
            {userState && (
          <div className="font-mono text-xs text-gray-600">
            account value: ${Number.parseFloat(userState.marginSummary.accountValue).toFixed(2)}
              </div>
            )}
            {botId && (
              <div className="font-mono text-xs text-blue-600 mt-1">
                Showing positions for this bot only
              </div>
            )}
          </div>
        </div>
      </div>

      {hasBotPositions ? (
        // Display bot-specific positions from trades table
        botPositions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="font-mono text-sm text-gray-600 mb-2">no open positions for this bot</div>
            <div className="font-mono text-xs text-gray-500">
              Bot ID: {botId}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead className="border-b-2 border-black bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">COIN</th>
                  <th className="px-4 py-2 text-left font-bold">SIDE</th>
                  <th className="px-4 py-2 text-right font-bold">SIZE</th>
                  <th className="px-4 py-2 text-right font-bold">ENTRY</th>
                  <th className="px-4 py-2 text-right font-bold">VALUE</th>
                  <th className="px-4 py-2 text-right font-bold">UNREAL P&L</th>
                </tr>
              </thead>
              <tbody>
                {botPositions.map((pos, index) => {
                  const isLong = pos.side === "LONG"
                  const absSize = Math.abs(pos.size)

                  return (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold">{pos.coin}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${isLong ? "text-green-600" : "text-red-600"}`}>
                          {pos.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{absSize.toFixed(4)}</td>
                      <td className="px-4 py-3 text-right">${pos.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">${pos.totalValue.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={pos.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}>
                          {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : positions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="font-mono text-sm text-gray-600 mb-2">no open positions</div>
          <div className="font-mono text-xs text-gray-500">
            wallet: {address.slice(0, 8)}...{address.slice(-6)}
          </div>
          {userState && (
            <div className="font-mono text-xs text-gray-500 mt-1">
              account value: ${Number.parseFloat(userState.marginSummary.accountValue).toFixed(2)}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="border-b-2 border-black bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-bold">COIN</th>
                <th className="px-4 py-2 text-left font-bold">SIDE</th>
                <th className="px-4 py-2 text-right font-bold">SIZE</th>
                <th className="px-4 py-2 text-right font-bold">ENTRY</th>
                <th className="px-4 py-2 text-right font-bold">VALUE</th>
                <th className="px-4 py-2 text-right font-bold">UNREAL P&L</th>
                <th className="px-4 py-2 text-right font-bold">ROE</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((ap, index) => {
                const pos = ap.position
                const size = Number.parseFloat(pos.szi)
                const isLong = size > 0
                const unrealizedPnl = Number.parseFloat(pos.unrealizedPnl)
                const roe = Number.parseFloat(pos.returnOnEquity)

                return (
                  <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold">{pos.coin}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${isLong ? "text-green-600" : "text-red-600"}`}>
                        {isLong ? "LONG" : "SHORT"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{Math.abs(size).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right">${Number.parseFloat(pos.entryPx).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${Number.parseFloat(pos.positionValue).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}>
                        {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {roe >= 0 ? (
                          <TrendingUp className="size-3 text-green-600" />
                        ) : (
                          <TrendingDown className="size-3 text-red-600" />
                        )}
                        <span className={roe >= 0 ? "text-green-600" : "text-red-600"}>
                          {roe >= 0 ? "+" : ""}
                          {(roe * 100).toFixed(2)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export type PerformanceTradeInput = {
  id: string
  coin: string
  side: "BUY" | "SELL"
  price: number
  quantity: number
  timestamp: number
}

export type CompletedPerformanceTrade = {
  id: string
  time: number
  coin: string
  side: "LONG" | "SHORT"
  entryPx: number
  exitPx: number
  pnl: number
}

export type PerformanceMetrics = {
  accountValue: number
  totalPnl: number
  pnlPercentage: number
  winRate: number
  winningTrades: number
  totalTrades: number
  sharpeRatio: number
}

export type PerformanceComputation = {
  metrics: PerformanceMetrics
  accountHistory: Array<{ date: string; value: number }>
  recentTrades: CompletedPerformanceTrade[]
  completedTrades: CompletedPerformanceTrade[]
  periodStart: string | null
  periodEnd: string | null
}

export function computePerformanceFromTrades(trades: PerformanceTradeInput[]): PerformanceComputation {
  const totalTrades = trades.length

  if (totalTrades === 0) {
    return {
      metrics: {
        accountValue: 0,
        totalPnl: 0,
        pnlPercentage: 0,
        winRate: 0,
        winningTrades: 0,
        totalTrades: 0,
        sharpeRatio: 0,
      },
      accountHistory: [],
      recentTrades: [],
      completedTrades: [],
      periodStart: null,
      periodEnd: null,
    }
  }

  const tradesByCoin = new Map<string, Array<{
    id: string
    side: "BUY" | "SELL"
    price: number
    quantity: number
    time: number
  }>>()

  let earliestTimestamp = Number.POSITIVE_INFINITY
  let latestTimestamp = 0

  for (const trade of trades) {
    const time = Number.isFinite(trade.timestamp) ? trade.timestamp : Date.now()
    if (time < earliestTimestamp) {
      earliestTimestamp = time
    }
    if (time > latestTimestamp) {
      latestTimestamp = time
    }

    const entry = tradesByCoin.get(trade.coin) ?? []
    entry.push({
      id: trade.id,
      side: trade.side,
      price: Number.isFinite(trade.price) ? trade.price : 0,
      quantity: Number.isFinite(trade.quantity) ? trade.quantity : 0,
      time,
    })
    tradesByCoin.set(trade.coin, entry)
  }

  const completedTrades: CompletedPerformanceTrade[] = []

  for (const [coin, coinTrades] of tradesByCoin.entries()) {
    coinTrades.sort((a, b) => a.time - b.time)

    let position: { id: string; side: "BUY" | "SELL"; price: number; quantity: number; time: number } | null = null

    for (const trade of coinTrades) {
      if (!position) {
        position = trade
        continue
      }

      const sidesMatch = position.side === trade.side
      if (sidesMatch) {
        position = trade
        continue
      }

      const closedQuantity = Math.min(Math.abs(position.quantity), Math.abs(trade.quantity))
      const entryPx = position.price
      const exitPx = trade.price
      const pnl = position.side === "BUY"
        ? (exitPx - entryPx) * closedQuantity
        : (entryPx - exitPx) * closedQuantity

      completedTrades.push({
        id: `${position.id}-${trade.id}`,
        time: trade.time,
        coin,
        side: position.side === "BUY" ? "LONG" : "SHORT",
        entryPx,
        exitPx,
        pnl,
      })

      if (Math.abs(position.quantity) > Math.abs(trade.quantity)) {
        const remaining = position.side === "BUY"
          ? position.quantity - trade.quantity
          : position.quantity + trade.quantity
        position = { ...position, quantity: remaining }
      } else if (Math.abs(trade.quantity) > Math.abs(position.quantity)) {
        const remaining = trade.side === "BUY"
          ? trade.quantity - position.quantity
          : trade.quantity + position.quantity
        position = { ...trade, quantity: remaining }
      } else {
        position = null
      }
    }
  }

  const totalPnl = completedTrades.reduce((sum, trade) => sum + trade.pnl, 0)
  const winningTrades = completedTrades.filter((trade) => trade.pnl > 0).length
  const winRate = completedTrades.length > 0 ? (winningTrades / completedTrades.length) * 100 : 0
  const returns = completedTrades.map((trade) => trade.pnl)
  const avgReturn = returns.length > 0 ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length > 0
    ? returns.reduce((sum, value) => sum + Math.pow(value - avgReturn, 2), 0) / returns.length
    : 0
  const stdDev = Math.sqrt(variance)
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0
  const accountValue = Math.max(0, totalPnl)
  const pnlPercentage = accountValue > 0 ? (totalPnl / accountValue) * 100 : 0

  const orderedTrades = [...completedTrades].sort((a, b) => a.time - b.time)
  const accountHistory: Array<{ date: string; value: number }> = []
  let cumulativeValue = 0
  for (const trade of orderedTrades) {
    cumulativeValue += trade.pnl
    accountHistory.push({
      date: new Date(trade.time).toISOString(),
      value: Math.max(0, cumulativeValue),
    })
  }

  const recentTrades = [...completedTrades]
    .sort((a, b) => b.time - a.time)
    .slice(0, 10)

  const periodStart = Number.isFinite(earliestTimestamp) ? new Date(earliestTimestamp).toISOString() : null
  const periodEnd = Number.isFinite(latestTimestamp) ? new Date(latestTimestamp).toISOString() : null

  return {
    metrics: {
      accountValue,
      totalPnl,
      pnlPercentage,
      winRate,
      winningTrades,
      totalTrades,
      sharpeRatio,
    },
    accountHistory,
    recentTrades,
    completedTrades,
    periodStart,
    periodEnd,
  }
}


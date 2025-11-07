import { computePerformanceFromTrades, type PerformanceTradeInput } from "@/lib/performance-metrics"
import { createBrowserClient } from "@/lib/supabase/client"

export interface BotPerformanceData {
  metrics: {
    accountValue: number
    totalPnl: number
    pnlPercentage: number
    winRate: number
    winningTrades: number
    totalTrades: number
    sharpeRatio: number
  }
  accountHistory: Array<{
    date: string
    value: number
  }>
  prompt: string
  recentTrades: Array<{
    id: string
    time: number
    coin: string
    side: "LONG" | "SHORT"
    entryPx: number
    exitPx: number
    pnl: number
  }>
}

type SupabaseClient = ReturnType<typeof createBrowserClient>

const zeroMetrics: BotPerformanceData["metrics"] = {
  accountValue: 0,
  totalPnl: 0,
  pnlPercentage: 0,
  winRate: 0,
  winningTrades: 0,
  totalTrades: 0,
  sharpeRatio: 0,
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeAccountHistory(raw: unknown): BotPerformanceData["accountHistory"] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null
      }
      const date = "date" in item ? String((item as any).date) : null
      if (!date) {
        return null
      }
      return {
        date,
        value: toFiniteNumber((item as any).value),
      }
    })
    .filter((entry): entry is { date: string; value: number } => Boolean(entry))
}

function normalizeRecentTrades(raw: unknown): BotPerformanceData["recentTrades"] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null
      }

      const id = "id" in item ? String((item as any).id) : null
      const coin = "coin" in item ? String((item as any).coin) : null
      const side = "side" in item ? String((item as any).side) : null
      const timeValue = toFiniteNumber((item as any).time)
      if (!id || !coin || (side !== "LONG" && side !== "SHORT")) {
        return null
      }

      return {
        id,
        coin,
        side,
        time: timeValue,
        entryPx: toFiniteNumber((item as any).entryPx),
        exitPx: toFiniteNumber((item as any).exitPx),
        pnl: toFiniteNumber((item as any).pnl),
      }
    })
    .filter((trade): trade is BotPerformanceData["recentTrades"][number] => Boolean(trade))
}

function normalizeMetrics(raw: unknown): BotPerformanceData["metrics"] {
  if (!raw || typeof raw !== "object") {
    return zeroMetrics
  }

  return {
    accountValue: toFiniteNumber((raw as any).accountValue),
    totalPnl: toFiniteNumber((raw as any).totalPnl),
    pnlPercentage: toFiniteNumber((raw as any).pnlPercentage),
    winRate: toFiniteNumber((raw as any).winRate),
    winningTrades: toFiniteNumber((raw as any).winningTrades),
    totalTrades: toFiniteNumber((raw as any).totalTrades),
    sharpeRatio: toFiniteNumber((raw as any).sharpeRatio),
  }
}

function resolveTimestamp(executedAt: string | null, createdAt: string | null): number {
  if (executedAt) {
    const ts = Date.parse(executedAt)
    if (!Number.isNaN(ts)) {
      return ts
    }
  }
  if (createdAt) {
    const ts = Date.parse(createdAt)
    if (!Number.isNaN(ts)) {
      return ts
    }
  }
  return Date.now()
}

async function fetchSnapshot(supabase: SupabaseClient, botId: string): Promise<BotPerformanceData | null> {
  const { data, error } = await supabase
    .from("bot_performance_snapshots")
    .select("metrics, account_history, prompt, recent_trades")
    .eq("bot_id", botId)
    .eq("status", "ready")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    console.error(`[getBotPerformance] Snapshot query failed for bot ${botId}:`, error)
    return null
  }

  if (!data) {
    return null
  }

  return {
    metrics: normalizeMetrics(data.metrics),
    accountHistory: normalizeAccountHistory(data.account_history),
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    recentTrades: normalizeRecentTrades(data.recent_trades),
  }
}

async function loadBotPrompt(supabase: SupabaseClient, botId: string): Promise<string> {
  const { data, error } = await supabase
    .from("encrypted_bots")
    .select("encrypted_config")
    .eq("id", botId)
    .single()

  if (error || !data) {
    console.error(`[getBotPerformance] Failed to load bot config for ${botId}:`, error)
    return ""
  }

  const parsed = JSON.parse(data.encrypted_config)
  if (parsed && typeof parsed === "object" && "prompt" in parsed) {
    const prompt = (parsed as any).prompt
    return typeof prompt === "string" ? prompt : ""
  }

  return ""
}

async function computePerformanceOnDemand(supabase: SupabaseClient, botId: string): Promise<BotPerformanceData | null> {
  const prompt = await loadBotPrompt(supabase, botId)

  const { data: tradeRows, error } = await supabase
    .from("trades")
    .select("id, coin, side, price, quantity, executed_at, created_at")
    .eq("bot_id", botId)
    .eq("status", "FILLED")
    .order("executed_at", { ascending: true })

  if (error) {
    console.error(`[getBotPerformance] Failed to load trades for fallback computation (bot ${botId}):`, error)
    return null
  }

  const inputs: PerformanceTradeInput[] = (tradeRows ?? []).map((trade) => ({
    id: trade.id,
    coin: trade.coin,
    side: trade.side as "BUY" | "SELL",
    price: toFiniteNumber(trade.price),
    quantity: toFiniteNumber(trade.quantity),
    timestamp: resolveTimestamp(trade.executed_at ?? null, trade.created_at ?? null),
  }))

  const computation = computePerformanceFromTrades(inputs)

  return {
    metrics: computation.metrics,
    accountHistory: computation.accountHistory,
    prompt,
    recentTrades: computation.recentTrades,
  }
}

export async function getBotPerformance(botId: string): Promise<BotPerformanceData | null> {
  const supabase = createBrowserClient()

  const snapshot = await fetchSnapshot(supabase, botId)
  if (snapshot) {
    return snapshot
  }

  return await computePerformanceOnDemand(supabase, botId)
}

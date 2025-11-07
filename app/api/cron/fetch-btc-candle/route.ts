import { NextResponse } from "next/server"
import { HyperliquidClient } from "@/lib/hyperliquid-client"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// This endpoint can be called by:
// 1. External cron services (cron-job.org, EasyCron, etc.)
// 2. System cron (curl command)
// 3. GitHub Actions
// 4. Any HTTP client with proper authentication
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  // Verify cron secret (optional but recommended for security)
  // Set CRON_SECRET environment variable to enable authentication
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hyperliquidClient = new HyperliquidClient()
  
  // Get current timestamp and 5 minutes ago (to ensure we get data)
  const now = Date.now()
  const fiveMinutesAgo = now - 5 * 60 * 1000

  // Fetch BTC candle data for 1m interval
  const candles = await hyperliquidClient.getCandleSnapshot("BTC", "5m", fiveMinutesAgo, now)

  if (candles.length === 0) {
    return NextResponse.json({ message: "No candle data available", timestamp: now })
  }

  // Get the most recent candle (last one)
  const latestCandle = candles[candles.length - 1]

  // Store in Supabase using service role key for cron jobs
  // MUST use service_role key to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase configuration")
    console.error("NOTE: SUPABASE_SERVICE_ROLE_KEY is required, not anon key")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  // Create client with service_role key (this bypasses RLS automatically)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { error } = await supabase.from("price_candles").upsert(
    {
      coin: "BTC",
      interval: "5m",
      time: latestCandle.time,
      open: latestCandle.open.toString(),
      high: latestCandle.high.toString(),
      low: latestCandle.low.toString(),
      close: latestCandle.close.toString(),
      volume: latestCandle.volume.toString(),
    },
    {
      onConflict: "coin,interval,time",
    },
  )

  if (error) {
    console.error("Error storing candle data:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    candle: latestCandle,
    timestamp: now,
  })
}


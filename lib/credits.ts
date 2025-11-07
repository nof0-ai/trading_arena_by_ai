import { createBrowserClient } from "@/lib/supabase/client"

export interface UserCredit {
  id: string
  user_address: string
  balance: number
  currency: string
  created_at: string
  updated_at: string
}

export interface CreditTransaction {
  id: string
  user_address: string
  amount: number
  type: "deposit" | "withdrawal" | "bot_creation" | "bot_usage" | "refund"
  description: string | null
  bot_id: string | null
  created_at: string
}

// Bot creation pricing based on model
export const BOT_CREATION_COSTS = {
  "gpt-4": 10.0,
  "gpt-3.5-turbo": 5.0,
  "claude-3-opus": 12.0,
  "claude-3-sonnet": 8.0,
  "claude-3-haiku": 4.0,
  "gemini-pro": 6.0,
  "gemini-ultra": 10.0,
}

// Monthly subscription costs
export const MONTHLY_COSTS = {
  "gpt-4": 50.0,
  "gpt-3.5-turbo": 20.0,
  "claude-3-opus": 60.0,
  "claude-3-sonnet": 35.0,
  "claude-3-haiku": 15.0,
  "gemini-pro": 25.0,
  "gemini-ultra": 45.0,
}

export async function getUserBalance(userAddress: string): Promise<number> {
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  const { data, error } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_address", normalizedAddress)
    .eq("currency", "USD")
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      // No record found, create one
      const { data: newCredit, error: insertError } = await supabase
        .from("user_credits")
        .insert({ user_address: normalizedAddress, balance: 0, currency: "USD" })
        .select()
        .single()

      if (insertError) throw insertError
      return newCredit.balance
    }
    throw error
  }

  return data.balance
}

export async function addCredits(userAddress: string, amount: number, description: string): Promise<void> {
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  // Start a transaction by getting current balance
  const currentBalance = await getUserBalance(userAddress)
  const newBalance = currentBalance + amount

  // Update balance
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_address", normalizedAddress)
    .eq("currency", "USD")

  if (updateError) throw updateError

  // Record transaction
  const { error: txError } = await supabase.from("credit_transactions").insert({
    user_address: normalizedAddress,
    amount,
    type: "deposit",
    description,
  })

  if (txError) throw txError
}

export async function deductCredits(
  userAddress: string,
  amount: number,
  type: CreditTransaction["type"],
  description: string,
  botId?: string,
): Promise<void> {
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  // Get current balance
  const currentBalance = await getUserBalance(userAddress)

  if (currentBalance < amount) {
    throw new Error("Insufficient credits")
  }

  const newBalance = currentBalance - amount

  // Update balance
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_address", normalizedAddress)
    .eq("currency", "USD")

  if (updateError) throw updateError

  // Record transaction
  const { error: txError } = await supabase.from("credit_transactions").insert({
    user_address: normalizedAddress,
    amount: -amount,
    type,
    description,
    bot_id: botId,
  })

  if (txError) throw txError
}

export async function getTransactionHistory(userAddress: string, limit = 50): Promise<CreditTransaction[]> {
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_address", normalizedAddress)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

export function getBotCreationCost(model: string): number {
  return BOT_CREATION_COSTS[model as keyof typeof BOT_CREATION_COSTS] || 5.0
}

export function getMonthlyBotCost(model: string): number {
  return MONTHLY_COSTS[model as keyof typeof MONTHLY_COSTS] || 20.0
}

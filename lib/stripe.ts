// Stripe utility functions
import { SUBSCRIPTION_PLANS, getPlanById, getTotalBotCountForPlans } from "./subscription-plans"

export const STRIPE_PLANS = {
  basic: {
    name: "Basic",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_BASIC || "",
    amount: 49,
    currency: "usd",
  },
  pro: {
    name: "Pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO || "",
    amount: 199,
    currency: "usd",
  },
  flagship: {
    name: "Flagship",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_FLAGSHIP || "",
    amount: 999,
    currency: "usd",
  },
}

export async function getSubscriptionStatus(userAddress: string) {
  const { createBrowserClient } = await import("@/lib/supabase/client")
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_address", normalizedAddress)
    .eq("status", "active")

  if (error) {
    throw error
  }

  return data || []
}

export async function getActiveSubscriptionCount(userAddress: string): Promise<number> {
  const subscriptions = await getSubscriptionStatus(userAddress)
  return subscriptions.length
}

export async function canCreateBot(userAddress: string): Promise<{ canCreate: boolean; activeSubscriptions: number; botCount: number; maxBotCount: number }> {
  const { createBrowserClient } = await import("@/lib/supabase/client")
  const supabase = createBrowserClient()

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  // Get active subscriptions with plan_id
  const subscriptions = await getSubscriptionStatus(userAddress)
  const planIds = subscriptions.map((sub: any) => sub.plan_id).filter(Boolean)
  
  // Calculate total bot count allowed based on plans
  const maxBotCount = getTotalBotCountForPlans(planIds)
  const activeSubscriptions = subscriptions.length

  // Get bot count
  const { count, error } = await supabase
    .from("encrypted_bots")
    .select("id", { count: "exact", head: true })
    .eq("user_address", normalizedAddress)

  const botCount = count || 0

  // Can create bot if bot count is less than the total allowed by all active plans
  const canCreate = botCount < maxBotCount

  return {
    canCreate,
    activeSubscriptions,
    botCount,
    maxBotCount,
  }
}

export async function getUserActivePlanIds(userAddress: string): Promise<string[]> {
  const subscriptions = await getSubscriptionStatus(userAddress)
  return subscriptions.map((sub: any) => sub.plan_id).filter(Boolean)
}

export async function cancelSubscription(subscriptionId: string) {
  const response = await fetch("/api/cancel-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to cancel subscription")
  }

  return await response.json()
}

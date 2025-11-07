"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWeb3 } from "@/components/web3-provider"
import { Header } from "@/components/header"
import { StripeCheckout } from "@/components/stripe-checkout"
import { getActiveSubscriptionCount, cancelSubscription, canCreateBot } from "@/lib/stripe"
import { STRIPE_PLANS } from "@/lib/stripe"
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/subscription-plans"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createBrowserClient } from "@/lib/supabase/client"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface Subscription {
  id: string
  stripe_subscription_id: string
  plan_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  created_at: string
}

export default function PricingPage() {
  const router = useRouter()
  const { address, isConnected, connect } = useWeb3()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [subscriptionCount, setSubscriptionCount] = useState(0)
  const [botCount, setBotCount] = useState(0)
  const [canCreate, setCanCreate] = useState(false)
  const [maxBotCount, setMaxBotCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [activePlanNames, setActivePlanNames] = useState<string[]>([])

  const availableBotSlots = Math.max(maxBotCount - botCount, 0)

  useEffect(() => {
    if (address) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [address])

  const loadData = async () => {
    if (!address) return

    setLoading(true)
    const supabase = createBrowserClient()

    // Load all subscriptions (not just active ones)
    const normalizedAddress = address.toLowerCase()
    const { data: allSubs, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_address", normalizedAddress)
      .order("created_at", { ascending: false })

    if (!error && allSubs) {
      const subs = allSubs as Subscription[]
      setSubscriptions(subs)

      const activePlans = subs
        .filter((sub) => sub.status === "active")
        .map((sub) => {
          const normalizedPlanId = sub.plan_id?.trim()
          if (!normalizedPlanId) return "Unknown"

          const planById = SUBSCRIPTION_PLANS.find((p) => p.plan_id === normalizedPlanId)
          if (planById) return planById.name

          const planByPriceId = SUBSCRIPTION_PLANS.find((p) => {
            const stripePlan = STRIPE_PLANS[p.plan_id as keyof typeof STRIPE_PLANS]
            return stripePlan?.priceId === normalizedPlanId
          })

          if (planByPriceId) return `${planByPriceId.name}`

          return normalizedPlanId.toUpperCase()
        })

      setActivePlanNames(Array.from(new Set(activePlans)))
    } else {
      setSubscriptions([])
      setActivePlanNames([])
    }

    // Load active subscription count
    const count = await getActiveSubscriptionCount(address)
    setSubscriptionCount(count)

    // Load bot count and check if can create
    const { count: botCountResult } = await supabase
      .from("encrypted_bots")
      .select("id", { count: "exact", head: true })
      .eq("user_address", address.toLowerCase())

    const botCountValue = botCountResult || 0
    setBotCount(botCountValue)

    const createCheck = await canCreateBot(address)
    setCanCreate(createCheck.canCreate)
    setMaxBotCount(createCheck.maxBotCount)

    setLoading(false)
  }

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!confirm("Are you sure you want to cancel this subscription? It will remain active until the end of the current billing period.")) {
      return
    }

    setCancelingId(subscriptionId)
    const subscription = subscriptions.find((s) => s.stripe_subscription_id === subscriptionId)
    
    if (!subscription) {
      alert("Subscription not found")
      setCancelingId(null)
      return
    }

    await cancelSubscription(subscriptionId)
    await loadData()
    setCancelingId(null)
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-16 flex items-center justify-center">
          <div className="max-w-md w-full bg-white border-2 border-black p-8 space-y-6">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold font-mono">CONNECT WALLET</h1>
              <p className="text-sm text-gray-600">
                Connect your Web3 wallet to view and manage subscriptions
              </p>
            </div>
            <button
              onClick={connect}
              className="w-full border-2 border-black bg-black text-white px-6 py-3 font-mono text-sm hover:bg-gray-800"
            >
              CONNECT WALLET
            </button>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-black transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-mono hover:underline"
          >
            <ArrowLeft className="size-4" />
            BACK TO ARENA
          </Link>
        </div>

        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold font-mono">SUBSCRIPTION PLANS</h1>
            <p className="text-sm text-gray-600 font-mono">
              Choose a plan that fits your trading needs
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 font-mono text-sm text-gray-600">
              Loading subscription information...
            </div>
          ) : (
            <>
              {/* Current Status */}
              <div className="border-2 border-black bg-white p-6 space-y-4">
                <h2 className="text-xl font-bold font-mono">CURRENT STATUS</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm font-mono">
                  <div>
                    <div className="text-gray-600">ACTIVE SUBSCRIPTIONS</div>
                    <div className="text-2xl font-bold">{subscriptionCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">BOTS CREATED</div>
                    <div className="text-2xl font-bold">{botCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">ACTIVE PLAN(S)</div>
                    <div className="text-sm font-bold">
                      {activePlanNames.length > 0 ? activePlanNames.join(", ") : "None"}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">AVAILABLE BOT SLOTS</div>
                    <div className={`text-2xl font-bold ${availableBotSlots > 0 ? "text-green-600" : "text-red-600"}`}>
                      {availableBotSlots}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">CAN CREATE BOT</div>
                    <div className={`text-2xl font-bold ${canCreate ? "text-green-600" : "text-red-600"}`}>
                      {canCreate ? "YES" : "NO"}
                    </div>
                  </div>
                </div>
                {!canCreate && (
                  <div className="border-2 border-yellow-300 bg-yellow-50 p-4 rounded">
                    <div className="text-sm font-mono text-yellow-800">
                      You have {botCount} bot(s) and can create up to {maxBotCount} bot(s) with your current subscriptions. You need to upgrade your plan to create more bots.
                    </div>
                  </div>
                )}
              </div>

              {/* Subscription Plans */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const stripePlan = STRIPE_PLANS[plan.plan_id as keyof typeof STRIPE_PLANS]
                  const priceId = stripePlan?.priceId || ""
                  
                  return (
                    <div key={plan.plan_id} className="border-2 border-black bg-white p-6 space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold font-mono">{plan.name}</h3>
                        <div className="text-3xl font-bold font-mono">${plan.price_usd}/mo</div>
                      </div>
                      
                      <div className="space-y-2 text-sm font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bots:</span>
                          <span className="font-bold">{plan.features.bot_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Trigger Interval:</span>
                          <span className="font-bold">{plan.features.trigger_interval_minutes} min</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Models:</span>
                          <span className="font-bold">{plan.available_models.length}</span>
                        </div>
                      </div>
                      
                      {priceId ? (
                        <Button
                          onClick={() => {
                            setSelectedPlan(plan)
                            setShowCheckoutDialog(true)
                          }}
                          className="w-full border-2 border-black bg-black text-white font-mono hover:bg-gray-800"
                        >
                          SUBSCRIBE
                        </Button>
                      ) : (
                        <div className="text-xs text-red-600 font-mono">
                          Price ID not configured for {plan.name}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Checkout Dialog */}
              <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold font-mono">
                      {selectedPlan ? `Subscribe to ${selectedPlan.name} Plan` : "Subscribe"}
                    </DialogTitle>
                  </DialogHeader>
                  {selectedPlan && (
                    <div className="space-y-4">
                      <div className="border-2 border-black bg-white p-4 space-y-2">
                        <div className="text-sm font-mono">
                          <div className="font-bold text-lg">{selectedPlan.name} Plan</div>
                          <div className="text-2xl font-bold">${selectedPlan.price_usd}/month</div>
                        </div>
                        <div className="space-y-1 text-xs font-mono text-gray-600">
                          <div>• {selectedPlan.features.bot_count} bot(s)</div>
                          <div>• {selectedPlan.features.trigger_interval_minutes} minute trigger interval</div>
                          <div>• {selectedPlan.available_models.length} available AI models</div>
                        </div>
                      </div>
                      <StripeCheckout
                        priceId={STRIPE_PLANS[selectedPlan.plan_id as keyof typeof STRIPE_PLANS]?.priceId || ""}
                        planName={`${selectedPlan.name} ($${selectedPlan.price_usd}/month)`}
                        planId={selectedPlan.plan_id}
                        onSuccess={() => {
                          setShowCheckoutDialog(false)
                          setSelectedPlan(null)
                          loadData()
                        }}
                      />
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* All Subscriptions */}
              {subscriptions.length > 0 && (
                <div className="border-2 border-black bg-white p-6 space-y-4">
                  <h2 className="text-xl font-bold font-mono">MY SUBSCRIPTIONS</h2>
                  <div className="space-y-4">
                    {subscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        className="border-2 border-gray-300 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="font-mono text-sm font-bold">
                              Status: <span className={
                                sub.status === "active" ? "text-green-600" : 
                                sub.status === "canceled" ? "text-red-600" :
                                sub.status === "past_due" ? "text-orange-600" :
                                "text-yellow-600"
                              }>
                                {sub.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="font-mono text-xs text-gray-600">
                              Subscription ID: {sub.stripe_subscription_id.slice(0, 20)}...
                            </div>
                            <div className="font-mono text-xs text-gray-600">
                              Current Period: {new Date(sub.current_period_start).toLocaleDateString()} - {new Date(sub.current_period_end).toLocaleDateString()}
                            </div>
                            {sub.cancel_at_period_end && (
                              <div className="font-mono text-xs text-yellow-600">
                                Will cancel at end of period
                              </div>
                            )}
                          </div>
                          {sub.status === "active" && !sub.cancel_at_period_end && (
                            <Button
                              onClick={() => handleCancelSubscription(sub.stripe_subscription_id)}
                              disabled={cancelingId === sub.stripe_subscription_id}
                              className="font-mono text-xs border-2 border-black"
                              variant="outline"
                            >
                              {cancelingId === sub.stripe_subscription_id ? "CANCELING..." : "CANCEL"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}


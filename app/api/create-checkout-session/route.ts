import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { priceId, customerId, userAddress, planId } = body

  if (!priceId || !customerId || !userAddress) {
    return NextResponse.json({ error: "Missing priceId, customerId, or userAddress" }, { status: 400 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe secret key not configured" }, { status: 500 })
  }

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  // Get the origin from request headers for return URL
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const returnUrl = `${origin}/pricing`

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    ui_mode: "custom",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    return_url: returnUrl,
    metadata: {
      user_id: user.id,
      user_address: normalizedAddress,
      plan_id: planId || "",
    },
  })

  return NextResponse.json({ clientSecret: session.client_secret })
}


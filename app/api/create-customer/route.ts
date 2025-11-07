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
  const { email, userAddress } = body

  if (!email || !userAddress) {
    return NextResponse.json({ error: "Missing email or userAddress" }, { status: 400 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe secret key not configured" }, { status: 500 })
  }

  // Normalize address to lowercase for consistency
  const normalizedAddress = userAddress.toLowerCase()

  const customer = await stripe.customers.create({
    email,
    metadata: {
      user_id: user.id,
      user_address: normalizedAddress,
    },
  })

  return NextResponse.json({ customerId: customer.id })
}


"use client"

import { useState, useEffect, useRef } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { useWeb3 } from "./web3-provider"
import { Button } from "./ui/button"
import { createBrowserClient } from "@/lib/supabase/client"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")

interface StripeCheckoutProps {
  priceId: string
  planName: string
  planId?: string
  onSuccess?: () => void
}

export function StripeCheckout({ priceId, planName, planId, onSuccess }: StripeCheckoutProps) {
  const { address } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkout, setCheckout] = useState<any>(null)
  const [paymentElement, setPaymentElement] = useState<any>(null)
  const [isReady, setIsReady] = useState(false)
  const paymentElementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!address || !priceId || !paymentElementRef.current) return

    const initializeCheckout = async () => {
      const stripe = await stripePromise
      if (!stripe) {
        setError("Stripe not initialized")
        return
      }

      const supabase = createBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError("Please sign in first")
        return
      }

      // Create or get customer
      let customerId: string
      const customerResponse = await fetch("/api/create-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email || `${address.toLowerCase()}@wallet.local`,
          userAddress: address,
        }),
      })

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json()
        setError(errorData.error || "Failed to create customer")
        return
      }

      const { customerId: newCustomerId } = await customerResponse.json()
      customerId = newCustomerId

      // Create checkout session
      const sessionResponse = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          customerId,
          userAddress: address,
          planId,
        }),
      })

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json()
        setError(errorData.error || "Failed to create checkout session")
        return
      }

      const { clientSecret } = await sessionResponse.json()

      if (!clientSecret) {
        setError("No client secret returned")
        return
      }

      // Initialize Stripe Checkout
      const checkoutInstance = await stripe.initCheckout({ clientSecret })
      setCheckout(checkoutInstance)

      // Wait for DOM element to be ready
      if (!paymentElementRef.current) {
        setError("Payment element container not found")
        return
      }

      // For ui_mode=custom, use createPaymentElement() to create the Payment Element
      // Then mount it to the container
      try {
        const element = await checkoutInstance.createPaymentElement()
        
        if (!element) {
          setError("Failed to create payment element")
          return
        }

        // Mount the Payment Element to the container
        if (typeof element.mount === "function") {
          await element.mount(paymentElementRef.current)
          setPaymentElement(element)
          setIsReady(true)
        } else {
          setError("Payment element does not have mount method")
        }
      } catch (elementError: any) {
        console.error("Error creating or mounting payment element:", elementError)
        setError(elementError.message || "Failed to create or mount payment element")
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeCheckout()
    }, 100)

    return () => clearTimeout(timer)
  }, [address, priceId])

  const handleSubscribe = async () => {
    if (!checkout || !isReady) {
      setError("Checkout not ready")
      return
    }

    setLoading(true)
    setError(null)

    const loadActionsResult = await checkout.loadActions()

    if (loadActionsResult.type === "error") {
      setError(loadActionsResult.error.message)
      setLoading(false)
      return
    }

    const { actions } = loadActionsResult

    // returnUrl is already set in the checkout session, so we don't need to provide it here
    const result = await actions.confirm()

    if (result.type === "error") {
      setError(result.error.message)
    } else if (result.type === "complete") {
      if (onSuccess) {
        onSuccess()
      }
    }

    setLoading(false)
  }

  if (!address) {
    return (
      <div className="text-sm text-gray-600 font-mono">
        Please connect your wallet to subscribe
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 font-mono">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div ref={paymentElementRef} id="payment-element" className="min-h-[200px] border-2 border-gray-300 rounded p-4" />
      {isReady && (
        <Button
          onClick={handleSubscribe}
          disabled={loading}
          className="font-mono w-full"
        >
          {loading ? "PROCESSING..." : `SUBSCRIBE TO ${planName.toUpperCase()}`}
        </Button>
      )}
      {!isReady && !error && (
        <div className="text-sm text-gray-600 font-mono text-center">
          Initializing payment form...
        </div>
      )}
    </div>
  )
}


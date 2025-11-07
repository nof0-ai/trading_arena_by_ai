"use client"

import { useState, useEffect } from "react"
import { useWeb3 } from "./web3-provider"
import { getUserBalance, addCredits, getTransactionHistory, type CreditTransaction } from "@/lib/credits"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function CreditManager() {
  const { address } = useWeb3()
  const [balance, setBalance] = useState<number>(0)
  const [amount, setAmount] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (address) {
      loadBalance()
      loadTransactions()
    }
  }, [address])

  const loadBalance = async () => {
    if (!address) return
    try {
      const bal = await getUserBalance(address)
      setBalance(bal)
    } catch (error) {
      console.error("Failed to load balance:", error)
    }
  }

  const loadTransactions = async () => {
    if (!address) return
    try {
      const txs = await getTransactionHistory(address)
      setTransactions(txs)
    } catch (error) {
      console.error("Failed to load transactions:", error)
    }
  }

  const handleDeposit = async () => {
    if (!address || !amount) return

    const depositAmount = Number.parseFloat(amount)
    if (isNaN(depositAmount) || depositAmount <= 0) {
      alert("Please enter a valid amount")
      return
    }

    setLoading(true)
    try {
      // In production, integrate with payment gateway or crypto payment
      await addCredits(address, depositAmount, "Manual deposit")
      await loadBalance()
      await loadTransactions()
      setAmount("")
      alert(`Successfully added $${depositAmount.toFixed(2)} credits`)
    } catch (error) {
      console.error("Deposit failed:", error)
      alert("Failed to add credits")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-2 border-black bg-white p-6">
      <div className="mb-6">
        <div className="text-sm font-mono mb-2">CURRENT BALANCE</div>
        <div className="text-3xl font-mono font-bold text-green-600">${balance.toFixed(2)}</div>
      </div>

      <div className="mb-6">
        <div className="text-sm font-mono mb-2">ADD CREDITS</div>
        <div className="flex gap-2">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (USD)"
            className="font-mono"
            min="0"
            step="0.01"
          />
          <Button onClick={handleDeposit} disabled={loading || !amount} className="font-mono">
            {loading ? "PROCESSING..." : "DEPOSIT"}
          </Button>
        </div>
        <div className="text-xs text-gray-600 mt-2 font-mono">
          * In production, this would integrate with Stripe or crypto payment
        </div>
      </div>

      <div>
        <Button onClick={() => setShowHistory(!showHistory)} variant="outline" className="font-mono w-full">
          {showHistory ? "HIDE" : "SHOW"} TRANSACTION HISTORY
        </Button>

        {showHistory && (
          <div className="mt-4 border-2 border-black p-4 max-h-64 overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="text-center text-gray-500 font-mono text-sm">No transactions yet</div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex justify-between items-center border-b border-gray-200 pb-2">
                    <div className="font-mono text-sm">
                      <div className="font-bold">{tx.type.toUpperCase()}</div>
                      <div className="text-xs text-gray-600">{new Date(tx.created_at).toLocaleString()}</div>
                      {tx.description && <div className="text-xs text-gray-500">{tx.description}</div>}
                    </div>
                    <div className={`font-mono font-bold ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.amount >= 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

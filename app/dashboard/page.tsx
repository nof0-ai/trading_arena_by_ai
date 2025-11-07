"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useWeb3 } from "@/components/web3-provider"
import { BotSidebar } from "@/components/bot-sidebar"
import { BotDetails } from "@/components/bot-details"
import { WalletIcon, ArrowLeft, LogOut } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const router = useRouter()
  const { address, isConnected, connect, disconnect } = useWeb3()
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)

  const handleDisconnect = () => {
    if (
      confirm("Are you sure you want to disconnect your wallet? You will need to reconnect to access the dashboard.")
    ) {
      disconnect()
      router.push("/")
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border-2 border-black p-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <WalletIcon className="size-16 text-gray-400" />
            <h1 className="text-2xl font-bold font-mono text-center">CONNECT WALLET</h1>
            <p className="text-sm text-gray-600 text-center">
              Connect your Web3 wallet to access the trading bot dashboard and manage your automated trading strategies
            </p>
          </div>
          <button
            onClick={connect}
            className="w-full border-2 border-black bg-black text-white px-6 py-3 font-mono text-sm hover:bg-gray-800 flex items-center justify-center gap-2"
          >
            <WalletIcon className="size-4" />
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
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <BotSidebar selectedBotId={selectedBotId} onSelectBot={setSelectedBotId} />

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b-2 border-black px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <ArrowLeft className="size-4" />
                <span className="font-mono text-sm font-bold">BACK TO ARENA</span>
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-bold font-mono">BOT DASHBOARD</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-mono">
                <div className="size-2 bg-green-500 rounded-full" />
                <span>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                className="border-2 border-black bg-white px-3 py-1.5 font-mono text-xs hover:bg-gray-100 transition-colors flex items-center gap-2"
                title="Disconnect Wallet"
              >
                <LogOut className="size-3" />
                DISCONNECT
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <BotDetails botId={selectedBotId} />
        </div>
      </div>
    </div>
  )
}

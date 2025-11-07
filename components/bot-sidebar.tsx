"use client"

import { useState, useEffect } from "react"
import { Plus, Bot, Lock, TestTube } from "lucide-react"
import { BotCreator } from "@/components/bot-creator"
import { listUserBots, deleteBotConfig, type EncryptedBot } from "@/lib/bot-storage"
import { useWeb3 } from "@/components/web3-provider"
import { createClient } from "@/lib/supabase/client"
import { getActiveSubscriptionCount } from "@/lib/stripe"

interface BotSidebarProps {
  selectedBotId: string | null
  onSelectBot: (botId: string | null) => void
}

export function BotSidebar({ selectedBotId, onSelectBot }: BotSidebarProps) {
  const { address } = useWeb3()
  const [showCreator, setShowCreator] = useState(false)
  const [bots, setBots] = useState<EncryptedBot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [botTestnetStatus, setBotTestnetStatus] = useState<Record<string, boolean>>({})
  const [subscriptionCount, setSubscriptionCount] = useState(0)

  useEffect(() => {
    if (address) {
      loadBots()
      loadSubscriptionCount()
    }
  }, [address])

  const loadSubscriptionCount = async () => {
    if (!address) return
    const count = await getActiveSubscriptionCount(address)
    setSubscriptionCount(count)
  }

  const loadBots = async () => {
    if (!address) return

    setIsLoading(true)
    const result = await listUserBots(address)
    if (result.success && result.bots) {
      setBots(result.bots)
      
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const testnetStatus: Record<string, boolean> = {}
        
        const testnetPromises = result.bots.map(async (bot) => {
          try {
            const config = JSON.parse(bot.encrypted_config) as { apiWalletId?: string }
            if (config.apiWalletId) {
              const { data: apiWallet } = await supabase
                .from("api_wallets")
                .select("is_testnet")
                .eq("id", config.apiWalletId)
                .eq("user_id", user.id)
                .single()
              
              if (apiWallet) {
                testnetStatus[bot.id] = apiWallet.is_testnet || false
              }
            }
          } catch {
          }
        })
        
        await Promise.all(testnetPromises)
        setBotTestnetStatus(testnetStatus)
      }
    }
    setIsLoading(false)
  }

  const handleCreateBot = async (botId: string) => {
    await loadBots()
    onSelectBot(botId)
  }

  const handleDeleteBot = async (botId: string) => {
    if (!address) return
    if (!confirm("Are you sure you want to delete this bot?")) return

    const result = await deleteBotConfig(botId, address)
    if (result.success) {
      await loadBots()
      if (selectedBotId === botId) {
        onSelectBot(null)
      }
    } else {
      alert(`Failed to delete bot: ${result.error}`)
    }
  }

  return (
    <>
      <div className="w-80 bg-white border-r-2 border-black flex flex-col">
        <div className="p-4 border-b-2 border-black">
          <button
            onClick={() => setShowCreator(true)}
            className="w-full border-2 border-black bg-black text-white px-4 py-3 font-mono text-sm hover:bg-gray-800 flex items-center justify-center gap-2"
          >
            <Plus className="size-4" />
            CREATE NEW BOT
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-500 font-mono">Loading bots...</div>
          ) : bots.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500 font-mono">
              No bots yet. Create your first trading bot!
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {bots.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => onSelectBot(bot.id)}
                  className={`w-full text-left p-3 border-2 transition-colors ${
                    selectedBotId === bot.id
                      ? "border-black bg-gray-100"
                      : "border-transparent hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-gray-600" />
                      <span className="font-mono text-sm font-bold">{bot.bot_name}</span>
                      {botTestnetStatus[bot.id] && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 border border-yellow-400 rounded">
                          <TestTube className="size-3 text-yellow-700" />
                          <span className="font-mono text-[10px] text-yellow-700 font-bold">TESTNET</span>
                        </div>
                      )}
                    </div>
                    <Lock className="size-3 text-gray-400" />
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    Created: {new Date(bot.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t-2 border-black bg-gray-50">
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-gray-600">TOTAL BOTS</span>
              <span className="font-bold">{bots.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">SUBSCRIPTIONS</span>
              <span className="font-bold">{subscriptionCount}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <Lock className="size-3" />
              <span className="text-xs">All bots encrypted</span>
            </div>
          </div>
        </div>
      </div>

      {showCreator && <BotCreator onClose={() => setShowCreator(false)} onCreate={handleCreateBot} />}
    </>
  )
}

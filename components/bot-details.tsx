"use client"

import { useState, useEffect } from "react"
import { Pause, Trash2, Settings, TrendingUp, DollarSign, Target, Zap, Globe, Lock } from "lucide-react"
import { BotPerformance } from "@/components/bot-performance"
import { KlineChart } from "@/components/kline-chart"
import { PositionPanel } from "@/components/position-panel"
import { KeyManager } from "@/components/key-manager"
import { ApiWalletManager } from "@/components/api-wallet-manager"
import { BotSettings } from "@/components/bot-settings"
import { ModelChat } from "@/components/model-chat"
import { ShareButton } from "@/components/share-button"
import { useWeb3 } from "@/components/web3-provider"
import { loadBotConfig, updateBotConfig, deleteBotConfig } from "@/lib/bot-storage"
import { getBotPerformance, type BotPerformanceData } from "@/lib/bot-performance"

interface BotDetailsProps {
  botId: string | null
}

export function BotDetails({ botId }: BotDetailsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "modelchat" | "settings">("overview")
  const { address } = useWeb3()
  const [botConfig, setBotConfig] = useState<any>(null)
  const [performanceData, setPerformanceData] = useState<BotPerformanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [botWalletAddress, setBotWalletAddress] = useState<string | null>(null)
  const [isTestnet, setIsTestnet] = useState<boolean>(false)

  const handlePause = async () => {
    if (!botId || !address || !botConfig) return

    const newStatus = botConfig.status === "active" ? "paused" : "active"
    const result = await updateBotConfig(botId, address, {
      ...botConfig,
      status: newStatus,
    })

    if (result.success) {
      setBotConfig({ ...botConfig, status: newStatus })
    } else {
      alert(`Failed to update bot status: ${result.error}`)
    }
  }

  const handleDelete = async () => {
    if (!botId || !address) return

    if (!confirm("Are you sure you want to delete this bot? This action cannot be undone.")) {
      return
    }

    const result = await deleteBotConfig(botId, address)
    if (result.success) {
      // Navigate back or refresh
      window.location.reload()
    } else {
      alert(`Failed to delete bot: ${result.error}`)
    }
  }

  const handleTogglePublic = async () => {
    if (!botId || !address || !botConfig) return

    const newIsPublic = !botConfig.isPublic
    const result = await updateBotConfig(botId, address, {
      ...botConfig,
      isPublic: newIsPublic,
    })

    if (result.success) {
      setBotConfig({ ...botConfig, isPublic: newIsPublic })
    } else {
      alert(`Failed to update bot visibility: ${result.error}`)
    }
  }

  useEffect(() => {
    if (!botId || !address) return

    async function loadData() {
      if (!botId || !address) return
      setIsLoading(true)
      const configResult = await loadBotConfig(botId, address)
      if (configResult.success && configResult.config) {
        setBotConfig(configResult.config)

        // Get bot's wallet address (API wallet or user address)
        if (configResult.config.apiWalletId) {
          const { createBrowserClient } = await import("@/lib/supabase/client")
          const supabase = createBrowserClient()
          
          // Try to get API wallet - RLS will handle user filtering
          // If user is authenticated, RLS allows access; if not, we'll get an error
          const { data: apiWallet, error: walletError } = await supabase
            .from("api_wallets")
            .select("wallet_address, is_testnet")
            .eq("id", configResult.config.apiWalletId)
            .single()
          
          if (walletError) {
            console.error("[BotDetails] Error loading API wallet:", walletError)
            console.error("[BotDetails] API Wallet ID:", configResult.config.apiWalletId)
            console.error("[BotDetails] Error details:", walletError.message, walletError.code)
            
            // If RLS error, try to get user info for debugging
            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (user) {
              console.error("[BotDetails] User ID:", user.id)
            } else {
              console.warn("[BotDetails] No authenticated user - may be RLS issue")
            }
          }
          
          if (apiWallet) {
            console.log("[BotDetails] Found API wallet:", apiWallet.wallet_address)
            console.log("[BotDetails] API wallet isTestnet:", apiWallet.is_testnet)
            setBotWalletAddress(apiWallet.wallet_address)
            setIsTestnet(apiWallet.is_testnet || false)
          } else {
            console.warn("[BotDetails] API wallet not found for ID:", configResult.config.apiWalletId)
          }
        } else {
          console.log("[BotDetails] Bot uses direct wallet address:", address)
          setBotWalletAddress(address)
        }
      }

      if (botId) {
        const perfResult = await getBotPerformance(botId)
        setPerformanceData(perfResult)
      }
      setIsLoading(false)
    }

    loadData()
  }, [botId, address])

  if (!botId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="text-6xl">🤖</div>
          <h2 className="text-xl font-bold font-mono text-gray-600">SELECT A BOT</h2>
          <p className="text-sm text-gray-500 font-mono">Choose a bot from the sidebar to view details</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white border-2 border-black p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold font-mono mb-2">
              {isLoading ? "Loading..." : botConfig?.name || "Unknown Bot"}
            </h2>
            <div className="flex items-center gap-4 text-sm font-mono text-gray-600">
              <span>Model: {isLoading ? "..." : botConfig?.model || "N/A"}</span>
              <span>•</span>
              <span>
                Created:{" "}
                {isLoading
                  ? "..."
                  : botConfig?.createdAt
                    ? new Date(botConfig.createdAt).toLocaleDateString()
                    : "N/A"}
              </span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <div
                  className={`size-2 rounded-full ${
                    isLoading
                      ? "bg-gray-400"
                      : botConfig?.status === "active"
                        ? "bg-green-500"
                        : botConfig?.status === "paused"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                  }`}
                />
                <span
                  className={`font-bold ${
                    isLoading
                      ? "text-gray-600"
                      : botConfig?.status === "active"
                        ? "text-green-600"
                        : botConfig?.status === "paused"
                          ? "text-yellow-600"
                          : "text-red-600"
                  }`}
                >
                  {isLoading ? "LOADING" : (botConfig?.status || "UNKNOWN").toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {botConfig?.isPublic && botId && (
              <ShareButton type="bot" id={botId} title={`${botConfig.name} - AI Trading Bot Performance`} />
            )}
            <button
              onClick={handleTogglePublic}
              disabled={isLoading || !botConfig}
              className={`border-2 px-4 py-2 font-mono text-sm hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                botConfig?.isPublic
                  ? "border-green-600 text-green-600"
                  : "border-gray-400 text-gray-600"
              }`}
              title={botConfig?.isPublic ? "Bot is public - click to make private" : "Bot is private - click to make public"}
            >
              {botConfig?.isPublic ? (
                <>
                  <Globe className="size-4" />
                  PUBLIC
                </>
              ) : (
                <>
                  <Lock className="size-4" />
                  PRIVATE
                </>
              )}
            </button>
            <button
              onClick={handlePause}
              disabled={isLoading || !botConfig}
              className="border-2 border-black px-4 py-2 font-mono text-sm hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pause className="size-4" />
              {botConfig?.status === "active" ? "PAUSE" : "RESUME"}
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className="border-2 border-black px-4 py-2 font-mono text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <Settings className="size-4" />
              SETTINGS
            </button>
            <button
              onClick={handleDelete}
              disabled={isLoading || !botConfig}
              className="border-2 border-red-600 text-red-600 px-4 py-2 font-mono text-sm hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="size-4" />
              DELETE
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="border-2 border-black p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="size-4 text-gray-600" />
              <span className="text-xs font-mono text-gray-600">Total PnL</span>
            </div>
            {isLoading ? (
              <div className="text-2xl font-bold font-mono text-gray-400">Loading...</div>
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">
                  ${performanceData?.metrics.accountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                </div>
                <div
                  className={`text-sm font-mono ${
                    (performanceData?.metrics.totalPnl || 0) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(performanceData?.metrics.totalPnl || 0) >= 0 ? "+" : ""}$
                  {(performanceData?.metrics.totalPnl || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  ({(performanceData?.metrics.pnlPercentage || 0) >= 0 ? "+" : ""}
                  {(performanceData?.metrics.pnlPercentage || 0).toFixed(2)}%)
                </div>
              </>
            )}
          </div>
          <div className="border-2 border-black p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="size-4 text-gray-600" />
              <span className="text-xs font-mono text-gray-600">WIN RATE</span>
            </div>
            {isLoading ? (
              <div className="text-2xl font-bold font-mono text-gray-400">Loading...</div>
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">
                  {performanceData?.metrics.winRate.toFixed(1) || "0.0"}%
                </div>
                <div className="text-sm font-mono text-gray-600">
                  {performanceData?.metrics.winningTrades || 0} / {performanceData?.metrics.totalTrades || 0} trades
                </div>
              </>
            )}
          </div>
          <div className="border-2 border-black p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="size-4 text-gray-600" />
              <span className="text-xs font-mono text-gray-600">SHARPE RATIO</span>
            </div>
            {isLoading ? (
              <div className="text-2xl font-bold font-mono text-gray-400">Loading...</div>
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">
                  {performanceData?.metrics.sharpeRatio.toFixed(2) || "0.00"}
                </div>
                <div className="text-sm font-mono text-gray-600">Risk-adjusted</div>
              </>
            )}
          </div>
          <div className="border-2 border-black p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="size-4 text-gray-600" />
              <span className="text-xs font-mono text-gray-600">TOTAL TRADES</span>
            </div>
            {isLoading ? (
              <div className="text-2xl font-bold font-mono text-gray-400">Loading...</div>
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">{performanceData?.metrics.totalTrades || 0}</div>
                <div className="text-sm font-mono text-gray-600">Last 30 days</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-black">
        <div className="border-b-2 border-black flex">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-6 py-3 font-mono text-sm font-bold border-r-2 border-black ${
              activeTab === "overview" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            OVERVIEW
          </button>
          <button
            onClick={() => setActiveTab("performance")}
            className={`px-6 py-3 font-mono text-sm font-bold border-r-2 border-black ${
              activeTab === "performance" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            PERFORMANCE
          </button>
          <button
            onClick={() => setActiveTab("modelchat")}
            className={`px-6 py-3 font-mono text-sm font-bold border-r-2 border-black ${
              activeTab === "modelchat" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            MODELCHAT
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 font-mono text-sm font-bold ${
              activeTab === "settings" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            SETTINGS
          </button>
        </div>

        <div className="p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold font-mono mb-3">MARKET CHART</h3>
                <KlineChart coin="BTC" interval="5m" height={400} botId={botId || undefined} />
              </div>

              <div>
                <h3 className="text-sm font-bold font-mono mb-3">LIVE POSITIONS</h3>
                {isLoading ? (
                  <div className="border-2 border-black bg-white p-4">
                    <div className="font-mono text-sm text-gray-600">Loading wallet address...</div>
                  </div>
                ) : botWalletAddress ? (
                  <PositionPanel address={botWalletAddress} botId={botId ? botId : undefined} isTestnet={isTestnet} />
                ) : (
                  <div className="border-2 border-black bg-white p-4">
                    <div className="font-mono text-sm text-yellow-600">
                      No wallet address found. Please check bot configuration.
                    </div>
                    {botConfig?.apiWalletId && (
                      <div className="font-mono text-xs text-gray-500 mt-2">
                        API Wallet ID: {botConfig.apiWalletId}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold font-mono mb-3">TRADING STRATEGY</h3>
                <div className="border-2 border-black p-4 bg-gray-50 font-mono text-sm whitespace-pre-wrap">
                  {isLoading ? "Loading strategy..." : botConfig?.prompt || "No strategy defined"}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold font-mono mb-3">TRADING PAIRS</h3>
                <div className="flex flex-wrap gap-2">
                  {isLoading ? (
                    <span className="text-gray-400 font-mono text-sm">Loading...</span>
                  ) : botConfig?.tradingPairs && botConfig.tradingPairs.length > 0 ? (
                    botConfig.tradingPairs.map((pair: string) => (
                      <span key={pair} className="border-2 border-black px-3 py-1 font-mono text-sm bg-white">
                        {pair}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 font-mono text-sm">All available pairs</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeTab === "performance" && <BotPerformance botId={botId} />}
          {activeTab === "modelchat" && botId && <ModelChat botId={botId} />}
          {activeTab === "settings" && (
            <div className="space-y-8">
              {botConfig && (
                <div className="border-2 border-black p-6 bg-white">
                  <BotSettings
                    botId={botId}
                    botConfig={botConfig}
                    onUpdate={(updatedConfig) => {
                      setBotConfig(updatedConfig)
                    }}
                  />
                </div>
              )}

              <div className="border-t-2 border-gray-300 pt-8">
                <div>
                  <h3 className="text-lg font-bold font-mono mb-2">API WALLETS (RECOMMENDED)</h3>
                  <p className="text-sm font-mono text-gray-600 mb-6">
                    API Wallets are separate wallets authorized by your master account. They can trade on your behalf
                    without exposing your master account private key. This is the recommended and safer approach.
                  </p>
                  <ApiWalletManager />
                </div>

                <div className="border-t-2 border-gray-200 pt-8 mt-8">
                  <h3 className="text-lg font-bold font-mono mb-2">DIRECT PRIVATE KEYS (ADVANCED)</h3>
                  <p className="text-sm font-mono text-gray-600 mb-6">
                    Only use this if you understand the security implications. Your private keys are encrypted client-side
                    before being stored. Only you can decrypt them with your password.
                  </p>
                  <KeyManager />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

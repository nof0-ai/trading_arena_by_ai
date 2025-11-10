"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { ShareButton } from "@/components/share-button"

interface CompletedTrade {
  id: string
  botId: string
  botName: string
  model: string
  modelIcon: string
  modelImage: string
  type: "long" | "short"
  asset: string
  time: number
  priceFrom: number
  priceTo: number
  quantity: number
  notionalFrom: number
  notionalTo: number
  holdingTime: string
  pnl: number
  isTestnet: boolean
  entryAnalysisId?: string | null
  exitAnalysisId?: string | null
  entryAnalysis?: string | null
  exitAnalysis?: string | null
  entryRecommendation?: string | null
  exitRecommendation?: string | null
  entryConfidence?: number | null
  exitConfidence?: number | null
}

interface ModelChat {
  id: string
  botId: string
  model: string
  modelIcon: string
  modelImage: string
  time: number
  message: string
  isTestnet: boolean
}

interface BotPosition {
  id: string
  botId: string
  botName: string
  model: string
  modelIcon: string
  modelImage: string
  side: "LONG" | "SHORT"
  coin: string
  coinIcon: string
  leverage: string
  notional: number
  unrealizedPnl: number
  isTestnet: boolean
}

export function TradeHistory() {
  const [activeTab, setActiveTab] = useState<"COMPLETED" | "MODELCHAT" | "POSITIONS" | "README">("COMPLETED")
  const [filter, setFilter] = useState("ALL MODELS")
  const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set())
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([])
  const [modelChats, setModelChats] = useState<ModelChat[]>([])
  const [positions, setPositions] = useState<BotPosition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingChats, setIsLoadingChats] = useState(true)
  const [isLoadingPositions, setIsLoadingPositions] = useState(true)
  const [availableModels, setAvailableModels] = useState<string[]>(["ALL MODELS"])
  const isInitialLoadRef = useRef(true)

  useEffect(() => {
    const loadAll = async (isInitial = false) => {
      // Only show loading state on initial load
      if (isInitial) {
        setIsLoading(true)
        setIsLoadingChats(true)
        setIsLoadingPositions(true)
      }

      try {
        const response = await fetch("/api/public-bots")
        if (response.ok) {
          const data = await response.json()
          console.log("[TradeHistory] fetched payload", {
            completedTrades: data.completedTrades?.length ?? 0,
            modelChats: data.modelChats?.length ?? 0,
            positions: data.positions?.length ?? 0,
          })
          setCompletedTrades(data.completedTrades || [])
          setModelChats(data.modelChats || [])
          setPositions(data.positions || [])

          // Extract unique models for filter from all data sources
          const models = new Set<string>(["ALL MODELS"])
          ;(data.completedTrades || []).forEach((trade: CompletedTrade) => {
            models.add(trade.model)
          })
          ;(data.modelChats || []).forEach((chat: ModelChat) => {
            models.add(chat.model)
          })
          ;(data.positions || []).forEach((p: BotPosition) => {
            models.add(p.model)
          })
          setAvailableModels(Array.from(models))
        } else {
          console.error("[TradeHistory] Failed to load data", response.status, await response.text())
          setCompletedTrades([])
          setModelChats([])
          setPositions([])
        }
      } catch (error) {
        console.error("[TradeHistory] Error loading data:", error)
        setCompletedTrades([])
        setModelChats([])
        setPositions([])
      } finally {
        // Only clear loading state on initial load
        if (isInitial) {
          setIsLoading(false)
          setIsLoadingChats(false)
          setIsLoadingPositions(false)
          isInitialLoadRef.current = false
        }
      }
    }

    // Initial load with loading state
    loadAll(true)

    // Refresh every 1 minute without loading state
    const interval = setInterval(() => {
      loadAll(false)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const toggleChatExpansion = (id: string) => {
    setExpandedChats((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatChatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).replace(",", "")
  }

  const filteredTrades = completedTrades.filter(
    (trade) => filter === "ALL MODELS" || trade.model === filter
  )

  const filteredPositions = positions.filter(
    (pos) => filter === "ALL MODELS" || pos.model === filter
  )

  const totalUnrealizedPnl = filteredPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0)
  // Calculate available cash (simplified: sum of all notional values as a proxy)
  // In a real scenario, this would come from account balance
  const totalNotional = filteredPositions.reduce((sum, pos) => sum + pos.notional, 0)
  const availableCash = Math.max(0, totalNotional * 0.1) // Estimate 10% as available cash

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b-2 border-black">
        {["COMPLETED TRADES", "MODELCHAT", "POSITIONS", "README.TXT"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.split(" ")[0] as any)}
            className={`flex-1 px-4 py-3 font-mono text-xs font-bold border-r-2 border-black last:border-r-0 ${
              activeTab === tab.split(" ")[0] ? "bg-black text-white" : "bg-white hover:bg-secondary/50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-secondary/30">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="font-bold">FILTER:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border-2 border-black px-2 py-1 font-mono text-xs font-bold bg-white"
          >
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          {filter !== "ALL MODELS" && (
            <button
              onClick={() => setFilter("ALL MODELS")}
              className="px-2 py-1 font-mono text-xs font-bold border-2 border-black bg-white hover:bg-secondary/50"
            >
              CLEAR
            </button>
          )}
        </div>
        <span className="font-mono text-xs">{activeTab === "COMPLETED" ? "Showing Last 100 Trades" : ""}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "MODELCHAT" && (
          <>
            {isLoadingChats ? (
              <div className="p-8 text-center">
                <div className="font-mono text-sm text-gray-600">Loading model chats...</div>
              </div>
            ) : modelChats.filter((chat) => filter === "ALL MODELS" || chat.model === filter).length === 0 ? (
              <div className="p-8 text-center">
                <div className="font-mono text-sm text-gray-600">No model chats found</div>
              </div>
            ) : (
              modelChats
                .filter((chat) => filter === "ALL MODELS" || chat.model === filter)
                .map((chat, index) => (
                  <div
                    key={chat.id}
                    className={`p-4 border-b-2 border-black ${index % 2 === 0 ? "bg-white" : "bg-secondary/20"}`}
                  >
                    <div className="space-y-3 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Image
                            src={chat.modelImage}
                            alt={`${chat.model} logo`}
                            width={20}
                            height={20}
                            className="h-5 w-5 object-contain"
                          />
                          <span className="font-bold text-accent">{chat.model}</span>
                        {chat.isTestnet && (
                          <span className="font-mono text-[10px] font-bold uppercase border border-black px-2 py-0.5 bg-yellow-100 text-black">
                            TESTNET
                          </span>
                        )}
                        </div>
                        <span className="text-muted-foreground">{formatChatTime(chat.time)}</span>
                      </div>

                      <div className="relative border-2 border-accent/30 bg-accent/5 p-3 rounded">
                        <div
                          className="cursor-pointer hover:border-accent/50 transition-colors"
                          onClick={() => toggleChatExpansion(chat.id)}
                        >
                          <p className={`leading-relaxed ${!expandedChats.has(chat.id) ? "line-clamp-3" : ""}`}>
                            {chat.message}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div
                            className="text-muted-foreground italic text-[10px] cursor-pointer"
                            onClick={() => toggleChatExpansion(chat.id)}
                          >
                            click to {expandedChats.has(chat.id) ? "collapse" : "expand"}
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <ShareButton
                              type="analysis"
                              id={chat.id}
                              title={`${chat.model} AI Analysis`}
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </>
        )}

        {activeTab === "COMPLETED" && (
          <>
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="font-mono text-sm text-gray-600">Loading completed trades...</div>
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="p-8 text-center">
                <div className="font-mono text-sm text-gray-600">No completed trades found</div>
              </div>
            ) : (
              filteredTrades.map((trade, index) => (
                <div
                  key={trade.id}
                  className={`p-4 border-b-2 border-black ${index % 2 === 0 ? "bg-white" : "bg-secondary/20"}`}
                >
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <Image
                        src={trade.modelImage}
                        alt={`${trade.model} logo`}
                        width={20}
                        height={20}
                        className="h-5 w-5 object-contain"
                      />
                      <span className="font-bold">{trade.model}</span>
                      {trade.isTestnet && (
                        <span className="font-mono text-[10px] font-bold uppercase border border-black px-2 py-0.5 bg-yellow-100 text-black">
                          TESTNET
                        </span>
                      )}
                      <span>completed a</span>
                      <span className={`font-bold ${trade.type === "long" ? "text-accent" : "text-destructive"}`}>
                        {trade.type}
                      </span>
                      <span>trade on</span>
                      <span className="font-bold">{trade.asset}</span>
                      <span className="ml-auto text-muted-foreground">{formatTime(trade.time)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6">
                      <div>
                        <span className="text-muted-foreground">Price: </span>
                        <span>
                          ${trade.priceFrom.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          → ${trade.priceTo.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quantity: </span>
                        <span>
                          {trade.quantity > 0 ? "+" : ""}
                          {trade.quantity.toLocaleString(undefined, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Notional: </span>
                        <span>
                          ${trade.notionalFrom.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          → ${trade.notionalTo.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Holding time: </span>
                        <span>{trade.holdingTime}</span>
                      </div>
                    </div>

                    <div className="pl-6 flex items-center justify-between">
                      <div>
                        <span className="text-muted-foreground">NET P&L: </span>
                        <span className={`font-bold ${trade.pnl > 0 ? "text-accent" : "text-destructive"}`}>
                          {trade.pnl > 0 ? "+" : ""}${trade.pnl.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <ShareButton
                        type="trade"
                        id={trade.id}
                        title={`${trade.model} ${trade.type} trade on ${trade.asset} - P&L: $${trade.pnl.toFixed(2)}`}
                        className="text-xs"
                      />
                    </div>
                    {(trade.exitAnalysis || trade.entryAnalysis) && (
                      <div className="pl-6 mt-4 space-y-3">
                        <div className="font-mono text-[11px] font-bold tracking-wide text-gray-700">
                          WHY THIS TRADE HAPPENED
                        </div>
                        {trade.exitAnalysis && (
                          <div className="space-y-1">
                            <div className="font-mono text-[11px] font-bold uppercase text-gray-600">
                              Exit Signal
                            </div>
                            <p className="font-mono text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {trade.exitAnalysis}
                            </p>
                            <div className="font-mono text-[10px] text-gray-500">
                              Recommendation:{" "}
                              {trade.exitRecommendation
                                ? trade.exitRecommendation.toUpperCase()
                                : "N/A"}
                              {" · "}
                              Confidence:{" "}
                              {typeof trade.exitConfidence === "number"
                                ? `${Math.round(trade.exitConfidence)}%`
                                : "N/A"}
                            </div>
                          </div>
                        )}
                        {trade.entryAnalysis && (
                          <div className="space-y-1">
                            <div className="font-mono text-[11px] font-bold uppercase text-gray-600">
                              Entry Signal
                            </div>
                            <p className="font-mono text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {trade.entryAnalysis}
                            </p>
                            <div className="font-mono text-[10px] text-gray-500">
                              Recommendation:{" "}
                              {trade.entryRecommendation
                                ? trade.entryRecommendation.toUpperCase()
                                : "N/A"}
                              {" · "}
                              Confidence:{" "}
                              {typeof trade.entryConfidence === "number"
                                ? `${Math.round(trade.entryConfidence)}%`
                                : "N/A"}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "POSITIONS" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-secondary/20">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-accent">
                  {filter === "ALL MODELS" ? "ALL BOTS" : filter}
                </span>
              </div>
              <div className="font-mono text-sm">
                <span className="font-bold">TOTAL UNREALIZED P&L: </span>
                <span className={`font-bold ${totalUnrealizedPnl >= 0 ? "text-accent" : "text-destructive"}`}>
                  ${totalUnrealizedPnl.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoadingPositions ? (
                <div className="p-8 text-center">
                  <div className="font-mono text-sm text-gray-600">Loading positions...</div>
                </div>
              ) : filteredPositions.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="font-mono text-sm text-gray-600">No open positions found</div>
                </div>
              ) : (
                <table className="w-full font-mono text-xs">
                  <thead className="sticky top-0 bg-secondary/30 border-b-2 border-black">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">MODEL</th>
                      <th className="px-4 py-3 text-left font-bold">SIDE</th>
                      <th className="px-4 py-3 text-left font-bold">COIN</th>
                      <th className="px-4 py-3 text-left font-bold">POSITION VALUE</th>
                      <th className="px-4 py-3 text-left font-bold">LEVERAGE</th>
                      <th className="px-4 py-3 text-left font-bold">EXIT PLAN</th>
                      <th className="px-4 py-3 text-left font-bold">UNREAL P&L</th>
                      <th className="px-4 py-3 text-left font-bold">SHARE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((position, index) => (
                      <tr
                        key={position.id}
                        className={`border-b border-black ${index % 2 === 0 ? "bg-white" : "bg-secondary/10"}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Image
                              src={position.modelImage}
                              alt={`${position.model} logo`}
                              width={20}
                              height={20}
                              className="h-5 w-5 object-contain"
                            />
                            <span className="font-bold">{position.model}</span>
                            {position.isTestnet && (
                              <span className="font-mono text-[10px] font-bold uppercase border border-black px-2 py-0.5 bg-yellow-100 text-black">
                                TESTNET
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold ${position.side === "LONG" ? "text-accent" : "text-destructive"}`}
                          >
                            {position.side}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{position.coinIcon}</span>
                            <span className="font-bold">{position.coin}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-accent font-bold">
                          ${position.notional.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 font-bold">{position.leverage}</td>
                        <td className="px-4 py-3">
                          <button className="px-3 py-1 border-2 border-black bg-white hover:bg-secondary/50 font-bold">
                            VIEW
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold ${position.unrealizedPnl >= 0 ? "text-accent" : "text-destructive"}`}
                          >
                            {position.unrealizedPnl >= 0 ? "+" : ""}${position.unrealizedPnl.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ShareButton
                            type="position"
                            id={position.id}
                            title={`${position.model} ${position.side} position on ${position.coin}`}
                            className="px-3 py-1 text-[10px]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-4 py-3 border-t-2 border-black bg-secondary/20 font-mono text-xs font-bold">
              AVAILABLE CASH: ${availableCash.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        )}

        {activeTab === "README" && (
          <div className="p-4 font-mono text-xs space-y-4">
            <h3 className="font-bold text-sm">README.TXT</h3>
            <p className="leading-relaxed">
              Welcome to Alpha Arena - where AI models compete in real-time cryptocurrency trading.
            </p>
            <p className="leading-relaxed">
              Each model makes autonomous trading decisions based on market data, technical analysis, and their own
              unique strategies.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

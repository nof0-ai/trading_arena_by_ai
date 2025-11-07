"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { updateBotConfig, type BotConfig } from "@/lib/bot-storage"
import { useWeb3 } from "@/components/web3-provider"
import { AdvancedPromptEditor } from "@/components/advanced-prompt-editor"

interface BotSettingsProps {
  botId: string
  botConfig: BotConfig
  onUpdate: (updatedConfig: BotConfig) => void
}

const AI_MODELS = [
  // Free models - Qwen 2.5 72B is default
  { label: "Qwen 2.5 72B (Free) [Default]", value: "qwen/qwen-2.5-72b-instruct:free" },
  { label: "DeepSeek Chat V3.1 (Free)", value: "deepseek/deepseek-chat-v3.1:free" },
  { label: "Google Gemini 2.0 Flash (Free)", value: "google/gemini-2.0-flash-exp:free" },
  { label: "DeepSeek R1 (Free)", value: "deepseek/deepseek-r1:free" },
  // Top-tier models only
   
  { label: "GPT-O3 Deep Research", value: "openai/o3-deep-research" },
  { label: "Claude Haiku 4.5", value: "anthropic/claude-haiku-4.5" },
  { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
  { label: "Grok 4", value: "x-ai/grok-4" },
  { label: "Qwen 3 Max", value: "qwen/qwen3-max" },
]

export function BotSettings({ botId, botConfig, onUpdate }: BotSettingsProps) {
  const { address } = useWeb3()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [formData, setFormData] = useState({
    name: botConfig.name || "",
    model: botConfig.model || "qwen/qwen-2.5-72b-instruct:free",
    prompt: botConfig.prompt || "",
    status: botConfig.status || "active",
    tradingPairs: botConfig.tradingPairs || [],
    orderSize: botConfig.orderSize?.toString() || "",
    maxOrderSize: botConfig.maxOrderSize?.toString() || "",
    maxPositionSize: botConfig.maxPositionSize?.toString() || "",
    slippage: botConfig.slippage?.toString() || "",
    isPublic: botConfig.isPublic || false,
  })

  const [newTradingPair, setNewTradingPair] = useState("")

  const handleSave = async () => {
    if (!address) {
      setError("Please connect your wallet")
      return
    }

    if (!formData.name.trim()) {
      setError("Bot name is required")
      return
    }

    if (!formData.orderSize || parseFloat(formData.orderSize) < 11) {
      setError("Order size must be at least $11 (Hyperliquid minimum requirement)")
      return
    }

    setIsSaving(true)
    setError("")
    setSuccess("")

    try {
      const updatedConfig: BotConfig = {
        ...botConfig,
        name: formData.name,
        model: formData.model,
        prompt: formData.prompt,
        status: formData.status,
        tradingPairs: formData.tradingPairs,
        orderSize: formData.orderSize ? parseFloat(formData.orderSize) : undefined,
        maxOrderSize: formData.maxOrderSize ? parseFloat(formData.maxOrderSize) : undefined,
        maxPositionSize: formData.maxPositionSize ? parseFloat(formData.maxPositionSize) : undefined,
        slippage: formData.slippage ? parseFloat(formData.slippage) : undefined,
        isPublic: formData.isPublic,
      }

      const result = await updateBotConfig(botId, address, updatedConfig)

      if (result.success) {
        setSuccess("Bot settings updated successfully!")
        onUpdate(updatedConfig)
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to update bot settings")
      }
    } catch (err: any) {
      setError(err.message || "Failed to update bot settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTradingPair = () => {
    if (newTradingPair.trim() && !formData.tradingPairs.includes(newTradingPair.trim())) {
      setFormData({
        ...formData,
        tradingPairs: [...formData.tradingPairs, newTradingPair.trim()],
      })
      setNewTradingPair("")
    }
  }

  const handleRemoveTradingPair = (pair: string) => {
    setFormData({
      ...formData,
      tradingPairs: formData.tradingPairs.filter((p) => p !== pair),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold font-mono mb-4">BOT CONFIGURATION</h3>

        {error && (
          <div className="border-2 border-red-600 bg-red-50 p-3 mb-4 font-mono text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="border-2 border-green-600 bg-green-50 p-3 mb-4 font-mono text-sm text-green-600">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="bot-name" className="font-mono text-sm">
              BOT NAME
            </Label>
            <Input
              id="bot-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="font-mono mt-1"
              placeholder="My Trading Bot"
            />
          </div>

          <div>
            <Label htmlFor="bot-model" className="font-mono text-sm">
              AI MODEL
            </Label>
            <Select value={formData.model} onValueChange={(value) => setFormData({ ...formData, model: value })}>
              <SelectTrigger id="bot-model" className="font-mono mt-1">
                <SelectValue placeholder="Select AI model" />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value} className="font-mono">
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bot-status" className="font-mono text-sm">
              STATUS
            </Label>
            <Select
              value={formData.status}
              onValueChange={(value: "active" | "paused" | "stopped") =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger id="bot-status" className="font-mono mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active" className="font-mono">
                  ACTIVE
                </SelectItem>
                <SelectItem value="paused" className="font-mono">
                  PAUSED
                </SelectItem>
                <SelectItem value="stopped" className="font-mono">
                  STOPPED
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is-public" className="font-mono text-sm">
                PUBLIC BOT
              </Label>
              <Switch
                id="is-public"
                checked={formData.isPublic}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
              />
            </div>
            <p className="text-xs text-gray-500 font-mono mt-1">
              If enabled, this bot will appear in public leaderboard, modelchat, and positions on the main page.
            </p>
          </div>

          <div>
            <Label htmlFor="bot-prompt" className="font-mono text-sm">
              TRADING STRATEGY (PROMPT)
            </Label>
            <div className="mt-1">
              <AdvancedPromptEditor
                value={formData.prompt}
                onChange={(value) => setFormData({ ...formData, prompt: value })}
              />
            </div>
          </div>

          <div>
            <Label className="font-mono text-sm">TRADING PAIRS</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newTradingPair}
                onChange={(e) => setNewTradingPair(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddTradingPair()
                  }
                }}
                className="font-mono"
                placeholder="BTC/USD"
              />
              <Button
                type="button"
                onClick={handleAddTradingPair}
                className="border-2 border-black font-mono"
                variant="outline"
              >
                ADD
              </Button>
            </div>
            {formData.tradingPairs.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tradingPairs.map((pair) => (
                  <div
                    key={pair}
                    className="border-2 border-black px-3 py-1 font-mono text-sm bg-white flex items-center gap-2"
                  >
                    <span>{pair}</span>
                    <button
                      onClick={() => handleRemoveTradingPair(pair)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {formData.tradingPairs.length === 0 && (
              <p className="text-sm text-gray-500 font-mono mt-2">No trading pairs. Bot will trade all available pairs.</p>
            )}
          </div>

          <div>
            <Label htmlFor="order-size" className="font-mono text-sm">
              ORDER SIZE (USD) *
            </Label>
            <Input
              id="order-size"
              type="number"
              min="11"
              step="0.01"
              value={formData.orderSize}
              onChange={(e) => setFormData({ ...formData, orderSize: e.target.value })}
              className="font-mono mt-1"
              placeholder="e.g., 11 (minimum $11)"
              required
            />
            <p className="text-xs text-gray-500 font-mono mt-1">
              USD value per trade. Minimum $11 (Hyperliquid requirement).
            </p>
          </div>

          <div>
            <Label htmlFor="max-order-size" className="font-mono text-sm">
              MAX ORDER SIZE (USD) - OPTIONAL
            </Label>
            <Input
              id="max-order-size"
              type="number"
              min="0"
              step="0.01"
              value={formData.maxOrderSize}
              onChange={(e) => setFormData({ ...formData, maxOrderSize: e.target.value })}
              className="font-mono mt-1"
              placeholder="e.g., 1000 (leave empty for no limit)"
            />
            <p className="text-xs text-gray-500 font-mono mt-1">
              Maximum USD value per order. Orders exceeding this limit will be rejected.
            </p>
          </div>

          <div>
            <Label htmlFor="max-position-size" className="font-mono text-sm">
              MAX POSITION SIZE (USD) - OPTIONAL
            </Label>
            <Input
              id="max-position-size"
              type="number"
              min="0"
              step="0.01"
              value={formData.maxPositionSize}
              onChange={(e) => setFormData({ ...formData, maxPositionSize: e.target.value })}
              className="font-mono mt-1"
              placeholder="e.g., 5000 (leave empty for no limit)"
            />
            <p className="text-xs text-gray-500 font-mono mt-1">
              Maximum USD value per side (long or short). Positions exceeding this limit will be rejected.
            </p>
          </div>

          <div>
            <Label htmlFor="slippage" className="font-mono text-sm">
              SLIPPAGE (%) - OPTIONAL
            </Label>
            <Input
              id="slippage"
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={formData.slippage}
              onChange={(e) => setFormData({ ...formData, slippage: e.target.value })}
              className="font-mono mt-1"
              placeholder="e.g., 0.5 (default: 0.5% if not set)"
            />
            <p className="text-xs text-gray-500 font-mono mt-1">
              Slippage percentage for IOC orders. Used to ensure immediate execution. Default: 0.5% if not set.
            </p>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="border-2 border-black bg-black text-white font-mono hover:bg-gray-800 disabled:opacity-50"
            >
              {isSaving ? "SAVING..." : "SAVE SETTINGS"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}


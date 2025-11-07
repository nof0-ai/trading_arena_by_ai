"use client"

import { useState, useEffect } from "react"
import { XIcon, Wallet, Shield, AlertTriangle, Plus, TestTube, ChevronsUpDown, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TechnicalIndicators } from "@/components/technical-indicators"
import { AdvancedPromptEditor } from "@/components/advanced-prompt-editor"
import { saveBotConfig, type BotConfig } from "@/lib/bot-storage"
import { storeAgentWalletPassword } from "@/lib/bot-vault"
import { useWeb3 } from "@/components/web3-provider"
import { createClient } from "@/lib/supabase/client"
import { approveAgentWithWeb3Wallet, getAgentWalletsFromHyperliquid, revokeAgentWithWeb3Wallet, type AgentWallet } from "@/lib/hyperliquid-agent"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { encryptPrivateKey } from "@/lib/crypto"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { canCreateBot, getUserActivePlanIds } from "@/lib/stripe"
import { getAvailableModelsForPlans, getPlanById, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans"
import Link from "next/link"

interface BotCreatorProps {
  onClose: () => void
  onCreate: (botId: string) => void
}

interface ApiWallet {
  id: string
  wallet_name: string
  wallet_address: string
  master_account: string
  is_approved: boolean
  is_testnet: boolean
}

interface EnhancedApiWallet extends ApiWallet {
  hasPassword: boolean // Whether we have the password in our system
  fromHyperliquid?: boolean // Whether this wallet exists on Hyperliquid but not in our DB
}

function CreateApiWalletInline({ 
  onWalletCreated,
  autoSelect = false 
}: { 
  onWalletCreated: (walletId: string, walletPassword: string) => void
  autoSelect?: boolean
}) {
  const { address } = useWeb3()
  const supabase = createClient()
  const [walletName, setWalletName] = useState("")
  const [password, setPassword] = useState("")
  const [isTestnet, setIsTestnet] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")

  async function ensureAuthenticated() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) return user

    // If no user, try to sign in anonymously using wallet address as identifier
    const {
      data: { user: anonymousUser },
      error: signInError,
    } = await supabase.auth.signInAnonymously()

    if (signInError) {
      // If anonymous sign-in fails, try to get or create user with email based on wallet
      const walletEmail = `${address?.toLowerCase()}@wallet.local`
      const {
        data: { user: emailUser },
        error: emailError,
      } = await supabase.auth.signInWithPassword({
        email: walletEmail,
        password: address || "",
      })

      if (emailError && emailError.message.includes("Invalid login credentials")) {
        // User doesn't exist, try to sign up
        const {
          data: { user: newUser },
          error: signUpError,
        } = await supabase.auth.signUp({
          email: walletEmail,
          password: address || "default",
        })

        if (signUpError) throw signUpError
        return newUser?.user
      }

      if (emailError) throw emailError
      return emailUser?.user
    }

    return anonymousUser?.user
  }

  async function handleCreate() {
    if (!address) {
      setError("Please connect your wallet first")
      return
    }
    if (!walletName.trim()) {
      setError("Please enter a wallet name")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      const user = await ensureAuthenticated()
      if (!user) throw new Error("Failed to authenticate. Please try again.")

      const apiWalletPrivateKey = generatePrivateKey()
      const apiWallet = privateKeyToAccount(apiWalletPrivateKey)
      const apiWalletAddress = apiWallet.address

      const { encrypted, salt, iv } = await encryptPrivateKey(apiWalletPrivateKey, password)

      const { data, error: insertError } = await supabase
        .from("api_wallets")
        .insert({
          user_id: user.id,
          wallet_name: walletName,
          wallet_address: apiWalletAddress,
          encrypted_private_key: encrypted,
          salt: salt,
          iv: iv,
          master_account: address,
          is_approved: false,
          is_testnet: isTestnet,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Pass both wallet ID and password to the callback
      onWalletCreated(data.id, password)
      setWalletName("")
      setPassword("")
      setIsTestnet(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-2 p-3 bg-white border-2 border-black rounded">
      <div className="space-y-2">
        <Input
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          placeholder="Wallet name (e.g., Trading Bot 1)"
          className="font-mono border-2 border-black text-xs"
          disabled={isCreating}
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Encryption password (min 8 chars)"
          className="font-mono border-2 border-black text-xs"
          disabled={isCreating}
        />
        <div className="flex items-center justify-between p-2 border border-blue-300 bg-blue-50 rounded">
          <div className="flex items-center gap-2">
            <TestTube className="size-3 text-blue-600" />
            <Label htmlFor="inline-testnet" className="text-xs font-bold cursor-pointer">
              Testnet
            </Label>
          </div>
          <Switch
            id="inline-testnet"
            checked={isTestnet}
            onCheckedChange={setIsTestnet}
            disabled={isCreating}
          />
        </div>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <Button
        onClick={handleCreate}
        disabled={isCreating || !address}
        className="w-full border-2 border-black text-xs font-bold h-8"
        size="sm"
      >
        {isCreating ? "CREATING..." : <><Plus className="size-3 mr-1" />CREATE API WALLET</>}
      </Button>
    </div>
  )
}

export function BotCreator({ onClose, onCreate }: BotCreatorProps) {
  const { address } = useWeb3()
  const [formData, setFormData] = useState({
    name: "",
    model: "", // Will be set based on available models
    prompt: "",
    tradingPairs: "",
    apiKey: "",
    apiSecret: "",
    useApiWallet: false,
    apiWalletId: "",
    apiWalletPassword: "",
    orderSize: "",
    maxOrderSize: "",
    maxPositionSize: "",
    slippage: "",
    executionInterval: "5", // Default to 5 minutes
    isPublic: false, // Default to false (private)
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [apiWallets, setApiWallets] = useState<EnhancedApiWallet[]>([])
  const [approvalError, setApprovalError] = useState("")
  const [showCreateWallet, setShowCreateWallet] = useState(false)
  const [isLoadingAgents, setIsLoadingAgents] = useState(false)
  const [canCreate, setCanCreate] = useState<boolean | null>(null)
  const [isCheckingMembership, setIsCheckingMembership] = useState(true)
  const [subscriptionCount, setSubscriptionCount] = useState(0)
  const [botCount, setBotCount] = useState(0)
  const [availableModels, setAvailableModels] = useState<Array<{ label: string; value: string }>>([])
  const [isModelPopoverOpen, setIsModelPopoverOpen] = useState(false)

  const supabase = createClient()

  const selectedModel = availableModels.find((model) => model.value === formData.model)

  // Check if user can create bot and get available models
  const checkMembership = async () => {
    if (!address) {
      setIsCheckingMembership(false)
      return
    }

    setIsCheckingMembership(true)
    const result = await canCreateBot(address)
    setCanCreate(result.canCreate)
    setSubscriptionCount(result.activeSubscriptions)
    setBotCount(result.botCount)
    
    // Get available models based on subscription plans
    const planIds = await getUserActivePlanIds(address)
    const models = getAvailableModelsForPlans(planIds)
    
    // Convert to format expected by Select component
    const modelOptions = models.map((model) => ({
      label: model.name,
      value: model.id,
    }))
    
    // If no subscriptions, show empty list (user needs to subscribe)
    setAvailableModels(modelOptions)
    
    // Set default model if available and current model is not in available list
    if (modelOptions.length > 0) {
      const currentModelAvailable = modelOptions.some(m => m.value === formData.model)
      if (!formData.model || !currentModelAvailable) {
        setFormData(prev => ({ ...prev, model: modelOptions[0].value }))
      }
    } else if (formData.model) {
      // Clear model if no models available
      setFormData(prev => ({ ...prev, model: "" }))
    }
    
    setIsCheckingMembership(false)
  }

  useEffect(() => {
    checkMembership()
  }, [address])

  useEffect(() => {
    loadApiWallets()
  }, [])


  async function ensureAuthenticated() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) return user

    // Try anonymous sign-in
    const {
      data: { user: anonymousUser },
      error: signInError,
    } = await supabase.auth.signInAnonymously()

    if (signInError) {
      // If anonymous fails, try wallet-based authentication
      if (!address) return null
      const walletEmail = `${address.toLowerCase()}@wallet.local`
      const {
        data: { user: emailUser },
        error: emailError,
      } = await supabase.auth.signInWithPassword({
        email: walletEmail,
        password: address,
      })

      if (emailError && emailError.message.includes("Invalid login credentials")) {
        // Create new user
        const {
          data: { user: newUser },
          error: signUpError,
        } = await supabase.auth.signUp({
          email: walletEmail,
          password: address,
        })
        if (signUpError) return null
        return newUser?.user
      }

      return emailUser?.user
    }

    return anonymousUser?.user
  }

  async function loadApiWallets() {
    if (!address) return

    setIsLoadingAgents(true)
    
    try {
      const user = await ensureAuthenticated()
      if (!user) return

      // Load wallets from database
      const { data: dbWallets } = await supabase
        .from("api_wallets")
        .select("id, wallet_name, wallet_address, master_account, is_approved, is_testnet")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      // Get all agent wallets from Hyperliquid (both testnet and mainnet)
      const [testnetAgents, mainnetAgents] = await Promise.all([
        getAgentWalletsFromHyperliquid(address as `0x${string}`, true).catch(() => []),
        getAgentWalletsFromHyperliquid(address as `0x${string}`, false).catch(() => []),
      ])

      // Combine all agents from Hyperliquid
      const allHyperliquidAgents = [
        ...testnetAgents.map(a => ({ ...a, is_testnet: true })),
        ...mainnetAgents.map(a => ({ ...a, is_testnet: false })),
      ]

      // Match Hyperliquid agents with database wallets
      const enhancedWallets: EnhancedApiWallet[] = []

      // First, add all database wallets (mark as having password)
      if (dbWallets) {
        dbWallets.forEach((dbWallet) => {
          const hyperliquidAgent = allHyperliquidAgents.find(
            (a) => a.address.toLowerCase() === dbWallet.wallet_address.toLowerCase()
          )
          enhancedWallets.push({
            ...dbWallet,
            hasPassword: true,
            is_approved: hyperliquidAgent ? true : dbWallet.is_approved,
            fromHyperliquid: false,
          })
        })
      }

      // Then, add Hyperliquid agents that don't exist in database (no password)
      allHyperliquidAgents.forEach((agent) => {
        const existsInDb = enhancedWallets.find(
          (w) => w.wallet_address.toLowerCase() === agent.address.toLowerCase()
        )
        if (!existsInDb) {
          enhancedWallets.push({
            id: `hyperliquid_${agent.address}`, // Temporary ID for Hyperliquid-only wallets
            wallet_name: agent.name || `Agent ${agent.address.slice(0, 6)}...${agent.address.slice(-4)}`,
            wallet_address: agent.address,
            master_account: address,
            is_approved: true,
            is_testnet: agent.is_testnet || false,
            hasPassword: false,
            fromHyperliquid: true,
          })
        }
      })

      setApiWallets(enhancedWallets)
    } catch (error: any) {
      console.error("Error loading agent wallets:", error)
      // Fallback to database-only wallets
      const user = await ensureAuthenticated()
      if (user) {
        const { data } = await supabase
          .from("api_wallets")
          .select("id, wallet_name, wallet_address, master_account, is_approved, is_testnet")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
        
        if (data) {
          setApiWallets(data.map(w => ({ ...w, hasPassword: true, fromHyperliquid: false })))
        }
      }
    } finally {
      setIsLoadingAgents(false)
    }
  }

  async function handleApproveWallet(wallet: ApiWallet) {
    if (!address) {
      setApprovalError("Please connect your wallet")
      return
    }

    setIsApproving(true)
    setApprovalError("")

    const result = await approveAgentWithWeb3Wallet({
      masterAccount: wallet.master_account as `0x${string}`,
      agentAddress: wallet.wallet_address as `0x${string}`,
      agentName: wallet.wallet_name,
      isTestnet: wallet.is_testnet,
    })

    if (result.success) {
      // Update wallet approval status
      await supabase
        .from("api_wallets")
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq("id", wallet.id)

      loadApiWallets()
    } else {
      setApprovalError(result.error || "Failed to approve wallet")
    }

    setIsApproving(false)
  }

  const handleSubmit = async () => {
    // Check subscription before allowing bot creation
    if (canCreate === false) {
      alert("You have reached the maximum number of bots allowed by your subscription plan. Please upgrade to create more bots.")
      return
    }

    if (!formData.name || !formData.model || !formData.prompt) {
      alert("Please fill in all required fields")
      return
    }

    // Validate model is available for user's subscription
    if (!address) {
      alert("Wallet not connected")
      return
    }

    const planIds = await getUserActivePlanIds(address)
    const availableModels = getAvailableModelsForPlans(planIds)
    const isModelAvailable = availableModels.some(m => m.id === formData.model)
    
    if (!isModelAvailable) {
      alert(`The selected model "${formData.model}" is not available with your current subscription plan. Please select a different model or upgrade your plan.`)
      return
    }

    // Validate execution interval is within plan limits
    const executionInterval = formData.executionInterval ? parseInt(formData.executionInterval, 10) : 5
    if (planIds.length > 0) {
      const intervals = planIds.map(id => {
        const plan = getPlanById(id)
        return plan ? plan.features.trigger_interval_minutes : 999
      })
      const minInterval = Math.min(...intervals)
      
      if (executionInterval < minInterval) {
        alert(`Your subscription plan(s) require a minimum execution interval of ${minInterval} minutes. Please select a valid interval.`)
        return
      }
    }

    if (!formData.orderSize || parseFloat(formData.orderSize) < 11) {
      alert("Order size must be at least $11 (Hyperliquid minimum requirement)")
      return
    }

    if (!address) {
      alert("Wallet not connected")
      return
    }

    setIsSubmitting(true)

    try {
      // If using API wallet, verify it's approved and has password
      if (formData.useApiWallet && formData.apiWalletId) {
        const selectedWallet = apiWallets.find((w) => w.id === formData.apiWalletId)
        if (!selectedWallet) {
          alert("Selected API wallet not found")
          setIsSubmitting(false)
          return
        }
        if (!selectedWallet.hasPassword) {
          alert("This wallet doesn't have a password in our system and cannot be used. Please select a wallet with a password or create a new one.")
          setIsSubmitting(false)
          return
        }
        if (!selectedWallet.is_approved) {
          alert("Please approve the API wallet before creating the bot")
          setIsSubmitting(false)
          return
        }
      }

      // Validate API wallet password if using API wallet
      if (formData.useApiWallet && formData.apiWalletId && !formData.apiWalletPassword) {
        alert("Please enter the API wallet password (same password used when creating the wallet)")
        setIsSubmitting(false)
        return
      }

      const botConfig: BotConfig = {
        name: formData.name,
        model: formData.model,
        prompt: formData.prompt,
        tradingPairs: formData.tradingPairs
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        apiWalletId: formData.useApiWallet ? formData.apiWalletId : undefined,
        orderSize: formData.orderSize ? parseFloat(formData.orderSize) : undefined,
        maxOrderSize: formData.maxOrderSize ? parseFloat(formData.maxOrderSize) : undefined,
        maxPositionSize: formData.maxPositionSize ? parseFloat(formData.maxPositionSize) : undefined,
        slippage: formData.slippage ? parseFloat(formData.slippage) : undefined,
        executionInterval: formData.executionInterval ? parseInt(formData.executionInterval, 10) : undefined,
        isPublic: formData.isPublic,
        status: "active",
      }

      // Save bot config first
      const result = await saveBotConfig(address, botConfig)

      if (!result.success || !result.botId) {
        alert(`Failed to create bot: ${result.error}`)
        setIsSubmitting(false)
        return
      }

      const botId = result.botId

      // If using API wallet, store password directly in Vault using key_{address}_{botname}
      if (formData.useApiWallet && formData.apiWalletId && formData.apiWalletPassword) {
        const selectedWallet = apiWallets.find((w) => w.id === formData.apiWalletId)
        if (selectedWallet) {
          // Note: wallet_address should be lowercase (agent wallet address)
          const passwordResult = await storeAgentWalletPassword(
            selectedWallet.wallet_address.toLowerCase(),
            botConfig.name,
            formData.apiWalletPassword
          )
          if (!passwordResult.success) {
            // Clean up bot if password storage fails
            const supabase = createClient()
            await supabase.from("encrypted_bots").delete().eq("id", botId)
            alert(`Failed to store agent wallet password: ${passwordResult.error}`)
            setIsSubmitting(false)
            return
          }
        }
      }

      alert("Bot created successfully!")
      onCreate(botId)
      onClose()
    } catch (error) {
      console.error("[v0] Error creating bot:", error)
      alert("Failed to create bot. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInsertIndicator = (indicator: string) => {
    setFormData({
      ...formData,
      prompt: formData.prompt + (formData.prompt ? "\n" : "") + indicator,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b-2 border-black p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold font-mono">CREATE NEW TRADING BOT</h2>
          <button onClick={onClose} className="hover:bg-gray-100 p-1">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
            {/* Membership Check - Link to pricing page if not a member */}
            {isCheckingMembership ? (
              <div className="border-2 border-yellow-300 bg-yellow-50 p-4 rounded">
                <div className="text-center text-sm font-mono text-yellow-800">
                  Checking membership status...
                </div>
              </div>
            ) : canCreate === false ? (
              <div className="border-2 border-red-300 bg-red-50 p-6 rounded space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-lg font-bold font-mono text-red-800">SUBSCRIPTION REQUIRED</div>
                  <div className="text-sm font-mono text-red-700">
                    Each bot requires a separate subscription ($49/month).<br />
                    You have {botCount} bot(s) and {subscriptionCount} active subscription(s).<br />
                    Please subscribe to create a new bot.
                  </div>
                </div>
                <div className="flex flex-col items-center space-y-4">
                  <Link
                    href="/pricing"
                    className="border-2 border-black bg-black text-white px-6 py-3 font-mono text-sm hover:bg-gray-800 transition-colors"
                  >
                    GO TO SUBSCRIPTION PAGE
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs font-bold">BOT NAME *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Aggressive Trader"
                className="font-mono border-2 border-black"
                disabled={canCreate === false}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">AI MODEL *</label>
              {availableModels.length === 0 ? (
                <div className="border-2 border-yellow-300 bg-yellow-50 p-4 rounded">
                  <div className="text-xs font-mono text-yellow-800">
                    No models available. Please subscribe to a plan to access AI models.
                  </div>
                </div>
              ) : (
                <Popover open={isModelPopoverOpen} onOpenChange={setIsModelPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="font-mono border-2 border-black w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2"
                      disabled={canCreate === false}
                    >
                      <span className="truncate">
                        {selectedModel ? selectedModel.label : "Select AI model"}
                      </span>
                      <ChevronsUpDown className="size-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command className="border-0">
                      <CommandInput placeholder="Type to filter models..." className="font-mono text-xs" />
                      <CommandList className="max-h-64">
                        <CommandEmpty className="font-mono text-xs py-4">No models found.</CommandEmpty>
                        <CommandGroup heading="Available Models" className="font-mono text-xs">
                          {availableModels.map((model) => (
                            <CommandItem
                              key={model.value}
                              value={`${model.label} ${model.value}`}
                              className="font-mono text-xs"
                              onSelect={() => {
                                setFormData((prev) => ({ ...prev, model: model.value }))
                                setIsModelPopoverOpen(false)
                              }}
                            >
                              <Check
                                className={`size-4 mr-2 ${formData.model === model.value ? "opacity-100" : "opacity-0"}`}
                              />
                              <div className="flex flex-col text-left">
                                <span>{model.label}</span>
                                <span className="text-[10px] text-gray-500">{model.value}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">TRADING PAIRS (comma separated)</label>
              <Input
                value={formData.tradingPairs}
                onChange={(e) => setFormData({ ...formData, tradingPairs: e.target.value })}
                placeholder="e.g., BTC, ETH, SOL, XRP"
                className="font-mono border-2 border-black"
              />
              <p className="text-xs text-gray-500">Leave empty to trade all available pairs</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">ORDER SIZE (USD) *</label>
              <Input
                type="number"
                min="11"
                step="0.01"
                value={formData.orderSize}
                onChange={(e) => setFormData({ ...formData, orderSize: e.target.value })}
                placeholder="e.g., 11 (minimum $11)"
                className="font-mono border-2 border-black"
                required
              />
              <p className="text-xs text-gray-500">USD value per trade. Minimum $11 (Hyperliquid requirement).</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">MAX ORDER SIZE (USD) - OPTIONAL</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.maxOrderSize}
                onChange={(e) => setFormData({ ...formData, maxOrderSize: e.target.value })}
                placeholder="e.g., 1000 (leave empty for no limit)"
                className="font-mono border-2 border-black"
              />
              <p className="text-xs text-gray-500">Maximum USD value per order. Orders exceeding this limit will be rejected.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">MAX POSITION SIZE (USD) - OPTIONAL</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.maxPositionSize}
                onChange={(e) => setFormData({ ...formData, maxPositionSize: e.target.value })}
                placeholder="e.g., 5000 (leave empty for no limit)"
                className="font-mono border-2 border-black"
              />
              <p className="text-xs text-gray-500">Maximum USD value per side (long or short). Positions exceeding this limit will be rejected.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">SLIPPAGE (%) - OPTIONAL</label>
              <Input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={formData.slippage}
                onChange={(e) => setFormData({ ...formData, slippage: e.target.value })}
                placeholder="e.g., 0.5 (default: 0.5% if not set)"
                className="font-mono border-2 border-black"
              />
              <p className="text-xs text-gray-500">Slippage percentage for IOC orders. Used to ensure immediate execution. Default: 0.5% if not set.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">EXECUTION FREQUENCY *</label>
              <Select 
                value={formData.executionInterval} 
                onValueChange={(value) => setFormData({ ...formData, executionInterval: value })}
              >
                <SelectTrigger className="font-mono border-2 border-black">
                  <SelectValue placeholder="Select execution frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minute</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">How often the bot will execute trading decisions.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="isPublic" className="text-xs font-bold">
                  PUBLIC BOT
                </Label>
                <Switch
                  id="isPublic"
                  checked={formData.isPublic}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
                />
              </div>
              <p className="text-xs text-gray-500">
                If enabled, this bot will appear in public leaderboard, modelchat, and positions on the main page.
              </p>
            </div>

            <div className="space-y-4 p-4 border-2 border-blue-500 bg-blue-50 rounded">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-blue-600" />
                <label className="text-xs font-bold">TRADING AUTHORIZATION</label>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={!formData.useApiWallet}
                    onChange={() => setFormData({ ...formData, useApiWallet: false, apiWalletId: "" })}
                    className="cursor-pointer"
                  />
                  Use API Key/Secret (requires private key)
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={formData.useApiWallet}
                    onChange={() => setFormData({ ...formData, useApiWallet: true })}
                    className="cursor-pointer"
                  />
                  Use API Wallet (Agent Wallet) - No private key needed!
                </label>
              </div>

              {!formData.useApiWallet ? (
                <div className="space-y-2 mt-4">
                  <label className="text-xs font-bold">HYPERLIQUID API KEY (optional)</label>
                  <Input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="Your Hyperliquid API key"
                    className="font-mono border-2 border-black"
                  />
                  <label className="text-xs font-bold">HYPERLIQUID API SECRET (optional)</label>
                  <Input
                    type="password"
                    value={formData.apiSecret}
                    onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                    placeholder="Your Hyperliquid API secret"
                    className="font-mono border-2 border-black"
                  />
                </div>
              ) : (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold">SELECT API WALLET *</label>
                    <button
                      type="button"
                      onClick={() => setShowCreateWallet(!showCreateWallet)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                    >
                      <Plus className="size-3" />
                      {showCreateWallet ? "Hide" : "Create New Wallet"}
                    </button>
                  </div>

                  {showCreateWallet && (
                    <div className="p-3 bg-gray-50 border-2 border-dashed border-gray-300 rounded">
                      <CreateApiWalletInline
                        onWalletCreated={(walletId, walletPassword) => {
                          loadApiWallets()
                          setFormData({ 
                            ...formData, 
                            apiWalletId: walletId,
                            apiWalletPassword: walletPassword 
                          })
                          setShowCreateWallet(false)
                        }}
                        autoSelect={true}
                      />
                    </div>
                  )}

                  {isLoadingAgents ? (
                    <div className="text-xs text-gray-500 py-2">Loading agent wallets from Hyperliquid...</div>
                  ) : apiWallets.length === 0 && !showCreateWallet ? (
                    <Alert className="border-2 border-yellow-500 bg-yellow-50">
                      <AlertTriangle className="size-4" />
                      <AlertDescription className="text-xs">
                        <div className="space-y-3">
                          <div>No API wallets found. Click "Create New Wallet" above or create one now:</div>
                          <CreateApiWalletInline
                            onWalletCreated={(walletId, walletPassword) => {
                              loadApiWallets()
                              setFormData({ 
                                ...formData, 
                                apiWalletId: walletId,
                                apiWalletPassword: walletPassword 
                              })
                            }}
                            autoSelect={true}
                          />
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {/* Show wallets without passwords that can be removed */}
                      {apiWallets.filter(w => !w.hasPassword && w.fromHyperliquid).length > 0 && (
                        <div className="mb-4 p-3 border-2 border-orange-500 bg-orange-50 rounded">
                          <div className="text-xs font-bold mb-2 text-orange-800 flex items-center gap-2">
                            <AlertTriangle className="size-3" />
                            Wallets Without Password (Cannot Use)
                          </div>
                          <div className="space-y-2">
                            {apiWallets
                              .filter(w => !w.hasPassword && w.fromHyperliquid)
                              .map((wallet) => (
                                <div key={wallet.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-orange-300">
                                  <div className="flex items-center gap-2">
                                    <Wallet className="size-3" />
                                    <span className="font-medium">{wallet.wallet_name}</span>
                                    <span className="text-gray-600 font-mono">
                                      ({wallet.wallet_address.slice(0, 6)}...{wallet.wallet_address.slice(-4)})
                                    </span>
                                    {wallet.is_testnet && (
                                      <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">TESTNET</span>
                                    )}
                                    <span className="text-xs text-red-600 bg-red-100 px-1 rounded">No Password</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (confirm(`Revoke wallet ${wallet.wallet_name} from Hyperliquid? This will permanently remove its authorization. You cannot undo this action.`)) {
                                          if (!address) {
                                            alert("Please connect your wallet first")
                                            return
                                          }
                                          
                                          try {
                                            const result = await revokeAgentWithWeb3Wallet({
                                              masterAccount: address as `0x${string}`,
                                              agentAddress: wallet.wallet_address as `0x${string}`,
                                              agentName: wallet.wallet_name,
                                              isTestnet: wallet.is_testnet,
                                            })
                                            
                                            if (result.success) {
                                              // Remove from list
                                              setApiWallets(apiWallets.filter(w => w.id !== wallet.id))
                                              if (formData.apiWalletId === wallet.id) {
                                                setFormData({ ...formData, apiWalletId: "", apiWalletPassword: "" })
                                              }
                                              alert("Wallet successfully revoked from Hyperliquid")
                                            } else {
                                              alert(`Failed to revoke wallet: ${result.error}`)
                                            }
                                          } catch (error: any) {
                                            alert(`Error revoking wallet: ${error.message}`)
                                          }
                                        }
                                      }}
                                      className="text-red-600 hover:text-red-800 text-xs font-bold underline"
                                    >
                                      Revoke from Hyperliquid
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm(`Remove wallet ${wallet.wallet_name} from the list? This only removes it from the UI, not from Hyperliquid.`)) {
                                          setApiWallets(apiWallets.filter(w => w.id !== wallet.id))
                                          if (formData.apiWalletId === wallet.id) {
                                            setFormData({ ...formData, apiWalletId: "", apiWalletPassword: "" })
                                          }
                                        }
                                      }}
                                      className="text-gray-600 hover:text-gray-800 text-xs font-bold underline"
                                    >
                                      Remove from List Only
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                          <div className="text-xs text-orange-700 mt-2">
                            These wallets exist on Hyperliquid but don't have passwords in our system. 
                            They cannot be used for trading. You can remove them from the list.
                          </div>
                        </div>
                      )}
                      
                      <Select
                        value={formData.apiWalletId}
                        onValueChange={(value) => setFormData({ ...formData, apiWalletId: value })}
                      >
                        <SelectTrigger className="font-mono border-2 border-black">
                          <SelectValue placeholder="Select API Wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {apiWallets.filter(w => w.hasPassword).map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              <div className="flex items-center gap-2">
                                <Wallet className="size-3" />
                                <span>{wallet.wallet_name}</span>
                                {wallet.is_testnet && (
                                  <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">TESTNET</span>
                                )}
                                {wallet.is_approved ? (
                                  <span className="text-xs text-green-600">✓ Approved</span>
                                ) : (
                                  <span className="text-xs text-orange-600">⚠ Not Approved</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                          {apiWallets.filter(w => w.hasPassword).length === 0 && (
                            <div className="px-2 py-1 text-xs text-gray-500">
                              No wallets with password available. Create a new wallet above.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </>
                  )}

                  {formData.apiWalletId && (
                    <div className="space-y-2 mt-4">
                      <label className="text-xs font-bold">API WALLET PASSWORD *</label>
                      <Input
                        type="password"
                        value={formData.apiWalletPassword}
                        onChange={(e) => setFormData({ ...formData, apiWalletPassword: e.target.value })}
                        placeholder="Enter the password used when creating this API wallet"
                        className="font-mono border-2 border-black text-xs"
                      />
                      <p className="text-xs text-gray-600">
                        This must match the password you used when creating the API wallet. The password will be stored in the bot configuration for automated trading.
                      </p>
                    </div>
                  )}

                  {formData.apiWalletId && (
                    <div className="mt-2">
                      {(() => {
                        const selectedWallet = apiWallets.find((w) => w.id === formData.apiWalletId)
                        if (!selectedWallet) return null

                        if (!selectedWallet.is_approved) {
                          return (
                            <Alert className="border-2 border-orange-500 bg-orange-50">
                              <AlertTriangle className="size-4" />
                              <AlertDescription className="text-xs">
                                <div className="space-y-2">
                                  <div>This wallet needs to be approved before use.</div>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveWallet(selectedWallet)}
                                    disabled={isApproving || !address}
                                    className="border-2 border-orange-600 text-orange-600 hover:bg-orange-100 px-3 py-1 text-xs font-bold disabled:opacity-50"
                                  >
                                    {isApproving
                                      ? "APPROVING..."
                                      : `APPROVE WITH ${address ? "WALLET" : "CONNECT WALLET"}`}
                                  </button>
                                  {approvalError && (
                                    <div className="text-xs text-red-600 mt-1">{approvalError}</div>
                                  )}
                                </div>
                              </AlertDescription>
                            </Alert>
                          )
                        }

                        return (
                          <Alert className="border-2 border-green-500 bg-green-50">
                            <Shield className="size-4" />
                            <AlertDescription className="text-xs text-green-800">
                              ✓ Wallet is approved and ready to use. No private key needed!
                            </AlertDescription>
                          </Alert>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">TRADING STRATEGY PROMPT *</label>
              <AdvancedPromptEditor
                value={formData.prompt}
                onChange={(value) => setFormData({ ...formData, prompt: value })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || canCreate === false}
                className="flex-1 border-2 border-black bg-black text-white px-4 py-3 text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "CREATING..." : canCreate === false ? "MEMBERSHIP REQUIRED" : "CREATE BOT"}
              </button>
              <button onClick={onClose} className="border-2 border-black bg-white px-4 py-3 text-sm hover:bg-gray-100">
                CANCEL
              </button>
            </div>
        </div>
      </div>
    </div>
  )
}

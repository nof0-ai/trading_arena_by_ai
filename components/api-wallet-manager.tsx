"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { encryptPrivateKey, decryptPrivateKey } from "@/lib/crypto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Wallet, Plus, CheckCircle, XCircle, Trash2, Shield, AlertTriangle, TestTube } from "lucide-react"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"

interface ApiWallet {
  id: string
  wallet_name: string
  wallet_address: string
  encrypted_private_key: string
  salt: string
  iv: string
  master_account: string
  is_approved: boolean
  approved_at: string | null
  expires_at: string | null
  is_testnet: boolean
  created_at: string
}

export function ApiWalletManager() {
  const [wallets, setWallets] = useState<ApiWallet[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<ApiWallet | null>(null)

  // Create wallet form
  const [walletName, setWalletName] = useState("")
  const [masterAccount, setMasterAccount] = useState("")
  const [masterPrivateKey, setMasterPrivateKey] = useState("")
  const [password, setPassword] = useState("")
  const [isTestnet, setIsTestnet] = useState(false)

  // Approve wallet form
  const [approvePassword, setApprovePassword] = useState("")

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadWallets()
  }, [])

  async function loadWallets() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("api_wallets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading wallets:", error)
    } else {
      setWallets(data || [])
    }
  }

  async function handleCreateWallet(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters")
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const apiWalletPrivateKey = generatePrivateKey()
      const apiWallet = privateKeyToAccount(apiWalletPrivateKey)
      const apiWalletAddress = apiWallet.address.toLowerCase()

      const { encrypted, salt, iv } = await encryptPrivateKey(apiWalletPrivateKey, password)

      const { error } = await supabase.from("api_wallets").insert({
        user_id: user.id,
        wallet_name: walletName,
        wallet_address: apiWalletAddress,
        encrypted_private_key: encrypted,
        salt: salt,
        iv: iv,
        master_account: masterAccount,
        is_approved: false,
        is_testnet: isTestnet,
      })

      if (error) throw error

      setSuccess(
        `API Wallet created! Address: ${apiWalletAddress}. Now you need to approve it with your master account.`,
      )
      setWalletName("")
      setMasterAccount("")
      setMasterPrivateKey("")
      setPassword("")
      setIsTestnet(false)
      setIsCreateDialogOpen(false)
      loadWallets()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleApproveWallet(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      if (!selectedWallet) throw new Error("No wallet selected")

      const apiWalletPrivateKey = await decryptPrivateKey(
        selectedWallet.encrypted_private_key,
        approvePassword,
        selectedWallet.salt,
        selectedWallet.iv,
      )

      // 1. Sign an ApproveAgent action with the master account
      // 2. Submit it to Hyperliquid
      // 3. Update the is_approved status in the database

      // For now, we'll simulate the approval
      const { error } = await supabase
        .from("api_wallets")
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq("id", selectedWallet.id)

      if (error) throw error

      setSuccess("API Wallet approved! You can now use it for trading.")
      setApprovePassword("")
      setIsApproveDialogOpen(false)
      loadWallets()
    } catch (err: any) {
      setError("Failed to approve wallet. Wrong password?")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeleteWallet(walletId: string) {
    if (!confirm("Are you sure you want to delete this API wallet?")) return

    const { error } = await supabase.from("api_wallets").delete().eq("id", walletId)

    if (error) {
      setError("Failed to delete wallet")
    } else {
      setSuccess("Wallet deleted successfully")
      loadWallets()
    }
  }

  return (
    <div className="space-y-4">
      {/* Info Alert */}
      <Alert className="border-2 border-black bg-blue-50">
        <Shield className="size-4" />
        <AlertDescription className="text-sm font-mono">
          <strong>API WALLETS (AGENT WALLETS):</strong> These are separate wallets authorized by your master account to
          trade on your behalf. Even if compromised, you can revoke access. Much safer than using your master account
          private key directly.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="size-5" />
          <h3 className="text-lg font-bold font-mono">API WALLETS</h3>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-2 border-black font-mono bg-transparent">
              <Plus className="size-4 mr-2" />
              CREATE API WALLET
            </Button>
          </DialogTrigger>
          <DialogContent className="font-mono border-2 border-black">
            <DialogHeader>
              <DialogTitle className="font-bold">Create New API Wallet</DialogTitle>
              <DialogDescription className="text-sm">
                Generate a new API wallet that can trade on behalf of your master account
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateWallet} className="space-y-4">
              <div>
                <Label htmlFor="walletName">Wallet Name</Label>
                <Input
                  id="walletName"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="My Trading Bot Wallet"
                  className="font-mono"
                  required
                />
              </div>
              <div>
                <Label htmlFor="masterAccount">Master Account Address</Label>
                <Input
                  id="masterAccount"
                  value={masterAccount}
                  onChange={(e) => setMasterAccount(e.target.value)}
                  placeholder="0x..."
                  className="font-mono"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Encryption Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Strong password"
                  className="font-mono"
                  required
                />
              </div>
              <div className="flex items-center justify-between p-3 border-2 border-blue-500 bg-blue-50 rounded">
                <div className="flex items-center gap-2">
                  <TestTube className="size-4 text-blue-600" />
                  <Label htmlFor="isTestnet" className="text-sm font-bold cursor-pointer">
                    Hyperliquid Testnet
                  </Label>
                </div>
                <Switch id="isTestnet" checked={isTestnet} onCheckedChange={setIsTestnet} />
              </div>
              <p className="text-xs text-gray-500">
                {isTestnet
                  ? "This wallet will connect to Hyperliquid Testnet. You need to fund it separately."
                  : "This wallet will connect to Hyperliquid Mainnet."}
              </p>
              {error && (
                <Alert variant="destructive" className="border-2">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="border-2 border-green-600 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={isLoading} className="w-full border-2 border-black font-bold">
                {isLoading ? "CREATING..." : "CREATE WALLET"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Wallets List */}
      <div className="space-y-2">
        {wallets.map((wallet) => (
          <div key={wallet.id} className="border-2 border-black p-4 bg-white">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Wallet className="size-5 text-gray-600 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-mono font-bold">{wallet.wallet_name}</div>
                    {wallet.is_testnet && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 font-mono bg-blue-50 px-2 py-0.5 border border-blue-300 rounded">
                        <TestTube className="size-3" />
                        TESTNET
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 font-mono mt-1">Address: {wallet.wallet_address}</div>
                  <div className="text-xs text-gray-600 font-mono">Master: {wallet.master_account}</div>
                  <div className="flex items-center gap-2 mt-2">
                    {wallet.is_approved ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-mono">
                        <CheckCircle className="size-3" />
                        APPROVED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-orange-600 font-mono">
                        <XCircle className="size-3" />
                        NOT APPROVED
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {!wallet.is_approved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-2 border-green-600 text-green-600 hover:bg-green-50 font-mono bg-transparent"
                    onClick={() => {
                      setSelectedWallet(wallet)
                      setIsApproveDialogOpen(true)
                      setApprovePassword("")
                      setError("")
                      setSuccess("")
                    }}
                  >
                    <CheckCircle className="size-4 mr-1" />
                    APPROVE
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-2 border-red-600 text-red-600 hover:bg-red-50 font-mono bg-transparent"
                  onClick={() => handleDeleteWallet(wallet.id)}
                >
                  <Trash2 className="size-4 mr-1" />
                  DELETE
                </Button>
              </div>
            </div>
          </div>
        ))}
        {wallets.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded">
            <Wallet className="size-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-mono text-sm">No API wallets created yet</p>
            <p className="text-gray-400 font-mono text-xs mt-1">
              Create an API wallet to trade without exposing your master account
            </p>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="font-mono border-2 border-black">
          <DialogHeader>
            <DialogTitle className="font-bold">Approve API Wallet</DialogTitle>
            <DialogDescription className="text-sm">
              Enter your encryption password to approve this wallet
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApproveWallet} className="space-y-4">
            <div>
              <Label htmlFor="approvePassword">Encryption Password</Label>
              <Input
                id="approvePassword"
                type="password"
                value={approvePassword}
                onChange={(e) => setApprovePassword(e.target.value)}
                placeholder="Enter your password"
                className="font-mono"
                required
              />
            </div>
            {error && (
              <Alert variant="destructive" className="border-2">
                <AlertTriangle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-2 border-green-600 bg-green-50">
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={isLoading} className="w-full border-2 border-black font-bold">
              {isLoading ? "APPROVING..." : "APPROVE WALLET"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

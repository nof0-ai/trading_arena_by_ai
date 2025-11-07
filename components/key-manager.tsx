"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { encryptPrivateKey, decryptPrivateKey, isValidPrivateKey } from "@/lib/crypto"
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
import { Key, Lock, Unlock, Trash2, Copy, AlertTriangle, Shield } from "lucide-react"

interface EncryptedKey {
  id: string
  key_name: string
  encrypted_private_key: string
  salt: string
  iv: string
  created_at: string
}

export function KeyManager() {
  const [keys, setKeys] = useState<EncryptedKey[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<EncryptedKey | null>(null)

  // Add key form state
  const [keyName, setKeyName] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  // Unlock key state
  const [unlockPassword, setUnlockPassword] = useState("")
  const [decryptedKey, setDecryptedKey] = useState("")

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  // Load user's encrypted keys
  useEffect(() => {
    loadKeys()
  }, [])

  async function loadKeys() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("encrypted_keys")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading keys:", error)
    } else {
      setKeys(data || [])
    }
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      // Validation
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match")
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters")
      }
      if (!isValidPrivateKey(privateKey)) {
        throw new Error("Invalid private key format (must be 64 hex characters)")
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Encrypt the private key
      const { encrypted, salt, iv } = await encryptPrivateKey(privateKey, password)

      // Store in Supabase
      const { error } = await supabase.from("encrypted_keys").insert({
        user_id: user.id,
        key_name: keyName,
        encrypted_private_key: encrypted,
        salt: salt,
        iv: iv,
      })

      if (error) throw error

      setSuccess("Private key encrypted and stored securely!")
      setKeyName("")
      setPrivateKey("")
      setPassword("")
      setConfirmPassword("")
      setIsAddDialogOpen(false)
      loadKeys()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUnlockKey(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      if (!selectedKey) throw new Error("No key selected")

      // Decrypt the private key
      const decrypted = await decryptPrivateKey(
        selectedKey.encrypted_private_key,
        unlockPassword,
        selectedKey.salt,
        selectedKey.iv,
      )

      setDecryptedKey(decrypted)
      setSuccess("Key unlocked successfully!")
    } catch (err: any) {
      setError("Failed to decrypt. Wrong password?")
      setDecryptedKey("")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeleteKey(keyId: string) {
    if (!confirm("Are you sure you want to delete this key? This action cannot be undone.")) return

    const { error } = await supabase.from("encrypted_keys").delete().eq("id", keyId)

    if (error) {
      setError("Failed to delete key")
    } else {
      setSuccess("Key deleted successfully")
      loadKeys()
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setSuccess("Copied to clipboard!")
    setTimeout(() => setSuccess(""), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Security Notice */}
      <Alert className="border-2 border-black bg-yellow-50">
        <Shield className="size-4" />
        <AlertDescription className="text-sm font-mono">
          <strong>SECURITY:</strong> Your private keys are encrypted client-side using AES-256-GCM before storage. Only
          you can decrypt them with your password. If you forget your password, keys cannot be recovered.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="size-5" />
          <h3 className="text-lg font-bold font-mono">ENCRYPTED PRIVATE KEYS</h3>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-2 border-black font-mono bg-transparent">
              <Lock className="size-4 mr-2" />
              ADD KEY
            </Button>
          </DialogTrigger>
          <DialogContent className="font-mono border-2 border-black">
            <DialogHeader>
              <DialogTitle className="font-bold">Add Encrypted Private Key</DialogTitle>
              <DialogDescription className="text-sm">
                Your private key will be encrypted with AES-256 before storage
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddKey} className="space-y-4">
              <div>
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="My Trading Key"
                  className="font-mono"
                  required
                />
              </div>
              <div>
                <Label htmlFor="privateKey">Private Key (64 hex characters)</Label>
                <Input
                  id="privateKey"
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="0x... or without 0x prefix"
                  className="font-mono"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Encryption Password (min 8 chars)</Label>
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
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
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
                {isLoading ? "ENCRYPTING..." : "ENCRYPT & SAVE"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Keys List */}
      <div className="space-y-2">
        {keys.map((key) => (
          <div key={key.id} className="border-2 border-black p-4 bg-white hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="size-5 text-gray-600" />
                <div>
                  <div className="font-mono font-bold">{key.key_name}</div>
                  <div className="text-xs text-gray-600 font-mono">
                    Added: {new Date(key.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-2 border-black font-mono bg-transparent"
                  onClick={() => {
                    setSelectedKey(key)
                    setIsUnlockDialogOpen(true)
                    setDecryptedKey("")
                    setUnlockPassword("")
                    setError("")
                    setSuccess("")
                  }}
                >
                  <Unlock className="size-4 mr-1" />
                  UNLOCK
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-2 border-red-600 text-red-600 hover:bg-red-50 font-mono bg-transparent"
                  onClick={() => handleDeleteKey(key.id)}
                >
                  <Trash2 className="size-4 mr-1" />
                  DELETE
                </Button>
              </div>
            </div>
          </div>
        ))}
        {keys.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded">
            <Key className="size-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-mono text-sm">No encrypted keys stored yet</p>
            <p className="text-gray-400 font-mono text-xs mt-1">
              Click "ADD KEY" to securely store your first private key
            </p>
          </div>
        )}
      </div>

      {/* Unlock Dialog */}
      <Dialog open={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen}>
        <DialogContent className="font-mono border-2 border-black">
          <DialogHeader>
            <DialogTitle className="font-bold">Unlock Key: {selectedKey?.key_name}</DialogTitle>
            <DialogDescription className="text-sm">
              Enter your encryption password to decrypt this private key
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUnlockKey} className="space-y-4">
            <div>
              <Label htmlFor="unlockPassword">Decryption Password</Label>
              <Input
                id="unlockPassword"
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
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
            {decryptedKey && (
              <div className="space-y-2">
                <Label>Decrypted Private Key</Label>
                <div className="p-3 bg-gray-100 rounded border-2 border-black break-all text-xs font-mono">
                  {decryptedKey}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(decryptedKey)}
                  className="w-full border-2 border-black font-mono"
                >
                  <Copy className="size-4 mr-2" />
                  COPY TO CLIPBOARD
                </Button>
              </div>
            )}
            <Button type="submit" disabled={isLoading} className="w-full border-2 border-black font-bold">
              {isLoading ? "DECRYPTING..." : "DECRYPT"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

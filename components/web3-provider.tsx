"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface Web3ContextType {
  address: string | null
  isConnected: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const Web3Context = createContext<Web3ContextType>({
  address: null,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
})

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Check if already connected
    const savedAddress = localStorage.getItem("walletAddress")
    if (savedAddress) {
      setAddress(savedAddress)
      setIsConnected(true)
    }
  }, [])

  const connect = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("Please install MetaMask or another Web3 wallet")
      return
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })

      if (accounts.length > 0) {
        const userAddress = accounts[0]
        setAddress(userAddress)
        setIsConnected(true)
        localStorage.setItem("walletAddress", userAddress)
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error)
    }
  }

  const disconnect = () => {
    setAddress(null)
    setIsConnected(false)
    localStorage.removeItem("walletAddress")
  }

  return <Web3Context.Provider value={{ address, isConnected, connect, disconnect }}>{children}</Web3Context.Provider>
}

export function useWeb3() {
  return useContext(Web3Context)
}

// Extend window type for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, callback: (...args: unknown[]) => void) => void
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void
    }
  }
}

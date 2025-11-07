import { signUserSignedAction } from "@nktkas/hyperliquid/signing"
import { ApproveAgentRequest, ApproveAgentTypes, parser } from "@nktkas/hyperliquid/api/exchange"
import { createWalletClient, custom, type Address } from "viem"
import * as hl from "@nktkas/hyperliquid"

export interface ApproveAgentParams {
  masterAccount: Address
  agentAddress: Address
  agentName?: string
  isTestnet?: boolean
}

export interface RevokeAgentParams {
  masterAccount: Address
  agentAddress: Address
  agentName?: string // Required if the agent was registered with a name
  isTestnet?: boolean
}

export interface AgentWallet {
  address: string
  name?: string
  hasPassword: boolean // Whether we have the password in our system
  dbId?: string // Database ID if exists in our system
  isApproved: boolean // Whether approved on Hyperliquid
}

/**
 * Get all approved agent wallets from Hyperliquid for a master account
 * Hyperliquid stores agent information in the user's state
 */
export async function getAgentWalletsFromHyperliquid(
  masterAccount: Address,
  isTestnet: boolean = false
): Promise<AgentWallet[]> {
  const apiUrl = isTestnet ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz"
  
  // Create InfoClient to query Hyperliquid
  const infoClient = new hl.InfoClient({
    transport: new hl.HttpTransport({
      isTestnet,
    }),
  })

  // Get user state which contains agent information
  // Hyperliquid API: GET /info?type=clearinghouseState&user={address}
  const state = await infoClient.clearinghouseState({ user: masterAccount })
  
  // Log the full state for debugging
  console.log("[hyperliquid-agent] Clearinghouse state structure:", JSON.stringify(state, null, 2))
  
  // Extract agent addresses from the state
  // Hyperliquid stores agents in different locations depending on API version
  const agents: AgentWallet[] = []
  
  if (state && typeof state === 'object') {
    const stateAny = state as any
    
    // Method 1: Direct agents array (most common)
    if (stateAny.agents && Array.isArray(stateAny.agents)) {
      stateAny.agents.forEach((agent: any) => {
        const agentAddress = typeof agent === 'string' ? agent : agent.address
        if (agentAddress) {
          agents.push({
            address: agentAddress.toLowerCase(),
            name: typeof agent === 'object' && agent.name ? agent.name : agentAddress.slice(0, 6) + '...' + agentAddress.slice(-4),
            hasPassword: false, // Will be updated when matched with DB
            isApproved: true,
          })
        }
      })
    }
    
    // Method 2: Check meta.agents
    if (stateAny.meta?.agents && Array.isArray(stateAny.meta.agents)) {
      stateAny.meta.agents.forEach((agent: any) => {
        const agentAddress = typeof agent === 'string' ? agent : agent.address
        if (agentAddress && !agents.find(a => a.address === agentAddress.toLowerCase())) {
          agents.push({
            address: agentAddress.toLowerCase(),
            name: typeof agent === 'object' && agent.name ? agent.name : agentAddress.slice(0, 6) + '...' + agentAddress.slice(-4),
            hasPassword: false,
            isApproved: true,
          })
        }
      })
    }
    
    // Method 3: Check for agent info in user state structure
    if (stateAny.user && stateAny.user.agents) {
      const userAgents = Array.isArray(stateAny.user.agents) 
        ? stateAny.user.agents 
        : Object.keys(stateAny.user.agents)
      
      userAgents.forEach((agent: any) => {
        const agentAddress = typeof agent === 'string' ? agent : agent.address
        if (agentAddress && !agents.find(a => a.address === agentAddress.toLowerCase())) {
          agents.push({
            address: agentAddress.toLowerCase(),
            name: typeof agent === 'object' && agent.name ? agent.name : agentAddress.slice(0, 6) + '...' + agentAddress.slice(-4),
            hasPassword: false,
            isApproved: true,
          })
        }
      })
    }
    
    // Method 4: Try to query meta endpoint directly for agent info
    // Hyperliquid might have a separate endpoint for agents
    try {
      const meta = await infoClient.meta()
      const metaAny = meta as any
      if (metaAny.agents && Array.isArray(metaAny.agents)) {
        metaAny.agents.forEach((agent: any) => {
          const agentAddress = typeof agent === 'string' ? agent : agent.address
          if (agentAddress && !agents.find(a => a.address === agentAddress.toLowerCase())) {
            agents.push({
              address: agentAddress.toLowerCase(),
              name: typeof agent === 'object' && agent.name ? agent.name : agentAddress.slice(0, 6) + '...' + agentAddress.slice(-4),
              hasPassword: false,
              isApproved: true,
            })
          }
        })
      }
    } catch (error) {
      // Meta endpoint might not have agents, that's okay
      console.log("[hyperliquid-agent] Meta endpoint doesn't have agents or error:", error)
    }
  }

  console.log(`[hyperliquid-agent] Found ${agents.length} agent wallet(s) from Hyperliquid for ${masterAccount}`)
  return agents
}

/**
 * Approve an Agent Wallet using Web3 wallet (MetaMask, etc.)
 * This allows the agent wallet to trade on behalf of the master account
 * without requiring the master account's private key.
 */
export async function approveAgentWithWeb3Wallet(params: ApproveAgentParams): Promise<{
  success: boolean
  error?: string
  signature?: string
}> {
  if (typeof window === "undefined" || !window.ethereum) {
    return { success: false, error: "Web3 wallet not found. Please install MetaMask or another Web3 wallet." }
  }

  const { masterAccount, agentAddress, agentName = "", isTestnet = false } = params

  // Verify the connected wallet matches the master account
  const [connectedAccount] = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[]

  if (!connectedAccount || connectedAccount.toLowerCase() !== masterAccount.toLowerCase()) {
    return {
      success: false,
      error: `Please connect with wallet ${masterAccount}. Currently connected: ${connectedAccount || "none"}`,
    }
  }

  // Create wallet client using Web3 provider
  const walletClient = createWalletClient({
    account: connectedAccount,
    transport: custom(window.ethereum),
  })

  // Get chain ID
  const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string

  // Create ApproveAgent action
  const nonce = Date.now()
  const action = parser(ApproveAgentRequest.entries.action)({
    type: "approveAgent",
    signatureChainId: chainId,
    hyperliquidChain: isTestnet ? "Testnet" : "Mainnet",
    agentAddress,
    agentName,
    nonce,
  })

  // Sign the action using Web3 wallet
  const signature = await signUserSignedAction({
    wallet: walletClient,
    action,
    types: ApproveAgentTypes,
  })

  // Submit to Hyperliquid API
  const apiUrl = isTestnet ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz"
  const response = await fetch(`${apiUrl}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      signature,
      nonce,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { 
      success: false, 
      error: `HTTP ${response.status}: ${errorText || response.statusText}` 
    }
  }

  const body = await response.json()

  // Hyperliquid API response structure:
  // Success: { status: "ok", response: { status: "ok", data: {...} } }
  // Error: { status: "ok", response: { status: "err", data: "error message" } }
  // or sometimes: { status: "err", response: {...} }
  
  // Log full response for debugging
  console.log("[hyperliquid-agent] Full API Response:", JSON.stringify(body, null, 2))
  
  if (body.status === "ok") {
    // Check nested response status
    if (body.response?.status === "ok") {
      return { success: true, signature: JSON.stringify(signature) }
    }
    
    // Success response with type "default" - this is also a success
    if (body.response?.type === "default" || (!body.response?.status && body.response)) {
      console.log("[hyperliquid-agent] Approve successful (default response type)")
      return { success: true, signature: JSON.stringify(signature) }
    }
    
    // Nested error response - this is the common case
    if (body.response?.status === "err") {
      // Extract error message from various possible locations
      const errorMsg = body.response?.data || 
                      body.response?.message || 
                      body.response?.error ||
                      (typeof body.response === "string" ? body.response : "Unknown error")
      
      console.error("[hyperliquid-agent] API Error Response:", {
        status: body.status,
        responseStatus: body.response?.status,
        errorData: body.response?.data,
        errorMessage: body.response?.message,
        fullResponse: body.response
      })
      
      return { 
        success: false, 
        error: errorMsg 
      }
    }
    
    // If response structure is unexpected, check if it's actually successful
    if (!body.response || Object.keys(body).length === 1) {
      return { success: true, signature: JSON.stringify(signature) }
    }
  }

  // Top-level error
  if (body.status === "err") {
    const errorMsg = body.response?.data || 
                    body.response?.message || 
                    body.error || 
                    (typeof body.response === "string" ? body.response : "Unknown error")
    
    console.error("[hyperliquid-agent] Top-level API Error:", {
      status: body.status,
      response: body.response,
      error: body.error
    })
    
    return { 
      success: false, 
      error: errorMsg 
    }
  }

  // Fallback: log the full response for debugging
  console.error("[hyperliquid-agent] Unexpected response format:", JSON.stringify(body, null, 2))
  return { 
    success: false, 
    error: `Unexpected response format: ${JSON.stringify(body)}` 
  }
}

/**
 * Revoke an Agent Wallet by re-registering with the same name but a dummy address
 * According to Hyperliquid docs: "An existing named API Wallet is deregistered when 
 * an ApproveAgent action is sent with a matching name."
 * 
 * For unnamed agents, we can register a new unnamed agent which will deregister the old one.
 * 
 * Note: This effectively "revokes" the agent by making it unusable, but the agent address
 * itself may still appear in queries until it's fully pruned.
 */
export async function revokeAgentWithWeb3Wallet(params: RevokeAgentParams): Promise<{
  success: boolean
  error?: string
}> {
  if (typeof window === "undefined" || !window.ethereum) {
    return { success: false, error: "Web3 wallet not found. Please install MetaMask or another Web3 wallet." }
  }

  const { masterAccount, agentAddress, agentName, isTestnet = false } = params

  // Verify the connected wallet matches the master account
  const [connectedAccount] = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[]

  if (!connectedAccount || connectedAccount.toLowerCase() !== masterAccount.toLowerCase()) {
    return {
      success: false,
      error: `Please connect with wallet ${masterAccount}. Currently connected: ${connectedAccount || "none"}`,
    }
  }

  // Create wallet client using Web3 provider
  const walletClient = createWalletClient({
    account: connectedAccount,
    transport: custom(window.ethereum),
  })

  // Get chain ID
  const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string

  // To revoke an agent, we register a new agent with the same name but a dummy address
  // This will deregister the old agent according to Hyperliquid's behavior
  // For unnamed agents, we register a new unnamed agent (which will deregister the old one)
  // For named agents, we register with the same name but a different (dummy) address
  
  // Generate a dummy address that won't be used (0x000...0001 or similar)
  // Actually, we can use any address - the key is matching the name
  const dummyAddress = "0x0000000000000000000000000000000000000001" as Address

  // Create ApproveAgent action with the same name (or empty for unnamed) to deregister
  const nonce = Date.now()
  const action = parser(ApproveAgentRequest.entries.action)({
    type: "approveAgent",
    signatureChainId: chainId,
    hyperliquidChain: isTestnet ? "Testnet" : "Mainnet",
    agentAddress: dummyAddress, // Use dummy address to effectively revoke
    agentName: agentName || "", // Use same name to deregister the old one
    nonce,
  })

  // Sign the action using Web3 wallet
  const signature = await signUserSignedAction({
    wallet: walletClient,
    action,
    types: ApproveAgentTypes,
  })

  // Submit to Hyperliquid API
  const apiUrl = isTestnet ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz"
  const response = await fetch(`${apiUrl}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      signature,
      nonce,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { 
      success: false, 
      error: `HTTP ${response.status}: ${errorText || response.statusText}` 
    }
  }

  const body = await response.json()

  // Log full response for debugging
  console.log("[hyperliquid-agent] Revoke API Response:", JSON.stringify(body, null, 2))
  
  if (body.status === "ok") {
    // Check nested response status
    if (body.response?.status === "ok") {
      return { success: true }
    }
    
    // Success response with type "default" - this is also a success
    if (body.response?.type === "default" || (!body.response?.status && body.response)) {
      console.log("[hyperliquid-agent] Revoke successful (default response type)")
      return { success: true }
    }
    
    // Nested error response
    if (body.response?.status === "err") {
      const errorMsg = body.response?.data || 
                      body.response?.message || 
                      body.response?.error ||
                      (typeof body.response === "string" ? body.response : "Unknown error")
      
      console.error("[hyperliquid-agent] Revoke API Error:", errorMsg)
      return { 
        success: false, 
        error: errorMsg 
      }
    }
    
    // If response exists but no status field, assume success
    if (body.response && !body.response.status) {
      console.log("[hyperliquid-agent] Revoke successful (no status field in response)")
      return { success: true }
    }
  }

  // Top-level error
  if (body.status === "err") {
    const errorMsg = body.response?.data || 
                    body.response?.message || 
                    body.error || 
                    (typeof body.response === "string" ? body.response : "Unknown error")
    
    return { 
      success: false, 
      error: errorMsg 
    }
  }

  // Fallback
  console.error("[hyperliquid-agent] Unexpected revoke response format:", JSON.stringify(body, null, 2))
  return { 
    success: false, 
    error: `Unexpected response format: ${JSON.stringify(body)}` 
  }
}

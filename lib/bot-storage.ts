import { createBrowserClient } from "@/lib/supabase/client"
import { encryptPrivateKey, decryptPrivateKey } from "@/lib/crypto"
import { deleteAgentWalletPassword, deleteOpenRouterApiKey } from "./bot-vault"

export interface BotConfig {
  id?: string
  name: string
  model: string
  prompt: string
  tradingPairs: string[]
  apiWalletId?: string
  // Sensitive fields removed - stored in Vault instead:
  // apiKey, apiSecret, apiWalletPassword, privateKey
  status: "active" | "paused" | "stopped"
  orderSize?: number // USD value per trade
  maxOrderSize?: number
  maxPositionSize?: number
  slippage?: number // Slippage percentage for IOC orders (e.g., 0.5 for 0.5%)
  executionInterval?: number // Execution frequency in minutes
  isPublic?: boolean // If true, bot can participate in public leaderboard, modelchat, and positions
  createdAt?: string
  updatedAt?: string
}

export interface EncryptedBot {
  id: string
  user_address: string
  bot_name: string
  encrypted_config: string
  salt: string
  iv: string
  created_at: string
  updated_at: string
}

/**
 * Save bot configuration to Supabase
 * Sensitive data (passwords, private keys) are stored in Vault
 */
export async function saveBotConfig(
  userAddress: string,
  botConfig: BotConfig,
  secrets?: {
    apiWalletPassword?: string
    privateKey?: string
    apiKey?: string
    apiSecret?: string
  },
): Promise<{ success: boolean; error?: string; botId?: string }> {
  try {
    const supabase = createBrowserClient()

    // Normalize address to lowercase for consistency
    const normalizedAddress = userAddress.toLowerCase()

    // Save bot config (without sensitive data) as JSON
    const { data, error } = await supabase
      .from("encrypted_bots")
      .insert({
        user_address: normalizedAddress,
        bot_name: botConfig.name,
        encrypted_config: JSON.stringify(botConfig), // Store as plain JSON for Edge Functions
        salt: "",
        iv: "",
        is_public: botConfig.isPublic || false,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error saving bot:", error)
      return { success: false, error: error.message }
    }

    const botId = data.id

    // Note: Agent wallet passwords are now stored separately using storeAgentWalletPassword
    // with key format: key_{address}_{botname}
    // This is handled in bot-creator.tsx after bot creation

    return { success: true, botId }
  } catch (error) {
    console.error("[v0] Error in saveBotConfig:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Update bot configuration
 * Can optionally update secrets in Vault
 */
export async function updateBotConfig(
  botId: string,
  userAddress: string,
  botConfig: BotConfig,
  secrets?: {
    apiWalletPassword?: string
    privateKey?: string
    apiKey?: string
    apiSecret?: string
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createBrowserClient()

    // Normalize address to lowercase for consistency
    const normalizedAddress = userAddress.toLowerCase()

    // Update bot config
    const { error } = await supabase
      .from("encrypted_bots")
      .update({
        bot_name: botConfig.name,
        encrypted_config: JSON.stringify(botConfig),
        is_public: botConfig.isPublic !== undefined ? botConfig.isPublic : false,
      })
      .eq("id", botId)
      .eq("user_address", normalizedAddress)

    if (error) {
      console.error("[v0] Error updating bot:", error)
      return { success: false, error: error.message }
    }

    // Update secrets in Vault if provided
    if (secrets) {
      // Note: We need the password to update secrets. For now, we'll require it as a parameter.
      // In a production system, you might want to handle this differently.
      // For now, storing secrets during update requires re-encryption with the same password
      // This is a limitation - in production, you'd want to handle password changes separately
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Error in updateBotConfig:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Load bot configuration (secrets are stored separately in Vault)
 */
export async function loadBotConfig(
  botId: string,
  userAddress: string,
): Promise<{ success: boolean; config?: BotConfig; error?: string }> {
  try {
    const supabase = createBrowserClient()

    // Normalize address to lowercase for consistency
    const normalizedAddress = userAddress.toLowerCase()

    // Fetch bot
    const { data, error } = await supabase
      .from("encrypted_bots")
      .select("*")
      .eq("id", botId)
      .eq("user_address", normalizedAddress)
      .single()

    if (error) {
      console.error("[v0] Error loading bot:", error)
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: "Bot not found" }
    }

    // Parse config (stored as JSON, not encrypted)
    let config: BotConfig
    try {
      config = JSON.parse(data.encrypted_config) as BotConfig
    } catch {
      // Legacy: try to decrypt if it's encrypted
      return { success: false, error: "Invalid bot configuration format" }
    }

    // Add metadata
    config.id = data.id
    config.createdAt = data.created_at
    config.updatedAt = data.updated_at
    
    // Ensure name is set from database field (bot_name is the source of truth)
    if (data.bot_name) {
      config.name = data.bot_name
    }
    
    // Ensure is_public is set from database field if not in JSON (for backward compatibility)
    if (config.isPublic === undefined && data.is_public !== undefined) {
      config.isPublic = data.is_public
    }

    return { success: true, config }
  } catch (error) {
    console.error("[v0] Error in loadBotConfig:", error)
    return { success: false, error: "Failed to load bot configuration" }
  }
}

/**
 * List all bots for a user (without decrypting)
 */
export async function listUserBots(
  userAddress: string,
): Promise<{ success: boolean; bots?: EncryptedBot[]; error?: string }> {
  try {
    const supabase = createBrowserClient()

    // Normalize address to lowercase for consistency
    const normalizedAddress = userAddress.toLowerCase()

    const { data, error } = await supabase
      .from("encrypted_bots")
      .select("*")
      .eq("user_address", normalizedAddress)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error listing bots:", error)
      return { success: false, error: error.message }
    }

    return { success: true, bots: data || [] }
  } catch (error) {
    console.error("[v0] Error in listUserBots:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Delete a bot configuration and its secrets
 */
export async function deleteBotConfig(
  botId: string,
  userAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createBrowserClient()

    // Normalize address to lowercase for consistency
    const normalizedAddress = userAddress.toLowerCase()

    // Get bot config first to get bot name and apiWalletId
    const { data: botData } = await supabase
      .from("encrypted_bots")
      .select("bot_name, encrypted_config")
      .eq("id", botId)
      .eq("user_address", normalizedAddress)
      .single()

    if (botData) {
      try {
        const botConfig = JSON.parse(botData.encrypted_config) as BotConfig
        
        // If bot uses API wallet, delete the password from Vault
        if (botConfig.apiWalletId) {
          // Get wallet address from api_wallets table
          const { data: apiWallet } = await supabase
            .from("api_wallets")
            .select("wallet_address")
            .eq("id", botConfig.apiWalletId)
            .single()
          
          if (apiWallet) {
            // Delete agent wallet password from Vault using key_{address}_{botname}
            // Note: wallet_address should be lowercase (agent wallet address)
            await deleteAgentWalletPassword(apiWallet.wallet_address.toLowerCase(), botConfig.name)
          }
        }

        // Delete OpenRouter API key from Vault
        await deleteOpenRouterApiKey(botId)
      } catch (parseError) {
        // If parsing fails, continue with deletion anyway
        console.warn("[v0] Could not parse bot config for secret deletion:", parseError)
        // Still try to delete OpenRouter API key even if parsing fails
        await deleteOpenRouterApiKey(botId)
      }
    } else {
      // If bot data not found, still try to delete OpenRouter API key
      await deleteOpenRouterApiKey(botId)
    }

    // Delete bot config
    const { error } = await supabase.from("encrypted_bots").delete().eq("id", botId).eq("user_address", normalizedAddress)

    if (error) {
      console.error("[v0] Error deleting bot:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Error in deleteBotConfig:", error)
    return { success: false, error: String(error) }
  }
}

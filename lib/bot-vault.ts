/**
 * Bot Vault - Simple key-value storage for agent wallet passwords and OpenRouter API keys
 * Uses Supabase Vault (pgsodium) for encryption
 * Key format for passwords: key_{address}_{botname}
 * Key format for OpenRouter keys: openrouter_key_{bot_id}
 */

import { createBrowserClient } from "@/lib/supabase/client"

/**
 * Store agent wallet password in Vault
 * Key: key_{address}_{botname}
 */
export async function storeAgentWalletPassword(
  address: string,
  botName: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.rpc("store_agent_wallet_password", {
    wallet_address: address.toLowerCase(),
    bot_name: botName,
    password_value: password,
  })

  if (error) {
    console.error("[v0] Error storing agent wallet password:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get agent wallet password from Vault
 * Key: key_{address}_{botname}
 */
export async function getAgentWalletPassword(
  address: string,
  botName: string,
): Promise<{ success: boolean; value?: string; error?: string }> {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.rpc("get_agent_wallet_password", {
    wallet_address: address.toLowerCase(),
    bot_name: botName,
  })

  if (error || !data) {
    return { success: false, error: "Password not found in Vault" }
  }

  return { success: true, value: data }
}

/**
 * Delete agent wallet password from Vault
 */
export async function deleteAgentWalletPassword(
  address: string,
  botName: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient()

  const { error } = await supabase.rpc("delete_agent_wallet_password", {
    wallet_address: address.toLowerCase(),
    bot_name: botName,
  })

  if (error) {
    console.error("[v0] Error deleting agent wallet password:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Store OpenRouter API key in Vault
 * Key: openrouter_key_{bot_id}
 */
export async function storeOpenRouterApiKey(
  botId: string,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.rpc("store_openrouter_api_key", {
    bot_id: botId,
    api_key: apiKey,
  })

  if (error) {
    console.error("[v0] Error storing OpenRouter API key:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get OpenRouter API key from Vault
 * Key: openrouter_key_{bot_id}
 */
export async function getOpenRouterApiKey(
  botId: string,
): Promise<{ success: boolean; value?: string; error?: string }> {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.rpc("get_openrouter_api_key", {
    bot_id: botId,
  })

  if (error || !data) {
    return { success: false, error: "OpenRouter API key not found in Vault" }
  }

  return { success: true, value: data }
}

/**
 * Delete OpenRouter API key from Vault
 */
export async function deleteOpenRouterApiKey(
  botId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient()

  const { error } = await supabase.rpc("delete_openrouter_api_key", {
    bot_id: botId,
  })

  if (error) {
    console.error("[v0] Error deleting OpenRouter API key:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

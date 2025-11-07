import { createBrowserClient } from "@/lib/supabase/client"
import { getModelIcon, getModelImage } from "@/lib/share-data"
import { getModelIcon } from "@/lib/share-data"

export interface ModelChat {
  id: string
  botId: string
  model: string
  modelIcon: string
  modelImage: string
  time: number
  message: string
}

/**
 * Get the latest analysis message for each active bot
 */
export async function getLatestModelChats(): Promise<ModelChat[]> {
  const supabase = createBrowserClient()

  // Get all bots (status is stored in encrypted_config JSON, not as a column)
  const { data: allBots, error: botsError } = await supabase
    .from("encrypted_bots")
    .select("id, encrypted_config, is_public")

  if (botsError || !allBots) {
    console.error("[getLatestModelChats] Error fetching bots:", botsError)
    return []
  }

  // Filter bots: must be public and active
  const bots = allBots.filter((bot) => {
    if (!bot.is_public) return false
    try {
      const config = JSON.parse(bot.encrypted_config)
      return config.status === "active"
    } catch {
      return false
    }
  })

  const botIds = bots.map((b) => b.id)

  if (botIds.length === 0) {
    return []
  }

  // Get the latest analysis for each bot
  // We need to get the most recent analysis per bot
  // Since Supabase doesn't support DISTINCT ON easily, we'll fetch all and filter in code
  const { data: analyses, error: analysesError } = await supabase
    .from("price_analyses")
    .select("id, bot_id, analysis, recommendation, created_at")
    .in("bot_id", botIds)
    .not("bot_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000) // Limit to avoid fetching too much data

  if (analysesError || !analyses) {
    console.error("[getLatestModelChats] Error fetching analyses:", analysesError)
    return []
  }

  // Create bot info map
  const botInfoMap = new Map<
    string,
    {
      name: string
      model: string
      icon: string
      modelImage: string
    }
  >()

  for (const bot of bots) {
    try {
      const config = JSON.parse(bot.encrypted_config)
      const model = config.model || "Unknown"

      const icon = getModelIcon(model)
      const modelImage = getModelImage(model)

      botInfoMap.set(bot.id, {
        name: config.name || "Unknown Bot",
        model: model.toUpperCase(),
        icon,
        modelImage,
      })
    } catch (error) {
      botInfoMap.set(bot.id, {
        name: "Unknown Bot",
        model: "UNKNOWN",
        icon: getModelIcon(undefined),
        modelImage: getModelImage(undefined),
      })
    }
  }

  // Get the latest analysis for each bot
  const latestByBot = new Map<string, typeof analyses[0]>()
  for (const analysis of analyses) {
    if (!analysis.bot_id) continue
    if (!latestByBot.has(analysis.bot_id)) {
      latestByBot.set(analysis.bot_id, analysis)
    }
  }

  // Convert to ModelChat format
  const modelChats: ModelChat[] = []
  for (const [botId, analysis] of latestByBot.entries()) {
    const botInfo = botInfoMap.get(botId)
    if (!botInfo) continue

    // Use analysis text as message, or create a message from recommendation
    let message = analysis.analysis || ""
    if (!message || message.trim().length === 0) {
      // Fallback: create message from recommendation
      const rec = analysis.recommendation?.toUpperCase() || "HOLD"
      message = `Current recommendation: ${rec}.`
    }

    modelChats.push({
      id: analysis.id,
      botId,
      model: botInfo.model,
      modelIcon: botInfo.icon,
      modelImage: botInfo.modelImage,
      time: new Date(analysis.created_at).getTime(),
      message: message.trim(),
    })
  }

  // Sort by time (most recent first)
  modelChats.sort((a, b) => b.time - a.time)

  return modelChats
}


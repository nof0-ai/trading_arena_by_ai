import subscriptionPlanModelsConfig from "@/config/subscription-plan-models.json"

export interface SubscriptionPlan {
  plan_id: string
  name: string
  price_usd: number
  features: {
    bot_count: number
    trigger_interval_minutes: number
  }
  available_models: Array<{
    id: string
    name: string
  }>
}

type SubscriptionPlanModelsConfig = Record<string, unknown>

const rawPlanModels = subscriptionPlanModelsConfig as SubscriptionPlanModelsConfig

function loadPlanModels(planId: string): Array<{ id: string; name: string }> {
  const models = rawPlanModels[planId]

  if (models === undefined) {
    return []
  }

  if (!Array.isArray(models)) {
    throw new Error(`Invalid subscription plan models config for plan "${planId}". Expected an array.`)
  }

  return models.map((model, index) => {
    if (model === null || typeof model !== "object") {
      throw new Error(`Invalid model entry at index ${index} for plan "${planId}". Expected an object.`)
    }

    const { id, name } = model as { id?: unknown; name?: unknown }

    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`Invalid or missing model id at index ${index} for plan "${planId}".`)
    }

    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`Invalid or missing model name for id "${id}" in plan "${planId}".`)
    }

    return { id, name }
  })
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    plan_id: "basic",
    name: "Basic",
    price_usd: 49,
    features: {
      bot_count: 1,
      trigger_interval_minutes: 5,
    },
    available_models: loadPlanModels("basic"),
  },
  {
    plan_id: "pro",
    name: "Pro",
    price_usd: 199,
    features: {
      bot_count: 2,
      trigger_interval_minutes: 5,
    },
    available_models: loadPlanModels("pro"),
  },
  {
    plan_id: "flagship",
    name: "Flagship",
    price_usd: 999,
    features: {
      bot_count: 3,
      trigger_interval_minutes: 5,
    },
    available_models: loadPlanModels("flagship"),
  },
]

export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((plan) => plan.plan_id === planId)
}

export function getAvailableModelsForPlans(planIds: string[]): Array<{ id: string; name: string }> {
  const modelMap = new Map<string, { id: string; name: string }>()
  
  for (const planId of planIds) {
    const plan = getPlanById(planId)
    if (plan) {
      for (const model of plan.available_models) {
        if (!modelMap.has(model.id)) {
          modelMap.set(model.id, model)
        }
      }
    }
  }
  
  return Array.from(modelMap.values())
}

export function getMaxBotCountForPlans(planIds: string[]): number {
  return planIds.reduce((max, planId) => {
    const plan = getPlanById(planId)
    return plan ? Math.max(max, plan.features.bot_count) : max
  }, 0)
}

export function getTotalBotCountForPlans(planIds: string[]): number {
  return planIds.reduce((total, planId) => {
    const plan = getPlanById(planId)
    return plan ? total + plan.features.bot_count : total
  }, 0)
}


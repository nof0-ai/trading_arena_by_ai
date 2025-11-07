import subscriptionPlanModelsConfig from "@/config/subscription-plan-models.json"

export interface ModelDescriptor {
  id: string
  name: string
}

type SubscriptionPlanModelsConfig = Record<string, unknown>

const rawPlanModels = subscriptionPlanModelsConfig as SubscriptionPlanModelsConfig

const modelDescriptorMap = new Map<string, ModelDescriptor>()

for (const [planId, models] of Object.entries(rawPlanModels)) {
  if (models === undefined) {
    continue
  }

  if (!Array.isArray(models)) {
    throw new Error(`Invalid subscription plan models config for plan "${planId}". Expected an array.`)
  }

  models.forEach((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Invalid model entry at index ${index} for plan "${planId}". Expected an object.`)
    }

    const { id, name } = entry as { id?: unknown; name?: unknown }

    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error(`Invalid or missing model id at index ${index} for plan "${planId}".`)
    }

    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`Invalid or missing model name for id "${id}" in plan "${planId}".`)
    }

    const trimmedId = id.trim()

    if (!modelDescriptorMap.has(trimmedId)) {
      modelDescriptorMap.set(trimmedId, {
        id: trimmedId,
        name: name.trim(),
      })
    }
  })
}

export function getModelDescriptor(modelId: string | undefined): ModelDescriptor | undefined {
  if (modelId === undefined) {
    return undefined
  }

  const trimmedId = modelId.trim()
  if (trimmedId.length === 0) {
    return undefined
  }

  return modelDescriptorMap.get(trimmedId)
}

export function getModelDisplayName(modelId: string | undefined): string | undefined {
  return getModelDescriptor(modelId)?.name
}

export function listModelDescriptors(): ModelDescriptor[] {
  return Array.from(modelDescriptorMap.values())
}



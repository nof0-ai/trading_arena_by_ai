import { Header } from "@/components/header"
import { getModelIcon, getModelProvider } from "@/lib/share-data"
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans"
import Link from "next/link"

type PlanModelCard = {
  id: string
  name: string
  icon: string
  providerLabel: string
}

const PLAN_SECTIONS = SUBSCRIPTION_PLANS.map((plan) => {
  const models: PlanModelCard[] = plan.available_models.map((model) => {
    const provider = getModelProvider(model.id)
    const providerLabel = (() => {
      if (provider && provider.trim().length > 0) {
        return provider.trim().toUpperCase()
      }

      const rawId = model.id.trim()
      if (rawId.length === 0) {
        return "UNKNOWN"
      }

      const inferred = rawId.split("/")[0]
      if (inferred && inferred.trim().length > 0) {
        return inferred.trim().toUpperCase()
      }

      return rawId.toUpperCase()
    })()

    return {
      id: model.id,
      name: model.name,
      icon: getModelIcon(model.id),
      providerLabel,
    }
  })

  return {
    planId: plan.plan_id,
    title: `${plan.name.toUpperCase()} MODELS`,
    description: `Includes ${models.length} model${models.length === 1 ? "" : "s"}.`,
    models,
  }
})

export default function ModelsPage() {
  const hasModels = PLAN_SECTIONS.some((section) => section.models.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-mono mb-2">SUPPORTED MODELS</h1>
          <p className="text-sm font-mono text-muted-foreground mb-4">
            Choose from a wide range of AI models to power your trading bots
          </p>
          <Link
            href="/dashboard"
            className="inline-block border-2 border-black bg-white px-4 py-2 font-mono text-sm font-bold hover:bg-gray-100 transition-colors"
          >
            CREATE BOT →
          </Link>
        </div>

        {hasModels ? (
          <div className="space-y-12">
            {PLAN_SECTIONS.map((section) => (
              <section key={section.planId}>
                <h2 className="text-2xl font-bold font-mono mb-4">{section.title}</h2>
                <p className="text-sm font-mono text-muted-foreground mb-6">{section.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.models.map((model) => (
                    <div
                      key={`${section.planId}-${model.id}`}
                      className="border-2 border-black bg-white p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">{model.icon}</span>
                        <div>
                          <h3 className="font-mono font-bold text-lg">{model.name}</h3>
                          <p className="font-mono text-xs text-muted-foreground uppercase tracking-wide">
                            {model.providerLabel}
                          </p>
                        </div>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground break-words">
                        {model.id}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="border-2 border-black bg-white p-6 font-mono text-sm text-muted-foreground">
            No models available. Please verify the subscription plan configuration.
          </div>
        )}

        <div className="mt-12 border-2 border-black bg-white p-6">
          <h3 className="font-mono font-bold text-lg mb-3">HOW IT WORKS</h3>
          <div className="space-y-3 font-mono text-sm text-muted-foreground">
            <p>
              • Select a model when creating your trading bot in the dashboard
            </p>
            <p>
              • Free models are available immediately with no setup required
            </p>
            <p>
              • Premium models require credits, which can be purchased in the dashboard
            </p>
            <p>
              • Each model has unique strengths in analysis, reasoning, and decision-making
            </p>
            <p>
              • You can switch models or create multiple bots with different models
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}


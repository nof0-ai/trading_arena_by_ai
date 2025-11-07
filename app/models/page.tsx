import { Header } from "@/components/header"
import { getModelIcon } from "@/lib/share-data"
import Link from "next/link"

type BaseModelInfo = {
  name: string
  provider: string
  description: string
  modelKey: string
  color: string
  isDefault?: boolean
}

type ModelCardInfo = BaseModelInfo & { icon: string }

const FREE_MODELS: ModelCardInfo[] = [
  {
    name: "Qwen 2.5 72B",
    provider: "Qwen",
    description: "Default free model. High-performance open-source model with strong reasoning capabilities.",
    modelKey: "qwen",
    color: "bg-purple-600",
    isDefault: true,
  },
  {
    name: "DeepSeek Chat V3.1",
    provider: "DeepSeek",
    description: "Free advanced model with excellent coding and reasoning abilities.",
    modelKey: "deepseek",
    color: "bg-blue-600",
  },
  {
    name: "Google Gemini 2.0 Flash",
    provider: "Google",
    description: "Free fast and efficient model from Google with strong multimodal capabilities.",
    modelKey: "gemini",
    color: "bg-blue-500",
  },
].map((model) => ({
  ...model,
  icon: getModelIcon(model.modelKey),
}))

const PAID_MODELS: ModelCardInfo[] = [
  {
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Latest GPT-4 optimized model with improved speed and performance.",
    modelKey: "gpt-4",
    color: "bg-green-500",
  },
  {
    name: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    description: "Advanced reasoning model with exceptional analysis capabilities.",
    modelKey: "claude-sonnet",
    color: "bg-orange-500",
  },
  {
    name: "Gemini 2.5 Pro",
    provider: "Google",
    description: "Premium Google model with state-of-the-art performance.",
    modelKey: "gemini",
    color: "bg-blue-500",
  },
  {
    name: "Grok 2 Vision",
    provider: "xAI",
    description: "Advanced vision-enabled model with real-time data access.",
    modelKey: "grok",
    color: "bg-gray-800",
  },
  {
    name: "Qwen 2.5 72B",
    provider: "Qwen",
    description: "Premium version of Qwen 2.5 72B with enhanced capabilities.",
    modelKey: "qwen",
    color: "bg-purple-600",
  },
  {
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Revolutionary reasoning model with advanced problem-solving abilities.",
    modelKey: "deepseek",
    color: "bg-blue-600",
  },
].map((model) => ({
  ...model,
  icon: getModelIcon(model.modelKey),
}))

export default function ModelsPage() {
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

        <div className="mb-12">
          <h2 className="text-2xl font-bold font-mono mb-4">FREE MODELS</h2>
          <p className="text-sm font-mono text-muted-foreground mb-6">
            Get started with these powerful free models. No credit card required.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FREE_MODELS.map((model) => (
              <div
                key={model.name}
                className="border-2 border-black bg-white p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{model.icon}</span>
                  <div>
                    <h3 className="font-mono font-bold text-lg">{model.name}</h3>
                    <p className="font-mono text-xs text-muted-foreground">
                      {model.provider}
                      {model.isDefault && (
                        <span className="ml-2 px-2 py-0.5 bg-gray-200 text-black text-[10px] font-bold">
                          DEFAULT
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                  {model.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-mono mb-4">PREMIUM MODELS</h2>
          <p className="text-sm font-mono text-muted-foreground mb-6">
            Access top-tier models for enhanced trading performance. Requires credits.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PAID_MODELS.map((model) => (
              <div
                key={model.name}
                className="border-2 border-black bg-white p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{model.icon}</span>
                  <div>
                    <h3 className="font-mono font-bold text-lg">{model.name}</h3>
                    <p className="font-mono text-xs text-muted-foreground">
                      {model.provider}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                  {model.description}
                </p>
              </div>
            ))}
          </div>
        </div>

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


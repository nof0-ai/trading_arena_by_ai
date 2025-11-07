import { Header } from "@/components/header"
import { PriceTicker } from "@/components/price-ticker"
import { TradingDashboard } from "@/components/trading-dashboard"
import { ModelCards } from "@/components/model-cards"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <PriceTicker />
      <TradingDashboard />
      <ModelCards />
    </div>
  )
}

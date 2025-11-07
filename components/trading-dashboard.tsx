"use client"
import { PerformanceChart } from "@/components/performance-chart"
import { TradeHistory } from "@/components/trade-history"

export function TradingDashboard() {
  return (
    <main className="py-6 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <div className="border-2 border-black bg-white p-4">
          <PerformanceChart />
        </div>
        <div className="border-2 border-black bg-white">
          <TradeHistory />
        </div>
      </div>
    </main>
  )
}

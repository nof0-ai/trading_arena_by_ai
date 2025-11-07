"use client"

import { useState } from "react"
import { ChevronDown, Plus } from "lucide-react"

interface TechnicalIndicatorsProps {
  onInsert: (indicator: string) => void
}

const INDICATORS = [
  {
    name: "MA",
    fullName: "Moving Average",
    description: "Simple moving average over N periods",
    syntax: "{{ MA(period), limit }}",
    example: "{{ MA(5), 60 }}",
    params: [
      { name: "period", description: "Number of periods (e.g., 5, 20, 50)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "EMA",
    fullName: "Exponential Moving Average",
    description: "Exponential moving average giving more weight to recent prices",
    syntax: "{{ EMA(period), limit }}",
    example: "{{ EMA(12), 100 }}",
    params: [
      { name: "period", description: "Number of periods" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "RSI",
    fullName: "Relative Strength Index",
    description: "Momentum oscillator measuring speed and magnitude of price changes",
    syntax: "{{ RSI(period), limit }}",
    example: "{{ RSI(14), 50 }}",
    params: [
      { name: "period", description: "Number of periods (typically 14)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "MACD",
    fullName: "Moving Average Convergence Divergence",
    description: "Trend-following momentum indicator",
    syntax: "{{ MACD(fast, slow, signal), limit }}",
    example: "{{ MACD(12, 26, 9), 100 }}",
    params: [
      { name: "fast", description: "Fast EMA period (typically 12)" },
      { name: "slow", description: "Slow EMA period (typically 26)" },
      { name: "signal", description: "Signal line period (typically 9)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "BB",
    fullName: "Bollinger Bands",
    description: "Volatility bands placed above and below a moving average",
    syntax: "{{ BB(period, stddev), limit }}",
    example: "{{ BB(20, 2), 60 }}",
    params: [
      { name: "period", description: "Number of periods (typically 20)" },
      { name: "stddev", description: "Standard deviations (typically 2)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "VOLUME",
    fullName: "Trading Volume",
    description: "Number of shares or contracts traded",
    syntax: "{{ VOLUME, limit }}",
    example: "{{ VOLUME, 100 }}",
    params: [{ name: "limit", description: "Number of values to return (optional)" }],
  },
  {
    name: "ATR",
    fullName: "Average True Range",
    description: "Volatility indicator showing degree of price volatility",
    syntax: "{{ ATR(period), limit }}",
    example: "{{ ATR(14), 50 }}",
    params: [
      { name: "period", description: "Number of periods (typically 14)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
  {
    name: "STOCH",
    fullName: "Stochastic Oscillator",
    description: "Momentum indicator comparing closing price to price range",
    syntax: "{{ STOCH(k, d, smooth), limit }}",
    example: "{{ STOCH(14, 3, 3), 60 }}",
    params: [
      { name: "k", description: "%K period (typically 14)" },
      { name: "d", description: "%D period (typically 3)" },
      { name: "smooth", description: "Smoothing period (typically 3)" },
      { name: "limit", description: "Number of values to return (optional)" },
    ],
  },
]

export function TechnicalIndicators({ onInsert }: TechnicalIndicatorsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndicator, setSelectedIndicator] = useState<(typeof INDICATORS)[0] | null>(null)

  const handleInsert = (indicator: (typeof INDICATORS)[0]) => {
    onInsert(indicator.example)
    setIsOpen(false)
    setSelectedIndicator(null)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="border-2 border-black px-3 py-2 font-mono text-xs hover:bg-gray-100 flex items-center gap-2"
      >
        <Plus className="size-4" />
        ADD INDICATOR
        <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white border-2 border-black shadow-lg z-10 max-h-96 overflow-y-auto">
          <div className="border-b-2 border-black p-3 bg-gray-50">
            <h3 className="font-mono text-xs font-bold">TECHNICAL INDICATORS</h3>
            <p className="font-mono text-xs text-gray-600 mt-1">Click to insert into your prompt</p>
          </div>

          <div className="divide-y-2 divide-gray-200">
            {INDICATORS.map((indicator) => (
              <div key={indicator.name} className="p-3 hover:bg-gray-50 cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-mono text-sm font-bold">{indicator.name}</div>
                    <div className="font-mono text-xs text-gray-600">{indicator.fullName}</div>
                  </div>
                  <button
                    onClick={() => handleInsert(indicator)}
                    className="border border-black px-2 py-1 font-mono text-xs hover:bg-black hover:text-white"
                  >
                    INSERT
                  </button>
                </div>
                <p className="font-mono text-xs text-gray-700 mb-2">{indicator.description}</p>
                <div className="bg-gray-100 border border-gray-300 p-2 font-mono text-xs mb-2">
                  <span className="text-gray-600">Syntax:</span>{" "}
                  <span className="text-blue-600">{indicator.syntax}</span>
                </div>
                <div className="bg-green-50 border border-green-300 p-2 font-mono text-xs">
                  <span className="text-gray-600">Example:</span>{" "}
                  <span className="text-green-700">{indicator.example}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

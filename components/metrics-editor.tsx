"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, X, Edit2, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface MetricConfig {
  id: string
  name: string
  type: string
  params: Record<string, string>
  limit?: string
  dataSource?: string
}

interface MetricsEditorProps {
  onInsert: (metric: string) => void
}

const INDICATOR_TYPES = [
  {
    value: "ma",
    label: "Moving Average (MA)",
    description: "Simple moving average",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "dataSource", label: "Data Source", defaultValue: "c", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{ma({dataSource},{period}),{limit}}}",
    outputs: ["MA{period}"],
  },
  {
    value: "ema",
    label: "Exponential Moving Average (EMA)",
    description: "Exponential moving average",
    params: [
      { name: "period", label: "Period", defaultValue: "12" },
      { name: "dataSource", label: "Data Source", defaultValue: "c", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{ema({dataSource},{period}),{limit}}}",
    outputs: ["EMA{period}"],
  },
  {
    value: "rsi",
    label: "Relative Strength Index (RSI)",
    description: "Momentum oscillator",
    params: [
      { name: "period", label: "Period", defaultValue: "14" },
    ],
    syntax: "{{rsi({period}),{limit}}}",
    outputs: ["RSI"],
  },
  {
    value: "macd",
    label: "MACD",
    description: "Moving Average Convergence Divergence",
    params: [
      { name: "fast", label: "Fast Period", defaultValue: "12" },
      { name: "slow", label: "Slow Period", defaultValue: "26" },
      { name: "signal", label: "Signal Period", defaultValue: "9" },
    ],
    syntax: "{{macd({fast},{slow},{signal}),{limit}}}",
    outputs: ["MACD_DIF", "MACD_DEA", "MACD"],
  },
  {
    value: "bb",
    label: "Bollinger Bands (BB)",
    description: "Volatility bands",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "stddev", label: "Std Dev", defaultValue: "2" },
    ],
    syntax: "{{bb({period},{stddev}),{limit}}}",
    outputs: ["BOLL_MID", "BOLL_UPPER", "BOLL_LOWER"],
  },
  {
    value: "atr",
    label: "Average True Range (ATR)",
    description: "Volatility indicator",
    params: [
      { name: "period", label: "Period", defaultValue: "14" },
    ],
    syntax: "{{atr({period}),{limit}}}",
    outputs: ["ATR", "ATR_TR"],
  },
  {
    value: "stoch",
    label: "Stochastic Oscillator",
    description: "Momentum indicator",
    params: [
      { name: "k", label: "%K Period", defaultValue: "14" },
      { name: "d", label: "%D Period", defaultValue: "3" },
      { name: "smooth", label: "Smooth Period", defaultValue: "3" },
    ],
    syntax: "{{stoch({k},{d},{smooth}),{limit}}}",
    outputs: ["STOCH_K", "STOCH_D", "STOCH_RSV"],
  },
  {
    value: "hhv",
    label: "Highest High Value (HHV)",
    description: "Highest value over N periods",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "dataSource", label: "Data Source", defaultValue: "h", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{hhv({dataSource},{period}),{limit}}}",
    outputs: ["HHV (single value)"],
  },
  {
    value: "llv",
    label: "Lowest Low Value (LLV)",
    description: "Lowest value over N periods",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "dataSource", label: "Data Source", defaultValue: "l", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{llv({dataSource},{period}),{limit}}}",
    outputs: ["LLV (single value)"],
  },
  {
    value: "ref",
    label: "Reference (REF)",
    description: "Value N periods ago",
    params: [
      { name: "period", label: "Periods Ago", defaultValue: "1" },
      { name: "dataSource", label: "Data Source", defaultValue: "c", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{ref({dataSource},{period}),{limit}}}",
    outputs: ["REF (single value)"],
  },
  {
    value: "stddev",
    label: "Standard Deviation",
    description: "Standard deviation over N periods",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "dataSource", label: "Data Source", defaultValue: "c", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{stddev({dataSource},{period}),{limit}}}",
    outputs: ["STDDEV (single value)"],
  },
  {
    value: "slope",
    label: "Slope",
    description: "Price slope/trend over N periods",
    params: [
      { name: "period", label: "Period", defaultValue: "20" },
      { name: "dataSource", label: "Data Source", defaultValue: "c", options: ["c", "o", "h", "l", "v"] },
    ],
    syntax: "{{slope({dataSource},{period}),{limit}}}",
    outputs: ["SLOPE (single value)"],
  },
]

export function MetricsEditor({ onInsert }: MetricsEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [metrics, setMetrics] = useState<MetricConfig[]>([])
  const [editingMetric, setEditingMetric] = useState<MetricConfig | null>(null)
  const [newMetricType, setNewMetricType] = useState<string>("")

  const generateMetricCode = (metric: MetricConfig): string => {
    const typeDef = INDICATOR_TYPES.find(t => t.value === metric.type)
    if (!typeDef) return ""

    let code = typeDef.syntax

    const allParams = { ...metric.params }
    
    Object.keys(allParams).forEach(key => {
      const value = allParams[key] || ""
      const regex = new RegExp(`\\{${key}\\}`, "g")
      code = code.replace(regex, value)
    })

    if (metric.limit) {
      const limitRegex = new RegExp(`\\{limit\\}`, "g")
      code = code.replace(limitRegex, metric.limit)
    } else {
      code = code.replace(/,{limit}/, "")
    }

    return code
  }

  const handleAddMetric = () => {
    if (!newMetricType) return

    const typeDef = INDICATOR_TYPES.find(t => t.value === newMetricType)
    if (!typeDef) return

    const defaultParams: Record<string, string> = {}
    typeDef.params.forEach(param => {
      defaultParams[param.name] = param.defaultValue
    })

    const newMetric: MetricConfig = {
      id: Date.now().toString(),
      name: `${typeDef.label} - ${Date.now()}`,
      type: newMetricType,
      params: defaultParams,
      limit: "60",
      dataSource: typeDef.params.find(p => p.name === "dataSource")?.defaultValue || "c",
    }

    setMetrics([...metrics, newMetric])
    setEditingMetric(newMetric)
    setNewMetricType("")
  }

  const handleUpdateMetric = (id: string, updates: Partial<MetricConfig>) => {
    setMetrics(metrics.map(m => m.id === id ? { ...m, ...updates } : m))
    if (editingMetric?.id === id) {
      setEditingMetric({ ...editingMetric, ...updates })
    }
  }

  const handleDeleteMetric = (id: string) => {
    setMetrics(metrics.filter(m => m.id !== id))
    if (editingMetric?.id === id) {
      setEditingMetric(null)
    }
  }

  const handleInsertMetric = (metric: MetricConfig) => {
    const code = generateMetricCode(metric)
    if (code) {
      onInsert(code)
    }
  }

  const handleSaveEdit = () => {
    if (!editingMetric) return
    
    handleUpdateMetric(editingMetric.id, editingMetric)
    setEditingMetric(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-mono text-sm">METRICS EDITOR</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="font-mono text-xs border-2 border-black h-7 px-2"
        >
          {isOpen ? <ChevronUp className="size-3 mr-1" /> : <ChevronDown className="size-3 mr-1" />}
          {isOpen ? "HIDE" : "SHOW"} EDITOR
        </Button>
      </div>

      {isOpen && (
        <Card className="border-2 border-black">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono">METRICS CONFIGURATION</CardTitle>
            <CardDescription className="text-xs font-mono">
              Create and manage custom technical indicators
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs">ADD NEW METRIC</Label>
              <div className="flex gap-2">
                <Select value={newMetricType} onValueChange={setNewMetricType}>
                  <SelectTrigger className="font-mono border-2 border-black text-xs">
                    <SelectValue placeholder="Select indicator type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDICATOR_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="font-mono text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={handleAddMetric}
                  disabled={!newMetricType}
                  className="font-mono text-xs border-2 border-black h-8 px-3"
                  size="sm"
                >
                  <Plus className="size-3 mr-1" />
                  ADD
                </Button>
              </div>
            </div>

            {metrics.length > 0 && (
              <div className="space-y-2">
                <Label className="font-mono text-xs">CONFIGURED METRICS ({metrics.length})</Label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {metrics.map((metric) => {
                    const typeDef = INDICATOR_TYPES.find(t => t.value === metric.type)
                    const isEditing = editingMetric?.id === metric.id
                    const code = generateMetricCode(metric)

                    return (
                      <Card key={metric.id} className="border-2 border-gray-300">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-mono text-xs font-bold">{typeDef?.label || metric.type}</div>
                              <div className="font-mono text-[10px] text-gray-600 mt-1">
                                {typeDef?.description || ""}
                              </div>
                              <div className="font-mono text-[10px] text-blue-600 mt-1 bg-blue-50 p-1 border border-blue-200">
                                {code}
                              </div>
                              {typeDef?.outputs && typeDef.outputs.length > 0 && (
                                <div className="font-mono text-[10px] text-green-700 mt-1 bg-green-50 p-1 border border-green-200">
                                  <span className="font-bold">Returns: </span>
                                  {typeDef.outputs.map((output, idx) => {
                                    // 替换参数占位符为实际值
                                    let displayOutput = output;
                                    if (output.includes('{period}')) {
                                      displayOutput = displayOutput.replace('{period}', metric.params.period || typeDef.params.find(p => p.name === 'period')?.defaultValue || '');
                                    }
                                    return (
                                      <span key={idx}>
                                        {idx > 0 && ', '}
                                        <code className="bg-green-100 px-1">{displayOutput}</code>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {!isEditing && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingMetric(metric)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Edit2 className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteMetric(metric.id)}
                                    className="h-6 w-6 p-0 text-red-600"
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleInsertMetric(metric)}
                                    className="font-mono text-[10px] border border-black h-6 px-2"
                                  >
                                    INSERT
                                  </Button>
                                </>
                              )}
                              {isEditing && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingMetric(null)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <X className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    className="font-mono text-[10px] border border-black h-6 px-2"
                                  >
                                    SAVE
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {isEditing && typeDef && (
                            <div className="space-y-2 pt-2 border-t border-gray-200">
                              {typeDef.params.map((param) => (
                                <div key={param.name} className="space-y-1">
                                  <Label className="font-mono text-[10px]">{param.label}</Label>
                                  {param.options ? (
                                    <Select
                                      value={editingMetric.params[param.name] || param.defaultValue}
                                      onValueChange={(value) => {
                                        setEditingMetric({
                                          ...editingMetric,
                                          params: {
                                            ...editingMetric.params,
                                            [param.name]: value,
                                          },
                                        })
                                      }}
                                    >
                                      <SelectTrigger className="font-mono border border-black text-xs h-7">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {param.options.map((opt) => (
                                          <SelectItem key={opt} value={opt} className="font-mono text-xs">
                                            {opt} ({opt === "c" ? "Close" : opt === "o" ? "Open" : opt === "h" ? "High" : opt === "l" ? "Low" : "Volume"})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      type="text"
                                      value={editingMetric.params[param.name] || param.defaultValue}
                                      onChange={(e) => {
                                        setEditingMetric({
                                          ...editingMetric,
                                          params: {
                                            ...editingMetric.params,
                                            [param.name]: e.target.value,
                                          },
                                        })
                                      }}
                                      className="font-mono border border-black text-xs h-7"
                                    />
                                  )}
                                </div>
                              ))}
                              <div className="space-y-1">
                                <Label className="font-mono text-[10px]">Limit (Number of values to return)</Label>
                                <Input
                                  type="text"
                                  value={editingMetric.limit || ""}
                                  onChange={(e) => {
                                    setEditingMetric({
                                      ...editingMetric,
                                      limit: e.target.value,
                                    })
                                  }}
                                  placeholder="60"
                                  className="font-mono border border-black text-xs h-7"
                                />
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {metrics.length === 0 && (
              <div className="text-center py-8 text-xs font-mono text-gray-500">
                No metrics configured. Add a metric above to get started.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoIcon, FileText, Zap, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { MetricsEditor } from "@/components/metrics-editor"

interface AdvancedPromptEditorProps {
  value: string
  onChange: (value: string) => void
}

// Template strings with ${{VARIABLE}} are intentionally used as literal strings
const PROMPT_TEMPLATES = {
  default: `# BTC Trading Analysis Request

## 1. Market Data Overview

### 1.1 Moving Average Price (Time-Descending)

**Data Format**: [0] = Newest | [9] = Oldest

\`\`\`
Index | Time Rank | Price
------|-----------|-------
[0]   | Latest    | $\${'{'}{'{'}}CURRENT_PRICE\${'}'}{'}'}
[1]   | -1 min    | $\${'{'}{'{'}}PRICE_1MIN_AGO\${'}'}{'}'}
[2]   | -2 min    | $\${'{'}{'{'}}PRICE_2MIN_AGO\${'}'}{'}'}
[3]   | -3 min    | $\${'{'}{'{'}}PRICE_3MIN_AGO\${'}'}{'}'}
[4]   | -4 min    | $\${'{'}{'{'}}PRICE_4MIN_AGO\${'}'}{'}'}
[5]   | -5 min    | $\${'{'}{'{'}}PRICE_5MIN_AGO\${'}'}{'}'}
[6]   | -6 min    | $\${'{'}{'{'}}PRICE_6MIN_AGO\${'}'}{'}'}
[7]   | -7 min    | $\${'{'}{'{'}}PRICE_7MIN_AGO\${'}'}{'}'}
[8]   | -8 min    | $\${'{'}{'{'}}PRICE_8MIN_AGO\${'}'}{'}'}
[9]   | Oldest    | $\${'{'}{'{'}}PRICE_9MIN_AGO\${'}'}{'}'}
\`\`\`

### 1.2 Current Candle Data

- **Timestamp**: \${'{'}{'{'}}TIMESTAMP\${'}'}{'}'}
- **OHLC Data**:
  - Open: $\${'{'}{'{'}}OPEN\${'}'}{'}'}
  - High: $\${'{'}{'{'}}HIGH\${'}'}{'}'}
  - Low: $\${'{'}{'{'}}LOW\${'}'}{'}'}
  - Close: $\${'{'}{'{'}}CLOSE\${'}'}{'}'}
- **Price Change**: \${'{'}{'{'}}PRICE_CHANGE\${'}'}{'}'}
- **Volume**: \${'{'}{'{'}}VOLUME\${'}'}{'}'} \${'{'}{'{'}}COIN\${'}'}{'}'}

---

## 2. Current Position Status

\${'{'}{'{'}}POSITION_INFO\${'}'}{'}'}

---

## 3. Analysis Requirements

### 3.1 Data Interpretation Guidelines

⚠️ **CRITICAL**: All technical indicator arrays follow **time-descending order**

- \`[0]\` = Most recent data point
- \`[n]\` = Oldest data point

### 3.2 Required Analysis Components

Please analyze the following aspects:

1. **Trend Identification**: Current market direction and momentum
2. **Position Evaluation**: Assessment of existing position
3. **Risk-Reward Analysis**: Potential outcomes and probabilities
4. **Action Recommendation**: Optimal next steps

---

## 4. Response Format

### 4.1 Required JSON Structure

\`\`\`json
{
  "trend": "bullish" | "bearish" | "neutral",
  "analysis": "<brief 2-3 sentence market summary>",
  "recommendation": "buy" | "sell" | "hold",
  "confidence": <0-100>,
  "reasoning": "<detailed multi-point explanation>"
}
\`\`\`

### 4.2 Response Guidelines

- **trend**: Classify overall market direction
- **analysis**: Concise market state summary (50-100 words)
- **recommendation**: Clear action directive considering existing position
- **confidence**: Numerical certainty level (0=no confidence, 100=absolute certainty)
- **reasoning**: Structured explanation including:
  - Technical indicator interpretation
  - Moving average trend analysis
  - Position risk assessment
  - Entry/exit timing rationale

---

## 5. Key Considerations

### Priority Factors

1. **Existing Position**: Account for current position in recommendations
2. **Price Action**: Analyze recent price movement relative to moving averages
3. **Risk Management**: Consider the position risk status
4. **Volume Analysis**: Evaluate trading volume significance
5. **Trend Confirmation**: Use multiple timeframes for validation

### Decision Framework

- If recommending **"hold"**: Explain wait criteria and invalidation levels
- If recommending **"buy"**: Consider if this means closing SHORT or opening LONG
- If recommending **"sell"**: Consider if this means closing LONG or opening SHORT`,

  minimal: `# Trading Analysis

## Market Data
{{MARKET_DATA}}

## Position
{{POSITION_INFO}}

## Analysis
Please analyze the market and provide a JSON response with:
- trend: "bullish" | "bearish" | "neutral"
- analysis: brief market summary
- recommendation: "buy" | "sell" | "hold"
- confidence: 0-100
- reasoning: detailed explanation`,

  custom: "",
}

const AVAILABLE_VARIABLES = [
  { name: "{{CURRENT_PRICE}}", description: "Current price" },
  { name: "{{TIMESTAMP}}", description: "Current candle timestamp (ISO format)" },
  { name: "{{OPEN}}", description: "Open price" },
  { name: "{{HIGH}}", description: "High price" },
  { name: "{{LOW}}", description: "Low price" },
  { name: "{{CLOSE}}", description: "Close price" },
  { name: "{{VOLUME}}", description: "Trading volume" },
  { name: "{{COIN}}", description: "Trading pair symbol (e.g., BTC)" },
  { name: "{{POSITION_INFO}}", description: "Position status information" },
  
  // Technical Indicators (format: {{ function(data, params), limit }})
  // Data sources: c/o/h/l/v = close/open/high/low/volume (lowercase also supported)
  { name: "{{ma(c,5),10}}", description: "MA: 5-period moving average on close, return 10 values" },
  { name: "{{ma(c,20),30}}", description: "MA: 20-period moving average on close, return 30 values" },
  { name: "{{ma(c,50),60}}", description: "MA: 50-period moving average on close, return 60 values" },
  { name: "{{ema(c,12),20}}", description: "EMA: 12-period exponential MA on close, return 20 values" },
  { name: "{{ema(c,26),30}}", description: "EMA: 26-period exponential MA on close, return 30 values" },
  { name: "{{sma(c,5),10}}", description: "SMA: 5-period smooth MA on close, return 10 values" },
  { name: "{{hhv(h,20),30}}", description: "HHV: 20-period highest high, return 30 values" },
  { name: "{{llv(l,20),30}}", description: "LLV: 20-period lowest low, return 30 values" },
  { name: "{{ref(c,1),10}}", description: "REF: Close price 1 period ago, return 10 values" },
  { name: "{{ref(c,5),10}}", description: "REF: Close price 5 periods ago, return 10 values" },
  { name: "{{stddev(c,20),30}}", description: "STDDEV: 20-period standard deviation on close, return 30 values" },
  { name: "{{cross(ma(c,5),ma(c,20)),10}}", description: "CROSS: Detect when MA5 crosses MA20 (1=up, -1=down), return 10 values" },
  { name: "{{ma(o,5),10}}", description: "MA: 5-period MA on open price, return 10 values" },
  { name: "{{ma(h,5),10}}", description: "MA: 5-period MA on high price, return 10 values" },
  { name: "{{ma(l,5),10}}", description: "MA: 5-period MA on low price, return 10 values" },
  { name: "{{ma(v,5),10}}", description: "MA: 5-period MA on volume, return 10 values" },
  { name: "{{slope(c,20),30}}", description: "SLOPE: 20-period price slope/trend, return 30 values" },
  { name: "{{barslast(c>ma(c,20)),10}}", description: "BARSLAST: Periods since condition was last true, return 10 values" },
  { name: "{{count(c>ma(c,20),20),10}}", description: "COUNT: Count times condition true in 20 periods, return 10 values" },
  
  // Preset Indicators - Output Variables (use after defining preset expressions)
]

export function AdvancedPromptEditor({ value, onChange }: AdvancedPromptEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>(value ? "custom" : "minimal")
  const [popoverOpen, setPopoverOpen] = useState(false)

  const handleTemplateSelect = (templateName: string) => {
    if (templateName === "custom") {
      setSelectedTemplate("custom")
      return
    }
    const template = PROMPT_TEMPLATES[templateName as keyof typeof PROMPT_TEMPLATES]
    if (template) {
      onChange(template)
      setSelectedTemplate(templateName)
    }
  }

  const handleInsertVariable = (variable: string) => {
    const textarea = document.getElementById("prompt-editor") as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + variable + value.substring(end)
      onChange(newValue)
      // Move cursor after inserted variable
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange(value + variable)
    }
    // Close popover after inserting variable
    setPopoverOpen(false)
  }

  const handleInsertMetric = (metric: string) => {
    handleInsertVariable(metric)
  }

  return (
    <div className="space-y-4">
          <Card className="border-2 border-black">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono">QUICK TEMPLATE SELECTION</CardTitle>
              <CardDescription className="text-xs font-mono">
            Choose a pre-built template or start with custom. The default template includes comprehensive market analysis structure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger className="font-mono border-2 border-black">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal" className="font-mono">
                    ⚡ Minimal (Simple Template)
                  </SelectItem>
                  <SelectItem value="custom" className="font-mono">
                    ✏️ Custom (Start from scratch)
                  </SelectItem>
                </SelectContent>
              </Select>

              {selectedTemplate !== "custom" && (
                <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded">
                  <div className="flex items-start gap-2">
                    <InfoIcon className="size-4 text-blue-600 mt-0.5" />
                    <div className="text-xs font-mono text-blue-800">
                      <div className="font-bold mb-1">Template Selected</div>
                      <div>
                    This is a minimal template with basic structure. You can customize it further.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

      <MetricsEditor onInsert={handleInsertMetric} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-editor" className="font-mono text-sm">
            TRADING STRATEGY PROMPT
          </Label>
          <div className="flex items-center gap-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs border-2 border-black h-7 px-2"
                >
                  <Zap className="size-3 mr-1" />
                  INSERT VARIABLE
                  <ChevronDown className="size-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="end">
                <Command className="border-0">
                  <CommandInput placeholder="Search variables..." className="font-mono text-xs" />
                  <CommandList className="max-h-[400px]">
                    <CommandEmpty className="font-mono text-xs py-4">No variables found.</CommandEmpty>
                    <CommandGroup heading="Basic Variables" className="font-mono">
                      {AVAILABLE_VARIABLES.filter(v => !v.name.includes("(")).map((variable) => (
                        <CommandItem
                          key={variable.name}
                          onSelect={() => {
                            handleInsertVariable(variable.name)
                          }}
                          className="font-mono text-xs cursor-pointer"
                        >
                          <Zap className="size-3 mr-2 text-blue-600" />
                          <div className="flex-1">
                            <div className="font-bold text-blue-600">{variable.name}</div>
                            <div className="text-gray-600 text-[10px]">{variable.description}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup heading="Technical Indicators" className="font-mono">
                      {AVAILABLE_VARIABLES.filter(v => 
                        v.name.includes("(")
                      ).map((variable) => (
                        <CommandItem
                          key={variable.name}
                          onSelect={() => {
                            handleInsertVariable(variable.name)
                          }}
                          className="font-mono text-xs cursor-pointer"
                        >
                          <Zap className="size-3 mr-2 text-blue-600" />
                          <div className="flex-1">
                            <div className="font-bold text-blue-600">{variable.name}</div>
                            <div className="text-gray-600 text-[10px]">{variable.description}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          <div className="text-xs font-mono text-gray-500">
            {value.length} characters
            </div>
          </div>
        </div>
        <Textarea
          id="prompt-editor"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono border-2 border-black min-h-[400px] text-xs"
          placeholder="Enter your trading strategy prompt... Use variables like {{MARKET_DATA}} and {{POSITION_INFO}} to insert dynamic content."
        />
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border-2 border-yellow-300 rounded">
          <InfoIcon className="size-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs font-mono text-yellow-800">
            <div className="font-bold mb-1">💡 How It Works</div>
            <div className="space-y-1">
              <div>
                • Select a template to get started quickly, or start with custom
              </div>
              <div>
                • Click "INSERT VARIABLE" button above to insert variables into your prompt (e.g., <code className="bg-yellow-100 px-1">{"{{MARKET_DATA}}"}</code>)
              </div>
              <div>
                • Backend will automatically replace variables with real-time data when making trading decisions
              </div>
              <div>
                • If you leave this empty, the system will use the default template structure
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


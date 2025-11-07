import * as hl from "@nktkas/hyperliquid"
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils"

export interface HyperliquidConfig {
  testnet?: boolean
  privateKey?: string
}

export interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Position {
  coin: string
  szi: string
  entryPx: string
  positionValue: string
  unrealizedPnl: string
  returnOnEquity: string
  leverage: string
}

export interface UserState {
  assetPositions: Array<{
    position: Position
    type: string
  }>
  marginSummary: {
    accountValue: string
    totalMarginUsed: string
    totalNtlPos: string
    totalRawUsd: string
  }
}

export class HyperliquidClient {
  private infoClient: hl.InfoClient
  private exchClient?: hl.ExchangeClient
  public readonly testnet: boolean
  public readonly apiUrl: string

  constructor(config: HyperliquidConfig = {}) {
    this.testnet = config.testnet === true // Explicitly check for true, default to false
    this.apiUrl = this.testnet ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz"

    console.log(`[${new Date().toISOString()}] 🔧 HyperliquidClient initialized:`)
    console.log(`  Network: ${this.testnet ? "TESTNET" : "MAINNET"}`)
    console.log(`  API URL: ${this.apiUrl}`)

    this.infoClient = new hl.InfoClient({
      transport: new hl.HttpTransport({
        isTestnet: this.testnet,
      }),
    })

    if (config.privateKey) {
      const transport = new hl.HttpTransport({
        isTestnet: this.testnet,
      })
      
      console.log(`  Creating ExchangeClient with testnet: ${this.testnet}`)
      
      this.exchClient = new hl.ExchangeClient({
        wallet: config.privateKey,
        transport: transport,
      })
      
      // Verify transport configuration
      console.log(`  Exchange client created for ${this.testnet ? "TESTNET" : "MAINNET"}`)
      console.log(`  Transport isTestnet: ${transport.isTestnet}`)
    }
  }

  async getAllMids(): Promise<Record<string, string>> {
    const response = await this.infoClient.allMids()
    return response
  }

  async getL2Book(coin: string): Promise<{ bids: Array<{ px: string; sz: string }>; asks: Array<{ px: string; sz: string }> } | null> {
    const response = await this.infoClient.l2Book({ coin })
    if (!response) {
      return null
    }
    // levels[0] = bids, levels[1] = asks
    return {
      bids: response.levels[0].map((level: any) => ({ px: level.px, sz: level.sz })),
      asks: response.levels[1].map((level: any) => ({ px: level.px, sz: level.sz })),
    }
  }

  async getUserState(address: string): Promise<UserState> {
    const response = await this.infoClient.clearinghouseState({ user: address })
    return response as unknown as UserState
  }

  async getOpenOrders(address: string) {
    return await this.infoClient.openOrders({ user: address })
  }

  async getUserFills(address: string) {
    return await this.infoClient.userFills({ user: address })
  }

  async getCandleSnapshot(coin: string, interval: string, startTime: number, endTime: number): Promise<CandleData[]> {
    const response = await this.infoClient.candleSnapshot({
      coin,
      interval: interval as any,
      startTime,
      endTime,
    })

    return response.map((candle: any) => ({
      time: candle.t,
      open: Number.parseFloat(candle.o),
      high: Number.parseFloat(candle.h),
      low: Number.parseFloat(candle.l),
      close: Number.parseFloat(candle.c),
      volume: Number.parseFloat(candle.v),
    }))
  }

  async getMeta() {
    return await this.infoClient.meta()
  }

  async getUserFunding(address: string, startTime: number, endTime?: number) {
    return await this.infoClient.userFunding({ user: address, startTime, endTime })
  }

  createWebSocket() {
    const wsUrl = this.testnet ? "wss://api.hyperliquid-testnet.xyz/ws" : "wss://api.hyperliquid.xyz/ws"
    console.log(`[${new Date().toISOString()}] 🔌 Creating WebSocket for ${this.testnet ? "TESTNET" : "MAINNET"}: ${wsUrl}`)
    return new WebSocket(wsUrl)
  }

  subscribeToTrades(ws: WebSocket, coin: string) {
    ws.send(
      JSON.stringify({
        method: "subscribe",
        subscription: {
          type: "trades",
          coin,
        },
      }),
    )
  }

  subscribeToCandles(ws: WebSocket, coin: string, interval: string) {
    ws.send(
      JSON.stringify({
        method: "subscribe",
        subscription: {
          type: "candle",
          coin,
          interval,
        },
      }),
    )
  }

  subscribeToUserEvents(ws: WebSocket, address: string) {
    ws.send(
      JSON.stringify({
        method: "subscribe",
        subscription: {
          type: "userEvents",
          user: address,
        },
      }),
    )
  }

  async placeOrder(params: {
    coin: string
    isBuy: boolean
    sz: number
    limitPx: number
    orderType: { limit?: { tif: string }; trigger?: any }
    reduceOnly?: boolean
    assetIndex?: number
    szDecimals?: number // Optional: lot size decimals for proper formatting
  }) {
    if (!this.exchClient) {
      throw new Error("Private key required for trading operations")
    }

    console.log(`[${new Date().toISOString()}] 📋 placeOrder called:`)
    console.log(`  Network: ${this.testnet ? "TESTNET" : "MAINNET"}`)
    console.log(`  API URL: ${this.apiUrl}`)
    console.log(`  Params:`, JSON.stringify(params, null, 2))

    // Get asset index and szDecimals from meta if not provided
    let assetIndex = params.assetIndex
    let szDecimals = params.szDecimals
    
    // Fetch meta once if needed
    if (assetIndex === undefined || szDecimals === undefined) {
      const meta = await this.getMeta()
      
      if (assetIndex === undefined) {
        assetIndex = meta.universe.findIndex((a: any) => a.name === params.coin)
        if (assetIndex === -1) {
          throw new Error(`Asset ${params.coin} not found`)
        }
      }
      
      // Get szDecimals from meta if not provided
      if (szDecimals === undefined) {
        const asset = meta.universe[assetIndex]
        if (asset && asset.szDecimals !== undefined) {
          szDecimals = typeof asset.szDecimals === "number" ? asset.szDecimals : parseFloat(String(asset.szDecimals))
        } else {
          szDecimals = 8 // Default to 8 decimals
        }
      }
    }
    
    // Use Hyperliquid's formatPrice and formatSize utilities
    // formatPrice: 5 significant figures max, decimals based on szDecimals and market type
    // formatSize: truncate to szDecimals
    const pxStr = formatPrice(String(params.limitPx), szDecimals, true) // true = perpetual
    const szStr = formatSize(String(params.sz), szDecimals)

    console.log(`[${new Date().toISOString()}] 🔢 Formatted values for order:`)
    console.log(`  Size: ${szStr} (from ${params.sz})`)
    console.log(`  Price: ${pxStr} (from ${params.limitPx})`)
    console.log(`  Asset Index: ${assetIndex}`)

    const orderPayload: any = {
      orders: [
        {
          a: assetIndex,
          b: params.isBuy,
          p: pxStr,
          s: szStr,
          r: params.reduceOnly || false,
          t: params.orderType,
        },
      ],
      grouping: "na",
    }

    console.log(`[${new Date().toISOString()}] 📤 Sending order to ${this.apiUrl}/exchange:`)
    console.log(`  Network: ${this.testnet ? "TESTNET" : "MAINNET"}`)
    console.log(`  API URL: ${this.apiUrl}`)
    console.log(`  Payload: ${JSON.stringify(orderPayload, null, 2)}`)
    
    // Verify transport configuration before sending
    if (this.exchClient) {
      const transport = (this.exchClient as any).transport
      if (transport) {
        console.log(`[${new Date().toISOString()}] 🔍 Transport isTestnet: ${transport.isTestnet}`)
        console.log(`[${new Date().toISOString()}] 🔍 Transport server.mainnet.api: ${transport.server.mainnet.api}`)
        console.log(`[${new Date().toISOString()}] 🔍 Transport server.testnet.api: ${transport.server.testnet.api}`)
        if (transport.isTestnet !== this.testnet) {
          console.error(`[${new Date().toISOString()}] ⚠️  WARNING: Transport isTestnet mismatch!`)
          console.error(`  Expected: ${this.testnet}`)
          console.error(`  Actual: ${transport.isTestnet}`)
        }
      }
    }

    let result
    try {
      result = await this.exchClient.order(orderPayload)
      
      console.log(`[${new Date().toISOString()}] 📥 Order response from ${this.testnet ? "TESTNET" : "MAINNET"}:`)
      console.log(`  Status: ${result.status}`)
      console.log(`  Response: ${JSON.stringify(result.response, null, 2)}`)
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Order error from ${this.testnet ? "TESTNET" : "MAINNET"}:`)
      console.error(`  Error: ${error?.message || String(error)}`)
      console.error(`  Error type: ${error?.constructor?.name || typeof error}`)
      if (error?.response) {
        console.error(`  Response status: ${error.response.status}`)
        console.error(`  Response statusText: ${error.response.statusText}`)
        console.error(`  Response URL: ${error.response.url}`)
      }
      if (error?.body) {
        console.error(`  Response body: ${error.body}`)
      }
      if (error?.stack) {
        console.error(`  Stack: ${error.stack}`)
      }
      throw error
    }

    return result
  }

  async cancelOrder(params: { coin: string; oid: number }) {
    if (!this.exchClient) {
      throw new Error("Private key required for trading operations")
    }

    return await this.exchClient.cancel({
      cancels: [
        {
          a: 0, // asset index
          o: params.oid,
        },
      ],
    })
  }

  async cancelAllOrders(coin?: string) {
    if (!this.exchClient) {
      throw new Error("Private key required for trading operations")
    }

    const wallet = this.exchClient.wallet as any
    const walletAddress = typeof wallet === "string" ? wallet : wallet.address || wallet.account?.address
    
    const openOrders = await this.getOpenOrders(walletAddress)
    const cancels = openOrders.map((order: any) => ({
      a: order.coin,
      o: order.oid,
    }))

    if (cancels.length === 0) return { status: "ok", response: { type: "cancel", data: { statuses: [] } } }

    return await this.exchClient.cancel({ cancels })
  }

  /**
   * Close a position for a specific coin
   * @param params - Parameters for closing position
   * @param params.coin - The coin symbol (e.g., "BTC", "ETH")
   * @param params.address - The wallet address to check position for
   * @param params.limitPx - Optional limit price. If not provided, will use current market price
   * @returns Order result
   */
  async closePosition(params: {
    coin: string
    address: string
    limitPx?: number
  }) {
    if (!this.exchClient) {
      throw new Error("Private key required for trading operations")
    }

    console.log(`[${new Date().toISOString()}] 🔒 closePosition called:`)
    console.log(`  Coin: ${params.coin}`)
    console.log(`  Address: ${params.address}`)

    // Get current position
    const userState = await this.getUserState(params.address)
    const positionData = userState.assetPositions.find(
      (ap) => ap.position.coin === params.coin
    )

    if (!positionData) {
      throw new Error(`No position found for ${params.coin}`)
    }

    const position = positionData.position
    const size = Number.parseFloat(position.szi)

    if (size === 0) {
      console.log(`[${new Date().toISOString()}] ⚠️  No position to close for ${params.coin}`)
      return {
        status: "ok",
        response: {
          type: "close",
          data: { message: "No position to close", position: position },
        },
      }
    }

    console.log(`[${new Date().toISOString()}] 📊 Current position:`)
    console.log(`  Coin: ${position.coin}`)
    console.log(`  Size: ${size}`)
    console.log(`  Entry Price: ${position.entryPx}`)
    console.log(`  Unrealized PnL: ${position.unrealizedPnl}`)

    // Determine order direction (opposite of current position)
    // If long (size > 0), we need to sell (isBuy = false)
    // If short (size < 0), we need to buy (isBuy = true)
    const isBuy = size < 0 // If short, buy to close; if long, sell to close
    const closeSize = Math.abs(size)

    console.log(`[${new Date().toISOString()}] 📋 Closing position:`)
    console.log(`  Direction: ${isBuy ? "BUY" : "SELL"}`)
    console.log(`  Size: ${closeSize}`)
    console.log(`  Reduce Only: true`)

    // Get current market price if not provided
    let limitPx = params.limitPx
    if (!limitPx) {
      const mids = await this.getAllMids()
      const midPrice = mids[params.coin]
      if (!midPrice) {
        throw new Error(`Cannot get market price for ${params.coin}`)
      }
      limitPx = Number.parseFloat(midPrice)
      console.log(`[${new Date().toISOString()}] 💰 Using current market price: ${limitPx}`)
    } else {
      console.log(`[${new Date().toISOString()}] 💰 Using provided limit price: ${limitPx}`)
    }

    // For market-like execution, use IoC (Immediate or Cancel) time-in-force
    // Set price slightly better than market to ensure immediate execution
    // For buy (closing short): use ask price or slightly higher
    // For sell (closing long): use bid price or slightly lower
    let executionPrice = limitPx
    if (!params.limitPx) {
      const l2Book = await this.getL2Book(params.coin)
      if (l2Book) {
        if (isBuy && l2Book.asks.length > 0) {
          // Closing short position: buy at ask price
          executionPrice = Number.parseFloat(l2Book.asks[0].px)
          console.log(`[${new Date().toISOString()}] 📈 Using ask price for buy: ${executionPrice}`)
        } else if (!isBuy && l2Book.bids.length > 0) {
          // Closing long position: sell at bid price
          executionPrice = Number.parseFloat(l2Book.bids[0].px)
          console.log(`[${new Date().toISOString()}] 📉 Using bid price for sell: ${executionPrice}`)
        }
      }
    }

    // Get asset index and szDecimals
    const meta = await this.getMeta()
    const assetIndex = meta.universe.findIndex((a: any) => a.name === params.coin)
    if (assetIndex === -1) {
      throw new Error(`Asset ${params.coin} not found`)
    }

    const asset = meta.universe[assetIndex]
    const szDecimals =
      asset && asset.szDecimals !== undefined
        ? typeof asset.szDecimals === "number"
          ? asset.szDecimals
          : parseFloat(String(asset.szDecimals))
        : 8

    // Format price and size
    const pxStr = formatPrice(String(executionPrice), szDecimals, true)
    const szStr = formatSize(String(closeSize), szDecimals)

    console.log(`[${new Date().toISOString()}] 🔢 Formatted values for close order:`)
    console.log(`  Size: ${szStr} (from ${closeSize})`)
    console.log(`  Price: ${pxStr} (from ${executionPrice})`)

    // Place reduce-only order to close position
    const orderPayload = {
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: pxStr,
          s: szStr,
          r: true, // reduceOnly = true
          t: { limit: { tif: "Ioc" as const } }, // Immediate or Cancel for quick execution
        },
      ],
      grouping: "na" as const,
    }

    console.log(`[${new Date().toISOString()}] 📤 Sending close order:`)
    console.log(`  Payload: ${JSON.stringify(orderPayload, null, 2)}`)

    let result
    try {
      result = await this.exchClient.order(orderPayload)

      console.log(`[${new Date().toISOString()}] 📥 Close order response:`)
      console.log(`  Status: ${result.status}`)
      console.log(`  Response: ${JSON.stringify(result.response, null, 2)}`)
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Close order error:`)
      console.error(`  Error: ${error?.message || String(error)}`)
      if (error?.response) {
        console.error(`  Response status: ${error.response.status}`)
        console.error(`  Response body: ${error.body}`)
      }
      throw error
    }

    return result
  }
}

export const hyperliquidClient = new HyperliquidClient()

/**
 * Create a HyperliquidClient from an API wallet
 * @param privateKey - Decrypted private key from API wallet
 * @param isTestnet - Whether this wallet is for testnet
 * @returns Configured HyperliquidClient instance
 */
export function createClientFromApiWallet(privateKey: string, isTestnet: boolean): HyperliquidClient {
  const network = isTestnet ? "TESTNET" : "MAINNET"
  const apiUrl = isTestnet 
    ? "https://api.hyperliquid-testnet.xyz" 
    : "https://api.hyperliquid.xyz"
  
  console.log(`[${new Date().toISOString()}] 🔧 Creating HyperliquidClient for ${network}`)
  console.log(`  API URL: ${apiUrl}`)
  console.log(`  Wallet address: ${privateKey ? "***" : "NOT PROVIDED"}`)
  
  const client = new HyperliquidClient({
    testnet: isTestnet,
    privateKey,
  })
  
  // Verify the client is using the correct network
  if (client.testnet !== isTestnet) {
    throw new Error(`Client network mismatch! Expected ${isTestnet ? "testnet" : "mainnet"}, got ${client.testnet ? "testnet" : "mainnet"}`)
  }
  
  return client
}

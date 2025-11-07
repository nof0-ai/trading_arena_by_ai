# Realtime Price Monitor Setup

使用 Supabase Realtime 监控 `price_candles` 表，当有新数据时自动触发 OpenRouter AI 分析。

## 功能

- **实时监听**：使用 Supabase Realtime 监听 `price_candles` 表的 INSERT 事件
- **AI 分析**：当检测到新的 BTC candle 数据时，自动调用 OpenRouter API（OpenAI 格式）
- **结果存储**：将 AI 分析结果存储到 `price_analyses` 表
- **自动交易**：当 AI 建议买入或卖出时，自动使用 bot 的 API wallet 在 Hyperliquid testnet 执行交易
- **交易记录**：所有交易记录存储到 `trades` 表，关联到 bot、candle 和 analysis

## 设置步骤

### 1. 运行数据库迁移

在 Supabase SQL Editor 中执行：

```sql
-- 创建 price_analyses 表
-- scripts/010_create_price_analyses_table.sql
```

### 2. 启用 Supabase Realtime

在 Supabase Dashboard：

1. 进入 **Database** → **Replication**
2. 找到 `price_candles` 表
3. 启用 **Realtime** 开关

或者使用 SQL：

```sql
-- 启用 Realtime 发布
ALTER PUBLICATION supabase_realtime ADD TABLE price_candles;
```

**重要**：如果 Realtime 未启用，连接会超时。确保：
- 表已添加到 `supabase_realtime` publication
- 检查 Replication 页面确认状态为 "Enabled"

### 3. 设置环境变量

在 `.env.local` 中添加：

```bash
# Supabase (必需)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# OpenRouter (必需)
OPENROUTER_API_KEY=your_openrouter_api_key

# OpenRouter 配置 (可选)
OPENROUTER_MODEL=openai/gpt-4o-mini  # 默认使用 gpt-4o-mini
OPENROUTER_HTTP_REFERER=https://your-domain.com  # 可选
OPENROUTER_X_TITLE=NOF0 Trading Bot  # 可选

# API Wallet 解密密码（自动交易必需）
# 这个密码用于在服务器端解密所有 API wallet
# 必须与创建 API wallet 时使用的密码相同
API_WALLET_SERVICE_PASSWORD=your_service_password

# 交易配置（可选）
MIN_TRADE_CONFIDENCE=70  # 最低信心度阈值 (0-100)，低于此值不交易
TRADE_SIZE_USD=10        # 每次交易金额（USD），默认 $10
```

### 4. 安装依赖

```bash
pnpm install
```

### 5. 启动监控服务

#### 方式 A: 直接运行（测试）

```bash
pnpm monitor:price
```

#### 方式 B: 使用 PM2（生产环境）

```bash
pm2 start scripts/realtime-price-monitor.ts --interpreter tsx --name price-monitor
pm2 logs price-monitor
```

#### 方式 C: 与 cron server 一起运行

可以同时运行两个服务：

```bash
# Terminal 1: Cron server (获取价格数据)
pm2 start ecosystem.config.js

# Terminal 2: Realtime monitor (监听并分析)
pm2 start scripts/realtime-price-monitor.ts --interpreter tsx --name price-monitor
```

## 工作流程

```
1. Cron Server (fetch-btc-candle.ts)
   ↓
   每分钟获取 BTC 价格
   ↓
   存储到 price_candles 表
   ↓
2. Supabase Realtime
   ↓
   检测到新 INSERT
   ↓
3. Realtime Monitor (realtime-price-monitor.ts)
   ↓
   调用 OpenRouter API
   ↓
   AI 分析价格趋势
   ↓
   存储到 price_analyses 表
```

## AI 分析格式

AI 会分析以下内容：

- **趋势判断**：bullish（看涨）、bearish（看跌）、neutral（中性）
- **分析文本**：简要分析当前价格走势
- **交易建议**：buy（买入）、sell（卖出）、hold（持有）
- **信心度**：0-100 的数值

## 查询分析结果

```sql
-- 查看最新的分析结果
SELECT 
  pa.*,
  pc.close as candle_price,
  TO_TIMESTAMP(pc.time / 1000) as candle_time
FROM price_analyses pa
JOIN price_candles pc ON pa.candle_id = pc.id
WHERE pa.coin = 'BTC'
ORDER BY pa.created_at DESC
LIMIT 10;

-- 查看趋势统计
SELECT 
  trend,
  recommendation,
  COUNT(*) as count,
  AVG(confidence) as avg_confidence
FROM price_analyses
WHERE coin = 'BTC'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY trend, recommendation
ORDER BY count DESC;
```

## OpenRouter API 配置

### 支持的模型

OpenRouter 支持多种模型，可以在环境变量中配置：

```bash
# 使用 OpenAI 模型
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_MODEL=openai/gpt-4o
OPENROUTER_MODEL=openai/gpt-3.5-turbo

# 使用其他模型
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_MODEL=google/gemini-pro
```

### API Key 获取

1. 访问 https://openrouter.ai/
2. 注册账号
3. 在 Dashboard 中创建 API Key
4. 将 API Key 添加到环境变量

## 故障排查

### 1. Realtime 连接超时 (TIMED_OUT)

**常见原因和解决方法**：

1. **Supabase Realtime 未启用**
   ```sql
   -- 检查 publication
   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   
   -- 如果没有 price_candles，添加它
   ALTER PUBLICATION supabase_realtime ADD TABLE price_candles;
   ```

2. **网络问题**
   - 检查防火墙是否阻止 WebSocket 连接
   - Supabase Realtime 使用 WebSocket (wss://)
   - 确保可以访问 `wss://your-project.supabase.co/realtime/v1`

3. **连接配置问题**
   - 代码已添加自动重连机制
   - 最大重连尝试：10 次
   - 使用指数退避策略（1s, 2s, 4s, 8s, 最多 30s）

4. **验证 Realtime 是否工作**
   ```sql
   -- 手动插入测试数据
   INSERT INTO price_candles (coin, interval, time, open, high, low, close, volume)
   VALUES ('BTC', '1m', EXTRACT(EPOCH FROM NOW())::bigint * 1000, 100, 101, 99, 100.5, 10);
   ```
   如果监控器没有检测到，说明 Realtime 未正确配置。

### 2. Realtime 未连接

检查：
- Supabase Realtime 是否已启用（最重要！）
- 网络连接是否正常
- 环境变量是否正确设置
- 查看日志中的错误信息

### 2. OpenRouter API 错误

检查：
- API Key 是否正确
- 账户是否有足够余额
- 模型名称是否正确

### 3. 没有分析结果

检查：
- 监控服务是否正在运行
- 数据库表是否正确创建
- Realtime 订阅是否成功

### 4. 查看日志

```bash
# PM2 日志
pm2 logs price-monitor

# 直接运行的输出会显示在控制台
```

## PM2 配置（可选）

创建 `ecosystem-monitor.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "price-monitor",
      script: "scripts/realtime-price-monitor.ts",
      interpreter: "tsx",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/monitor-error.log",
      out_file: "./logs/monitor-out.log",
    },
  ],
}
```

启动：

```bash
pm2 start ecosystem-monitor.config.js
```

## 性能考虑

- **API 调用频率**：每分钟一次（跟随 price_candles 插入频率）
- **OpenRouter 成本**：取决于使用的模型和调用次数
- **数据库存储**：每个 candle 会产生一条分析记录

## 扩展功能

可以在 `realtime-price-monitor.ts` 中添加：

- 价格波动提醒
- 交易信号生成
- 多币种监控
- 自定义分析提示词


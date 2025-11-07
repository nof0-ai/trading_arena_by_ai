# 自动交易设置指南

当 AI 分析建议买入或卖出时，系统会自动使用 bot 的 API wallet 在 Hyperliquid testnet 上执行交易。

## 工作流程

```
1. 价格数据插入 (price_candles)
   ↓
2. Realtime 触发监控
   ↓
3. AI 分析 (OpenRouter)
   ↓
4. 如果 recommendation = buy/sell 且 confidence >= 阈值
   ↓
5. 查找所有激活的 bot（配置了 API wallet 且包含该币种）
   ↓
6. 解密每个 bot 的 API wallet 私钥
   ↓
7. 在 Hyperliquid testnet 执行交易
   ↓
8. 存储交易记录 (trades 表)
```

## 设置步骤

### 1. 运行数据库迁移

在 Supabase SQL Editor 中执行：

```sql
-- 创建 trades 表
-- scripts/011_create_trades_table.sql
```

### 2. 设置环境变量

在 `.env.local` 中添加：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenRouter
OPENROUTER_API_KEY=your_openrouter_api_key

# API Wallet 解密密码（重要！）
# 这个密码用于在服务器端解密所有 API wallet
# 建议使用强密码，并妥善保管
API_WALLET_SERVICE_PASSWORD=your_service_password

# 交易配置（可选）
MIN_TRADE_CONFIDENCE=70  # 最低信心度阈值 (0-100)
TRADE_SIZE_USD=10        # 每次交易金额（USD）
```

**重要**：`API_WALLET_SERVICE_PASSWORD` 必须与创建 API wallet 时使用的密码相同。如果每个 wallet 使用不同密码，需要修改架构。

### 3. 配置 Bot

确保 bot 满足以下条件：

1. **状态为 active**
2. **配置了 API wallet** (`apiWalletId` 不为空)
3. **API wallet 已批准** (`is_approved = true`)
4. **交易对匹配**（如果配置了 `tradingPairs`，必须包含 BTC）

### 4. 启动监控服务

```bash
# 使用 PM2
pm2 start ecosystem.config.js

# 或单独启动
pnpm monitor:price
```

## 交易逻辑

### 触发条件

交易只在以下条件**全部满足**时执行：

1. ✅ AI recommendation = `buy` 或 `sell`
2. ✅ AI confidence >= `MIN_TRADE_CONFIDENCE`（默认 70%）
3. ✅ Bot status = `active`
4. ✅ Bot 配置了 API wallet
5. ✅ API wallet 已批准
6. ✅ 币种在 bot 的 `tradingPairs` 中（或 `tradingPairs` 为空）

### 交易参数

- **订单类型**: Market-like (使用 IOC - Immediate or Cancel)
- **交易金额**: `TRADE_SIZE_USD`（默认 $10）
- **网络**: 根据 API wallet 的 `is_testnet` 配置（true = testnet, false = mainnet）
- **杠杆**: 当前为 1x（可在代码中调整）

### 交易记录

所有交易都会记录到 `trades` 表，包括：

- Bot ID
- Candle ID 和 Analysis ID（关联到原始数据）
- 交易方向（BUY/SELL）
- 交易金额和价格
- 订单状态（SUBMITTED, FILLED, FAILED）
- Hyperliquid 订单 ID
- 错误信息（如有）

## 安全考虑

### API Wallet 密码管理

当前实现要求所有 API wallet 使用同一个服务密码（`API_WALLET_SERVICE_PASSWORD`）。这样做是为了服务器端自动交易的需要。

**生产环境建议**：

1. **使用密钥管理服务**（如 AWS KMS, HashiCorp Vault）
2. **为每个 wallet 使用不同的加密密钥**
3. **实现轮换机制**
4. **限制服务器访问权限**

### 当前限制

- ⚠️ 所有 API wallet 必须使用相同的服务密码
- ⚠️ 密码存储在环境变量中（需要确保安全）
- ⚠️ 交易在 testnet 上执行（生产环境需要配置 mainnet）

## 查询交易记录

```sql
-- 查看所有交易
SELECT 
  t.*,
  b.bot_name,
  pc.close as candle_price,
  pa.recommendation,
  pa.confidence
FROM trades t
JOIN encrypted_bots b ON t.bot_id = b.id
JOIN price_candles pc ON t.candle_id = pc.id
JOIN price_analyses pa ON t.analysis_id = pa.id
ORDER BY t.created_at DESC
LIMIT 20;

-- 查看失败的交易
SELECT * FROM trades 
WHERE status = 'FAILED'
ORDER BY created_at DESC;

-- 统计交易
SELECT 
  side,
  status,
  COUNT(*) as count,
  SUM(CAST(size AS NUMERIC)) as total_size
FROM trades
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY side, status;
```

## 故障排查

### 1. 交易未执行

检查：
- Bot 状态是否为 `active`
- Bot 是否配置了 API wallet
- API wallet 是否已批准
- AI confidence 是否达到阈值
- 查看监控日志：`pm2 logs price-monitor`

### 2. 解密失败

检查：
- `API_WALLET_SERVICE_PASSWORD` 是否正确
- API wallet 创建时使用的密码是否与 `API_WALLET_SERVICE_PASSWORD` 相同

### 3. 交易失败

检查：
- API wallet 余额是否充足
- Hyperliquid testnet 是否可访问
- 币种名称是否正确（如 "BTC"）
- 查看错误信息：`SELECT * FROM trades WHERE status = 'FAILED'`

## 测试建议

1. **先在 testnet 上测试**
   - 创建 testnet API wallet (`is_testnet = true`)
   - 确保 testnet 账户有测试资金
   - 观察交易执行情况

2. **监控交易日志**
   ```bash
   pm2 logs price-monitor --lines 100
   ```

3. **验证交易记录**
   ```sql
   SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;
   ```

4. **检查 Hyperliquid 订单**
   - 登录 Hyperliquid testnet
   - 查看订单历史和持仓

## 生产环境部署

当准备好使用 mainnet 时：

1. **修改环境变量**
   - 确保 API wallet 的 `is_testnet = false`
   - 使用 mainnet API wallet

2. **降低交易金额**
   - 设置较小的 `TRADE_SIZE_USD` 进行测试
   - 逐步增加金额

3. **增加监控**
   - 设置告警通知
   - 定期检查交易记录
   - 监控账户余额






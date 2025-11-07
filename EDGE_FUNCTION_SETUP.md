# Supabase Edge Functions + Vault 设置指南

## 概述

本系统使用 Supabase Edge Functions 来处理 bot 分析和交易，敏感信息（API wallet password、私钥）存储在 Supabase Vault 中。

## 架构

```
PostgreSQL NOTIFY (新 candle)
  ↓
price-monitor-pg-notify.ts
  ↓
调用 Edge Function (process-bot-trade)
  ↓
Edge Function:
  - 从 Vault 读取 bot secrets
  - 使用 bot 的 prompt 分析
  - 执行交易
```

## 设置步骤

### 1. 运行数据库迁移

在 Supabase SQL Editor 中运行：

```sql
-- 设置 Supabase Vault（使用内置 pgsodium）
scripts/016_setup_supabase_vault.sql
```

这会：
- 启用 pgsodium 扩展
- 创建 Vault 函数来存储和检索 bot secrets
- 设置必要的权限

### 2. 部署 Edge Function

```bash
# 安装 Supabase CLI (如果还没有)
npm install -g supabase

# 登录 Supabase
supabase login

# 链接到你的项目
supabase link --project-ref your-project-ref

# 部署 Edge Function
supabase functions deploy process-bot-trade

# 部署性能快照 Edge Function
supabase functions deploy compute-bot-performance
```

### 3. 设置环境变量

在 Supabase Dashboard → Edge Functions → Settings 中设置：

- `SUPABASE_URL`: 你的 Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key
- `OPENROUTER_API_KEY`: OpenRouter API key
- `OPENROUTER_MODEL`: 默认模型 (可选)
- `MIN_TRADE_CONFIDENCE`: 最小交易信心阈值 (默认: 70)
- `PERFORMANCE_SNAPSHOT_SCHEDULE`: 可选，若需要在函数内读取计划频率

### 4. 更新 bot 存储

现在 bot 配置不再包含敏感信息，敏感信息直接存储在 Supabase Vault 中：

```typescript
import { saveBotConfig } from "@/lib/bot-storage"

// 保存 bot 配置
// Vault 会自动加密，不需要密码
const result = await saveBotConfig(
  userAddress,
  botConfig, // 不包含 password/privateKey
  {
    apiWalletPassword: "your-password", // 直接存储在 Supabase Vault
    privateKey: "your-private-key" // 可选，存储在 Vault
  }
)
```

### 5. 使用 Edge Functions

在 `price-monitor-pg-notify.ts` 中，可以调用 Edge Functions：

```typescript
import { callProcessBotTrade } from "@/lib/edge-function-client"

// 调用 Edge Function
const result = await callProcessBotTrade(candleId, botId)
```

## 安全特性

1. **Supabase Vault**: 使用 Supabase 内置 Vault（基于 pgsodium）自动加密存储
2. **自动加密**: Vault 使用 pgsodium 自动处理加密/解密，无需手动管理密钥
3. **Edge Functions**: 在服务器端运行，使用 service role 自动解密 Vault secrets
4. **访问控制**: 通过函数权限控制，只有 service role 可以访问 secrets

## 迁移现有 Bots

如果你的 bots 已经存储了敏感信息在配置中，需要迁移：

1. 从配置中提取敏感信息
2. 使用 `storeBotSecret` 存储到 Vault
3. 更新配置，移除敏感字段

## Supabase Vault 优势

使用 Supabase Vault 而不是自定义加密表的好处：

1. **自动加密**: pgsodium 自动处理加密/解密，无需手动管理密钥
2. **更安全**: 使用 PostgreSQL 级别的加密，密钥存储在数据库服务器端
3. **更简单**: 不需要传递密码，service role 自动有权限访问
4. **标准化**: 使用 Supabase 推荐的安全存储方式

## 性能快照计算任务

1. **运行数据库迁移**：执行 `scripts/036_create_bot_performance_snapshots.sql`，或者运行完整的 `scripts/000_final_schema.sql` 以获取最新 schema。
2. **部署函数**：使用上面命令部署 `compute-bot-performance` Edge Function。
3. **配置 Supabase Cron**：在 Supabase Dashboard → Database → Cron Schedules 中新增任务，例如：

   ```cron
   # 每 5 分钟执行一次性能快照计算
   */5 * * * *  edge_function  compute-bot-performance
   ```

   如需针对单个 bot 手动运行，可调用：

   ```bash
   supabase functions invoke compute-bot-performance --query-string "botId=your-bot-id"
   ```

4. **监控**：在 Supabase Dashboard → Edge Functions → Logs 检查执行输出，确保失败会立即显示堆栈信息。

## 注意事项

- Vault secrets 只能通过 service role 或具有权限的函数访问
- Edge Functions 使用 service role key，可以自动解密 Vault 中的 secrets
- 不需要在环境变量中存储解密密码，Vault 自动处理


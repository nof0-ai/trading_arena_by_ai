# PostgreSQL Webhook Trigger Setup

这个文档说明如何设置 PostgreSQL 直接触发 webhook 来调用 Supabase Edge Function，替代外部的 `price-monitor-pg-notify.ts` 监控脚本。

## 工作原理

1. **PostgreSQL Trigger**: 当 `price_candles` 表有新数据插入时，自动触发
2. **查询活跃 Bots**: Trigger 函数查询所有交易该币种的活跃 bots
3. **调用 Edge Function**: 使用 `pg_net` 扩展为每个 bot 发送 HTTP 请求到 Edge Function
4. **异步处理**: 请求是异步发送的，不会阻塞 INSERT 操作

## 优势

- ✅ 无需外部监控脚本（不需要 `price-monitor-pg-notify.ts`）
- ✅ 更可靠：直接由数据库触发，不依赖外部进程
- ✅ 更简单：无需维护 Node.js 进程或 PM2
- ✅ 自动处理：数据库层面自动处理，无需手动启动

## 设置步骤

### 1. 启用 pg_net 扩展

在 Supabase SQL Editor 中运行：

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 2. 创建 Webhook Trigger

运行脚本：

```bash
# 在 Supabase SQL Editor 中运行
psql < scripts/028_add_price_candles_webhook_trigger.sql
```

或者直接在 Supabase Dashboard > SQL Editor 中粘贴脚本内容。

### 3. 配置 Supabase 凭证

运行配置脚本（需要先修改脚本中的值）：

```sql
-- 修改 scripts/029_setup_webhook_config.sql 中的值
-- 然后运行：
INSERT INTO app_config (key, value) 
VALUES 
  ('supabase_url', 'https://YOUR_PROJECT_REF.supabase.co'),
  ('supabase_service_role_key', 'YOUR_SERVICE_ROLE_KEY')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value, 
    updated_at = NOW();
```

**获取凭证：**
- `supabase_url`: Supabase Dashboard > Settings > API > Project URL
- `supabase_service_role_key`: Supabase Dashboard > Settings > API > service_role key (secret)

### 4. 验证配置

```sql
SELECT 
  key,
  CASE 
    WHEN key = 'supabase_service_role_key' THEN 
      '***' || SUBSTRING(value, LENGTH(value) - 3)
    ELSE 
      value 
  END AS value_preview,
  updated_at
FROM app_config
WHERE key IN ('supabase_url', 'supabase_service_role_key');
```

### 5. 测试 Trigger

插入一条测试数据：

```sql
-- 插入一条测试 candle（如果还没有）
INSERT INTO price_candles (coin, interval, time, open, high, low, close, volume)
VALUES ('BTC', '1h', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, '100000', '101000', '99000', '100500', '1000');

-- 检查日志（在 Supabase Dashboard > Database > Logs 中查看）
-- 应该能看到 NOTICE 消息，显示触发了多少个 bots 的 webhook
```

## 停止旧监控脚本

如果之前使用 `price-monitor-pg-notify.ts`，现在可以停止它：

```bash
# 如果使用 PM2
pm2 stop price-monitor
pm2 delete price-monitor

# 或者直接停止进程
pkill -f price-monitor-pg-notify
```

## 监控和调试

### 查看 Trigger 日志

在 Supabase Dashboard > Database > Logs 中查看 NOTICE 消息：

```
NOTICE: Triggered webhooks for 2 active bot(s) for candle ... (coin: BTC, time: ...)
```

### 检查 pg_net 请求状态

```sql
-- 查看最近的 HTTP 请求
SELECT 
  id,
  url,
  method,
  status_code,
  created_at
FROM net.http_request_queue
ORDER BY created_at DESC
LIMIT 10;

-- 查看请求详情
SELECT 
  id,
  url,
  method,
  headers,
  body,
  status_code,
  content,
  created_at,
  updated_at
FROM net.http_request_queue
WHERE url LIKE '%/process-bot-trade%'
ORDER BY created_at DESC
LIMIT 5;
```

### 检查 Trigger 是否启用

```sql
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  tgenabled AS enabled
FROM pg_trigger
WHERE tgname = 'price_candles_webhook_trigger';
```

如果 `enabled` 是 `'O'`，说明 trigger 已启用。

### 禁用 Trigger（如果需要）

```sql
-- 临时禁用
ALTER TABLE price_candles DISABLE TRIGGER price_candles_webhook_trigger;

-- 重新启用
ALTER TABLE price_candles ENABLE TRIGGER price_candles_webhook_trigger;

-- 完全删除
DROP TRIGGER IF EXISTS price_candles_webhook_trigger ON price_candles;
```

## 故障排除

### 问题：Webhook 没有触发

1. **检查配置是否存在**：
   ```sql
   SELECT * FROM app_config WHERE key IN ('supabase_url', 'supabase_service_role_key');
   ```

2. **检查 pg_net 扩展是否启用**：
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

3. **检查 Trigger 是否存在**：
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'price_candles_webhook_trigger';
   ```

4. **查看日志**：Supabase Dashboard > Database > Logs

### 问题：Edge Function 没有收到请求

1. **检查 pg_net 请求队列**：
   ```sql
   SELECT * FROM net.http_request_queue 
   WHERE url LIKE '%/process-bot-trade%' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. **检查请求状态**：如果 `status_code` 是 NULL，说明请求还在队列中
3. **检查 Edge Function 日志**：Supabase Dashboard > Edge Functions > process-bot-trade > Logs

### 问题：配置错误

如果看到警告信息：
```
WARNING: Supabase configuration not found...
```

请确保：
1. `app_config` 表存在
2. 配置已正确插入
3. Key 名称正确：`supabase_url` 和 `supabase_service_role_key`

## 注意事项

1. **异步处理**: `pg_net.http_post` 是异步的，不会等待响应
2. **错误处理**: 如果配置错误，trigger 会记录警告但不会阻止 INSERT
3. **性能**: 如果有大量活跃 bots，trigger 会为每个 bot 发送 HTTP 请求
4. **安全性**: Service Role Key 有完整权限，确保配置安全存储

## 迁移检查清单

- [ ] 启用 `pg_net` 扩展
- [ ] 运行 `028_add_price_candles_webhook_trigger.sql`
- [ ] 配置 `app_config` 表（运行 `029_setup_webhook_config.sql`）
- [ ] 验证配置
- [ ] 测试 trigger（插入测试数据）
- [ ] 停止旧的监控脚本（`price-monitor-pg-notify.ts`）
- [ ] 监控 Edge Function 日志确认正常工作


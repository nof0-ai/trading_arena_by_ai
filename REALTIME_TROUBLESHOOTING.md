# Supabase Realtime 超时问题排查指南

根据 [Supabase Realtime 官方文档](https://supabase.com/docs/guides/realtime)，以下是常见问题和解决方案。

## 常见超时原因

### 1. Realtime 未启用（最常见）

**检查方法**：
```sql
-- 检查 price_candles 是否在 realtime publication 中
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'price_candles';
```

**如果没有结果，启用它**：
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE price_candles;
```

**验证**：
```sql
-- 再次检查确认
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'price_candles';
```

### 2. 使用错误的 API Key

**服务器端 Node.js 脚本应该使用**：
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - 用于 Realtime 订阅（推荐）
- ❌ `SUPABASE_SERVICE_ROLE_KEY` - 不适合 Realtime（绕过 RLS，但 Realtime 需要用户上下文）

**注意**：如果使用 service role key，可能无法正确订阅 Realtime 事件。

### 3. Channel 配置问题

根据 Supabase 文档，`postgres_changes` 订阅的 channel 配置应该：

```typescript
// ✅ 正确：简单的 channel（postgres_changes 不需要 broadcast/presence）
const channel = supabase
  .channel('my-channel-name')
  .on('postgres_changes', { ... })
  .subscribe()

// ❌ 错误：不必要的配置（虽然不会出错，但不是必需的）
const channel = supabase
  .channel('my-channel-name', {
    config: {
      broadcast: { self: false },
      presence: { key: "" },
    },
  })
  .on('postgres_changes', { ... })
  .subscribe()
```

### 4. 网络/防火墙问题

**检查 WebSocket 连接**：
```bash
# 测试 WebSocket 端点是否可访问
# 将 YOUR_PROJECT_REF 替换为你的项目 ID
wscat -c wss://YOUR_PROJECT_REF.supabase.co/realtime/v1/websocket
```

**如果连接失败**：
- 检查防火墙是否阻止 WebSocket (wss://)
- 检查代理设置
- 检查网络连接

### 5. JWT 认证问题

Supabase Realtime 使用 JWT 进行 WebSocket 连接认证。

**检查**：
- JWT 是否有效
- JWT 是否过期
- API Key 是否正确

**调试**：
```javascript
// 在代码中添加 JWT 检查
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session)
```

### 6. 连接池限制

Supabase 对每个项目的连接数有限制：
- Free tier: 200 并发连接
- Pro tier: 更多连接

检查你的连接数是否超出限制。

## 验证 Realtime 是否工作

### 方法 1: 手动插入测试数据

```sql
-- 插入测试数据
INSERT INTO price_candles (coin, interval, time, open, high, low, close, volume)
VALUES ('BTC', '1m', EXTRACT(EPOCH FROM NOW())::bigint * 1000, 100, 101, 99, 100.5, 10);
```

如果监控器检测到，说明 Realtime 工作正常。

### 方法 2: 检查 Supabase Dashboard

1. 进入 Supabase Dashboard
2. Database → Replication
3. 确认 `price_candles` 的 Realtime 开关是 **ON**

### 方法 3: 查看网络请求

在浏览器开发者工具中：
1. Network 标签
2. 过滤 "WS" (WebSocket)
3. 查看是否有到 `/realtime/v1` 的连接
4. 检查连接状态和消息

## 代码修正

根据 Supabase 文档，我们的代码已做以下修正：

1. ✅ 使用 `@supabase/supabase-js` 而不是 `@supabase/ssr`（服务器端）
2. ✅ 简化 channel 配置（移除不必要的 broadcast/presence）
3. ✅ 添加详细的错误日志
4. ✅ 实现自动重连机制
5. ✅ 添加心跳保持连接

## 如果仍然超时

### 步骤 1: 确认 Realtime 已启用

```sql
-- 必须返回一行数据
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'price_candles';
```

### 步骤 2: 检查日志输出

运行监控器，查看日志：
```bash
pnpm monitor:price
```

重点关注：
- `📡 Channel status changed` - 状态变化
- `❌ Channel error details` - 错误详情
- `🔍 Expected Realtime WebSocket URL` - WebSocket URL
- `✅ Database connection successful` - 数据库连接测试

### 步骤 3: 测试 WebSocket 连接

```bash
# 安装 wscat
npm install -g wscat

# 测试连接（替换为你的项目 URL）
wscat -c wss://YOUR_PROJECT_REF.supabase.co/realtime/v1/websocket?apikey=YOUR_ANON_KEY
```

如果连接失败，说明网络或配置问题。

### 步骤 4: 联系 Supabase 支持

如果以上都正确但仍然超时：
1. 查看 Supabase Dashboard → Logs → Realtime
2. 检查是否有服务端错误
3. 联系 Supabase 支持并提供：
   - 项目 ID
   - 错误日志
   - 时间戳

## 参考资源

- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [Postgres Changes 订阅](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Realtime 故障排查](https://supabase.com/docs/guides/realtime/troubleshooting)






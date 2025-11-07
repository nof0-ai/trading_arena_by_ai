# Node.js + node-cron 部署指南

使用长期运行的 Node.js 进程配合 node-cron 来实现定时任务。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

这会安装 `node-cron` 和 `@types/node-cron`。

### 2. 设置环境变量

确保 `.env.local` 文件包含：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. 运行 Cron Server

#### 方式 A: 直接运行（开发/测试）

```bash
pnpm cron:server
```

或：

```bash
tsx scripts/cron-server.ts
```

#### 方式 B: 使用 PM2（推荐 - 生产环境）

```bash
# 全局安装 PM2
npm install -g pm2

# 启动 cron server
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs btc-cron-server

# 停止服务
pm2 stop btc-cron-server

# 重启服务
pm2 restart btc-cron-server

# 设置开机自启
pm2 startup
pm2 save
```

### 4. 验证运行

查看日志文件：

```bash
tail -f logs/cron-server.log
```

或使用 PM2：

```bash
pm2 logs btc-cron-server --lines 50
```

## 功能特性

- **每分钟自动获取 BTC 价格数据**
- **自动日志记录**：所有输出保存到 `logs/cron-server.log`
- **优雅关闭**：支持 SIGINT 和 SIGTERM 信号
- **错误处理**：捕获并记录所有错误
- **环境变量验证**：启动前检查必需的环境变量

## 日志位置

- 控制台输出：实时显示在终端
- 文件日志：`logs/cron-server.log`
- PM2 日志（如果使用 PM2）：
  - `logs/pm2-out.log` - 标准输出
  - `logs/pm2-error.log` - 错误输出

## Cron 调度配置

当前配置（在 `scripts/cron-server.ts` 中）：

```typescript
// 每分钟执行一次
cron.schedule("* * * * *", () => {
  runFetchBtcCandle()
})
```

### 修改调度频率

可以修改 cron 表达式：

```typescript
// 每 5 分钟
cron.schedule("*/5 * * * *", ...)

// 每小时
cron.schedule("0 * * * *", ...)

// 每天凌晨 2 点
cron.schedule("0 2 * * *", ...)
```

## PM2 管理命令

```bash
# 启动
pm2 start ecosystem.config.js

# 停止
pm2 stop btc-cron-server

# 重启
pm2 restart btc-cron-server

# 删除
pm2 delete btc-cron-server

# 查看状态
pm2 status

# 查看详细信息
pm2 describe btc-cron-server

# 监控
pm2 monit

# 查看日志（实时）
pm2 logs btc-cron-server

# 查看日志（最后 100 行）
pm2 logs btc-cron-server --lines 100

# 清空日志
pm2 flush

# 保存当前进程列表
pm2 save

# 开机自启
pm2 startup
pm2 save
```

## 系统服务配置（可选）

### Systemd Service（Linux）

创建 `/etc/systemd/system/btc-cron-server.service`:

```ini
[Unit]
Description=BTC Candle Cron Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/nof0
EnvironmentFile=/path/to/nof0/.env.local
ExecStart=/usr/local/bin/pnpm cron:server
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable btc-cron-server
sudo systemctl start btc-cron-server
sudo systemctl status btc-cron-server
```

## 故障排查

### 1. 进程没有运行

```bash
# 检查 PM2 状态
pm2 status

# 查看错误日志
pm2 logs btc-cron-server --err

# 重启服务
pm2 restart btc-cron-server
```

### 2. 没有数据插入

- 检查环境变量是否正确设置
- 查看日志文件：`logs/cron-server.log`
- 验证 Supabase 连接和 RLS 策略

### 3. 内存泄漏

```bash
# PM2 会自动重启（配置了 max_memory_restart）
# 查看内存使用
pm2 monit
```

### 4. 时区问题

默认使用 UTC 时区，可以在 `cron-server.ts` 中修改：

```typescript
cron.schedule("* * * * *", () => {
  runFetchBtcCandle()
}, {
  scheduled: true,
  timezone: "Asia/Shanghai", // 或你的时区
})
```

## 监控建议

1. **日志监控**：定期检查日志文件大小和内容
2. **PM2 监控**：使用 `pm2 monit` 实时监控
3. **数据库监控**：定期查询 `price_candles` 表确认数据正常插入
4. **告警设置**：可以集成 Sentry 或其他监控服务

## 性能优化

- PM2 已配置内存限制（500MB），超出会自动重启
- 日志文件会持续增长，建议定期清理或使用日志轮转
- 可以添加更多定时任务到同一个 cron server






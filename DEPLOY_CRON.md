# BTC Candle Cron Job - 自部署指南

本项目提供了多种方式来实现每分钟自动获取 BTC 价格数据，不依赖 Vercel。

## 方案 1: 系统 Cron（推荐 - Linux/macOS）

### 步骤 1: 安装依赖（如果使用 TypeScript）

```bash
# 使用 tsx 直接运行 TypeScript
pnpm add -D tsx

# 或使用 ts-node
pnpm add -D ts-node typescript @types/node
```

### 步骤 2: 设置环境变量

创建 `.env.local` 文件：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 步骤 3: 配置 Cron Job

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每分钟执行）
* * * * * cd /path/to/nof0 && /usr/bin/tsx scripts/fetch-btc-candle.ts >> /tmp/btc-candle.log 2>&1

# 或使用编译后的 JavaScript（需要先编译）
* * * * * cd /path/to/nof0 && node dist/scripts/fetch-btc-candle.js >> /tmp/btc-candle.log 2>&1

# 或使用 shell 脚本（需要先设置执行权限）
chmod +x scripts/fetch-btc-candle.sh
* * * * * /path/to/nof0/scripts/fetch-btc-candle.sh >> /tmp/btc-candle.log 2>&1
```

### 步骤 4: 验证

```bash
# 查看 cron 日志
tail -f /tmp/btc-candle.log

# 手动测试
tsx scripts/fetch-btc-candle.ts
```

## 方案 2: Docker + Cron

### 步骤 1: 构建 Docker 镜像

```bash
docker build -f docker/cron.dockerfile -t nof0-cron .
```

### 步骤 2: 运行容器

```bash
docker run -d \
  --name nof0-cron \
  --env-file .env.local \
  -v $(pwd)/logs:/var/log \
  nof0-cron
```

### 步骤 3: 查看日志

```bash
docker logs -f nof0-cron
```

## 方案 3: Node.js 进程 + node-cron

### 步骤 1: 安装 node-cron

```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

### 步骤 2: 创建长期运行的服务

创建 `scripts/cron-server.ts`:

```typescript
import cron from 'node-cron';
import { spawn } from 'child_process';
import * as path from 'path';

// 每分钟执行一次
cron.schedule('* * * * *', () => {
  console.log(`[${new Date().toISOString()}] Running BTC candle fetch...`);
  
  const scriptPath = path.join(__dirname, 'fetch-btc-candle.ts');
  const child = spawn('tsx', [scriptPath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  
  child.on('error', (error) => {
    console.error('Failed to start process:', error);
  });
});

console.log('Cron server started. Fetching BTC candle every minute...');
```

### 步骤 3: 运行服务

```bash
# 使用 PM2（推荐用于生产环境）
pnpm add -g pm2
pm2 start scripts/cron-server.ts --interpreter tsx --name btc-cron

# 或直接运行
tsx scripts/cron-server.ts
```

## 方案 4: 外部 Cron 服务

如果你的 API 端点已部署并可通过 HTTP 访问，可以使用外部 cron 服务：

### 可用的 Cron 服务

1. **cron-job.org** (免费)
   - 注册账号
   - 创建新的 cron job
   - URL: `https://your-domain.com/api/cron/fetch-btc-candle`
   - Schedule: `* * * * *` (每分钟)

2. **EasyCron** (免费/付费)
   - 类似 cron-job.org

3. **GitHub Actions** (如果代码在 GitHub)
   
   创建 `.github/workflows/fetch-btc-candle.yml`:
   
   ```yaml
   name: Fetch BTC Candle
   on:
     schedule:
       - cron: '* * * * *'  # Every minute
     workflow_dispatch:  # Allow manual trigger
   
   jobs:
     fetch:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: '20'
         - run: pnpm install
         - run: pnpm add -g tsx
         - run: tsx scripts/fetch-btc-candle.ts
           env:
             NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
             SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
   ```

## 方案 5: Systemd Service (Linux)

### 步骤 1: 创建服务文件

创建 `/etc/systemd/system/btc-candle-cron.service`:

```ini
[Unit]
Description=BTC Candle Fetch Cron
After=network.target

[Service]
Type=oneshot
User=your-user
WorkingDirectory=/path/to/nof0
EnvironmentFile=/path/to/nof0/.env.local
ExecStart=/usr/bin/tsx /path/to/nof0/scripts/fetch-btc-candle.ts
StandardOutput=journal
StandardError=journal
```

### 步骤 2: 创建定时器

创建 `/etc/systemd/system/btc-candle-cron.timer`:

```ini
[Unit]
Description=Run BTC Candle Fetch Every Minute
Requires=btc-candle-cron.service

[Timer]
OnCalendar=*:0/1  # Every minute
Persistent=true

[Install]
WantedBy=timers.target
```

### 步骤 3: 启用和启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable btc-candle-cron.timer
sudo systemctl start btc-candle-cron.timer

# 查看状态
sudo systemctl status btc-candle-cron.timer
```

## 验证和监控

### 检查数据是否存储

```sql
-- 在 Supabase SQL Editor 中运行
SELECT 
  time, 
  close, 
  volume,
  created_at
FROM price_candles 
WHERE coin = 'BTC' 
ORDER BY time DESC 
LIMIT 10;
```

### 查看最近的记录

```sql
SELECT 
  time,
  TO_TIMESTAMP(time / 1000) as datetime,
  close,
  volume
FROM price_candles 
WHERE coin = 'BTC' 
  AND interval = '1m'
ORDER BY time DESC 
LIMIT 5;
```

## 故障排查

1. **没有数据插入**
   - 检查环境变量是否正确设置
   - 查看脚本日志输出
   - 验证 Supabase 连接

2. **Cron 没有运行**
   - 检查 crontab: `crontab -l`
   - 查看系统日志: `journalctl -u btc-candle-cron.timer`
   - 验证脚本路径和权限

3. **权限错误**
   - 确保脚本有执行权限: `chmod +x scripts/fetch-btc-candle.sh`
   - 检查数据库 RLS 策略

## 推荐方案

- **开发环境**: 方案 3 (node-cron)
- **生产环境（有服务器）**: 方案 1 (系统 cron) 或 方案 5 (systemd)
- **生产环境（无服务器）**: 方案 4 (外部 cron 服务)
- **Docker 环境**: 方案 2






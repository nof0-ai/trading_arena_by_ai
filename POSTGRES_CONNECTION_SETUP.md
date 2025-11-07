# PostgreSQL 连接配置指南

## 问题说明

`ping db.peqwjmcjgewztcutomrm.supabase.co` 无法解析的原因：

1. **Supabase 数据库主机名不是这个格式**
   - Supabase 使用 AWS Pooler 架构
   - 实际主机名格式：`aws-0-[region].pooler.supabase.com`
   - 不能直接从项目 URL 推断数据库主机名

2. **需要从 Supabase 控制台获取准确的连接信息**

## 获取 Supabase 数据库连接字符串

### 步骤 1: 打开 Supabase Dashboard

1. 访问 https://supabase.com/dashboard
2. 登录并选择你的项目

### 步骤 2: 找到数据库连接信息

1. 进入 **Settings** (设置)
2. 点击 **Database**
3. 向下滚动找到 **Connection string** 部分

### 步骤 3: 选择合适的连接方式

Supabase 提供两种连接方式：

#### 选项 A: Connection Pooling (推荐用于应用)

- **Session mode**: 用于需要保持会话的功能（如 LISTEN/NOTIFY）
- **Transaction mode**: 用于事务性查询（不适用于 LISTEN/NOTIFY）
- 端口: `6543`
- 格式示例:
  ```
  postgresql://postgres.peqwjmcjgewztcutomrm:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
  ```

#### 选项 B: Direct Connection (用于 LISTEN/NOTIFY)

- 直接连接到数据库，不经过 Pooler
- 端口: `5432`
- 格式示例:
  ```
  postgresql://postgres.peqwjmcjgewztcutomrm:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
  ```

**注意**: LISTEN/NOTIFY 通常需要 Session mode 的 Pooler 连接或 Direct 连接。

### 步骤 4: 复制连接字符串

1. 在 Supabase Dashboard 中，点击连接字符串旁边的 **复制** 图标
2. 将 `[YOUR-PASSWORD]` 替换为你的数据库密码
   - 如果忘记密码，在 Settings > Database > Database password 中重置

## 配置环境变量

### 方法 1: 使用 DATABASE_URL (推荐)

在 `.env.local` 文件中添加：

```bash
DATABASE_URL="postgresql://postgres.peqwjmcjgewztcutomrm:your-password@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
```

### 方法 2: 使用单独的变量

```bash
POSTGRES_HOST="aws-0-us-west-1.pooler.supabase.com"
POSTGRES_PORT="6543"  # 或 5432 用于 Direct connection
POSTGRES_DB="postgres"
POSTGRES_USER="postgres.peqwjmcjgewztcutomrm"
POSTGRES_PASSWORD="your-password"
```

## 验证连接

### 方法 1: 使用 psql (如果已安装)

```bash
psql "$DATABASE_URL"
```

### 方法 2: 运行监听脚本

```bash
pnpm monitor:price:pg
```

如果连接成功，你会看到：
```
✅ Connected to PostgreSQL database
✅ Listening on channel 'price_candle_insert'
```

## 常见问题

### Q: 为什么 Session mode 的 Pooler 连接可以用于 LISTEN/NOTIFY？

A: Session mode 的 Pooler 会为每个客户端保持一个持久的数据库会话，因此支持 LISTEN/NOTIFY。Transaction mode 的 Pooler 在每次查询后关闭连接，不支持 LISTEN/NOTIFY。

### Q: 如何找到我的数据库密码？

A: 
1. 在 Supabase Dashboard 中，进入 Settings > Database
2. 查看或重置 Database password

### Q: 连接被拒绝怎么办？

A:
1. 检查密码是否正确
2. 确认使用的是 Session mode (端口 6543) 或 Direct connection (端口 5432)
3. 检查防火墙设置（Supabase 允许所有 IP 连接，通常不会有问题）
4. 确认项目没有被暂停

### Q: LISTEN/NOTIFY 不工作？

A:
1. 确认已运行 `scripts/013_add_price_candles_notify.sql` 创建触发器
2. 尝试使用 Direct connection (端口 5432) 而不是 Pooler
3. 检查触发器是否正确创建：
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'price_candles_notify_trigger';
   ```

## 安全提示

⚠️ **重要**: 
- 不要将数据库密码提交到 Git
- 确保 `.env.local` 在 `.gitignore` 中
- 使用 Supabase 的 Service Role Key 或 Session mode Pooler，而不是直接暴露数据库密码






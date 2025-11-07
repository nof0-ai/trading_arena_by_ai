# Stripe 支付集成设置指南

## 概述

本系统使用 Stripe 的嵌入式组件（Embedded Components）来构建订阅支付功能。所有 webhook 事件通过 Supabase Edge Functions 直接写入数据库。

## 架构设计

```
前端 (Next.js)
  ↓
API Routes (创建 Customer, Checkout Session)
  ↓
Stripe Checkout (嵌入式组件)
  ↓
Stripe Webhook
  ↓
Supabase Edge Function (stripe-webhook)
  ↓
数据库 (payments, subscriptions 表)
```

## 环境变量配置

### Next.js 环境变量

在 `.env.local` 或部署环境变量中设置：

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (从 Stripe Dashboard 获取)
NEXT_PUBLIC_STRIPE_PRICE_ID_BASIC=price_...
NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM=price_...
```

### Supabase Edge Function 环境变量

在 Supabase Dashboard → Project Settings → Edge Functions → Secrets 中设置：

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 设置步骤

### 1. 在 Stripe Dashboard 创建产品和价格

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 进入 **Products** → **Add product**
3. 创建两个产品：
   - **Basic Plan**: $5/月
   - **Premium Plan**: $15/月
4. 为每个产品创建 **Recurring** 价格，记录 Price ID（格式：`price_xxx`）

### 2. 配置 Webhook Endpoint

1. 在 Stripe Dashboard → **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 设置 Endpoint URL：
   ```
   https://your-project.supabase.co/functions/v1/stripe-webhook
   ```
4. 选择要监听的事件：
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. 复制 **Signing secret**（格式：`whsec_xxx`）到环境变量

### 3. 部署 Edge Function

```bash
# 安装 Supabase CLI (如果还没有)
npm install -g supabase

# 登录 Supabase
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 部署 Edge Function
supabase functions deploy stripe-webhook
```

### 4. 安装依赖

```bash
# 安装 Stripe SDK
npm install stripe @stripe/stripe-js

# 或使用 pnpm
pnpm add stripe @stripe/stripe-js
```

**注意**: 如果使用 npm/pnpm 安装失败，可能需要手动添加到 `package.json`:

```json
{
  "dependencies": {
    "stripe": "^17.0.0",
    "@stripe/stripe-js": "^4.0.0"
  }
}
```

然后运行 `npm install` 或 `pnpm install`。

## API Routes

### POST /api/create-customer

创建 Stripe Customer。

**请求体：**
```json
{
  "email": "user@example.com",
  "userAddress": "0x..."
}
```

**响应：**
```json
{
  "customerId": "cus_xxx"
}
```

### POST /api/create-checkout-session

创建 Checkout Session。

**请求体：**
```json
{
  "priceId": "price_xxx",
  "customerId": "cus_xxx",
  "userAddress": "0x..."
}
```

**响应：**
```json
{
  "clientSecret": "cs_test_xxx"
}
```

### POST /api/cancel-subscription

取消订阅。

**请求体：**
```json
{
  "subscriptionId": "sub_xxx"
}
```

**响应：**
```json
{
  "subscription": { ... }
}
```

## 前端组件使用

```tsx
import { StripeCheckout } from "@/components/stripe-checkout"

<StripeCheckout
  priceId="price_xxx"
  planName="Premium"
  onSuccess={() => {
    console.log("Subscription successful!")
  }}
/>
```

## Webhook 事件处理

Edge Function (`stripe-webhook`) 处理以下事件并直接写入数据库：

### checkout.session.completed
- 创建或更新 `subscriptions` 记录

### customer.subscription.created / updated
- 更新 `subscriptions` 记录的状态、周期等信息

### customer.subscription.deleted
- 将 `subscriptions` 状态更新为 `canceled`

### payment_intent.succeeded / payment_intent.payment_failed
- 创建或更新 `payments` 记录

### invoice.payment_succeeded / invoice.payment_failed
- 创建 `payments` 记录
- 更新 `subscriptions` 的计费周期

## 数据库表结构

### payments 表
- `payment_intent_id`: Stripe Payment Intent ID
- `stripe_customer_id`: Stripe Customer ID
- `user_id`: Supabase User ID
- `user_address`: 用户钱包地址
- `amount`: 金额（分）
- `currency`: 货币
- `status`: pending, succeeded, failed, canceled, refunded

### subscriptions 表
- `stripe_subscription_id`: Stripe Subscription ID
- `stripe_customer_id`: Stripe Customer ID
- `user_id`: Supabase User ID
- `user_address`: 用户钱包地址
- `plan_id`: 订阅计划 ID
- `status`: active, canceled, expired, past_due, unpaid, trialing
- `current_period_start`: 当前计费周期开始时间
- `current_period_end`: 当前计费周期结束时间

## 测试

### 使用 Stripe 测试卡

- **成功支付**: `4242 4242 4242 4242`
- **需要认证**: `4000 0025 0000 3155`
- **支付失败**: `4000 0000 0000 9995`

### 本地测试 Webhook

```bash
# 使用 Stripe CLI 转发 webhook
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook

# 触发测试事件
stripe trigger checkout.session.completed
```

## 安全注意事项

1. **Webhook 签名验证**: 当前实现简化了签名验证。生产环境应该使用 Stripe 官方 SDK 进行完整验证。
2. **RLS 策略**: 数据库表使用宽松的 RLS 策略，依赖 Service Role Key 在 webhook 中写入数据。
3. **环境变量**: 确保所有敏感密钥存储在环境变量中，不要提交到代码仓库。

## 故障排查

### Webhook 未收到事件
1. 检查 Stripe Dashboard 中的 Webhook 日志
2. 确认 Edge Function URL 正确
3. 检查环境变量是否正确设置

### 数据库写入失败
1. 检查 Supabase Service Role Key 是否正确
2. 查看 Edge Function 日志
3. 确认数据库表结构正确

### Checkout 无法初始化
1. 检查 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 是否正确设置
2. 确认 Price ID 有效
3. 检查浏览器控制台错误


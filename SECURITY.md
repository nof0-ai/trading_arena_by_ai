# 私钥安全存储方案

## 概述

本系统使用多层安全措施来保护用户的私钥，确保即使数据库被攻击，私钥也无法被解密。

## 安全架构

### 1. 客户端加密（Client-Side Encryption）

所有私钥在发送到服务器之前都在浏览器中加密：

- **加密算法**: AES-GCM 256位
- **密钥派生**: PBKDF2 with SHA-256
- **迭代次数**: 100,000 次（防止暴力破解）
- **随机盐**: 每个私钥使用唯一的16字节随机盐
- **初始化向量**: 每次加密使用唯一的12字节随机IV

### 2. 数据库存储

加密后的数据存储在 Supabase PostgreSQL 数据库中：

\`\`\`sql
encrypted_keys 表结构:
- id: UUID (主键)
- user_id: UUID (关联到 auth.users)
- key_name: TEXT (密钥名称)
- encrypted_private_key: TEXT (加密后的私钥，十六进制)
- salt: TEXT (用于密钥派生的盐，十六进制)
- iv: TEXT (加密使用的初始化向量，十六进制)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
\`\`\`

### 3. 行级安全策略（Row Level Security）

使用 Supabase RLS 确保用户只能访问自己的密钥：

\`\`\`sql
-- 用户只能查看自己的密钥
CREATE POLICY "Users can view their own keys"
  ON encrypted_keys FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能插入自己的密钥
CREATE POLICY "Users can insert their own keys"
  ON encrypted_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的密钥
CREATE POLICY "Users can update their own keys"
  ON encrypted_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- 用户只能删除自己的密钥
CREATE POLICY "Users can delete their own keys"
  ON encrypted_keys FOR DELETE
  USING (auth.uid() = user_id);
\`\`\`

## 安全流程

### 存储私钥流程

1. 用户输入私钥和加密密码
2. 系统验证私钥格式（64位十六进制）
3. 生成随机盐（16字节）和IV（12字节）
4. 使用 PBKDF2 从密码派生加密密钥（100,000次迭代）
5. 使用 AES-GCM 加密私钥
6. 将加密数据、盐和IV存储到数据库
7. **原始私钥和密码永不离开浏览器**

### 解密私钥流程

1. 用户输入解密密码
2. 从数据库获取加密数据、盐和IV
3. 使用相同的 PBKDF2 参数从密码派生密钥
4. 使用 AES-GCM 解密私钥
5. 在浏览器内存中临时显示私钥
6. **解密过程完全在客户端进行**

## 安全特性

### ✅ 零知识架构
- 服务器永远看不到明文私钥
- 服务器永远看不到加密密码
- 即使数据库泄露，攻击者也无法解密私钥

### ✅ 强加密标准
- AES-GCM 256位：军事级加密
- PBKDF2 100,000次迭代：防止暴力破解
- 随机盐和IV：防止彩虹表攻击

### ✅ 访问控制
- Supabase 身份验证：只有登录用户可访问
- RLS 策略：用户只能访问自己的数据
- 会话管理：自动过期和刷新

### ✅ 最佳实践
- 密码强度要求：最少8个字符
- 私钥格式验证：确保是有效的以太坊私钥
- 安全的密钥派生：使用标准的 Web Crypto API

## 使用建议

### 密码要求
- 至少8个字符（建议12+）
- 包含大小写字母、数字和特殊字符
- 不要使用常见密码
- 不要重复使用其他账户的密码

### 最佳实践
1. **使用强密码**：密码是唯一的保护层
2. **安全存储密码**：使用密码管理器
3. **定期备份**：导出加密密钥到安全位置
4. **限制访问**：不要在公共设备上解密私钥
5. **监控活动**：定期检查交易历史

## 技术栈

- **前端加密**: Web Crypto API
- **数据库**: Supabase PostgreSQL
- **认证**: Supabase Auth
- **安全策略**: Row Level Security (RLS)
- **框架**: Next.js 16 + React 19

## 风险提示

⚠️ **重要提醒**：

1. 如果忘记加密密码，私钥将**永久无法恢复**
2. 请务必安全保管加密密码
3. 建议使用密码管理器存储密码
4. 定期备份加密密钥到离线存储

## 合规性

本方案符合以下安全标准：
- OWASP 加密存储指南
- NIST 密钥管理最佳实践
- GDPR 数据保护要求

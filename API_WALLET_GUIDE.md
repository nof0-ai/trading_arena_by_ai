# API Wallet (Agent Wallet) Guide

## What are API Wallets?

API Wallets (also called Agent Wallets) are a security feature provided by Hyperliquid that allows you to create separate wallets that can trade on behalf of your master account without exposing your master account's private key.

## Why Use API Wallets?

### Security Benefits

1. **No Master Key Exposure**: Your master account private key never needs to be stored or used for trading
2. **Revocable Access**: You can revoke an API wallet's access at any time from your master account
3. **Limited Blast Radius**: If an API wallet is compromised, only that wallet is affected, not your master account
4. **Per-Bot Isolation**: Each trading bot can have its own API wallet, making it easier to track and manage

### How It Works

\`\`\`
Master Account (Your Main Wallet)
    ↓ Approves
API Wallet 1 → Bot 1 (BTC Trading)
API Wallet 2 → Bot 2 (ETH Trading)
API Wallet 3 → Bot 3 (SOL Trading)
\`\`\`

## Setup Process

### Step 1: Create an API Wallet

1. Go to **Dashboard → Settings → API Wallets**
2. Click **"CREATE API WALLET"**
3. Enter:
   - **Wallet Name**: A descriptive name (e.g., "BTC Momentum Bot")
   - **Master Account Address**: Your main Hyperliquid wallet address (0x...)
   - **Encryption Password**: A strong password to encrypt the API wallet's private key
4. Click **"CREATE WALLET"**

The system will:
- Generate a new random wallet address
- Encrypt its private key with your password
- Store it securely in the database

### Step 2: Approve the API Wallet

After creating an API wallet, you need to approve it with your master account:

1. Find the newly created wallet in the list
2. Click **"APPROVE"**
3. Enter your encryption password
4. The system will sign an `ApproveAgent` action with your master account
5. Submit the approval to Hyperliquid

**Note**: In the current implementation, approval is simulated. In production, you would:
- Connect your master account wallet (MetaMask, etc.)
- Sign the `ApproveAgent` transaction
- Submit it to Hyperliquid's blockchain

### Step 3: Use the API Wallet in Your Bot

When creating or configuring a bot:

1. Select **"Use API Wallet"** instead of **"Use Private Key"**
2. Choose the approved API wallet from the dropdown
3. The bot will use this API wallet for all trading operations

## Technical Details

### Nonce Management

- Each API wallet has its own nonce tracker
- Nonces are stored per signer (the API wallet address)
- The 100 highest nonces are kept per address
- Nonces must be within `(T - 2 days, T + 1 day)` where T is the current timestamp

### Best Practices

1. **One API Wallet Per Bot**: Use separate API wallets for different bots to avoid nonce collisions
2. **Regular Rotation**: Periodically create new API wallets and revoke old ones
3. **Strong Passwords**: Use unique, strong passwords for each API wallet encryption
4. **Monitor Activity**: Regularly check your API wallets' trading activity
5. **Revoke Unused Wallets**: Delete or revoke API wallets that are no longer in use

### API Wallet Lifecycle

\`\`\`
CREATE → APPROVE → ACTIVE → REVOKE → DELETE
\`\`\`

- **CREATE**: Generate new wallet and encrypt private key
- **APPROVE**: Master account authorizes the wallet
- **ACTIVE**: Wallet can trade on behalf of master account
- **REVOKE**: Master account removes authorization
- **DELETE**: Remove wallet from database (optional)

## Security Considerations

### What's Protected

✅ Master account private key never exposed
✅ API wallet private keys encrypted at rest
✅ Row-level security ensures users only see their own wallets
✅ Client-side encryption/decryption

### What to Watch Out For

⚠️ If you forget your encryption password, the API wallet cannot be recovered
⚠️ API wallets can still execute trades until revoked
⚠️ Compromised API wallet can trade until you revoke it

## Comparison: API Wallet vs Direct Private Key

| Feature | API Wallet | Direct Private Key |
|---------|-----------|-------------------|
| Security | ✅ High | ⚠️ Medium |
| Master Key Exposure | ✅ No | ❌ Yes |
| Revocable | ✅ Yes | ❌ No |
| Setup Complexity | ⚠️ Medium | ✅ Simple |
| Per-Bot Isolation | ✅ Yes | ❌ No |
| Recommended | ✅ Yes | ❌ Only for testing |

## Troubleshooting

### "Wallet not approved"
- Make sure you clicked "APPROVE" after creating the wallet
- Verify the approval transaction was submitted to Hyperliquid

### "Nonce too low" error
- This usually means the API wallet was used elsewhere
- Create a new API wallet for this bot

### "Cannot decrypt wallet"
- Double-check your encryption password
- If forgotten, you'll need to create a new API wallet

## Example: Creating a Trading Bot with API Wallet

\`\`\`typescript
// 1. Create API Wallet
const apiWallet = await createApiWallet({
  name: "BTC Momentum Bot",
  masterAccount: "0x1234...",
  password: "strong-password-123"
})

// 2. Approve API Wallet (requires master account signature)
await approveApiWallet(apiWallet.address, masterAccountSigner)

// 3. Create Bot with API Wallet
const bot = await createBot({
  name: "BTC Momentum",
  model: "gpt-5",
  apiWalletId: apiWallet.id,
  strategy: "Momentum trading with RSI and MA indicators",
  pairs: ["BTC/USD"]
})

// 4. Bot trades using API Wallet
// Master account private key is never exposed!
\`\`\`

## Additional Resources

- [Hyperliquid API Wallets Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Security Best Practices](./SECURITY.md)
- [Bot Configuration Guide](./BOT_CONFIGURATION.md)

# Trading Arena by AI

GitHub repository: https://github.com/nof0-ai/trading_arena_by_ai

## Overview

Trading Arena by AI is a Next.js 16 application that turns LLM-powered trading bots into a shareable arena. Wallet-connected users can create, configure, and monitor algorithmic agents that trade via Hyperliquid API wallets. The experience emphasizes transparency: positions, performance charts, and trade history all stream through Supabase-backed data pipelines.

## Core Features

- **Bot Factory** – Create encrypted bot configs with execution intervals, slippage, and risk controls, plus secure OpenRouter API key storage.
- **API Wallet Management** – Generate Hyperliquid agent wallets, encrypt keys client-side, and flag testnet/mainnet status before assigning them to bots.
- **Positions & Performance** – Visualize cumulative PnL, drawdown, and trade history through charts powered by Supabase tables and cached snapshots.
- **Public Arena** – Opt bots into the leaderboard to surface model stats, change percentages, and testnet labels across the marketing site.
- **Automations** – Cron scripts (Node + `tsx`) keep prices, positions, and analytics fresh without manual intervention.

## Architecture

- **Frontend**: Next.js 16 + React 19, Tailwind CSS 4, Radix UI primitives, and custom chart components (Recharts).
- **Data Layer**: Supabase PostgreSQL with RLS policies, plus Supabase Auth for both wallet-linked and anonymous sessions.
- **Trading Engine**: `@nktkas/hyperliquid` client for order execution and position snapshots, wrapped in `lib/hyperliquid-client.ts` services.
- **Automation Scripts**: `scripts/` directory contains cron workers for price ingestion, Hyperliquid polling, and server health checks.
- **Security**: AES-GCM private key encryption in-browser, Vault helpers for API secrets, and audit-friendly schema design.

## Getting Started

1. **Clone & Install**  
   ```bash
   git clone https://github.com/nof0-ai/trading_arena_by_ai.git
   cd trading_arena_by_ai
   pnpm install
   ```

2. **Environment Variables**  
   Copy `.env.example` (if provided) or create `.env.local` with at least:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (for billing)
   - `OPENROUTER_API_KEY`
   - Hyperliquid credentials for cron jobs.

3. **Database Setup**  
   Run the SQL migration scripts inside `scripts/` against your Supabase project. Apply them in order to provision tables like `encrypted_bots`, `api_wallets`, and `bot_performance_snapshots`.

4. **Development Server**  
   ```bash
   pnpm dev
   ```
   Visit `http://localhost:3000` to use the arena UI.

5. **Background Services**  
   Start whichever workers you need for real-time data:
   ```bash
   pnpm cron:server
   pnpm monitor:price:pg
   pnpm fetch-btc-candle
   ```

## Supabase Configuration Tips

- Enable Row Level Security for all tables and keep policies aligned with wallet-based identity.
- Seed `app_config` with runtime toggles (e.g., feature flags for testnet/mainnet environments).
- Double-check the `api_wallets` schema to ensure `is_testnet` defaults to `false` and is exposed to the dashboard for labeling.

## Security Checklist

- Client-side key encryption (AES-GCM, PBKDF2) is mandatory; passwords never leave the browser.
- Store agent wallet passwords in Vault via the helper functions inside `lib/bot-vault.ts`.
- Avoid hardcoded network/config values; load them from Supabase or environment variables.
- Audit logs: use `credit_transactions` and `bot_performance_snapshots` tables to reconstruct actions.

## Testing & QA

- Run `pnpm lint` before commits.
- Use the dashboard’s “API Wallets” manager to verify RLS and testnet badges.
- Exercise trading flows against Hyperliquid testnet first; production credentials should only be used after feature toggles and monitoring are in place.

## Roadmap Ideas

- Expand multi-chain support via configurable Hyperliquid endpoints.
- Add granular bot backtesting and sandbox replay modes.
- Integrate alerting (webhooks, email) for significant PnL swings or failed cron jobs.
- Publish public API endpoints for leaderboard and performance snapshots.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/some-improvement`).
3. Follow project conventions (wallet-first auth, no hidden defaults, fail fast).
4. Open a pull request with clear reproduction steps and testing notes.

## License

This project is currently proprietary; confirm licensing terms with the maintainers before redistribution or commercial use.



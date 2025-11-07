# BTC Price Candle Cron Job Setup

This project includes a cron job that fetches BTC price candle data from Hyperliquid API every minute.

## Setup Instructions

### 1. Run Database Migration

Execute the SQL migration script to create the `price_candles` table:

```bash
# Run this in your Supabase SQL editor or using psql
psql -h your-db-host -U postgres -d your-db-name -f scripts/008_create_price_candles_table.sql
```

Or manually execute the SQL from `scripts/008_create_price_candles_table.sql` in your Supabase dashboard.

### 2. Environment Variables

Add the following environment variables to your Vercel project (or `.env.local` for local testing):

```bash
# Supabase Configuration (already required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Required for cron job to write to database
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Set a secret for cron endpoint security
CRON_SECRET=your_random_secret_string
```

### 3. Vercel Cron Configuration

The `vercel.json` file is already configured with the cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-btc-candle",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This will automatically run every minute when deployed to Vercel.

### 4. Local Testing

To test the cron endpoint locally:

```bash
# Make a GET request to the endpoint
curl http://localhost:3000/api/cron/fetch-btc-candle

# Or with authentication (if CRON_SECRET is set)
curl -H "Authorization: Bearer your_cron_secret" http://localhost:3000/api/cron/fetch-btc-candle
```

## How It Works

1. **Cron Schedule**: Every minute, Vercel Cron calls `/api/cron/fetch-btc-candle`
2. **Data Fetching**: The endpoint fetches BTC 1-minute candle data from Hyperliquid API
3. **Storage**: The latest candle data is stored in the `price_candles` table in Supabase
4. **Deduplication**: Uses `UPSERT` with unique constraint on `(coin, interval, time)` to prevent duplicates

## Database Schema

The `price_candles` table stores:
- `coin`: Asset symbol (e.g., "BTC")
- `interval`: Candle interval (e.g., "1m")
- `time`: Timestamp in milliseconds
- `open`, `high`, `low`, `close`: OHLC prices
- `volume`: Trading volume
- `created_at`: When the record was inserted

## Querying Stored Data

Example queries:

```sql
-- Get latest BTC price
SELECT close FROM price_candles 
WHERE coin = 'BTC' AND interval = '1m' 
ORDER BY time DESC 
LIMIT 1;

-- Get last 100 candles
SELECT * FROM price_candles 
WHERE coin = 'BTC' AND interval = '1m' 
ORDER BY time DESC 
LIMIT 100;

-- Get candles for a specific time range
SELECT * FROM price_candles 
WHERE coin = 'BTC' 
  AND interval = '1m' 
  AND time >= 1700000000000 
  AND time <= 1700100000000
ORDER BY time ASC;
```

## Monitoring

- Check Vercel logs for cron execution: Vercel Dashboard → Your Project → Functions → Logs
- Monitor Supabase for data insertion: Supabase Dashboard → Table Editor → price_candles
- Verify cron is running: Check Vercel Dashboard → Settings → Cron Jobs

## Troubleshooting

1. **Cron not running**: Verify `vercel.json` is committed and deployed
2. **401 Unauthorized**: Set `CRON_SECRET` environment variable or remove auth check for testing
3. **Database errors**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is set and migration script is executed
4. **No data**: Check Hyperliquid API is accessible and BTC symbol is correct


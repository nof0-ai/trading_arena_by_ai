FROM node:20-alpine

# Install cron and required packages
RUN apk add --no-cache dcron bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm if needed
RUN npm install -g pnpm@10.18.3

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy project files
COPY . .

# Build the project (if needed)
RUN pnpm build || true

# Copy cron script
COPY scripts/fetch-btc-candle.sh /usr/local/bin/fetch-btc-candle.sh
RUN chmod +x /usr/local/bin/fetch-btc-candle.sh

# Create crontab file
RUN echo "* * * * * /usr/local/bin/fetch-btc-candle.sh >> /var/log/cron.log 2>&1" > /etc/cron.d/fetch-btc-candle

# Give execution rights to the cron job
RUN chmod 0644 /etc/cron.d/fetch-btc-candle

# Apply cron job
RUN crontab /etc/cron.d/fetch-btc-candle

# Create log file
RUN touch /var/log/cron.log

# Start cron in foreground
CMD ["sh", "-c", "crond -f -l 2"]






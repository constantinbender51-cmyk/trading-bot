# Automated Trading Bot

This bot fetches trading signals from a signal generation service and executes trades on Kraken Futures.

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Copy `.env` and configure your environment variables
4. Add your Kraken Futures API credentials to the `.env` file

## Environment Variables

- `KRAKEN_API_KEY`: Your Kraken Futures API key
- `KRAKEN_API_SECRET`: Your Kraken Futures API secret
- `SIGNAL_BOT_URL`: URL of the signal generation service
- `TRADING_SYMBOL`: Trading symbol (default: pf_xbtusd)
- `TRADE_SIZE`: Default trade size in contracts
- `MAX_POSITION_SIZE`: Maximum position size
- `DRY_RUN`: Set to true for testing without real trades
- `POLL_INTERVAL_MINUTES`: How often to check for signals

## Deployment on Railway

1. Connect your GitHub repository to Railway
2. Add environment variables in Railway dashboard
3. Deploy automatically

## Manual Testing

```bash
# Start the bot
npm start

# Test with dry run
DRY_RUN=true npm start

# Manual trigger
curl -X POST http://localhost:3000/execute

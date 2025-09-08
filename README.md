> ⚠️ **Clarification**  
> This repository – along with every other “bot” project in the `constantinbender51-cmyk` namespace – is **scrap / legacy code** and should **not** be treated as a working or profitable trading system.  
>  
> The **only** repos that still receive updates and are intended for forward-testing are:  
> - `constantinbender51-cmyk/sigtrabot`  
> - `constantinbender51-cmyk/DeepSeekGenerator-v.-1.4` (a.k.a. “DeepSignal v. 1.4”)  
>  
> Complete list of repos that remain **functionally maintained** (but still **unproven** in live, statistically-significant trading):  
> - `constantinbender51-cmyk/Kraken-futures-API`  
> - `constantinbender51-cmyk/sigtrabot`  
> - `constantinbender51-cmyk/binance-btc-data`  
> - `constantinbender51-cmyk/SigtraConfig`  
> - `constantinbender51-cmyk/Simple-bot-complex-behavior-project-`  
> - `constantinbender51-cmyk/DeepSeekGenerator-v.-1.4`  
>  
> > None of the above has demonstrated **statistically significant profitability** in out-of-sample, live trading; **DeepSignal v. 1.4** is merely **showing early promise** and remains experimental.
> > 
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

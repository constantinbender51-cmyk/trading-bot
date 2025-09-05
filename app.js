require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { KrakenFuturesApi } = require('./krakenApi');
const { TradingBot } = require('./tradingLogic');

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const config = {
    KRAKEN_API_KEY: process.env.KRAKEN_API_KEY,
    KRAKEN_API_SECRET: process.env.KRAKEN_API_SECRET,
    SIGNAL_BOT_URL: process.env.SIGNAL_BOT_URL,
    TRADING_SYMBOL: process.env.TRADING_SYMBOL || 'PF_XBTUSD', // Correct default symbol
    TRADE_SIZE: parseFloat(process.env.TRADE_SIZE) || 0.001,    // Smaller size for safety
    MAX_POSITION_SIZE: parseFloat(process.env.MAX_POSITION_SIZE) || 0.01,
    DRY_RUN: process.env.DRY_RUN !== 'false', // Default to true for safety
    POLL_INTERVAL_MINUTES: parseInt(process.env.POLL_INTERVAL_MINUTES) || 15,
    MIN_CONFIDENCE: parseFloat(process.env.MIN_CONFIDENCE) || 0.65
};

// Validate configuration
if (!config.KRAKEN_API_KEY || !config.KRAKEN_API_SECRET) {
    console.error('Error: Kraken API credentials are required');
    process.exit(1);
}

// Initialize Kraken API and Trading Bot
const krakenApi = new KrakenFuturesApi(config.KRAKEN_API_KEY, config.KRAKEN_API_SECRET);
const tradingBot = new TradingBot(krakenApi, config);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        config: {
            dryRun: config.DRY_RUN,
            symbol: config.TRADING_SYMBOL,
            tradeSize: config.TRADE_SIZE
        }
    });
});

// Manual trigger endpoint
app.post('/execute', async (req, res) => {
    try {
        await tradingBot.runTradingCycle();
        res.json({ status: 'execution triggered' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Trading bot server running on port ${port}`);
    console.log(`Dry run mode: ${config.DRY_RUN}`);
    console.log(`Polling interval: ${config.POLL_INTERVAL_MINUTES} minutes`);
    
    // Schedule automated trading
    if (config.POLL_INTERVAL_MINUTES > 0) {
        const cronSchedule = `*/${config.POLL_INTERVAL_MINUTES} * * * *`;
        cron.schedule(cronSchedule, () => {
            tradingBot.runTradingCycle();
        });
        console.log(`Scheduled trading with cron: ${cronSchedule}`);
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down trading bot...');
    process.exit(0);
});

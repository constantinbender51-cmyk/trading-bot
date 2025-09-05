const axios = require('axios');

class TradingBot {
    constructor(krakenApi, config) {
        this.krakenApi = krakenApi;
        this.config = config;
        this.currentPosition = null;
    }

    async fetchSignal() {
        try {
            console.log('Fetching trading signal...');
            const response = await axios.get(this.config.SIGNAL_BOT_URL);
            
            if (response.data.success) {
                console.log('Signal received:', response.data.data);
                return response.data;
            } else {
                console.log('No valid signal received');
                return null;
            }
        } catch (error) {
            console.error('Error fetching signal:', error.message);
            return null;
        }
    }

    async getCurrentPrice(symbol) {
        try {
            const tickers = await this.krakenApi.getTickers();
            const ticker = tickers.tickers.find(t => t.symbol === symbol);
            return ticker ? parseFloat(ticker.last) : null;
        } catch (error) {
            console.error('Error getting current price:', error.message);
            return null;
        }
    }

    async getOpenPositions() {
        try {
            const positions = await this.krakenApi.getOpenPositions();
            return positions.openPositions || [];
        } catch (error) {
            console.error('Error getting open positions:', error.message);
            return [];
        }
    }

    async closeAllPositions(symbol) {
        try {
            const positions = await this.getOpenPositions();
            const symbolPositions = positions.filter(p => p.symbol === symbol);
            
            for (const position of symbolPositions) {
                const side = position.side === 'long' ? 'sell' : 'buy';
                const size = Math.abs(parseFloat(position.size));
                
                console.log(`Closing position: ${side} ${size} ${symbol}`);
                
                if (!this.config.DRY_RUN) {
                    await this.krakenApi.sendOrder({
                        orderType: 'mkt',
                        symbol: symbol,
                        side: side,
                        size: size
                    });
                }
            }
            
            console.log('All positions closed');
        } catch (error) {
            console.error('Error closing positions:', error.message);
        }
    }

    async executeSignal(signalData) {
        const { signal, price_target, stop_loss, confidence } = signalData.data;
        const symbol = this.config.TRADING_SYMBOL;
        
        console.log(`Executing ${signal} signal for ${symbol}`);
        console.log(`Price target: ${price_target}, Stop loss: ${stop_loss}, Confidence: ${confidence}`);

        // Close any existing positions first
        await this.closeAllPositions(symbol);

        if (signal === 'NEUTRAL' || confidence < 0.5) {
            console.log('Signal is neutral or low confidence - no action taken');
            return;
        }

        const currentPrice = await this.getCurrentPrice(symbol);
        if (!currentPrice) {
            console.log('Could not get current price - aborting trade');
            return;
        }

        const orderParams = {
            orderType: 'lmt',
            symbol: symbol,
            side: signal.toLowerCase(),
            size: this.config.TRADE_SIZE,
            limitPrice: currentPrice,
            stopPrice: stop_loss
        };

        console.log('Order parameters:', orderParams);

        if (!this.config.DRY_RUN) {
            try {
                const result = await this.krakenApi.sendOrder(orderParams);
                console.log('Order executed successfully:', result);
                
                // Place stop loss order
                const stopOrderParams = {
                    orderType: 'stp',
                    symbol: symbol,
                    side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy',
                    size: this.config.TRADE_SIZE,
                    stopPrice: stop_loss
                };
                
                const stopResult = await this.krakenApi.sendOrder(stopOrderParams);
                console.log('Stop loss order placed:', stopResult);
                
            } catch (error) {
                console.error('Error executing order:', error);
            }
        } else {
            console.log('DRY RUN: Order would have been placed');
        }
    }

    async runTradingCycle() {
        console.log('\n=== Starting trading cycle ===');
        console.log(new Date().toISOString());
        
        try {
            const signalData = await this.fetchSignal();
            
            if (signalData) {
                await this.executeSignal(signalData);
            }
            
            console.log('=== Trading cycle completed ===\n');
        } catch (error) {
            console.error('Error in trading cycle:', error);
        }
    }
}

module.exports = { TradingBot };

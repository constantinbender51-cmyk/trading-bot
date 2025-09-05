const axios = require('axios');

class TradingBot {
    constructor(krakenApi, config) {
        this.krakenApi = krakenApi;
        this.config = config;
        this.currentPosition = null;
        this.symbolMapping = {
            'XXBTZUSD': 'pf_xbtusd', // Kraken Futures symbol for BTC/USD
            'XETHZUSD': 'pf_ethusd'  // Kraken Futures symbol for ETH/USD
        };
    }

    async fetchSignal() {
        try {
            console.log('Fetching trading signal...');
            const response = await axios.get(this.config.SIGNAL_BOT_URL);
            
            if (response.data.success) {
                console.log('Signal received:', JSON.stringify(response.data.data, null, 2));
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

    mapSymbol(pairUsed) {
        return this.symbolMapping[pairUsed] || this.config.TRADING_SYMBOL;
    }

    async getCurrentPrice(symbol) {
        try {
            const tickers = await this.krakenApi.getTickers();
            const ticker = tickers.tickers.find(t => t.symbol === symbol);
            
            if (!ticker) {
                console.log(`Ticker not found for symbol: ${symbol}`);
                console.log('Available symbols:', tickers.tickers.map(t => t.symbol).slice(0, 10));
                return null;
            }
            
            return parseFloat(ticker.last);
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
            
            if (symbolPositions.length === 0) {
                console.log('No open positions to close');
                return;
            }
            
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

    shouldExecuteSignal(signalData) {
        const { signal, confidence, price_target, stop_loss } = signalData.data;
        
        // Don't execute HOLD signals
        if (signal === 'HOLD') {
            console.log('HOLD signal received - no action taken');
            return false;
        }
        
        // Don't execute low confidence signals
        if (confidence < 0.6) {
            console.log(`Low confidence signal (${confidence}) - no action taken`);
            return false;
        }
        
        // Validate required parameters for BUY/SELL signals
        if (signal === 'BUY' || signal === 'SELL') {
            if (!price_target || !stop_loss) {
                console.log('Missing price_target or stop_loss - no action taken');
                return false;
            }
        }
        
        return true;
    }

    async executeSignal(signalData) {
        const { signal, price_target, stop_loss, confidence } = signalData.data;
        const krakenSymbol = this.mapSymbol(signalData.pair_used);
        
        console.log(`Processing ${signal} signal for ${signalData.pair_used} (Kraken: ${krakenSymbol})`);
        console.log(`Price target: ${price_target}, Stop loss: ${stop_loss}, Confidence: ${confidence}`);

        if (!this.shouldExecuteSignal(signalData)) {
            return;
        }

        const currentPrice = await this.getCurrentPrice(krakenSymbol);
        if (!currentPrice) {
            console.log('Could not get current price - aborting trade');
            return;
        }

        console.log(`Current price: ${currentPrice}`);

        // Close any existing positions first
        await this.closeAllPositions(krakenSymbol);

        const orderParams = {
            orderType: 'lmt',
            symbol: krakenSymbol,
            side: signal.toLowerCase(),
            size: this.config.TRADE_SIZE,
            limitPrice: currentPrice * 0.995, // Slightly better price for entry
            reduceOnly: false
        };

        console.log('Order parameters:', orderParams);

        if (!this.config.DRY_RUN) {
            try {
                // Place main order
                const result = await this.krakenApi.sendOrder(orderParams);
                console.log('Order executed successfully:', result);
                
                // Place stop loss order
                const stopOrderParams = {
                    orderType: 'stp',
                    symbol: krakenSymbol,
                    side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy',
                    size: this.config.TRADE_SIZE,
                    stopPrice: stop_loss,
                    reduceOnly: true
                };
                
                const stopResult = await this.krakenApi.sendOrder(stopOrderParams);
                console.log('Stop loss order placed:', stopResult);
                
                // Optional: Place take profit order
                if (price_target) {
                    const tpOrderParams = {
                        orderType: 'lmt',
                        symbol: krakenSymbol,
                        side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy',
                        size: this.config.TRADE_SIZE,
                        limitPrice: price_target,
                        reduceOnly: true
                    };
                    
                    const tpResult = await this.krakenApi.sendOrder(tpOrderParams);
                    console.log('Take profit order placed:', tpResult);
                }
                
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
            } else {
                console.log('No signal data received');
            }
            
            console.log('=== Trading cycle completed ===\n');
        } catch (error) {
            console.error('Error in trading cycle:', error);
        }
    }
}

module.exports = { TradingBot };

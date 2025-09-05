const axios = require('axios');

class TradingBot {
    constructor(krakenApi, config) {
        this.krakenApi = krakenApi;
        this.config = config;
        this.currentPosition = null;
        this.symbolMapping = {
            'XXBTZUSD': 'PF_XBTUSD', // Correct Kraken Futures symbol for BTC/USD
            'XBTUSD': 'PF_XBTUSD',   // Alternative naming
            'BTCUSD': 'PF_XBTUSD',   // Alternative naming
            'XETHZUSD': 'PF_ETHUSD', // Kraken Futures symbol for ETH/USD
            'ETHUSD': 'PF_ETHUSD'    // Alternative naming
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
            
            // Find the ticker - case insensitive search
            const ticker = tickers.tickers.find(t => 
                t.symbol.toLowerCase() === symbol.toLowerCase()
            );
            
            if (!ticker) {
                console.log(`Ticker not found for symbol: ${symbol}`);
                console.log('Available symbols (first 20):', 
                    tickers.tickers.slice(0, 20).map(t => t.symbol)
                );
                return null;
            }
            
            console.log(`Found ticker: ${ticker.symbol} - Last price: ${ticker.last}`);
            return parseFloat(ticker.last);
        } catch (error) {
            console.error('Error getting current price:', error.message);
            return null;
        }
    }

    async getInstrumentInfo(symbol) {
        try {
            const instruments = await this.krakenApi.getInstruments();
            const instrument = instruments.instruments.find(i => 
                i.symbol.toLowerCase() === symbol.toLowerCase()
            );
            
            if (instrument) {
                console.log(`Instrument info: ${instrument.symbol} - Tick size: ${instrument.tickSize}, Contract value: ${instrument.contractValue}`);
                return instrument;
            }
            return null;
        } catch (error) {
            console.error('Error getting instrument info:', error.message);
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
            const symbolPositions = positions.filter(p => 
                p.symbol.toLowerCase() === symbol.toLowerCase()
            );
            
            if (symbolPositions.length === 0) {
                console.log('No open positions to close');
                return;
            }
            
            console.log(`Found ${symbolPositions.length} positions to close`);
            
            for (const position of symbolPositions) {
                const side = position.side === 'long' ? 'sell' : 'buy';
                const size = Math.abs(parseFloat(position.size));
                
                console.log(`Closing position: ${side} ${size} ${position.symbol} (P&L: ${position.unrealizedFunding})`);
                
                if (!this.config.DRY_RUN) {
                    const result = await this.krakenApi.sendOrder({
                        orderType: 'mkt',
                        symbol: position.symbol,
                        side: side,
                        size: size,
                        reduceOnly: true
                    });
                    console.log('Close order result:', result);
                }
            }
            
            console.log('Position closing completed');
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
        if (confidence < this.config.MIN_CONFIDENCE) {
            console.log(`Low confidence signal (${confidence}) - minimum required: ${this.config.MIN_CONFIDENCE}`);
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
        
        console.log(`\nProcessing ${signal} signal for ${signalData.pair_used} (Kraken: ${krakenSymbol})`);
        console.log(`Price target: ${price_target}, Stop loss: ${stop_loss}, Confidence: ${confidence}`);

        if (!this.shouldExecuteSignal(signalData)) {
            return;
        }

        // Get instrument info first to understand contract specifications
        const instrument = await this.getInstrumentInfo(krakenSymbol);
        if (!instrument) {
            console.log(`Could not get instrument info for ${krakenSymbol} - aborting trade`);
            return;
        }

        const currentPrice = await this.getCurrentPrice(krakenSymbol);
        if (!currentPrice) {
            console.log('Could not get current price - aborting trade');
            return;
        }

        console.log(`Current market price: ${currentPrice}`);

        // Validate prices are reasonable
        if (stop_loss <= currentPrice && signal === 'SELL') {
            console.log(`Stop loss (${stop_loss}) should be above current price (${currentPrice}) for SELL orders`);
            return;
        }

        if (stop_loss >= currentPrice && signal === 'BUY') {
            console.log(`Stop loss (${stop_loss}) should be below current price (${currentPrice}) for BUY orders`);
            return;
        }

        // Close any existing positions first (for this symbol only)
        await this.closeAllPositions(krakenSymbol);

        const orderParams = {
            orderType: 'lmt',
            symbol: krakenSymbol,
            side: signal.toLowerCase(),
            size: this.config.TRADE_SIZE,
            limitPrice: currentPrice,
            reduceOnly: false
        };

        console.log('Main order parameters:', orderParams);

        if (!this.config.DRY_RUN) {
            try {
                // Place main order
                console.log('Placing main order...');
                const result = await this.krakenApi.sendOrder(orderParams);
                console.log('Order executed successfully:', JSON.stringify(result, null, 2));
                
                if (result.sendStatus && result.sendStatus.status === 'placed') {
                    // Place stop loss order
                    const stopOrderParams = {
                        orderType: 'stp',
                        symbol: krakenSymbol,
                        side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy',
                        size: this.config.TRADE_SIZE,
                        stopPrice: stop_loss,
                        reduceOnly: true
                    };
                    
                    console.log('Placing stop loss order...');
                    const stopResult = await this.krakenApi.sendOrder(stopOrderParams);
                    console.log('Stop loss order placed:', JSON.stringify(stopResult, null, 2));
                    
                    // Place take profit order
                    if (price_target) {
                        const tpOrderParams = {
                            orderType: 'lmt',
                            symbol: krakenSymbol,
                            side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy',
                            size: this.config.TRADE_SIZE,
                            limitPrice: price_target,
                            reduceOnly: true
                        };
                        
                        console.log('Placing take profit order...');
                        const tpResult = await this.krakenApi.sendOrder(tpOrderParams);
                        console.log('Take profit order placed:', JSON.stringify(tpResult, null, 2));
                    }
                } else {
                    console.log('Main order was not placed successfully, skipping SL/TP orders');
                }
                
            } catch (error) {
                console.error('Error executing order:', error);
                // Try to cancel any partially filled orders
                try {
                    console.log('Attempting to cancel any open orders...');
                    const cancelResult = await this.krakenApi.cancelAllOrders({ symbol: krakenSymbol });
                    console.log('Cancel result:', cancelResult);
                } catch (cancelError) {
                    console.error('Error canceling orders:', cancelError);
                }
            }
        } else {
            console.log('DRY RUN: Orders would have been placed');
            console.log('Main order:', orderParams);
            console.log('Stop loss:', { stopPrice: stop_loss, side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy' });
            if (price_target) {
                console.log('Take profit:', { limitPrice: price_target, side: signal.toLowerCase() === 'buy' ? 'sell' : 'buy' });
            }
        }
    }

    async runTradingCycle() {
        console.log('\n' + '='.repeat(50));
        console.log('Starting trading cycle:', new Date().toISOString());
        console.log('='.repeat(50));
        
        try {
            const signalData = await this.fetchSignal();
            
            if (signalData) {
                await this.executeSignal(signalData);
            } else {
                console.log('No signal data received');
            }
            
            console.log('='.repeat(50));
            console.log('Trading cycle completed');
            console.log('='.repeat(50) + '\n');
        } catch (error) {
            console.error('Error in trading cycle:', error);
        }
    }
}

module.exports = { TradingBot };

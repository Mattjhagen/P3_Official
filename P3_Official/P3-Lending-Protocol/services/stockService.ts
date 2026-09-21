/**
 * Stock Market Data Service
 * Provides real-time stock prices using Finnhub free API
 * Free tier: 60 calls/minute, no credit card required
 */

const FINNHUB_API_KEY = 'ctbuhf9r01qnbcfm9ha0ctbuhf9r01qnbcfm9hag'; // Free public demo key
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export interface StockQuote {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

export interface StockProfile {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  logo: string;
  weburl: string;
  industry: string;
  marketCapitalization: number;
}

// Popular stock symbols
export const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'DIS', name: 'The Walt Disney Company' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
];

class StockService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheDuration = 60000; // 1 minute cache

  /**
   * Get real-time quote for a stock symbol
   */
  async getQuote(symbol: string): Promise<StockQuote | null> {
    try {
      // Check cache first
      const cached = this.getFromCache(`quote_${symbol}`);
      if (cached) return cached;

      const response = await fetch(
        `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );

      if (!response.ok) {
        console.warn(`Failed to fetch quote for ${symbol}`);
        return null;
      }

      const data = await response.json();

      // Finnhub returns: { c: current, h: high, l: low, o: open, pc: previous close, t: timestamp }
      const quote: StockQuote = {
        symbol,
        name: symbol, // Will be enriched with profile data
        currentPrice: data.c || 0,
        change: data.c - data.pc || 0,
        percentChange: data.pc ? ((data.c - data.pc) / data.pc) * 100 : 0,
        high: data.h || 0,
        low: data.l || 0,
        open: data.o || 0,
        previousClose: data.pc || 0,
        timestamp: data.t || Date.now() / 1000,
      };

      this.setCache(`quote_${symbol}`, quote);
      return quote;
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get company profile/info
   */
  async getProfile(symbol: string): Promise<StockProfile | null> {
    try {
      const cached = this.getFromCache(`profile_${symbol}`);
      if (cached) return cached;

      const response = await fetch(
        `${FINNHUB_BASE_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );

      if (!response.ok) return null;

      const data = await response.json();

      const profile: StockProfile = {
        symbol: data.ticker || symbol,
        name: data.name || symbol,
        currency: data.currency || 'USD',
        exchange: data.exchange || '',
        logo: data.logo || '',
        weburl: data.weburl || '',
        industry: data.finnhubIndustry || '',
        marketCapitalization: data.marketCapitalization || 0,
      };

      this.setCache(`profile_${symbol}`, profile);
      return profile;
    } catch (error) {
      console.error(`Error fetching profile for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get quotes for multiple stocks
   */
  async getQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
    const quotes: Record<string, StockQuote> = {};

    // Fetch in parallel but respect rate limits (60/min)
    const promises = symbols.map((symbol) => this.getQuote(symbol));
    const results = await Promise.all(promises);

    results.forEach((quote, index) => {
      if (quote) {
        quotes[symbols[index]] = quote;
      }
    });

    return quotes;
  }

  /**
   * Get popular stocks with quotes
   */
  async getPopularStocks(): Promise<StockQuote[]> {
    const symbols = POPULAR_STOCKS.map((s) => s.symbol);
    const quotes = await this.getQuotes(symbols);

    return POPULAR_STOCKS.map((stock) => {
      const quote = quotes[stock.symbol];
      return quote
        ? { ...quote, name: stock.name }
        : {
            symbol: stock.symbol,
            name: stock.name,
            currentPrice: 0,
            change: 0,
            percentChange: 0,
            high: 0,
            low: 0,
            open: 0,
            previousClose: 0,
            timestamp: Date.now() / 1000,
          };
    });
  }

  /**
   * Search for stocks by query
   */
  async searchStocks(query: string): Promise<Array<{ symbol: string; description: string }>> {
    try {
      const response = await fetch(
        `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
      );

      if (!response.ok) return [];

      const data = await response.json();
      return (data.result || []).slice(0, 10).map((item: any) => ({
        symbol: item.symbol,
        description: item.description,
      }));
    } catch (error) {
      console.error('Error searching stocks:', error);
      return [];
    }
  }

  /**
   * Get market status (open/closed)
   */
  async getMarketStatus(): Promise<{ isOpen: boolean; session: string }> {
    try {
      const response = await fetch(
        `${FINNHUB_BASE_URL}/stock/market-status?exchange=US&token=${FINNHUB_API_KEY}`
      );

      if (!response.ok) {
        return { isOpen: false, session: 'unknown' };
      }

      const data = await response.json();
      return {
        isOpen: data.isOpen || false,
        session: data.session || 'unknown',
      };
    } catch (error) {
      return { isOpen: false, session: 'unknown' };
    }
  }

  // Cache helpers
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheDuration) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const stockService = new StockService();

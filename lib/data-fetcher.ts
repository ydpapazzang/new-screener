import { OHLCV, Exchange } from './types';
import { getCached, setCached, cacheKey } from './cache';
import { delay } from './utils';

type CcxtExchange = {
  loadMarkets: () => Promise<unknown>;
  fetchOHLCV: (symbol: string, timeframe: string, since?: number, limit?: number) => Promise<number[][]>;
  fetchTickers: (symbols?: string[]) => Promise<Record<string, { quoteVolume?: number; symbol: string }>>;
};

// Lazy exchange instance cache
const exchangeInstances = new Map<string, CcxtExchange>();

async function getExchange(exchangeId: Exchange): Promise<CcxtExchange> {
  if (exchangeInstances.has(exchangeId)) {
    return exchangeInstances.get(exchangeId)!;
  }

  const ccxt = await import('ccxt');
  let ex: CcxtExchange;

  switch (exchangeId) {
    case 'upbit':
      ex = new (ccxt as unknown as { upbit: new (opts: object) => CcxtExchange }).upbit({ enableRateLimit: true });
      break;
    case 'binance':
      ex = new (ccxt as unknown as { binance: new (opts: object) => CcxtExchange }).binance({ enableRateLimit: true });
      break;
    case 'bithumb':
      ex = new (ccxt as unknown as { bithumb: new (opts: object) => CcxtExchange }).bithumb({ enableRateLimit: true });
      break;
    default:
      ex = new (ccxt as unknown as { upbit: new (opts: object) => CcxtExchange }).upbit({ enableRateLimit: true });
  }

  await ex.loadMarkets();
  exchangeInstances.set(exchangeId, ex);
  return ex;
}

// Fetch OHLCV candles, returns newest-last sorted array
export async function fetchOHLCV(
  exchange: Exchange,
  symbol: string,
  timeframe: '1d' | '1w' | '1M' = '1d',
  limit = 500,
): Promise<OHLCV[]> {
  const key = cacheKey(exchange, symbol, timeframe);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    const ex = await getExchange(exchange);
    const raw = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
    const data: OHLCV[] = raw.map(([timestamp, open, high, low, close, volume]: number[]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }));
    // Remove the last (incomplete) candle - only keep closed candles
    const closed = data.slice(0, -1);
    setCached(key, closed);
    return closed;
  } catch {
    return [];
  }
}

// Get top symbols by 24h quote volume
export async function getTopSymbols(exchange: Exchange, limit = 40): Promise<string[]> {
  try {
    const ex = await getExchange(exchange);
    const tickers = await ex.fetchTickers();
    const quoteAsset = exchange === 'binance' ? 'USDT' : 'KRW';

    return Object.values(tickers)
      .filter((t) => t.symbol && t.quoteVolume && t.symbol.endsWith(`/${quoteAsset}`))
      .sort((a, b) => (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0))
      .slice(0, limit)
      .map((t) => t.symbol);
  } catch {
    return getDefaultSymbols(exchange);
  }
}

function getDefaultSymbols(exchange: Exchange): string[] {
  const base = [
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK',
    'UNI', 'ATOM', 'LTC', 'BCH', 'ETC', 'NEAR', 'ALGO', 'FIL', 'VET', 'TRX',
  ];
  const quote = exchange === 'binance' ? 'USDT' : 'KRW';
  return base.map((b) => `${b}/${quote}`);
}

// Batch fetch with rate limiting
export async function fetchMultipleOHLCV(
  exchange: Exchange,
  symbols: string[],
): Promise<Map<string, OHLCV[]>> {
  const result = new Map<string, OHLCV[]>();
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const data = await fetchOHLCV(exchange, sym, '1d', 500);
    if (data.length > 50) result.set(sym, data);
    await delay(120);
  }
  return result;
}

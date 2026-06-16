import { OHLCV } from './types';

interface CacheEntry {
  data: OHLCV[];
  timestamp: number;
}

// Module-level cache (persists between requests in the same Node.js process)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export function getCached(key: string): OHLCV[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key: string, data: OHLCV[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function cacheKey(exchange: string, symbol: string, timeframe: string): string {
  return `${exchange}:${symbol}:${timeframe}`;
}

export function clearCache(): void {
  cache.clear();
}

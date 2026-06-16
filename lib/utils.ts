import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, exchange: string): string {
  if (exchange === 'upbit' || exchange === 'bithumb') {
    if (price >= 1_000_000) return price.toLocaleString('ko-KR') + '원';
    if (price >= 1000) return price.toLocaleString('ko-KR') + '원';
    return price.toFixed(2) + '원';
  }
  if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (price >= 1) return '$' + price.toFixed(4);
  return '$' + price.toFixed(6);
}

export function formatPercent(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

export function roundFigure(price: number): number {
  if (price >= 10_000_000) return Math.round(price / 1_000_000) * 1_000_000;
  if (price >= 1_000_000) return Math.round(price / 100_000) * 100_000;
  if (price >= 100_000) return Math.round(price / 10_000) * 10_000;
  if (price >= 10_000) return Math.round(price / 1_000) * 1_000;
  if (price >= 1_000) return Math.round(price / 100) * 100;
  if (price >= 100) return Math.round(price / 10) * 10;
  if (price >= 10) return Math.round(price / 1) * 1;
  if (price >= 1) return Math.round(price * 10) / 10;
  if (price >= 0.1) return Math.round(price * 100) / 100;
  return Math.round(price * 10000) / 10000;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

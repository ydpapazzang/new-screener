import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EOD 퀀트 스크리너 | 눌림목 전략',
  description: '어제 마감 데이터 기반 5대 눌림목 전략 기술적 지표 퀀트 스크리너',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

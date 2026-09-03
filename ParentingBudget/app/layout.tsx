import type { Metadata } from 'next';
import { Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import './globals.css';

const sans = Noto_Sans_TC({ variable: '--font-noto-sans-tc', subsets: ['latin'], display: 'swap' });
const serif = Noto_Serif_TC({ variable: '--font-noto-serif-tc', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: '小日子育兒預算｜台灣備孕到兩歲花費估算',
  description: '調整生產、月中、餵養、托嬰與育嬰留停條件，即時計算台灣備孕到寶寶兩歲的花費與家庭現金流。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW"><body className={`${sans.variable} ${serif.variable} antialiased`}>{children}</body></html>;
}

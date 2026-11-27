import { Analytics } from '@vercel/analytics/next';
import '@/styles/style.css';
import '@/styles/deck-navigation.css';
import '@/styles/trading.css';

export const metadata = {
  title: 'Trading Deck — Market Deck',
  description: 'Screener saham dan kripto serta setup trading pribadi di Trading Deck.',
  icons: { icon: { url: '/assets/deck-mark.svg', type: 'image/svg+xml' } },
};

export const viewport = { themeColor: '#131313' };

export default function TradingLayout({ children }) {
  return (
    <html lang="id">
      <body className="trading-page">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

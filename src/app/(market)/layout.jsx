import { Analytics } from '@vercel/analytics/next';
import '@/styles/style.css';
import '@/styles/agenda.css';
import '@/styles/market-stats.css';
import '@/styles/metric-details.css';
import '@/styles/fresh-data.css';
import '@/styles/btc-cards.css';
import '@/styles/deck-navigation.css';
import '@/styles/macro-details.css';
import '@/styles/treasury.css';
import '@/styles/fx-ihsg.css';
import '@/styles/chart-tools.css';
import '@/styles/sectors.css';
import '@/styles/macro-watch.css';

export const metadata = {
  title: 'Market Deck — Trading & Investing',
  description: 'Chart IHSG dan Bitcoin, sentimen pasar, corporate action personal, dan kalender ekonomi.',
  icons: { icon: { url: '/assets/deck-mark.svg', type: 'image/svg+xml' } },
};

export const viewport = { themeColor: '#131313' };

export default function MarketLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

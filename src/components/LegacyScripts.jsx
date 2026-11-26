'use client';

import { useEffect } from 'react';

// The page widgets are driven by DOM modules (src/legacy from the prototype,
// src/client added since). They run once, in order, after hydration.
const pages = {
  market: [
    () => import('@/legacy/tv-tickers-fix.mjs'),
    () => import('@/legacy/app.mjs'),
    () => import('@/client/fear-greed.mjs'),
    () => import('@/legacy/agenda.mjs'),
    () => import('@/legacy/market-stats.mjs'),
    () => import('@/legacy/btc-cards.mjs'),
    () => import('@/legacy/macro-details.mjs'),
    () => import('@/legacy/treasury.mjs'),
    () => import('@/client/fx-ihsg.mjs'),
    () => import('@/client/eido.mjs'),
    () => import('@/client/rates-dialog.mjs'),
    () => import('@/client/sentiment.mjs'),
    () => import('@/client/btc-perpetual-position.mjs'),
    () => import('@/client/sectors.mjs'),
    () => import('@/client/macro-watch.mjs'),
    () => import('@/client/live-session.mjs'),
    () => import('@/client/market-status.mjs'),
    () => import('@/client/turnover-dialog.mjs'),
    () => import('@/client/foreign-dialog.mjs'),
    () => import('@/client/commodity-dialog.mjs'),
  ],
  trading: [() => import('@/legacy/trading.mjs')],
};

export default function LegacyScripts({ page }) {
  useEffect(() => {
    (async () => {
      for (const load of pages[page]) {
        try {
          await load();
        } catch (error) {
          console.error('Gagal memuat modul halaman', error);
        }
      }
    })();
  }, [page]);
  return null;
}

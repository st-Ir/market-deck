// IDX stocks most exposed to each commodity in the market panel, with their 1-day
// and 1-week (5 sessions) moves from TradingView. "up" names gain when the price
// rises (producers); "down" names gain when it falls (the commodity is a cost).
//
// Catatan: daftar ini kurasi umum berdasarkan bisnis utama tiap emiten, bukan
// rekomendasi beli/jual. Tambah atau hapus emiten cukup di COMMODITY_STOCKS:
// [kode IDX, alasan singkat]. Kode yang tidak ditemukan di TradingView dilewati.
import { tradingViewQuotes } from '@/lib/tradingview';

export const COMMODITY_STOCKS = {
  coal: {
    up: [['ADRO', 'Batu bara & energi terintegrasi'], ['AADI', 'Produsen batu bara termal'], ['PTBA', 'Produsen batu bara BUMN'], ['ITMG', 'Produsen batu bara termal'], ['BUMI', 'Produsen batu bara'], ['INDY', 'Batu bara & jasa energi'], ['HRUM', 'Batu bara & nikel'], ['GEMS', 'Produsen batu bara'], ['BSSR', 'Produsen batu bara'], ['DSSA', 'Induk GEMS, energi']],
    down: [['SMGR', 'Semen, batu bara sebagai bahan bakar'], ['INTP', 'Semen, batu bara sebagai bahan bakar']],
  },
  cpo: {
    up: [['AALI', 'Perkebunan sawit'], ['LSIP', 'Perkebunan sawit'], ['TAPG', 'Perkebunan sawit'], ['DSNG', 'Sawit & kayu'], ['SSMS', 'Perkebunan sawit'], ['SGRO', 'Perkebunan sawit'], ['SMAR', 'Sawit & minyak goreng'], ['BWPT', 'Perkebunan sawit']],
    down: [['ICBP', 'Mi instan, minyak sawit sebagai bahan baku'], ['INDF', 'Pangan, minyak goreng & mi'], ['MYOR', 'Makanan olahan'], ['UNVR', 'Produk konsumen berbasis sawit'], ['ROTI', 'Roti & kue']],
  },
  brent: {
    up: [['MEDC', 'Produsen migas'], ['ENRG', 'Produsen migas'], ['ELSA', 'Jasa migas'], ['PGAS', 'Gas, harga terkait minyak'], ['AKRA', 'Distribusi BBM & kimia'], ['RAJA', 'Distribusi & transportasi gas']],
    down: [['GIAA', 'Maskapai, avtur biaya terbesar'], ['BIRD', 'Transportasi darat, BBM'], ['ASSA', 'Transportasi & logistik, BBM'], ['TPIA', 'Petrokimia, nafta sebagai bahan baku']],
  },
  nickel: {
    up: [['INCO', 'Nikel matte'], ['ANTM', 'Nikel, emas & bauksit'], ['MBMA', 'Nikel (Merdeka Battery)'], ['NCKL', 'Nikel (Harita)'], ['DKFT', 'Bijih nikel']],
    down: [],
  },
  gold: {
    up: [['ANTM', 'Penambang & penjual emas'], ['MDKA', 'Tambang emas & tembaga'], ['BRMS', 'Tambang emas'], ['ARCI', 'Tambang emas'], ['PSAB', 'Tambang emas'], ['UNTR', 'Tambang emas Martabe (selain alat berat)']],
    down: [],
  },
};

export async function commodityStocks() {
  const codes = [...new Set(Object.values(COMMODITY_STOCKS).flatMap((g) => [...g.up, ...g.down].map(([code]) => code)))];
  const raw = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbols: { tickers: codes.map((c) => 'IDX:' + c) }, columns: ['close', 'change', 'Perf.W', 'description', 'update_mode'] }),
    signal: AbortSignal.timeout(15000),
  }).then((r) => {
    if (!r.ok) throw new Error(`TradingView HTTP ${r.status}`);
    return r.json();
  });
  const quotes = Object.fromEntries((raw.data || []).map(({ s, d }) => [s.replace('IDX:', ''), { price: d[0], change1d: d[1], change5d: d[2], name: d[3], delay: /delayed_streaming_(\d+)/.exec(d[4] || '')?.[1] }]));
  const build = (list) => list.filter(([code]) => quotes[code]).map(([code, reason]) => ({ code, reason, ...quotes[code], delayMinutes: quotes[code].delay ? Math.round(quotes[code].delay / 60) : 0 }));
  return {
    schema: 1,
    source: 'TradingView',
    generatedAt: new Date().toISOString(),
    commodities: Object.fromEntries(Object.entries(COMMODITY_STOCKS).map(([kind, g]) => [kind, { up: build(g.up), down: build(g.down) }])),
    delivery: 'feed',
  };
}

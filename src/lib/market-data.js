// Server-side data for /api/*. Most endpoints have a live source and a dated
// snapshot (src/data) used when the source fails. BEI data (idx.id) starts from
// a bundled session history and caches new sessions on disk. BTC ETF flows come from
// SoSoValue (src/lib/btc-etf.js) on top of the Farside snapshot. The economic
// calendar is an official schedule and stays a dated snapshot.
import { after } from 'next/server';
import { idxFearGreed, idxForeignSummary, idxSectorStocks, idxSectors, idxTurnover } from '@/lib/idx-daily';
import { idxLive } from '@/lib/idx-live';
import { ihsgOhlc } from '@/lib/ihsg-ohlc';
import { btcOhlc } from '@/lib/btc-ohlc';
import { btcFearGreed } from '@/lib/btc-fear-greed';
import { liveBtcPerpetualPosition } from '@/lib/btc-perpetual-position';
import { binanceDailyPoints, btcPerpetualArchive, freshTicker, liveGatePerpetual } from '@/lib/btc-turnover';
import { btcEtfTurnover, liveBtcEtf } from '@/lib/btc-etf';
import { idxCorporateActions } from '@/lib/idx-corporate';
import { liveMacroIndicators, macroIndicators, releaseIndicator } from '@/lib/macro-id';
import { macroLiquidity } from '@/lib/macro-liquidity';
import { loadMacroGrowthInflation } from '@/lib/macro-growth-inflation';
import { macroRisk } from '@/lib/macro-risk';
import { macroScores } from '@/lib/macro-scores';
import { fredObservations } from '@/lib/fred-observations';
import { tradingViewChart, tradingViewHistories, tradingViewQuotes } from '@/lib/tradingview';
import { commodityStocks } from '@/lib/commodity-stocks';
import { marketNews } from '@/lib/news';
import btcEtf from '@/data/btc-etf.json';
import btcM2 from '@/data/btc-m2.json';
import btcSpot from '@/data/btc-spot.json';
import chinaSeed from '@/data/m2-china-seed.json';
import monthlyM2Seed from '@/data/m2-monthly-seed.json';
import contextPrices from '@/data/context-prices.json';
import economicCalendar from '@/data/economic-calendar.json';
import fearGreed from '@/data/fear-greed.json';
import treasuryCurve from '@/data/treasury-curve.json';
import treasurySeed from '@/data/treasury-seed.json';
import us10yQuote from '@/data/us10y-quote.json';
import vix from '@/data/vix.json';

const TIMEOUT = 10000;
const getJson = (url, timeout = TIMEOUT) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) }).then((r) => {
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
});
const getText = (url, timeout = TIMEOUT) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) }).then((r) => {
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
});
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

const BROWSER_UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const dateIn = (ms, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

async function yahooChart(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const json = await fetch(url, { cache: 'no-store', headers: BROWSER_UA, signal: AbortSignal.timeout(TIMEOUT) }).then((r) => {
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.json();
  });
  const result = json.chart?.result?.[0];
  if (!result?.meta) throw new Error(`Yahoo ${symbol}: respons kosong`);
  const { close: closes = [], volume: volumes = [] } = result.indicators?.quote?.[0] || {};
  const rows = (result.timestamp || [])
    .map((t, i) => ({ t: t * 1000, close: closes[i], volume: volumes[i] }))
    .filter((row) => Number.isFinite(row.close));
  return { meta: result.meta, rows };
}

// Daily closes keyed by exchange-local date; today's bar uses the live price.
async function yahooDaily(symbol, range = '2y') {
  const { meta, rows } = await yahooChart(symbol, range, '1d');
  const zone = meta.exchangeTimezoneName || 'UTC';
  const byDate = new Map(rows.map((row) => [dateIn(row.t, zone), row.close]));
  const liveDate = dateIn(meta.regularMarketTime * 1000, zone);
  if (Number.isFinite(meta.regularMarketPrice)) byDate.set(liveDate, meta.regularMarketPrice);
  const points = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, close]) => ({ date, close }));
  const previous = points.filter((p) => p.date < liveDate).at(-1)?.close ?? null;
  return {
    points,
    quote: {
      value: meta.regularMarketPrice,
      previousClose: previous,
      changePercent: previous ? (meta.regularMarketPrice / previous - 1) * 100 : null,
      time: new Date(meta.regularMarketTime * 1000).toISOString(),
      date: liveDate,
    },
  };
}

// ECB reference rates (via Frankfurter) give a clean daily USD/IDR history; Yahoo's
// IDR=X daily closes contain bad prints (closes outside the day's range). Yahoo's
// intraday quote is used only for the live value, and only while it stays within
// 1.5% of the latest ECB rate.
async function ecbUsdIdr(from) {
  const json = await getJson(`https://api.frankfurter.dev/v1/${from}..?from=USD&to=IDR`);
  return Object.entries(json.rates).map(([date, rate]) => ({ date, close: rate.IDR })).sort((x, y) => (x.date < y.date ? -1 : 1));
}

async function liveUsdIdr() {
  const ihsg = await yahooDaily('^JKSE');
  const [ecb, yahooFx] = await Promise.all([
    ecbUsdIdr(ihsg.points[0].date),
    yahooDaily('IDR=X', '5d').catch(() => null),
  ]);
  const lastEcb = ecb.at(-1);
  const live = yahooFx?.quote;
  const liveOk = live && Number.isFinite(live.value) && Math.abs(live.value / lastEcb.close - 1) < 0.015;
  const fx = [...ecb];
  if (liveOk && live.date > lastEcb.date) fx.push({ date: live.date, close: live.value, live: true });
  const quoteDate = liveOk ? live.date : lastEcb.date;
  const previous = fx.filter((p) => p.date < quoteDate).at(-1)?.close ?? null;
  const value = liveOk ? live.value : lastEcb.close;
  // Align on IHSG sessions; USD/IDR takes its rate for that date or the latest before it.
  let i = 0;
  let last = null;
  const points = [];
  for (const day of ihsg.points) {
    while (i < fx.length && fx[i].date <= day.date) last = fx[i++].close;
    if (last !== null) points.push({ date: day.date, usdidr: last, ihsg: day.close });
  }
  return {
    schema: 1,
    source: 'ECB via Frankfurter · Yahoo Finance',
    sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-idr.en.html',
    liveSourceUrl: 'https://finance.yahoo.com/quote/IDR%3DX/',
    ihsgSourceUrl: 'https://finance.yahoo.com/quote/%5EJKSE/',
    frequency: 'daily-reference-with-live-quote',
    asOf: points.at(-1)?.date ?? null,
    generatedAt: new Date().toISOString(),
    quote: {
      usdidr: {
        value,
        previousClose: previous,
        changePercent: previous ? (value / previous - 1) * 100 : null,
        // ECB publishes its reference rates around 16:00 CET.
        time: liveOk ? live.time : `${lastEcb.date}T15:00:00.000Z`,
        date: quoteDate,
        source: liveOk ? 'yahoo' : 'ecb',
      },
      ihsg: ihsg.quote,
    },
    fxSpark: fx.slice(-30),
    points,
    delivery: 'feed',
  };
}

async function liveEthBtc() {
  const [ticker, klines] = await Promise.all([
    getJson('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=ETHBTC'),
    getJson('https://data-api.binance.vision/api/v3/klines?symbol=ETHBTC&interval=1d&limit=30'),
  ]);
  return {
    schema: 1,
    source: 'Binance Spot',
    sourceUrl: 'https://www.binance.com/en/trade/ETH_BTC',
    symbol: 'ETHBTC',
    value: Number(ticker.lastPrice),
    changePercent: Number(ticker.priceChangePercent),
    asOf: new Date(ticker.closeTime).toISOString(),
    generatedAt: new Date().toISOString(),
    frequency: 'rolling-24h',
    points: klines.map((k) => ({ date: isoDate(k[0]), close: Number(k[4]) })),
    delivery: 'feed',
  };
}

async function cboeUs10y() {
  const { timestamp, data } = await getJson('https://cdn.cboe.com/api/global/delayed_quotes/quotes/_TNX.json');
  // TNX is quoted as yield × 10.
  const value = data.current_price / 10;
  const previousClose = data.prev_day_close / 10;
  return {
    ...us10yQuote,
    value,
    previousClose,
    changeBp: (value - previousClose) * 100,
    asOf: new Date(timestamp.replace(' ', 'T') + 'Z').toISOString(), // Cboe stamps quotes in UTC
    generatedAt: new Date().toISOString(),
    points: [],
    delivery: 'feed',
  };
}

async function yahooUs10y() {
  const { meta, rows } = await yahooChart('^TNX', '1d', '1m');
  const value = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  if (!Number.isFinite(value)) throw new Error('Yahoo ^TNX: kuotasi kosong');
  return {
    ...us10yQuote,
    source: 'Yahoo Finance · Cboe TNX',
    sourceUrl: 'https://finance.yahoo.com/quote/%5ETNX/',
    value,
    previousClose,
    changeBp: Number.isFinite(previousClose) ? (value - previousClose) * 100 : null,
    asOf: new Date(meta.regularMarketTime * 1000).toISOString(),
    generatedAt: new Date().toISOString(),
    points: rows.map((row) => ({ time: new Date(row.t).toISOString(), value: row.close })),
    delivery: 'feed',
  };
}

async function liveUs10y() {
  const cutoff = Date.now() - 4 * 86400e3;
  const yahoo = await yahooUs10y().catch(() => null);
  if (yahoo && Date.parse(yahoo.asOf) >= cutoff) return yahoo;

  const [cboe, curve] = await Promise.all([
    cboeUs10y().catch(() => null),
    loadEndpoint('treasury-curve'),
  ]);
  const observations = curve.points.filter((point) => Number.isFinite(point.yields['10Y']));
  const last = observations.at(-1);
  const newest = [yahoo, cboe].filter((quote) => Number.isFinite(quote?.value))
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))[0];
  if (newest && (!last || newest.asOf.slice(0, 10) >= last.date)) {
    return Date.parse(newest.asOf) >= cutoff ? newest : { ...newest, delivery: 'archive' };
  }
  if (!last) throw new Error('US 10Y: kuotasi dan par yield harian tidak tersedia');

  const value = last.yields['10Y'];
  const previousClose = observations.at(-2)?.yields['10Y'] ?? null;
  return {
    ...us10yQuote,
    source: 'U.S. Treasury · EOD',
    sourceUrl: curve.sourceUrl,
    value,
    previousClose,
    changeBp: previousClose === null ? null : (value - previousClose) * 100,
    asOf: last.date,
    timePrecision: 'day',
    generatedAt: curve.generatedAt,
    frequency: 'daily',
    points: [],
    delivery: curve.delivery,
  };
}

const TENOR_COLUMNS = { '1 Mo': '1M', '1.5 Month': '1.5M', '2 Mo': '2M', '3 Mo': '3M', '4 Mo': '4M', '6 Mo': '6M', '1 Yr': '1Y', '2 Yr': '2Y', '3 Yr': '3Y', '5 Yr': '5Y', '7 Yr': '7Y', '10 Yr': '10Y', '20 Yr': '20Y', '30 Yr': '30Y' };

async function liveTreasuryCurve() {
  const first = Number(treasuryCurve.points[0].date.slice(0, 4));
  const now = new Date().getUTCFullYear();
  const years = Array.from({ length: now - first + 1 }, (_, k) => first + k);
  const csvs = await Promise.all(years.map((year) => getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`)));
  const points = csvs.flatMap((csv) => {
    const [head, ...lines] = csv.trim().split(/\r?\n/);
    const columns = head.split(',').map((c) => c.replace(/"/g, ''));
    return lines.map((line) => {
      const cells = line.split(',');
      const [m, d, y] = cells[0].split('/');
      const yields = Object.fromEntries(treasuryCurve.tenors.map((tenor) => [tenor, null]));
      columns.forEach((column, k) => { if (TENOR_COLUMNS[column] && cells[k] !== '') yields[TENOR_COLUMNS[column]] = Number(cells[k]); });
      return { date: `${y}-${m}-${d}`, yields };
    });
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...treasuryCurve, asOf: points.at(-1).date, generatedAt: new Date().toISOString(), points, delivery: 'feed' };
}

async function liveTreasurySeed() {
  const [quote, curve] = await Promise.all([loadEndpoint('us10y-quote'), loadEndpoint('treasury-curve')]);
  return {
    ...treasurySeed,
    quote,
    curve,
    delivery: quote.delivery === 'feed' || curve.delivery === 'feed' ? 'feed' : 'snapshot',
  };
}

const TE_PAGES = { coal: 'coal', cpo: 'palm-oil', brent: 'brent-crude-oil', nickel: 'nickel', gold: 'gold' };
// Fields for commodities that are not in the dated snapshot.
const COMMODITY_META = {
  nickel: { kind: 'nickel', label: 'Nikel', unit: 'USD/ton', frequency: 'daily', instrument: 'CFD reference', source: 'Trading Economics', sourceUrl: 'https://tradingeconomics.com/commodity/nickel' },
  gold: { kind: 'gold', label: 'Emas', unit: 'USD/troy oz', frequency: 'daily', instrument: 'CFD reference', source: 'Trading Economics', sourceUrl: 'https://tradingeconomics.com/commodity/gold' },
  brent: { kind: 'brent', label: 'Brent', unit: 'USD/barel', frequency: 'daily', instrument: 'CFD reference', source: 'Trading Economics', sourceUrl: 'https://tradingeconomics.com/commodity/brent-crude-oil' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Intraday quotes: every Trading Economics commodity page carries a market table
// (symbol, price, day change, %, …, date), refreshed through the session. The
// coal page lists coal, Brent, nickel and gold; the palm-oil page lists CPO.
const TE_SYMBOLS = { 'XAL1:COM': 'coal', 'PLO:COM': 'cpo', 'CO1:COM': 'brent', 'LN1:COM': 'nickel', 'XAUUSD:CUR': 'gold' };
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function marketTableQuotes(html, found) {
  for (const [, symbol, row] of html.matchAll(/<tr[^>]*data-symbol="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const kind = TE_SYMBOLS[symbol];
    if (!kind || found[kind]) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const value = Number((cells[1] || '').replace(/,/g, ''));
    // Day change % is the first percentage column after the price.
    const percent = Number((cells.slice(2).find((c) => c.endsWith('%')) || '').replace('%', ''));
    const stamp = cells.findLast((c) => /^[A-Z][a-z]{2}\/\d{1,2}$|^\d{1,2}:\d{2}/.test(c));
    if (!Number.isFinite(value) || !value || !Number.isFinite(percent) || !stamp) continue;
    let asOf = new Date().toISOString().slice(0, 10);
    if (stamp.includes('/')) {
      const [mon, dd] = stamp.split('/');
      const now = new Date();
      const year = SHORT_MONTHS.indexOf(mon) > now.getUTCMonth() ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      asOf = `${year}-${String(SHORT_MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    found[kind] = { value, changePercent: percent, asOf };
  }
  return found;
}

// Primary source: TradingView futures/spot quotes (intraday, with the exchange's
// own delay); Trading Economics remains the fallback.
const TV_COMMODITIES = {
  coal: { symbol: 'ICEEUR:NCF1!', label: 'Batu bara', unit: 'USD/ton', instrument: 'Newcastle coal futures (ICE)' },
  cpo: { symbol: 'MYX:FCPO1!', label: 'CPO', unit: 'MYR/ton', instrument: 'Crude palm oil futures (Bursa Malaysia)' },
  brent: { symbol: 'ICEEUR:BRN1!', label: 'Brent', unit: 'USD/barel', instrument: 'Brent crude futures (ICE)' },
  // LME history needs a TradingView subscription; the popup chart uses the CFD.
  nickel: { symbol: 'LME:NI1!', historySymbol: 'CAPITALCOM:NICKEL', label: 'Nikel', unit: 'USD/ton', instrument: 'Nickel futures (LME)' },
  gold: { symbol: 'TVC:GOLD', label: 'Emas', unit: 'USD/troy oz', instrument: 'Gold spot (TVC)' },
};

async function liveContextPrices() {
  try {
    const checkedAt = new Date().toISOString();
    const quotes = await tradingViewQuotes(Object.values(TV_COMMODITIES).map((c) => c.symbol));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const entries = Object.entries(TV_COMMODITIES).map(([kind, c]) => {
      const q = quotes[c.symbol];
      if (!q) throw new Error(`TradingView ${c.symbol} kosong`);
      return [kind, {
        kind, label: c.label, unit: c.unit, instrument: c.instrument, value: q.close, changePercent: q.changePercent, asOf: today,
        high: q.high, low: q.low, perfWeek: q.perfWeek, perfMonth: q.perfMonth,
        delayMinutes: q.delayMinutes, frequency: 'intraday', source: 'TradingView', sourceShort: 'TV', symbol: c.symbol,
        sourceUrl: tradingViewChart(c.symbol), checkedAt, status: 'live',
      }];
    });
    return { schema: 1, generatedAt: checkedAt, quotes: Object.fromEntries(entries), delivery: 'feed' };
  } catch (error) {
    console.warn('[context-prices] TradingView gagal, memakai Trading Economics:', error.message);
    return tradingEconomicsPrices();
  }
}

async function tradingEconomicsPrices() {
  const checkedAt = new Date().toISOString();
  const pages = await Promise.all(['coal', 'palm-oil'].map((page) => fetch(`https://tradingeconomics.com/commodity/${page}`, { cache: 'no-store', headers: BROWSER_UA, signal: AbortSignal.timeout(TIMEOUT) }).then((r) => r.text())));
  const found = pages.reduce((acc, html) => marketTableQuotes(html, acc), {});
  const missing = Object.keys(TE_PAGES).filter((kind) => !found[kind]);
  // Anything the table did not yield falls back to its own page description.
  const fallback = missing.length ? await liveContextDescriptions(missing) : {};
  const quotes = Object.fromEntries(Object.keys(TE_PAGES).map((kind) => {
    const quote = found[kind] ?? fallback[kind];
    return [kind, { ...(contextPrices.quotes[kind] ?? COMMODITY_META[kind]), ...quote, sourceShort: 'TE', checkedAt, status: 'live' }];
  }));
  return { ...contextPrices, generatedAt: checkedAt, quotes, delivery: 'feed' };
}

// Trading Economics also states the latest CFD reading in the page description, e.g.
// "Coal rose to 142.45 USD/T on November 11, 2026, up 2.48% from the previous day."
async function liveContextDescriptions(kinds) {
  const entries = await Promise.all(kinds.map(async (kind) => {
    const page = TE_PAGES[kind];
    const html = await fetch(`https://tradingeconomics.com/commodity/${page}`, { cache: 'no-store', headers: BROWSER_UA, signal: AbortSignal.timeout(TIMEOUT) }).then((r) => r.text());
    const text = html.match(/name="description" content="([^"]+)"/)?.[1] ?? '';
    const match = text.match(/to ([\d,.]+) [A-Za-z/.]+ on (\w+) (\d{1,2}), (\d{4}), (up|down) ([\d.]+)%/);
    if (!match) throw new Error(`Trading Economics ${page}: format tidak dikenali`);
    const [, value, month, day, year, direction, percent] = match;
    const asOf = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
    return [kind, { value: Number(value.replace(/,/g, '')), changePercent: (direction === 'down' ? -1 : 1) * Number(percent), asOf }];
  }));
  return Object.fromEntries(entries);
}

// Two years of daily closes for the commodity popups, from TradingView on the
// same contracts as the live tiles (TV_COMMODITIES; nickel on the CFD).
async function commodityHistory() {
  const symbols = Object.fromEntries(Object.entries(TV_COMMODITIES).map(([kind, c]) => [kind, c.historySymbol ?? c.symbol]));
  const history = await tradingViewHistories(Object.values(symbols));
  return {
    schema: 1,
    source: 'TradingView',
    generatedAt: new Date().toISOString(),
    commodities: Object.fromEntries(Object.entries(symbols).map(([kind, symbol]) => [kind, history[symbol] ? { symbol, points: history[symbol] } : null])),
    delivery: 'feed',
  };
}

// Rates popups: TradingView daily history of SBN 10Y,
// UST 10Y, IHSG and USD/IDR, and BI-Rate from the Trading Economics release table.
async function ratesId() {
  const symbols = { sbn: 'TVC:ID10Y', ust: 'TVC:US10Y', COMPOSITE: 'IDX:COMPOSITE', USDIDR: 'FX_IDC:USDIDR' };
  const [history, biRate] = await Promise.all([
    tradingViewHistories(Object.values(symbols)),
    releaseIndicator({ key: 'bi-rate', label: 'BI-Rate', page: 'indonesia/interest-rate', unit: '%' }).catch((error) => (console.warn('[rates-id] BI-Rate:', error.message), null)),
  ]);
  const of = (key) => history[symbols[key]] ?? null;
  if (!of('sbn') || !of('ust')) throw new Error('riwayat yield TradingView belum tersedia');
  return {
    schema: 1,
    source: 'TradingView · Trading Economics',
    generatedAt: new Date().toISOString(),
    sbn: of('sbn'),
    ust: of('ust'),
    series: { COMPOSITE: of('COMPOSITE'), USDIDR: of('USDIDR') },
    biRate: biRate && { value: biRate.value, previous: biRate.previous, released: biRate.released, next: biRate.next, sourceUrl: biRate.sourceUrl },
    sourceUrls: { sbn: tradingViewChart('TVC:ID10Y'), ust: tradingViewChart('TVC:US10Y') },
    delivery: 'feed',
  };
}

// EIDO (iShares MSCI Indonesia ETF, NYSE, USD): two years of Yahoo daily closes
// for the card sparkline and the popup, with TradingView's quote (15-minute
// delay) as the latest price when it is available.
async function liveEido() {
  const [daily, tv] = await Promise.all([yahooDaily('EIDO', '2y'), tradingViewQuotes(['AMEX:EIDO']).catch(() => null)]);
  const quote = tv?.['AMEX:EIDO'];
  const points = daily.points;
  if (quote && points.length) points[points.length - 1] = { ...points.at(-1), close: quote.close };
  return {
    schema: 1,
    symbol: 'EIDO',
    name: 'iShares MSCI Indonesia ETF',
    exchange: 'NYSE Arca',
    unit: 'USD',
    source: quote ? 'TradingView · Yahoo Finance' : 'Yahoo Finance',
    sourceUrl: tradingViewChart('AMEX:EIDO'),
    asOf: daily.quote.date,
    generatedAt: new Date().toISOString(),
    quote: quote
      ? { value: quote.close, changePercent: quote.changePercent, high: quote.high, low: quote.low, delayMinutes: quote.delayMinutes, source: 'tradingview' }
      : { value: daily.quote.value, changePercent: daily.quote.changePercent, high: null, low: null, delayMinutes: null, source: 'yahoo', time: daily.quote.time },
    points,
    delivery: 'feed',
  };
}

async function liveFearGreed() {
  const { data } = await getJson('https://api.alternative.me/fng/?limit=2');
  return {
    ...fearGreed,
    generatedAt: new Date().toISOString(),
    points: data.map((p) => ({ value: Number(p.value), date: isoDate(Number(p.timestamp) * 1000), classification: p.value_classification })),
    delivery: 'feed',
  };
}

const btcPerpetual = {
  schema: 1,
  source: 'Binance USDⓈ-M Perpetual',
  venue: 'Binance',
  sourceUrl: 'https://www.binance.com/en/futures/BTCUSDT',
  apiUrl: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=1000',
  tickerUrl: 'https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT',
  symbol: 'BTCUSDT',
  unit: 'USDT',
  scope: 'Kontrak perpetual BTCUSDT Binance USDⓈ-M',
  frequency: 'rolling-24h-and-UTC-days',
};

async function liveBinanceTurnover(market, timeout = TIMEOUT) {
  const startedAt = Date.now();
  const [klines, ticker] = await Promise.all([getJson(market.apiUrl, timeout), getJson(market.tickerUrl, timeout)]);
  const points = binanceDailyPoints(klines, startedAt);
  if (!points.length || ticker.symbol !== market.symbol) throw new Error(`${market.source}: respons kosong`);
  return {
    ...market,
    asOf: points.at(-1).date,
    generatedAt: new Date().toISOString(),
    rolling: {
      volume: Number(ticker.quoteVolume),
      volumeBTC: Number(ticker.volume),
      close: Number(ticker.lastPrice),
      from: new Date(ticker.openTime).toISOString(),
      to: new Date(ticker.closeTime).toISOString(),
      trades: ticker.count,
    },
    points,
    delivery: 'feed',
  };
}

async function liveBtcPerpetual() {
  try {
    const data = await liveBinanceTurnover(btcPerpetual, 5000);
    if (Number.isFinite(data.rolling.volume) && freshTicker(data.rolling.to)) return data;
  } catch {}
  try {
    return await liveGatePerpetual();
  } catch {}
  return btcPerpetualArchive(btcPerpetual);
}

async function liveVix() {
  const csv = await getText(vix.csvUrl);
  const points = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [d, open, high, low, close] = line.split(',');
    const [m, day, y] = d.split('/');
    return { date: `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`, open: +open, high: +high, low: +low, close: +close };
  }).slice(-vix.points.length);
  return { ...vix, asOf: points.at(-1).date, generatedAt: new Date().toISOString(), points, delivery: 'feed' };
}


// Global M2 proxy = US + euro area + China + Japan, in USD trillion, with daily ECB
// FX. Month t is used from the first day of month t+2 (same assumption as the
// snapshot). China has no open history API, so its verified monthly table seeds
// the series and Trading Economics supplies the latest two months.
const csvRecords = (csv) => {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const columns = head.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((cell, i) => [columns[i], cell])));
};
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const latestUpTo = (series, month) => {
  let found = null;
  for (const [key, value] of series) if (key <= month) found = [key, value];
  return found;
};

async function chinaM2() {
  const response = await fetch('https://tradingeconomics.com/china/money-supply-m2', { cache: 'no-store', headers: BROWSER_UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`Trading Economics → HTTP ${response.status}`);
  const html = await response.text();
  // "...increased to 359628.97 CNY Billion in September from 356808.36 CNY Billion in August of 2026."
  const match = html.match(/to ([\d.]+) CNY Billion in (\w+) from ([\d.]+) CNY Billion in (\w+) of (\d{4})/);
  if (!match) throw new Error('Rilis M2 China tidak ditemukan');
  const [, latest, latestName, previous, previousName, year] = match;
  const latestIndex = MONTHS.indexOf(latestName), previousIndex = MONTHS.indexOf(previousName);
  if (latestIndex < 0 || previousIndex < 0) throw new Error('Periode M2 China tidak dikenal');
  const latestMonth = `${latestIndex < previousIndex ? Number(year) + 1 : year}-${String(latestIndex + 1).padStart(2, '0')}`;
  const previousMonth = `${year}-${String(previousIndex + 1).padStart(2, '0')}`;
  // CNY billion → 100 million yuan; keep verified seed months as they are.
  return [[previousMonth, Number(previous) * 10], [latestMonth, Number(latest) * 10]]
    .filter(([month]) => !Object.hasOwn(chinaSeed.months, month));
}

async function monthlyM2Series(key, archive, load) {
  const live = await load().then((rows) => rows.filter(([month, value]) => /^\d{4}-\d{2}$/.test(month)
    && Number.isFinite(value) && value > 0)).catch((error) => {
    console.warn(`[api/btc-m2] seri ${key} gagal, memakai arsip:`, error.message);
    return [];
  });
  const months = new Map([...Object.entries(archive), ...live].sort(([a], [b]) => a.localeCompare(b)));
  return { months, liveMonths: new Set(live.map(([month]) => month)) };
}

async function liveBtcM2() {
  const start = btcM2.points[0].date;
  const { us, ea, jp } = monthlyM2Seed.series;
  const [usM2, eaM2, jpM2, cnM2, fx] = await Promise.all([
    monthlyM2Series('AS', us.months, async () => {
      const start = Object.keys(us.months).sort()[0] + '-01';
      const { rows } = await fredObservations('M2SL', start);
      return rows.map(({ date, value }) => [date.slice(0, 7), value]);
    }),
    monthlyM2Series('euro area', ea.months, async () => {
      const csv = await getText(ea.sourceUrl);
      return csvRecords(csv).map((row) => [row.TIME_PERIOD, Number(row.OBS_VALUE)]);
    }),
    monthlyM2Series('Jepang', jp.months, async () => {
      const boj = await getJson(jp.sourceUrl);
      const values = boj.RESULTSET?.[0]?.VALUES;
      if (!values) throw new Error('Respons Bank of Japan kosong');
      return values.SURVEY_DATES.map((date, index) => [
        String(date).replace(/^(\d{4})(\d{2})$/, '$1-$2'),
        Number(values.VALUES[index]),
      ]);
    }),
    monthlyM2Series('China', chinaSeed.months, chinaM2),
    // ECB reference rates; Frankfurter serves the same series far faster than the ECB API.
    getJson(`https://api.frankfurter.dev/v1/${shiftMonth(start.slice(0, 7), -1)}-01..?from=EUR&to=USD,JPY,CNY`),
  ]);
  const monthly = { us: usM2, ea: eaM2, cn: cnM2, jp: jpM2 };
  const rates = fx.rates ?? {};
  const fxDates = Object.keys(rates).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && ['USD', 'JPY', 'CNY'].every((currency) => Number.isFinite(rates[date]?.[currency]) && rates[date][currency] > 0)).sort();
  const asOf = fxDates.at(-1);
  if (fxDates[0] > start || !asOf || asOf < btcM2.asOf) throw new Error('Riwayat kurs acuan ECB belum lengkap');

  const points = [];
  let fxIndex = 0;
  let used;
  for (let t = Date.parse(start + 'T00:00:00Z'); t <= Date.parse(asOf + 'T00:00:00Z'); t += 86400000) {
    const date = isoDate(t);
    while (fxIndex + 1 < fxDates.length && fxDates[fxIndex + 1] <= date) fxIndex++;
    const fxDate = fxDates[fxIndex];
    if (fxDate > date) continue;
    const r = rates[fxDate];
    const month = shiftMonth(date.slice(0, 7), -2);
    const available = Object.fromEntries(Object.entries(monthly).map(([key, series]) => [key, latestUpTo(series.months, month)]));
    if (Object.values(available).some((v) => !v)) continue;
    used = available;
    const value = used.us[1] / 1e3 // USD billion
      + used.ea[1] * 1e6 * r.USD / 1e12 // EUR million
      + used.cn[1] * 1e8 / (r.CNY / r.USD) / 1e12 // 100 million yuan
      + used.jp[1] * 1e8 / (r.JPY / r.USD) / 1e12; // 100 million yen
    points.push({ date, value, fxDate });
  }
  if (points.length < 2) throw new Error('Riwayat M2 belum lengkap');
  const components = Object.fromEntries(Object.entries(btcM2.components).map(([key, meta]) => {
    const referenceMonth = used[key][0];
    const live = monthly[key].liveMonths.has(referenceMonth);
    return [key, { ...meta, referenceMonth, delivery: live ? 'feed' : 'snapshot' }];
  }));
  if (components.cn.delivery === 'feed') components.cn.sourceUrl = 'https://tradingeconomics.com/china/money-supply-m2';
  const archived = Object.values(components).filter((component) => component.delivery === 'snapshot')
    .map(({ label, referenceMonth }) => `${label} ${referenceMonth}`);
  return {
    ...btcM2,
    asOf,
    generatedAt: new Date().toISOString(),
    components,
    points,
    refreshNote: archived.length ? `Kurs ECB diperbarui. Observasi M2 dari arsip: ${archived.join(', ')}.` : 'Kurs ECB dan observasi M2 bulanan diperbarui dari sumber masing-masing.',
    delivery: 'feed',
  };
}

async function loadMacroScores() {
  const inputs = await Promise.allSettled([
    macroLiquidity(loadEndpoint).then((liquidity) => ({ liquidity })),
    loadMacroGrowthInflation(),
    macroRisk(loadEndpoint, yahooDaily).then((risk) => ({ risk })),
  ]);
  const models = {};
  for (const input of inputs) {
    if (input.status === 'fulfilled') Object.assign(models, input.value);
    else console.warn('[api/macro-scores] Sumber indikator gagal:', input.reason?.message);
  }
  if (!Object.keys(models).length) throw new Error('Data makro belum tersedia');
  return macroScores(models);
}

const endpoints = {
  // 14 requests per refresh (list, summary, one per fund); shared with ETF turnover.
  'btc-etf': { snapshot: btcEtf, live: liveBtcEtf, ttl: 30 * 60e3 },
  'btc-etf-turnover': { live: async () => btcEtfTurnover(await loadEndpoint('btc-etf'), yahooChart), ttl: 30 * 60e3 },
  'btc-fear-greed': { live: async () => btcFearGreed(await loadEndpoint('btc-spot')), ttl: 5 * 60e3, fresh: true },
  'btc-m2': { snapshot: btcM2, live: liveBtcM2, ttl: 60 * 60e3 },
  'btc-spot': { snapshot: btcSpot, live: () => liveBinanceTurnover(btcSpot), ttl: 45e3, fresh: true },
  'btc-perpetual': { live: liveBtcPerpetual, ttl: 45e3, fresh: true },
  'btc-perpetual-position': { live: liveBtcPerpetualPosition, ttl: 45e3, fresh: true },
  'context-prices': { snapshot: contextPrices, live: liveContextPrices, ttl: 30e3, fresh: true },
  'commodity-stocks': { live: commodityStocks, ttl: 60e3, fresh: true },
  'macro-scores': { live: loadMacroScores, ttl: 15 * 60e3, fresh: true },
  'macro-id': {
    live: async () => {
      const tv = await tradingViewQuotes(['TVC:ID10Y', 'TVC:US10Y', 'AMEX:EIDO']).catch((error) => (console.warn('[macro-id] TradingView gagal:', error.message), null));
      if (tv?.['TVC:ID10Y'] && tv['TVC:US10Y']) return liveMacroIndicators(tv);
      const [ust10y, eido] = await Promise.all([yahooDaily('^TNX', '1mo').catch(() => null), yahooDaily('EIDO', '5d').catch(() => null)]);
      return macroIndicators({ ust10y: ust10y?.points, eido: eido?.quote });
    },
    ttl: 30e3,
    fresh: true,
  },
  'corporate-actions': { live: idxCorporateActions, ttl: 60 * 60e3 },
  'economic-calendar': { snapshot: economicCalendar },
  'fear-greed': { snapshot: fearGreed, live: liveFearGreed, ttl: 60 * 60e3 },
  // Net asing and turnover from BEI's daily stock summary (idx.id), all stocks.
  'idx-summary': { live: idxForeignSummary, ttl: 10 * 60e3 },
  'idx-turnover': { live: idxTurnover, ttl: 10 * 60e3 },
  // fresh: wait for the source once stale instead of serving the previous reading.
  'idx-live': { live: idxLive, ttl: 15e3, fresh: true },
  // IHSG candles for the custom chart (daily and 5-minute), last bar from the BEI live feed.
  'ihsg-ohlc': { live: async () => ihsgOhlc('1d', await loadEndpoint('idx-live').catch(() => null)), ttl: 15e3, fresh: true },
  'btc-ohlc': { live: () => btcOhlc('1d'), ttl: 30e3, fresh: true },
  'btc-ohlc-5m': { live: () => btcOhlc('5m'), ttl: 30e3, fresh: true },
  'ihsg-ohlc-5m': { live: async () => ihsgOhlc('5m', await loadEndpoint('idx-live').catch(() => null)), ttl: 15e3, fresh: true },
  'idx-sectors': { live: async () => idxSectors(await loadEndpoint('idx-live').catch(() => null)), ttl: 15e3, fresh: true },
  'ihsg-fear-greed': { live: async () => idxFearGreed(await loadEndpoint('idx-live').catch(() => null)), ttl: 60e3, fresh: true },
  'idx-sector-stocks': { live: async () => idxSectorStocks(await loadEndpoint('idx-live').catch(() => null)), ttl: 15e3, fresh: true },
  'eth-btc': { live: liveEthBtc, ttl: 60e3 },
  eido: { live: liveEido, ttl: 60e3 },
  'commodity-history': { live: commodityHistory, ttl: 30 * 60e3 },
  'rates-id': { live: ratesId, ttl: 5 * 60e3 },
  // Headlines for the Sentiment panel.
  'market-news': { live: marketNews, ttl: 10 * 60e3 },
  'treasury-curve': { snapshot: treasuryCurve, live: liveTreasuryCurve, ttl: 60 * 60e3 },
  'treasury-seed': { snapshot: treasurySeed, live: liveTreasurySeed, ttl: 60e3 },
  'us10y-quote': { snapshot: us10yQuote, live: liveUs10y, ttl: 60e3, fresh: true },
  'usd-idr': { live: liveUsdIdr, ttl: 30e3, fresh: true },
  vix: { snapshot: vix, live: liveVix, ttl: 15 * 60e3 },
};

export const endpointNames = Object.keys(endpoints);

const cache = new Map();
const pending = new Map();

function refresh(name, endpoint) {
  if (!pending.has(name)) {
    pending.set(name, endpoint.live()
      .then((data) => {
        cache.set(name, { at: Date.now(), data });
        return data;
      })
      .finally(() => pending.delete(name)));
  }
  return pending.get(name);
}

// Serves cached data at once and refreshes it in the background once stale;
// only the first request waits for the source.
export async function loadEndpoint(name) {
  const endpoint = endpoints[name];
  if (!endpoint) return null;
  if (!endpoint.live) return endpoint.snapshot;
  const hit = cache.get(name);
  if (hit && endpoint.fresh && Date.now() - hit.at >= endpoint.ttl) {
    try {
      return await refresh(name, endpoint);
    } catch (error) {
      console.warn(`[api/${name}] pembaruan gagal, data lama dipertahankan:`, error.message);
      return hit.data;
    }
  }
  if (hit) {
    if (Date.now() - hit.at >= endpoint.ttl) {
      after(async () => {
        if (cache.get(name) !== hit) return;
        try {
          await refresh(name, endpoint);
        } catch (error) {
          console.warn(`[api/${name}] pembaruan gagal, data lama dipertahankan:`, error.message);
        }
      });
    }
    return hit.data;
  }
  try {
    return await refresh(name, endpoint);
  } catch (error) {
    console.warn(`[api/${name}] sumber live gagal, memakai snapshot:`, error.message);
    if (endpoint.snapshot) return { ...endpoint.snapshot, delivery: 'snapshot' };
    return { schema: 1, status: 'unavailable', reason: error.message };
  }
}

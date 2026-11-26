// US spot Bitcoin ETF flows from the SoSoValue OpenAPI (free key, SOSOVALUE_API_KEY).
// The API only serves the most recent month, so live rows are merged into the
// stored history: the dated snapshot (Farside, since Apr 2026) plus every day
// fetched before, kept on disk while the cache is available.
// Flows settle T+1: today's row exists with null flows and is skipped.
import { readFile } from 'node:fs/promises';
import snapshot from '@/data/btc-etf.json';
import { marketCachePath, writeMarketCache } from '@/lib/market-cache';

const BASE = 'https://openapi.sosovalue.com/openapi/v1';
const SOSO_PAGE = 'https://sosovalue.com/assets/etf/us-btc-spot';
const STORE = marketCachePath('btc-etf.json');
const TIMEOUT = 15000;
const DAY = 86_400_000;
const NEW_YORK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
const NEW_YORK_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

async function soso(route) {
  const key = process.env.SOSOVALUE_API_KEY;
  if (!key) throw new Error('SOSOVALUE_API_KEY belum dikonfigurasi');
  const response = await fetch(BASE + route, { cache: 'no-store', headers: { 'x-soso-api-key': key }, signal: AbortSignal.timeout(TIMEOUT) });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.code !== 0) throw new Error(`SoSoValue ${route} → HTTP ${response.status} ${json?.message ?? ''}`.trim());
  return json.data;
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(STORE, 'utf8'));
    if (Array.isArray(store?.points)) return store;
  } catch {
    // Use the bundled snapshot when the cache is missing or unreadable.
  }
  return { points: [] };
}

function num(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function latestTurnoverSession(byFund, funds, settledDate) {
  const newestDates = new Set([...byFund.values()].flatMap((history) => [...history.keys()]));
  for (const date of [...newestDates].filter((day) => day > settledDate).sort().reverse()) {
    const traded = funds.map((fund) => num(byFund.get(fund)?.get(date)?.value_traded));
    if (!traded.length || traded.some((value) => value === null || value < 0)) continue;
    const volume = traded.reduce((total, value) => total + value, 0);
    if (volume <= 0) continue;
    return {
      date, volume, net: null, assets: null, provisional: true, coverage: funds.length,
      byFund: Object.fromEntries(funds.map((fund, index) => [fund, traded[index]])),
    };
  }
  return null;
}

export async function liveBtcEtf() {
  const [list, summary] = await Promise.all([
    soso('/etfs?symbol=BTC&country_code=US'),
    soso('/etfs/summary-history?symbol=BTC&country_code=US&limit=300'),
  ]);
  const tickers = [...new Set(list.map((f) => f.ticker).filter((ticker) => /^[A-Z0-9]{1,8}$/.test(ticker)))];
  const histories = await Promise.all(tickers.map((ticker) => soso(`/etfs/${ticker}/history`).catch(() => [])));
  const byFund = new Map(tickers.map((ticker, i) => [ticker, new Map(histories[i].map((row) => [row.date, row]))]));
  // Keep the snapshot's column order; funds new to the list go at the end.
  const funds = [...snapshot.funds.filter((f) => tickers.includes(f)), ...tickers.filter((t) => !snapshot.funds.includes(t))];

  const live = summary
    .filter((row) => num(row.total_net_inflow) !== null)
    .map((row) => ({
      date: row.date,
      net: num(row.total_net_inflow),
      funds: Object.fromEntries(funds.map((fund) => [fund, num(byFund.get(fund)?.get(row.date)?.net_inflow)])),
      traded: num(row.total_value_traded),
      tradedFunds: Object.fromEntries(funds.map((fund) => [fund, num(byFund.get(fund)?.get(row.date)?.value_traded)])),
      assets: num(row.total_net_assets),
      cumulative: num(row.cum_net_inflow),
    }));
  if (!live.length) throw new Error('SoSoValue tidak mengembalikan hari yang sudah settle');

  const store = await readStore();
  const merged = new Map([...snapshot.points, ...store.points].map((point) => [point.date, point]));
  for (const point of live) {
    const previous = merged.get(point.date);
    if (previous) {
      for (const fund of funds) {
        point.funds[fund] ??= previous.funds?.[fund] ?? null;
        point.tradedFunds[fund] ??= previous.tradedFunds?.[fund] ?? null;
      }
      point.traded ??= previous.traded ?? null;
    }
    merged.set(point.date, point);
  }
  const points = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  await writeMarketCache(STORE, { points }).catch((error) => console.warn('[btc-etf] cache disk gagal ditulis:', error.message));
  const asOf = points.at(-1).date;

  return {
    ...snapshot,
    source: 'SoSoValue',
    sourceUrl: SOSO_PAGE,
    funds,
    asOf,
    generatedAt: new Date().toISOString(),
    accessNote: 'Bulan terakhir dari SoSoValue OpenAPI (settle T+1); riwayat sebelumnya dari snapshot Farside.',
    points,
    latestTurnoverSession: latestTurnoverSession(byFund, funds, asOf),
    delivery: 'feed',
  };
}

function turnoverFeed({ points, funds, source, sourceUrl, estimate, delivery, flowSource, latestSession = null }) {
  return {
    schema: 1, unit: 'USD', source, sourceUrl, estimate, delivery, flowSource, funds,
    asOf: points.at(-1).date,
    points, latestSession,
  };
}

function actualTurnover(flowRows, funds) {
  return flowRows.filter((row) => Number.isFinite(row.traded) && row.traded > 0).map((row) => {
    const byFund = row.tradedFunds ?? null;
    const coverage = byFund ? funds.filter((fund) => Number.isFinite(byFund[fund])).length : null;
    return { date: row.date, volume: row.traded, net: row.net, assets: row.assets ?? null, byFund, coverage };
  });
}

async function estimatedTurnover(yahooChart, funds, now, flowRows) {
  const today = NEW_YORK.format(now);
  const finished = NEW_YORK_TIME.format(now) >= '16:15';
  const days = new Map();
  const histories = await Promise.allSettled(funds.map((fund) => yahooChart(fund, '1y', '1d')));
  for (const [index, result] of histories.entries()) {
    if (result.status !== 'fulfilled' || result.value.meta.currency !== 'USD') continue;
    const fund = funds[index];
    for (const row of result.value.rows) {
      if (!(Number.isFinite(row.volume) && row.volume >= 0 && row.close > 0)) continue;
      const date = NEW_YORK.format(row.t);
      if (date > today || (date === today && !finished)) continue;
      if (!days.has(date)) days.set(date, {});
      days.get(date)[fund] = Math.round(row.close * row.volume);
    }
  }
  const flows = new Map(flowRows.map((row) => [row.date, row]));
  return [...days.keys()].sort().flatMap((date) => {
    const byFund = days.get(date);
    const coverage = Object.keys(byFund).length;
    if (coverage !== funds.length) return [];
    const volume = Object.values(byFund).reduce((sum, value) => sum + value, 0);
    const flow = flows.get(date);
    return [{ date, volume, byFund, coverage, net: flow?.net ?? null, assets: flow?.assets ?? null }];
  });
}

export async function btcEtfTurnover(feed, yahooChart) {
  const now = Date.now();
  const funds = feed?.funds?.length ? feed.funds : snapshot.funds;
  const flowRows = feed?.delivery === 'feed' ? feed.points : (await readStore()).points;
  const history = flowRows?.length ? flowRows : snapshot.points;
  const actual = actualTurnover(history, funds);
  const actualFeed = () => turnoverFeed({
    points: actual, funds, source: 'SoSoValue', sourceUrl: SOSO_PAGE, estimate: false,
    delivery: feed?.delivery === 'feed' ? 'feed' : 'archive', flowSource: 'SoSoValue',
    latestSession: feed?.latestTurnoverSession,
  });
  // A week's allowance covers the normal T+1 publication lag and US market holidays.
  if (actual.length && Date.parse(actual.at(-1).date) >= now - 7 * DAY) return actualFeed();
  const estimated = await estimatedTurnover(yahooChart, funds, now, history);
  if (estimated.length && (!actual.length || estimated.at(-1).date > actual.at(-1).date)) {
    return turnoverFeed({
      points: estimated, funds, source: 'Yahoo Finance', sourceUrl: 'https://finance.yahoo.com/quote/IBIT/history/',
      estimate: true, delivery: 'feed', flowSource: history === snapshot.points ? snapshot.source : 'SoSoValue',
    });
  }
  if (actual.length) return actualFeed();
  throw new Error('Nilai transaksi ETF spot Bitcoin AS belum tersedia');
}

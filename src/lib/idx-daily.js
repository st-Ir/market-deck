// Daily market totals from BEI's own stock summary and index summary (idx.id):
// - turnover = Σ (Value + NonRegularValue), the official definition;
// - foreign net in rupiah is estimated: BEI publishes foreign buy/sell as share
//   volumes, so each stock's net volume is valued at its regular-market VWAP.
//   On 12 Nov 2026 this gave +508.9 bn vs +510.5 bn reported for the regular market.
// Sessions are cached on disk; only missing days and today's session are fetched.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUMMARY_URL = 'https://idx.id/primary/TradingSummary/GetStockSummary?length=9999&start=0&date=';
const INDEX_URL = 'https://idx.id/primary/TradingSummary/GetIndexSummary?length=9999&start=0&date=';
export const SECTORS = {
  IDXENERGY: 'Energi', IDXBASIC: 'Barang baku', IDXINDUST: 'Perindustrian', IDXNONCYC: 'Konsumen primer',
  IDXCYCLIC: 'Konsumen non-primer', IDXHEALTH: 'Kesehatan', IDXFINANCE: 'Keuangan', IDXPROPERT: 'Properti & real estat',
  IDXTECHNO: 'Teknologi', IDXINFRA: 'Infrastruktur', IDXTRANS: 'Transportasi & logistik',
};
const INDEX_CODES = ['COMPOSITE', 'LQ45', ...Object.keys(SECTORS)];
export const SOURCE_PAGE = 'https://idx.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/';
const STORE = path.join(process.cwd(), '.cache', 'idx-daily.json');
const HISTORY_DAYS = 190; // calendar days (~125 sessions): MA, percentile and spike context
const CLOSE_HOUR_WIB = 16;
const CONCURRENCY = 4;
// Bump when summarize() gains fields; stored sessions of an older version are fetched again.
const DAY_VERSION = 2;

const wib = (ms = Date.now()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const isWeekday = (date) => ![0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay());

async function readStore() {
  try {
    return JSON.parse(await readFile(STORE, 'utf8'));
  } catch {
    return { days: {} };
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE), { recursive: true });
  await writeFile(STORE, JSON.stringify(store));
}

function summarize(date, rows) {
  let foreignBuy = 0, foreignSell = 0, regularValue = 0, nonRegularValue = 0, frequency = 0;
  let advancers = 0, decliners = 0, unchanged = 0;
  const flows = [], values = [];
  for (const r of rows) {
    const vwap = r.Volume ? r.Value / r.Volume : r.Close;
    const buy = r.ForeignBuy * vwap, sell = r.ForeignSell * vwap;
    foreignBuy += buy;
    foreignSell += sell;
    regularValue += r.Value;
    nonRegularValue += r.NonRegularValue;
    frequency += r.Frequency;
    if (buy || sell) flows.push([r.StockCode, Math.round(buy - sell)]);
    if (r.Value + r.NonRegularValue > 0) values.push([r.StockCode, Math.round(r.Value + r.NonRegularValue), Math.round(r.NonRegularValue)]);
    // Breadth counts stocks that traded in the regular market.
    if (r.Frequency > 0) {
      if (r.Change > 0) advancers++;
      else if (r.Change < 0) decliners++;
      else unchanged++;
    }
  }
  flows.sort((a, b) => b[1] - a[1]);
  values.sort((a, b) => b[1] - a[1]);
  return {
    date,
    foreignBuy,
    foreignSell,
    netForeign: foreignBuy - foreignSell,
    totalValue: regularValue + nonRegularValue,
    regularValue,
    nonRegularValue,
    frequency,
    advancers,
    decliners,
    unchanged,
    stocks: rows.length,
    version: DAY_VERSION,
    // [code, estimated net rupiah] for the 15 largest foreign net buys and sells.
    topBuy: flows.slice(0, 15),
    topSell: flows.slice(-15).reverse(),
    // [code, total value, negotiated value] for the stocks driving turnover.
    topValue: values.slice(0, 5),
  };
}

async function rowsFor(url, date) {
  const response = await fetch(url + date.replaceAll('-', ''), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`BEI HTTP ${response.status}`);
  const json = await response.json();
  return (json.data || []).filter((r) => r.Date?.slice(0, 10) === date);
}

// IHSG, LQ45 and the eleven IDX-IC sector indices for one session.
async function fetchIndices(date) {
  const rows = await rowsFor(INDEX_URL, date);
  const wanted = rows.filter((r) => INDEX_CODES.includes(r.IndexCode));
  return wanted.length ? Object.fromEntries(wanted.map((r) => [r.IndexCode, { close: r.Close, previous: r.Previous, value: r.Value }])) : null;
}

async function fetchDay(date) {
  const [rows, indices] = await Promise.all([rowsFor(SUMMARY_URL, date), fetchIndices(date)]);
  return rows.length ? { ...summarize(date, rows), indices } : null;
}

let syncing = null;

async function sync() {
  const store = await readStore();
  const now = wib();
  const wanted = [];
  for (let date = now.date; date >= addDays(now.date, -HISTORY_DAYS); date = addDays(date, -1)) {
    if (!isWeekday(date) || (date === now.date && now.hour < CLOSE_HOUR_WIB)) continue;
    const day = store.days[date];
    // Today's summary may not be out yet right after the close: keep checking it.
    if (!day || (date === now.date && day.closed) || (!day.closed && day.version !== DAY_VERSION)) wanted.push(date);
  }
  let changed = false;
  // Sessions stored before index data was collected only need the indices.
  const indexless = Object.values(store.days).filter((d) => !d.closed && !d.indices && !wanted.includes(d.date)).map((d) => d.date);
  for (let i = 0; i < indexless.length; i += CONCURRENCY) {
    const batch = indexless.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchIndices));
    results.forEach((result, k) => {
      if (result.status === 'fulfilled' && result.value) {
        store.days[batch[k]].indices = result.value;
        changed = true;
      }
    });
  }
  for (let i = 0; i < wanted.length; i += CONCURRENCY) {
    const batch = wanted.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchDay));
    results.forEach((result, k) => {
      if (result.status === 'rejected') {
        console.warn('[idx-daily]', batch[k], result.reason.message);
        return;
      }
      store.days[batch[k]] = result.value ?? { date: batch[k], closed: true };
      changed = true;
    });
  }
  if (changed) await writeStore(store);
  return store;
}

async function sessions() {
  syncing ??= sync().finally(() => { syncing = null; });
  const store = await syncing;
  const days = Object.values(store.days).filter((d) => !d.closed).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) throw new Error('ringkasan saham BEI belum tersedia');
  return days;
}

// Same shape as the BEI investor archive, so the card, Harian/Mingguan, Δ20H
// and the history dialog work unchanged.
export async function idxForeignSummary() {
  const days = await sessions();
  return {
    schema: 1,
    market: 'ihsg',
    source: 'Bursa Efek Indonesia',
    method: 'estimate',
    sourceUrl: SOURCE_PAGE,
    scope: `Seluruh saham (${days.at(-1).stocks}) · pasar reguler · rupiah diestimasi dari volume asing × VWAP`,
    unit: 'IDR',
    asOf: days.at(-1).date,
    generatedAt: new Date().toISOString(),
    points: days.map((d) => ({
      date: d.date,
      foreignBuy: d.foreignBuy,
      foreignSell: d.foreignSell,
      netForeign: d.netForeign,
      totalValue: d.totalValue,
      regularValue: d.regularValue,
      stocks: d.stocks,
      topBuy: d.topBuy,
      topSell: d.topSell,
      ihsg: d.indices?.COMPOSITE ? { close: d.indices.COMPOSITE.close, previous: d.indices.COMPOSITE.previous } : null,
    })),
    delivery: 'feed',
  };
}

export async function idxTurnover() {
  const days = await sessions();
  return {
    schema: 1,
    market: 'ihsg',
    source: 'Bursa Efek Indonesia',
    sourceUrl: SOURCE_PAGE,
    scope: 'Saham · reguler + nonreguler',
    unit: 'IDR',
    frequency: 'daily-close',
    asOf: days.at(-1).date,
    generatedAt: new Date().toISOString(),
    missingDates: [],
    points: days.map((d) => ({
      date: d.date,
      totalValue: d.totalValue,
      regularValue: d.regularValue,
      nonRegularValue: d.nonRegularValue ?? d.totalValue - d.regularValue,
      frequency: d.frequency ?? null,
      foreignBuy: d.foreignBuy,
      foreignSell: d.foreignSell,
      advancers: d.advancers ?? null,
      decliners: d.decliners ?? null,
      unchanged: d.unchanged ?? null,
      ihsg: d.indices?.COMPOSITE ? { close: d.indices.COMPOSITE.close, previous: d.indices.COMPOSITE.previous } : null,
      topValue: d.topValue ?? [],
      method: 'stock-summary',
    })),
    delivery: 'feed',
  };
}

const change = (now, then) => (Number.isFinite(now) && Number.isFinite(then) && then ? (now / then - 1) * 100 : null);

// Sector rotation: each IDX-IC sector's move over 1, 5 and 20 sessions, its share
// of market turnover, and the same figures for IHSG and LQ45 as benchmarks.
// live: idxLive() result; during a session newer than the last summary its index
// levels stand in for today and the changes are measured against stored closes.
export async function idxSectors(live) {
  const days = (await sessions()).filter((d) => d.indices);
  if (!days.length) throw new Error('ringkasan indeks BEI belum tersedia');
  const last = days.at(-1);
  const intraday = live && live.date > last.date ? live : null;
  // Close N sessions before the latest reading (today's live level or the last summary).
  const closeAt = (code, back) => days.at((intraday ? 0 : -1) - back)?.indices?.[code]?.close;
  const row = (code, name) => {
    const today = intraday?.indices[code] ? { close: intraday.indices[code].current, previous: intraday.indices[code].previous, value: last.indices[code]?.value } : last.indices[code];
    if (!today) return null;
    return {
      code,
      name,
      close: today.close,
      change1: change(today.close, today.previous),
      change5: change(today.close, closeAt(code, 5)),
      change20: change(today.close, closeAt(code, 20)),
      valueShare: last.indices.COMPOSITE?.value ? today.value / last.indices.COMPOSITE.value * 100 : null,
      history: days.slice(-21).map((d) => d.indices?.[code]?.close ?? null),
    };
  };
  return {
    schema: 1,
    source: 'Bursa Efek Indonesia',
    sourceUrl: 'https://idx.id/id/data-pasar/ringkasan-perdagangan/ringkasan-indeks/',
    asOf: intraday ? intraday.date : last.date,
    liveTime: intraday ? intraday.time : null,
    sessions: days.length,
    generatedAt: new Date().toISOString(),
    benchmarks: [row('COMPOSITE', 'IHSG'), row('LQ45', 'LQ45')].filter(Boolean),
    sectors: Object.entries(SECTORS).map(([code, name]) => row(code, name)).filter(Boolean),
    delivery: 'feed',
  };
}

// The benchmark uses completed sessions. The indicative intraday reading uses
// only components observed on its date, and compares the previous close on the
// same set of components.
const FG_LOOKBACK = 60;
const FG_MIN_READINGS = 20;
const FG_INDICATORS = {
  momentum: { label: 'Momentum', description: 'Jarak IHSG dari rata-rata 50 sesi', unit: '%' },
  breadth: { label: 'Breadth', description: 'Porsi saham naik dari saham yang bergerak selama 10 sesi', unit: '%' },
  foreign: { label: 'Net asing', description: 'Estimasi net asing dibagi nilai transaksi reguler selama 5 sesi', unit: '%' },
  volatility: { label: 'Volatilitas', description: 'Simpangan baku perubahan harian IHSG selama 20 sesi. Skor dibalik.', unit: '%' },
};
const FG_LABELS = Object.fromEntries(Object.entries(FG_INDICATORS).map(([key, indicator]) => [key, indicator.label]));
const FG_KEYS = Object.keys(FG_INDICATORS);
const fgLabel = (v) => (v <= 25 ? 'Extreme fear' : v < 45 ? 'Fear' : v <= 55 ? 'Netral' : v < 75 ? 'Greed' : 'Extreme greed');
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const positive = (value) => Number.isFinite(value) && value > 0;
const breadthAvailable = (day) => Number.isFinite(day.advancers) && Number.isFinite(day.decliners)
  && day.advancers >= 0 && day.decliners >= 0;

export function calculateIdxFearGreed(summaries, live, now = Date.now()) {
  const days = summaries.filter((day) => positive(day.indices?.COMPOSITE?.close)).map((day) => ({
    date: day.date, close: day.indices.COMPOSITE.close, previous: day.indices.COMPOSITE.previous,
    advancers: day.advancers, decliners: day.decliners, netForeign: day.netForeign, regularValue: day.regularValue,
  }));
  const ihsg = live?.indices?.COMPOSITE;
  if (live && live.date === wib(now).date && isWeekday(live.date) && live.date > days.at(-1)?.date
    && /^\d{2}:\d{2}$/.test(live.time) && live.time >= '09:00' && positive(ihsg?.current)
    && live.turnover && breadthAvailable(live.turnover) && live.turnover.advancers + live.turnover.decliners > 0) {
    days.push({
      date: live.date, close: ihsg.current, previous: ihsg.previous,
      advancers: live.turnover.advancers, decliners: live.turnover.decliners, live: live.time,
    });
  }
  const metrics = days.map((day, i) => {
    const closes = days.slice(Math.max(0, i - 49), i + 1).map((row) => row.close);
    const breadth = days.slice(Math.max(0, i - 9), i + 1).filter(breadthAvailable);
    const flows = days.slice(Math.max(0, i - 4), i + 1)
      .filter((row) => Number.isFinite(row.netForeign) && positive(row.regularValue));
    const returns = days.slice(Math.max(0, i - 19), i + 1)
      .filter((row) => positive(row.previous)).map((row) => Math.log(row.close / row.previous) * 100);
    const advancers = breadth.reduce((sum, row) => sum + row.advancers, 0);
    const movers = breadth.reduce((sum, row) => sum + row.advancers + row.decliners, 0);
    const net = flows.reduce((sum, row) => sum + row.netForeign, 0);
    const turnover = flows.reduce((sum, row) => sum + row.regularValue, 0);
    const returnAverage = returns.length === 20 ? mean(returns) : null;
    return {
      momentum: closes.length === 50 ? (day.close / mean(closes) - 1) * 100 : null,
      breadth: breadth.length === 10 && movers > 0 ? advancers / movers * 100 : null,
      foreign: flows.length === 5 ? net / turnover * 100 : null,
      volatility: returnAverage !== null ? Math.sqrt(mean(returns.map((value) => (value - returnAverage) ** 2))) : null,
    };
  });
  const rank = (key, i) => {
    const value = metrics[i]?.[key];
    if (!Number.isFinite(value)) return null;
    const past = metrics.slice(Math.max(0, i - FG_LOOKBACK), i).map((row) => row[key]).filter(Number.isFinite);
    if (past.length < FG_MIN_READINGS) return null;
    const percentile = past.reduce((sum, sample) => sum + (sample < value ? 1 : sample === value ? 0.5 : 0), 0) / past.length * 100;
    return Math.round(key === 'volatility' ? 100 - percentile : percentile);
  };
  const points = [];
  for (let i = days.length - 1; i >= 0 && points.length < 2; i--) {
    const components = Object.fromEntries(FG_KEYS.map((key) => [key, rank(key, i)]));
    const present = FG_KEYS.filter((key) => components[key] !== null);
    if (present.length < 3) continue;
    const value = Math.round(mean(present.map((key) => components[key])));
    const previous = present.map((key) => rank(key, i - 1));
    const comparable = previous.every(Number.isFinite);
    points.push({
      date: days[i].date,
      value,
      classification: fgLabel(value),
      components,
      raw: metrics[i],
      componentCount: present.length,
      missingComponents: FG_KEYS.filter((key) => components[key] === null),
      change: comparable ? value - Math.round(mean(previous)) : null,
      comparedDate: comparable ? days[i - 1].date : null,
      basis: days[i].live ? 'intraday' : 'close',
      live: days[i].live ?? null,
    });
  }
  if (!points.length) throw new Error('riwayat BEI belum cukup untuk Fear & Greed IHSG');
  return {
    schema: 1,
    market: 'ihsg',
    source: 'Bursa Efek Indonesia',
    sourceUrl: SOURCE_PAGE,
    scope: 'IHSG',
    method: 'Rata-rata skor indikator dengan bobot sama. Setiap indikator dibandingkan dengan hingga 60 sesi penutupan sebelumnya (minimal 20 pembanding). Skor intraday bersifat indikatif dan memakai data yang sudah tersedia. Perubahan skor dibandingkan pada indikator yang sama.',
    labels: FG_LABELS,
    indicators: FG_INDICATORS,
    sessions: days.length - (days.at(-1)?.live ? 1 : 0),
    asOf: points[0].date,
    generatedAt: new Date(now).toISOString(),
    points,
    delivery: 'feed',
  };
}

export async function idxFearGreed(live) {
  return calculateIdxFearGreed(await sessions(), live);
}

// Every stock of one IDX-IC sector with its price move, for the sector heatmap.
// Sector membership comes from BEI company profiles (field Sektor, refreshed
// daily); prices from the live top-value feed (all traded stocks) during and after
// the session, or the last stock summary before the open.
const PROFILES_URL = 'https://idx.id/primary/ListedCompany/GetCompanyProfiles?emitenType=s&start=0&length=9999';
const TOP_VALUE_URL = 'https://idx.id/primary/Home/GetTopValue?resultCount=2000';
const SECTOR_BY_NAME = {
  'Energi': 'IDXENERGY', 'Barang Baku': 'IDXBASIC', 'Perindustrian': 'IDXINDUST', 'Barang Konsumen Primer': 'IDXNONCYC',
  'Barang Konsumen Non-Primer': 'IDXCYCLIC', 'Kesehatan': 'IDXHEALTH', 'Keuangan': 'IDXFINANCE', 'Properti & Real Estat': 'IDXPROPERT',
  'Teknologi': 'IDXTECHNO', 'Infrastruktur': 'IDXINFRA', 'Transportasi & Logistik': 'IDXTRANS',
};
let profiles = null;

async function companyProfiles() {
  if (profiles && Date.now() - profiles.at < 24 * 3600e3) return profiles.map;
  const response = await fetch(PROFILES_URL, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`BEI profil HTTP ${response.status}`);
  const map = new Map((await response.json()).data.map((p) => [p.KodeEmiten, { name: p.NamaEmiten, sector: SECTOR_BY_NAME[p.Sektor] ?? null, subSector: p.SubSektor || null }]));
  profiles = { at: Date.now(), map };
  return map;
}

export async function idxSectorStocks(live) {
  const map = await companyProfiles();
  let quotes = [], asOf = null, liveTime = null;
  try {
    const response = await fetch(TOP_VALUE_URL, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.ok) quotes = (await response.json()).filter((s) => s.Frequency > 0).map((s) => ({ code: s.Code, price: s.Price, change: s.Percent, value: s.Value }));
  } catch {}
  if (quotes.length >= 50 && live) {
    asOf = live.date;
    liveTime = live.time;
  } else {
    const last = (await sessions()).at(-1);
    quotes = (await rowsFor(SUMMARY_URL, last.date)).filter((r) => r.Frequency > 0).map((r) => ({ code: r.StockCode, price: r.Close, change: r.Previous ? (r.Close / r.Previous - 1) * 100 : 0, value: r.Value }));
    asOf = last.date;
  }
  const sectors = Object.fromEntries(Object.keys(SECTORS).map((code) => [code, []]));
  for (const q of quotes) {
    const profile = map.get(q.code);
    if (!profile?.sector) continue;
    sectors[profile.sector].push([q.code, profile.name, profile.subSector, q.price, Math.round(q.change * 100) / 100, Math.round(q.value)]);
  }
  for (const list of Object.values(sectors)) list.sort((a, b) => Math.abs(b[4]) - Math.abs(a[4]) || b[5] - a[5]);
  return {
    schema: 1,
    source: 'Bursa Efek Indonesia',
    sourceUrl: SOURCE_PAGE,
    asOf,
    liveTime,
    generatedAt: new Date().toISOString(),
    // [code, name, sub-sector, price, % change, value] sorted by |change|.
    fields: ['code', 'name', 'subSector', 'price', 'change', 'value'],
    sectors,
    delivery: 'feed',
  };
}


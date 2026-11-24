import { inflateRawSync } from 'node:zlib';

const DAY = 86_400_000;
const GATE_FUTURES_API = 'https://api.gateio.ws/api/v4/futures/usdt';
const GATE_CONTRACT = 'BTC_USDT';
const GATE_TIMEOUT = 5000;
const MAX_TICKER_AGE = 5 * 60_000;
const ARCHIVE_URL = 'https://data.binance.vision/data/futures/um';
const ARCHIVE_SOURCE = 'https://data.binance.vision/?prefix=data/futures/um/daily/klines/BTCUSDT/1d/';
const ARCHIVE_TTL = 15 * 60_000;
const MAX_ARCHIVE_FILES = 96;
const archiveFiles = new Map();
let archiveCache;

export function binanceDailyPoints(klines, before) {
  const days = new Map();
  for (const candle of klines) {
    const time = Number(candle[0]);
    if (!Number.isSafeInteger(time) || time <= 0 || time % DAY !== 0 || time + DAY > before) continue;
    const close = Number(candle[4]);
    const volumeBTC = Number(candle[5]);
    const volume = Number(candle[7]);
    const trades = Number(candle[8]);
    const buy = Number(candle[10]);
    if (![close, volumeBTC, volume, buy].every(Number.isFinite) || close <= 0 || volumeBTC < 0 || buy < 0 || buy > volume || !Number.isSafeInteger(trades) || trades < 0) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    const sell = volume - buy;
    days.set(date, { date, close, volumeBTC, volume, buy, sell, net: buy - sell, trades });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function freshTicker(to, now = Date.now()) {
  return Math.abs(now - Date.parse(to)) <= MAX_TICKER_AGE;
}

async function gateMarketData(path) {
  const response = await fetch(GATE_FUTURES_API + path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(GATE_TIMEOUT),
  });
  if (!response.ok) throw new Error(`Gate perpetual HTTP ${response.status}`);
  return { data: await response.json(), observedAt: response.headers.get('date') };
}

function gateDailyPoints(candles, before) {
  const days = new Map();
  for (const candle of candles) {
    const time = Number(candle?.t) * 1000;
    if (!Number.isSafeInteger(time) || time <= 0 || time % DAY !== 0 || time + DAY > before) continue;
    const volume = Number(candle.sum);
    const close = Number(candle.c);
    if (candle.sum == null || candle.sum === '' || !Number.isFinite(volume) || volume < 0 || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    days.set(date, { date, close, volume, volumeBTC: null, buy: null, sell: null, net: null, trades: null });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function liveGatePerpetual() {
  const startedAt = Date.now();
  const apiPath = '/candlesticks?contract=' + GATE_CONTRACT + '&interval=1d&limit=251';
  const tickerPath = '/tickers?contract=' + GATE_CONTRACT;
  const [{ data: candles }, { data: tickers, observedAt }] = await Promise.all([
    gateMarketData(apiPath),
    gateMarketData(tickerPath),
  ]);
  const points = gateDailyPoints(candles, startedAt);
  const ticker = tickers.find((item) => item?.contract === GATE_CONTRACT);
  const volume = Number(ticker?.volume_24h_quote);
  const volumeBTC = Number(ticker?.volume_24h_base);
  const close = Number(ticker?.last);
  if (!points.length || !freshTicker(observedAt) || ticker?.volume_24h_quote == null
    || ticker.volume_24h_quote === '' || !Number.isFinite(volume) || volume < 0
    || !Number.isFinite(close) || close <= 0) {
    throw new Error('Gate perpetual: data belum tersedia');
  }

  // Gate REST publishes a rolling ticker without an event timestamp. Record
  // the server's response time as the time at which the ticker was observed.
  const end = Date.parse(observedAt);
  return {
    schema: 1,
    source: 'Gate Perpetual',
    venue: 'Gate',
    sourceUrl: 'https://www.gate.com/docs/developers/apiv4/en/futures/#get-all-futures-trading-statistics',
    apiUrl: GATE_FUTURES_API + apiPath,
    tickerUrl: GATE_FUTURES_API + tickerPath,
    symbol: GATE_CONTRACT,
    unit: 'USDT',
    scope: 'Kontrak perpetual BTC/USDT Gate',
    frequency: 'rolling-24h-and-UTC-days',
    asOf: points.at(-1).date,
    generatedAt: new Date().toISOString(),
    rolling: {
      volume,
      volumeBTC: ticker.volume_24h_base && Number.isFinite(volumeBTC) && volumeBTC >= 0 ? volumeBTC : null,
      close,
      from: new Date(end - DAY).toISOString(),
      to: new Date(end).toISOString(),
      trades: null,
      timeSource: 'http-date',
    },
    points,
    delivery: 'feed',
  };
}

function archiveCsv(zip) {
  // Binance publishes one deflated CSV with its size in the local ZIP header.
  if (zip.length < 30 || zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt16LE(6) !== 0 || zip.readUInt16LE(8) !== 8) {
    throw new Error('Format arsip Binance tidak didukung');
  }
  const start = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  const end = start + zip.readUInt32LE(18);
  if (end > zip.length) throw new Error('Arsip Binance tidak lengkap');
  return inflateRawSync(zip.subarray(start, end), { maxOutputLength: 100_000 }).toString('utf8');
}

async function archiveKlines(period, date) {
  const key = `${period}/${date}`;
  if (archiveFiles.has(key)) return archiveFiles.get(key);
  const url = `${ARCHIVE_URL}/${period}/klines/BTCUSDT/1d/BTCUSDT-1d-${date}.zip`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Arsip Binance HTTP ${response.status}`);
  const csv = archiveCsv(Buffer.from(await response.arrayBuffer()));
  const rows = csv.trim().split(/\r?\n/).map((line) => line.split(','));
  if (archiveFiles.size >= MAX_ARCHIVE_FILES) archiveFiles.delete(archiveFiles.keys().next().value);
  archiveFiles.set(key, rows);
  return rows;
}

async function readArchives(period, dates) {
  const rows = [];
  for (let i = 0; i < dates.length; i += 8) {
    const batch = await Promise.allSettled(dates.slice(i, i + 8).map((date) => archiveKlines(period, date)));
    for (const result of batch) if (result.status === 'fulfilled') rows.push(...result.value);
  }
  return rows;
}

export async function btcPerpetualArchive(market) {
  const now = new Date();
  if (archiveCache && now - archiveCache.at < ARCHIVE_TTL) return archiveCache.data;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const previousMonth = Date.UTC(year, month - 1, 1);
  // Eight months cover the 180-day chart plus the longest 60-day comparison.
  const months = Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(year, month - 8 + i, 1)).toISOString().slice(0, 7));
  const monthly = await readArchives('monthly', months);
  const monthlyEnd = Date.parse(binanceDailyPoints(monthly, now).at(-1)?.date);
  const dailyStart = Number.isFinite(monthlyEnd) ? Math.max(monthlyEnd + DAY, previousMonth) : previousMonth;
  const dates = [];
  for (let time = dailyStart; time + DAY <= now; time += DAY) dates.push(new Date(time).toISOString().slice(0, 10));
  const daily = await readArchives('daily', dates);
  const points = binanceDailyPoints([...monthly, ...daily], now);
  if (!points.length) throw new Error('Arsip Binance perpetual belum tersedia');
  const asOf = points.at(-1).date;
  const data = { ...market, sourceUrl: ARCHIVE_SOURCE, asOf, generatedAt: now.toISOString(), rolling: null, points, delivery: 'archive' };
  if (archiveCache?.data.asOf > asOf) return archiveCache.data;
  archiveCache = { at: now, data };
  return data;
}

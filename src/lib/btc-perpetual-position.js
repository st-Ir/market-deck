const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_AGE = 4 * MINUTE;
const FUNDING_LOOKBACK = 7 * DAY;
const FUNDING_LIMIT = 200;
const FUNDING_HISTORY_TIMEOUT = 2500;
const BINANCE = 'https://fapi.binance.com';
const GATE = 'https://api.gateio.ws/api/v4/futures/usdt';
const BINANCE_SYMBOL = 'BTCUSDT';
const GATE_SYMBOL = 'BTC_USDT';
const GATE_DECIMAL_SIZE = { 'X-Gate-Size-Decimal': '1' };

const iso = (time) => new Date(time).toISOString();
const number = (value) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const validValue = (value) => Number.isFinite(value) && value >= 0;
const fresh = (time, now = Date.now()) => Number.isFinite(time) && time <= now + MINUTE && time >= now - MAX_AGE;

async function readMarket(url, headers, timeout = 5000) {
  const response = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Statistik perpetual HTTP ${response.status}`);
  return { data: await response.json(), time: Date.parse(response.headers.get('date')) };
}

async function readOptional(url, headers, timeout) {
  return readMarket(url, headers, timeout).then(({ data }) => data).catch(() => null);
}

function fundingPoints(rows, asOf, timeOf, rateOf) {
  const byTime = new Map();
  for (const row of rows) {
    const time = timeOf(row);
    const rate = number(rateOf(row));
    if (!Number.isFinite(time) || time < asOf - FUNDING_LOOKBACK || time > asOf || rate === null) continue;
    const ratePercent = rate * 100;
    if (Number.isFinite(ratePercent)) byTime.set(time, ratePercent);
  }
  return [...byTime].sort(([a], [b]) => a - b).map(([time, ratePercent]) => ({ time: iso(time), ratePercent }));
}

function openInterest(current, previousRows, chartRows, tolerance) {
  if (!fresh(current?.time) || !validValue(current.value)) return null;
  const target = current.time - DAY;
  const previous = previousRows.filter(({ time, value }) => time <= target && time >= target - tolerance && value > 0)
    .sort((a, b) => b.time - a.time)[0];
  const series = new Map(chartRows.filter(({ time, value }) =>
    time >= (previous?.time ?? target) && time < current.time && validValue(value)).map(({ time, value }) => [time, value]));
  if (previous) series.set(previous.time, previous.value);
  series.set(current.time, current.value);
  return {
    value: current.value,
    unit: 'BTC',
    asOf: iso(current.time),
    previousAsOf: previous ? iso(previous.time) : null,
    change24hPercent: previous ? (current.value / previous.value - 1) * 100 : null,
    points: [...series].sort(([a], [b]) => a - b).map(([time, value]) => ({ time: iso(time), value })),
  };
}

function reading({ venue, symbol, sourceUrl, rate, time, intervalHours, next, interest, points }) {
  if (!Number.isFinite(rate) || !fresh(time)) throw new Error(`Funding ${venue} tidak mutakhir`);
  return {
    schema: 1,
    venue,
    symbol,
    source: venue + ' Futures',
    sourceUrl,
    asOf: iso(time),
    funding: {
      ratePercent: rate * 100,
      intervalHours: intervalHours > 0 ? intervalHours : null,
      nextAt: next > time && next - time <= DAY ? iso(next) : null,
      points,
    },
    openInterest: interest,
    delivery: 'feed',
  };
}

async function binancePosition() {
  const query = '?symbol=' + BINANCE_SYMBOL;
  const fundingStart = Date.now() - FUNDING_LOOKBACK;
  const [{ data: premium }, current, history, fundingInfo, fundingHistory] = await Promise.all([
    readMarket(BINANCE + '/fapi/v1/premiumIndex' + query),
    readOptional(BINANCE + '/fapi/v1/openInterest' + query),
    readOptional(BINANCE + '/futures/data/openInterestHist' + query + '&period=5m&limit=300'),
    readOptional(BINANCE + '/fapi/v1/fundingInfo'),
    readOptional(BINANCE + '/fapi/v1/fundingRate' + query + '&startTime=' + fundingStart + '&limit=' + FUNDING_LIMIT,
      undefined, FUNDING_HISTORY_TIMEOUT),
  ]);
  if (premium.symbol !== BINANCE_SYMBOL) throw new Error('Kontrak Binance tidak cocok');

  const samples = (Array.isArray(history) ? history : []).filter((row) => row.symbol === BINANCE_SYMBOL)
    .map((row) => ({ time: row.timestamp, value: number(row.sumOpenInterest) }));
  const interest = current?.symbol === BINANCE_SYMBOL
    ? openInterest({ time: current.time, value: number(current.openInterest) }, samples,
      samples.filter(({ time }) => time % (15 * MINUTE) === 0), 5 * MINUTE)
    : null;
  const adjusted = Array.isArray(fundingInfo) ? fundingInfo.find((row) => row.symbol === BINANCE_SYMBOL) : null;
  const settlements = Array.isArray(fundingHistory)
    ? fundingHistory.filter((row) => row?.symbol === BINANCE_SYMBOL && row.rateType !== 'Special')
    : [];
  return reading({
    venue: 'Binance',
    symbol: BINANCE_SYMBOL,
    sourceUrl: 'https://www.binance.com/en/futures/BTCUSDT',
    rate: number(premium.lastFundingRate),
    time: premium.time,
    intervalHours: adjusted ? number(adjusted.fundingIntervalHours) : Array.isArray(fundingInfo) ? 8 : null,
    next: premium.nextFundingTime,
    interest,
    points: fundingPoints(settlements, premium.time, (row) => number(row.fundingTime), (row) => row.fundingRate),
  });
}

async function gatePosition() {
  const stats = GATE + '/contract_stats?contract=' + GATE_SYMBOL;
  const baselineStart = Math.floor((Date.now() - DAY - 5 * MINUTE) / MINUTE) * 60;
  const fundingStart = Math.floor((Date.now() - FUNDING_LOOKBACK) / 1000);
  const [contract, current, previous, history, fundingHistory] = await Promise.all([
    readMarket(GATE + '/contracts/' + GATE_SYMBOL, GATE_DECIMAL_SIZE),
    readOptional(stats + '&interval=1m&limit=4', GATE_DECIMAL_SIZE),
    readOptional(stats + '&interval=1m&from=' + baselineStart + '&limit=10', GATE_DECIMAL_SIZE),
    readOptional(stats + '&interval=15m&limit=100', GATE_DECIMAL_SIZE),
    readOptional(GATE + '/funding_rate?contract=' + GATE_SYMBOL + '&from=' + fundingStart + '&limit=' + FUNDING_LIMIT,
      undefined, FUNDING_HISTORY_TIMEOUT),
  ]);
  const { data, time } = contract;
  if (data.name !== GATE_SYMBOL || data.type !== 'direct') throw new Error('Kontrak Gate tidak cocok');

  // Compare the same reported open_interest field on both dates, converted
  // from contracts to equivalent BTC using the linear contract multiplier.
  const multiplier = number(data.quanto_multiplier);
  const samples = (rows) => multiplier > 0 && Array.isArray(rows)
    ? rows.flatMap((row) => {
      const time = number(row.time) * 1000;
      const size = number(row.open_interest);
      return time > 0 && validValue(size) ? [{ time, value: size * multiplier }] : [];
    })
    : [];
  const latest = samples(current).sort((a, b) => b.time - a.time).find(({ time }) => fresh(time));
  return reading({
    venue: 'Gate',
    symbol: GATE_SYMBOL,
    sourceUrl: 'https://www.gate.com/futures/USDT/BTC_USDT',
    rate: number(data.funding_rate),
    time,
    intervalHours: number(data.funding_interval) / 3600,
    next: number(data.funding_next_apply) * 1000,
    interest: openInterest(latest, samples(previous), samples(history), MINUTE),
    points: fundingPoints(Array.isArray(fundingHistory) ? fundingHistory : [], time,
      (row) => number(row?.t) * 1000, (row) => row?.r),
  });
}

export async function liveBtcPerpetualPosition() {
  const binance = await binancePosition().catch(() => null);
  if (Number.isFinite(binance?.openInterest?.change24hPercent)) return binance;
  const gate = await gatePosition().catch(() => null);
  if (Number.isFinite(gate?.openInterest?.change24hPercent)) return gate;
  if (binance || gate) return binance?.openInterest ? binance : gate ?? binance;
  throw new Error('Funding dan open interest BTC perpetual belum tersedia');
}

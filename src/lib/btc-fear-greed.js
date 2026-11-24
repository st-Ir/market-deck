const DAY = 86_400_000;
const HISTORY_DAYS = 180;
const REFERENCE_DAYS = 90;
const MIN_REFERENCE_READINGS = 75;
const ACTIVITY_LOOKBACK = 37;

const indicators = {
  momentum: {
    label: 'Momentum harga',
    description: 'Jarak harga penutupan BTC dari rata-rata harga 30 hari.',
    unit: '%',
  },
  volatility: {
    label: 'Volatilitas',
    description: 'Simpangan baku imbal hasil log harian selama 20 hari. Volatilitas tinggi menurunkan skor.',
    unit: '%',
  },
  activity: {
    label: 'Volume berarah',
    description: 'Rata-rata volume BTC 7 hari dibanding 30 hari sebelumnya, bertanda positif saat harga naik dan negatif saat harga turun selama 7 hari.',
    unit: '×',
  },
  taker: {
    label: 'Tekanan taker',
    description: 'Nilai taker buy dikurangi taker sell, dibagi nilai transaksi spot selama 7 hari.',
    unit: '%',
  },
};

const keys = Object.keys(indicators);
const labels = Object.fromEntries(keys.map((key) => [key, indicators[key].label]));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function completedCandles(candles, now) {
  const days = new Map();
  for (const candle of candles ?? []) {
    const time = Date.parse(candle.date + 'T00:00:00Z');
    if (!Number.isFinite(time) || time + DAY > now || !Number.isFinite(candle.close) || candle.close <= 0) continue;
    days.set(time, { ...candle, time });
  }
  return [...days.values()].sort((a, b) => a.time - b.time).slice(-(HISTORY_DAYS + REFERENCE_DAYS + ACTIVITY_LOOKBACK));
}

function dailyWindow(days, end, length) {
  const start = end - length + 1;
  if (start < 0 || days[end].time - days[start].time !== (length - 1) * DAY) return [];
  return days.slice(start, end + 1);
}

function readIndicators(days, index) {
  const day = days[index];
  const price = dailyWindow(days, index, 30);
  const volatilityDays = dailyWindow(days, index, 21);
  const returns = volatilityDays.slice(1).map((point, i) => Math.log(point.close / volatilityDays[i].close));
  const meanReturn = returns.length ? average(returns) : null;
  const volatility = returns.length ? Math.sqrt(average(returns.map((value) => (value - meanReturn) ** 2))) * 100 : null;
  const activityDays = dailyWindow(days, index, ACTIVITY_LOOKBACK);
  const validVolume = activityDays.length && activityDays.every(({ volumeBTC }) => Number.isFinite(volumeBTC) && volumeBTC >= 0);
  const previousAverage = validVolume ? average(activityDays.slice(0, 30).map((point) => point.volumeBTC)) : null;
  const activity = previousAverage > 0
    ? Math.sign(day.close - activityDays.at(-8).close) * average(activityDays.slice(-7).map((point) => point.volumeBTC)) / previousAverage
    : null;
  const takers = dailyWindow(days, index, 7);
  const validTakers = takers.length && takers.every(({ volume, net }) =>
    Number.isFinite(volume) && volume >= 0 && Number.isFinite(net) && Math.abs(net) <= volume);
  const volume = validTakers ? takers.reduce((sum, point) => sum + point.volume, 0) : null;
  return {
    momentum: price.length ? (day.close / average(price.map((point) => point.close)) - 1) * 100 : null,
    volatility,
    activity,
    taker: volume > 0 ? takers.reduce((sum, point) => sum + point.net, 0) / volume * 100 : null,
  };
}

function percentile(value, baseline, inverted) {
  if (!Number.isFinite(value) || baseline.length < MIN_REFERENCE_READINGS) return null;
  const rank = baseline.reduce((sum, past) => sum + (past < value ? 1 : past === value ? 0.5 : 0), 0) / baseline.length;
  return Math.round((inverted ? 1 - rank : rank) * 100);
}

function classification(value) {
  if (value <= 25) return 'Extreme fear';
  if (value < 45) return 'Fear';
  if (value <= 55) return 'Netral';
  if (value < 75) return 'Greed';
  return 'Extreme greed';
}

export function btcFearGreed(spot, now = Date.now()) {
  const days = completedCandles(spot?.points, now);
  const metrics = days.map((_, index) => readIndicators(days, index));
  const points = [];
  for (let i = 0; i < days.length; i++) {
    const { date, time } = days[i];
    const raw = metrics[i];
    const start = Math.max(0, i - REFERENCE_DAYS);
    const lookback = metrics.slice(start, i)
      .filter((_, index) => days[start + index].time >= time - REFERENCE_DAYS * DAY);
    const components = Object.fromEntries(keys.map((key) => [
      key,
      percentile(raw[key], lookback.map((day) => day[key]).filter(Number.isFinite), key === 'volatility'),
    ]));
    const scores = Object.values(components);
    if (!scores.every(Number.isFinite)) continue;
    const previous = points.at(-1);
    const value = Math.round(average(scores));
    points.push({
      date, value, classification: classification(value), components, raw,
      componentCount: scores.length, live: null,
      change: previous ? value - previous.value : null, comparedDate: previous?.date ?? null,
    });
  }
  if (!points.length) throw new Error('Riwayat BTCUSDT belum cukup untuk Fear & Greed BTC');

  return {
    schema: 1,
    scope: 'BTC',
    source: 'Binance Spot',
    sourceUrl: spot.sourceUrl,
    symbol: 'BTCUSDT',
    frequency: 'daily',
    timezone: 'UTC',
    asOf: points.at(-1).date,
    generatedAt: new Date(now).toISOString(),
    method: 'Rata-rata empat persentil terhadap 90 hari kalender sebelumnya (minimal 75 pembacaan per indikator). Hanya memakai sesi BTCUSDT spot yang selesai pada hari UTC.',
    labels,
    indicators,
    points: points.slice(-HISTORY_DAYS).reverse(),
    delivery: spot.delivery,
  };
}

// IHSG candles for the custom chart: Yahoo Finance ^JKSE OHLC (daily for two
// years, or 5-minute bars for five days), with the current bar's close, high and
// low taken from BEI's live feed so the last candle follows the market. The
// TradingView embed only receives end-of-day data for IDX symbols.
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const WIB_OFFSET = 7 * 3600;

export async function ihsgOhlc(interval, live) {
  const intraday = interval === '5m';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?range=${intraday ? '5d' : '2y'}&interval=${intraday ? '5m' : '1d'}`;
  const json = await fetch(url, { cache: 'no-store', headers: UA, signal: AbortSignal.timeout(15000) }).then((r) => {
    if (!r.ok) throw new Error(`Yahoo ^JKSE HTTP ${r.status}`);
    return r.json();
  });
  const result = json.chart?.result?.[0];
  if (!result?.timestamp) throw new Error('Yahoo ^JKSE: respons kosong');
  const q = result.indicators.quote[0];
  const bars = [];
  result.timestamp.forEach((t, i) => {
    if (![q.open[i], q.high[i], q.low[i], q.close[i]].every(Number.isFinite)) return;
    // Daily bars use the Jakarta date; intraday bars use Jakarta wall-clock seconds.
    const time = intraday ? t + WIB_OFFSET : new Date((t + WIB_OFFSET) * 1000).toISOString().slice(0, 10);
    bars.push({ time, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
  });
  // BEI's live index level is fresher than Yahoo's; fold it into the latest bar.
  const current = live?.indices?.COMPOSITE?.current;
  const last = bars.at(-1);
  if (Number.isFinite(current) && last && (intraday || last.time === live.date)) {
    last.close = current;
    last.high = Math.max(last.high, current);
    last.low = Math.min(last.low, current);
  }
  return {
    schema: 1,
    symbol: 'IHSG',
    interval: intraday ? '5m' : '1d',
    source: 'Yahoo Finance ^JKSE · BEI live',
    liveTime: live?.time ?? null,
    bars,
    generatedAt: new Date().toISOString(),
    delivery: 'feed',
  };
}

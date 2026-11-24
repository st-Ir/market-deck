// BTC/USDT candles from Binance spot (daily or 5-minute, last 1000). Intraday
// times are shifted to WIB wall-clock so both charts share the same clock; the
// client keeps the latest candle moving through Binance's public kline stream.
const WIB_OFFSET = 7 * 3600;

export async function btcOhlc(interval) {
  const intraday = interval === '5m';
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${intraday ? '5m' : '1d'}&limit=1000`;
  const klines = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then((r) => {
    if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
    return r.json();
  });
  const bars = klines.map((k) => ({
    time: intraday ? k[0] / 1000 + WIB_OFFSET : new Date(k[0]).toISOString().slice(0, 10),
    open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
  }));
  return { schema: 1, symbol: 'BTCUSDT', interval: intraday ? '5m' : '1d', source: 'Binance Spot', bars, generatedAt: new Date().toISOString(), delivery: 'feed' };
}

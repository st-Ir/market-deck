// Candlestick charts for both markets (TradingView Lightweight Charts).
// - IHSG: /api/ihsg-ohlc[-5m] (Yahoo ^JKSE candles, latest bar from BEI's live
//   feed), polled every 15 s. The TradingView embed only has end-of-day IDX data.
// - Bitcoin: /api/btc-ohlc[-5m] (Binance BTCUSDT) for history, then Binance's
//   public kline stream moves the latest candle on every trade.
// Prices are shown without decimals. The interval buttons and OHLC legend are
// part of the chart tools and only show while the tools toggle is on.
import { createChart, CrosshairMode } from 'lightweight-charts';

const WIB_OFFSET = 7 * 3600;
const MARKETS = {
  ihsg: { name: 'IHSG', endpoints: { '1d': '/api/ihsg-ohlc', '5m': '/api/ihsg-ohlc-5m' }, poll: 15000 },
  bitcoin: { name: 'BTC/USDT', endpoints: { '1d': '/api/btc-ohlc', '5m': '/api/btc-ohlc-5m' }, poll: 60000, stream: (interval) => 'wss://data-stream.binance.vision/ws/btcusdt@kline_' + interval },
};
const price = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

export function mountMarketChart(container, market) {
  const config = MARKETS[market];
  container.innerHTML =
    '<div class="mchart"><div class="mchart-toolbar"><div class="mchart-intervals" role="group" aria-label="Interval chart ' + config.name + '">' +
    '<button type="button" data-chart-interval="1d" aria-pressed="true">1D</button><button type="button" data-chart-interval="5m" aria-pressed="false">5m</button></div>' +
    '<span class="mchart-legend" aria-live="polite"></span></div><div class="mchart-canvas"></div></div>';
  const canvas = container.querySelector('.mchart-canvas');
  const legend = container.querySelector('.mchart-legend');
  const chart = createChart(canvas, {
    autoSize: true,
    layout: { background: { color: '#131313' }, textColor: '#929292', fontFamily: "Consolas,'Liberation Mono',monospace", fontSize: 11 },
    grid: { vertLines: { color: 'rgba(85,85,85,0.18)' }, horzLines: { color: 'rgba(85,85,85,0.18)' } },
    rightPriceScale: { borderColor: '#292929' },
    timeScale: { borderColor: '#292929', rightOffset: 4 },
    crosshair: { mode: CrosshairMode.Normal },
    localization: { locale: 'id-ID', priceFormatter: (p) => price.format(p) },
  });
  const candles = chart.addCandlestickSeries({
    upColor: '#00bcd4', downColor: '#e91e63', borderUpColor: '#00bcd4', borderDownColor: '#e91e63', wickUpColor: '#00bcd4', wickDownColor: '#e91e63',
    priceFormat: { type: 'price', precision: 0, minMove: 1 },
  });
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
  const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  // No price scale or last-price tag in the card, so the candles get the full
  // width (the live price is in the header status); both come back while the
  // chart card is expanded to full screen.
  const card = container.closest('.chart-card');
  const applyScale = () => {
    const show = !!card?.classList.contains('expanded');
    chart.applyOptions({ rightPriceScale: { visible: show } });
    candles.applyOptions({ lastValueVisible: show });
  };
  applyScale();
  const cardObserver = card ? new MutationObserver(applyScale) : null;
  cardObserver?.observe(card, { attributes: true, attributeFilter: ['class'] });

  let interval = '1d', bars = [], liveTime = null, loadedInterval = null, timer = 0, socket = null;

  const describe = (bar, index) => {
    if (!bar) return '';
    const prev = bars[index - 1];
    const change = prev ? (bar.close / prev.close - 1) * 100 : null;
    const up = !prev || bar.close >= prev.close;
    const live = index === bars.length - 1 ? (market === 'bitcoin' ? (socket?.readyState === 1 ? ' <span class="mchart-live">● Binance live</span>' : '') : liveTime ? ' <span class="mchart-live">● BEI ' + liveTime + '</span>' : '') : '';
    return '<b>' + config.name + '</b> O ' + price.format(bar.open) + ' H ' + price.format(bar.high) + ' L ' + price.format(bar.low) +
      ' C <em class="' + (up ? 'up' : 'down') + '">' + price.format(bar.close) + (change === null ? '' : ' (' + pct.format(change) + '%)') + '</em>' + live;
  };
  const showLast = () => { legend.innerHTML = describe(bars.at(-1), bars.length - 1); };
  chart.subscribeCrosshairMove((param) => {
    if (!param.time || param.logical === undefined) return showLast();
    const index = Math.round(param.logical);
    legend.innerHTML = describe(bars[index], index);
  });
  const volumeBar = (b, i) => ({ time: b.time, value: b.volume, color: i && b.close < bars[i - 1].close ? 'rgba(233,30,99,0.45)' : 'rgba(0,188,212,0.45)' });

  // Adds or replaces the latest bar without moving the view.
  function upsert(bar) {
    const last = bars.at(-1);
    if (last && bar.time < last.time) return;
    if (last && bar.time === last.time) bars[bars.length - 1] = bar;
    else bars.push(bar);
    // Lightweight Charts converts the time field of objects it receives, so it gets copies.
    candles.update({ ...bar });
    volume.update(volumeBar(bar, bars.length - 1));
    showLast();
  }

  async function load() {
    if (!canvas.isConnected) return destroy();
    try {
      const response = await fetch(config.endpoints[interval]);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.schema !== 1 || !data.bars?.length) throw new Error();
      liveTime = data.liveTime ?? null;
      const same = loadedInterval === interval && bars.length && data.bars.some((b) => b.time === bars.at(-1).time);
      if (same) {
        for (const bar of data.bars.filter((b) => b.time >= bars.at(-1).time)) upsert(bar);
      } else {
        bars = data.bars;
        candles.setData(bars.map((b) => ({ ...b })));
        volume.setData(bars.map(volumeBar));
        const visible = interval === '1d' ? 250 : 120;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - visible), to: bars.length + 3 });
        chart.applyOptions({ timeScale: { timeVisible: interval === '5m', secondsVisible: false } });
        loadedInterval = interval;
        connect();
      }
      showLast();
    } catch {
      if (!bars.length) legend.textContent = 'Data ' + config.name + ' belum dapat dimuat.';
    }
  }

  // Bitcoin: Binance's public kline stream, one message per trade burst.
  function connect() {
    if (!config.stream) return;
    socket?.close();
    const streamInterval = interval;
    socket = new WebSocket(config.stream(interval));
    socket.onmessage = (event) => {
      if (streamInterval !== interval) return;
      const k = JSON.parse(event.data).k;
      if (!k) return;
      upsert({
        time: interval === '5m' ? k.t / 1000 + WIB_OFFSET : new Date(k.t).toISOString().slice(0, 10),
        open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
      });
    };
    socket.onclose = () => { if (canvas.isConnected && streamInterval === interval) setTimeout(() => streamInterval === interval && connect(), 5000); };
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chart-interval]');
    if (!button || button.dataset.chartInterval === interval) return;
    interval = button.dataset.chartInterval;
    container.querySelectorAll('[data-chart-interval]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    bars = [];
    load();
  });

  function destroy() {
    clearInterval(timer);
    socket?.close();
    socket = null;
    cardObserver?.disconnect();
    chart.remove();
  }
  load();
  timer = setInterval(load, config.poll);
}

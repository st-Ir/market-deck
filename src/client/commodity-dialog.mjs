// Commodity popup: clicking a commodity tile opens live readings for that contract
// (price, 1-day / 1-week / 1-month change, today's range from /api/context-prices)
// and the IDX stocks that gain when it rises or falls, with their 1-day and 5-day
// moves (/api/commodity-stocks), and a two-year daily price chart
// (/api/commodity-history). All from TradingView.
import { flashValue, keyedFlasher } from './flash.mjs';
import { W, dateAxis, frame, grid, indexAt, linePath, movingAverage, scale } from './mini-chart.mjs';

const dialog = document.getElementById('commodity-dialog');
const body = document.getElementById('commodity-body');
const title = document.getElementById('commodity-title');
const NAMES = { coal: 'Batu bara Newcastle', cpo: 'CPO (Bursa Malaysia)', brent: 'Minyak Brent', nickel: 'Nikel LME', gold: 'Emas' };
const decimals = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const flashCells = keyedFlasher();

let kind = null, stocks = null, opener = null, timer = 0;
let history = null, historyFailed = false, chartRange = 126, hover = null;
const RANGES = [['3B', 63], ['6B', 126], ['1T', 252], ['2T', Infinity]];
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const priceFormat = (v) => (v >= 1000 ? number : decimals).format(v);

// ---- Price chart (TradingView daily closes) -------------------------------

function chartPoints() {
  const all = history?.commodities?.[kind]?.points;
  return all ? all.slice(-Math.min(chartRange, all.length)) : null;
}

function chartSvg(points) {
  const closes = points.map((p) => p.close);
  const ma = movingAverage(closes, 20);
  const geo = frame(points.length, 220);
  const s = scale(closes, geo);
  const up = closes.at(-1) >= closes[0];
  const color = up ? '#00bcd4' : '#e91e63';
  const i = hover ?? points.length - 1;
  return '<svg class="mc-chart" viewBox="0 0 ' + W + ' 220" role="img" aria-label="Harga ' + NAMES[kind] + ' ' + day(points[0].date, true) + ' sampai ' + day(points.at(-1).date, true) + '">' +
    grid(geo, s, priceFormat) + dateAxis(geo, points.map((p) => p.date), (d) => day(d, chartRange > 126)) +
    '<path d="' + linePath(ma, geo.x, s.y) + '" fill="none" stroke="#929292" stroke-width="1" stroke-dasharray="3 3"/>' +
    '<path d="' + linePath(closes, geo.x, s.y) + '" fill="none" stroke="' + color + '" stroke-width="1.6"/>' +
    '<line x1="' + geo.x(i).toFixed(1) + '" x2="' + geo.x(i).toFixed(1) + '" y1="' + geo.T + '" y2="' + geo.B + '" class="mc-cursor"/>' +
    '<circle cx="' + geo.x(i).toFixed(1) + '" cy="' + s.y(closes[i]).toFixed(1) + '" r="3" fill="' + color + '" stroke="none"/></svg>';
}

function renderChart() {
  const host = document.getElementById('commodity-chart');
  if (!host) return;
  const points = chartPoints();
  if (!points) {
    host.innerHTML = '<section class="m2-plot-panel fx-panel"><p class="fx-empty">' + (historyFailed || history ? 'Grafik harga belum tersedia untuk kontrak ini.' : 'Memuat grafik harga…') + '</p></section>';
    return;
  }
  const i = hover ?? points.length - 1, p = points[i], prev = points[i - 1];
  const change = prev ? (p.close / prev.close - 1) * 100 : null;
  const span = (points.at(-1).close / points[0].close - 1) * 100;
  host.innerHTML = '<section class="m2-plot-panel fx-panel"><header><h3>Grafik harga <small>harian · garis putus = MA20 · ' + history.commodities[kind].symbol + '</small></h3>' +
    '<div class="history-periods" role="group" aria-label="Rentang grafik">' + RANGES.map(([label, n]) => '<button type="button" data-cm-range="' + n + '" aria-pressed="' + (n === chartRange) + '">' + label + '</button>').join('') + '</div></header>' +
    '<div class="m2-legend fx-legend"><span>' + day(p.date, true) + ' · <b>' + priceFormat(p.close) + '</b>' + (change === null ? '' : ' <em class="' + (change >= 0 ? 'btc-positive' : 'btc-negative') + '">' + pct.format(change) + '%</em>') + '</span><span>Sepanjang rentang <b class="' + (span >= 0 ? 'btc-positive' : 'btc-negative') + '">' + pct.format(span) + '%</b></span></div>' +
    chartSvg(points) + '</section>';
}

async function loadHistory() {
  if (history) return renderChart();
  try {
    const response = await fetch('/api/commodity-history');
    if (!response.ok) throw new Error();
    history = await response.json();
  } catch {
    historyFailed = true;
  }
  renderChart();
}


// Live readings for the open commodity, refreshed with the tile data.
async function renderQuote() {
  const host = document.getElementById('commodity-quote');
  if (!host) return;
  let q = null;
  try {
    const data = await fetch('/api/context-prices').then((r) => (r.ok ? r.json() : null));
    q = data?.quotes?.[kind] ?? null;
  } catch {}
  if (!q) {
    if (!host.dataset.ready) host.innerHTML = '<p class="fx-empty">Harga belum dapat dimuat.</p>';
    return;
  }
  const tone = (v) => (v > 0 ? 'btc-positive' : v < 0 ? 'btc-negative' : '');
  const change = (v) => (Number.isFinite(v) ? pct.format(v) + '%' : '—');
  const tile = (label, value, sub, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  host.dataset.ready = '1';
  host.innerHTML =
    '<div class="metric-detail-summary fx-summary">' +
      tile('Harga · ' + q.unit, '<span class="commodity-live">' + decimals.format(q.value) + '</span>', (q.sourceShort === 'TV' ? 'TradingView · ' + (q.delayMinutes ? 'tunda ' + q.delayMinutes + ' mnt' : 'live') : 'Trading Economics') + (q.symbol ? ' · ' + q.symbol : '')) +
      tile('1 hari', change(q.changePercent), 'terhadap penutupan sebelumnya', tone(q.changePercent)) +
      tile('5 hari', change(q.perfWeek), 'satu minggu', tone(q.perfWeek)) +
      tile('1 bulan', change(q.perfMonth), Number.isFinite(q.high) && Number.isFinite(q.low) ? 'hari ini L ' + decimals.format(q.low) + ' · H ' + decimals.format(q.high) : '', tone(q.perfMonth)) +
    '</div>';
  flashValue(host.querySelector('.commodity-live'), q.value);
}

const move = (v) => (Number.isFinite(v) ? '<td class="' + (v > 0 ? 'btc-positive' : v < 0 ? 'btc-negative' : '') + '">' + pct.format(v) + '%</td>' : '<td>—</td>');

function table(list, heading, note) {
  if (!list.length) return '';
  return '<section class="m2-plot-panel fx-panel"><header><h3>' + heading + ' <small>' + note + '</small></h3></header>' +
    '<div class="btc-table-wrap commodity-stocks"><table><thead><tr><th>Saham</th><th>Harga</th><th>1H</th><th>5H</th></tr></thead><tbody>' +
    list.map((s) => '<tr data-stock="' + s.code + '"><td><a href="https://www.tradingview.com/chart/?symbol=IDX%3A' + s.code + '" target="_blank" rel="noopener noreferrer"><b>' + s.code + '</b></a><small>' + s.reason + '</small></td>' +
      '<td class="commodity-price" data-key="' + s.code + '" data-value="' + s.price + '">' + number.format(s.price) + '</td>' + move(s.change1d) + move(s.change5d) + '</tr>').join('') +
    '</tbody></table></div></section>';
}

function renderStocks() {
  const host = document.getElementById('commodity-stocks');
  if (!host) return;
  const group = stocks?.commodities?.[kind];
  if (!group) {
    host.innerHTML = '<p class="fx-empty">' + (stocks ? 'Daftar saham belum tersedia.' : 'Memuat saham terkait…') + '</p>';
    return;
  }
  const delay = Math.max(0, ...[...group.up, ...group.down].map((s) => s.delayMinutes || 0));
  host.innerHTML =
    '<p class="commodity-curation">Daftar emiten adalah kurasi umum berdasarkan bisnis utamanya, <b>bukan rekomendasi beli/jual</b>. Sensitivitas tiap saham terhadap harga komoditas berbeda-beda.</p>' +
    table(group.up, 'Diuntungkan saat harga naik', 'produsen') +
    table(group.down, 'Diuntungkan saat harga turun', 'komoditas ini menjadi biaya') +
    '<p class="fx-method">Perubahan 1H = hari ini terhadap penutupan kemarin; 5H = satu minggu bursa. Harga saham dari TradingView' + (delay ? ', tertunda ' + delay + ' menit' : '') + '. Kaitan saham dengan komoditas bersifat umum; kinerja tiap emiten juga dipengaruhi faktor lain. Bukan rekomendasi.</p>';
  flashCells(host.querySelectorAll('.commodity-price'), (el) => el.dataset.key, (el) => Number(el.dataset.value));
}

async function loadStocks() {
  try {
    const response = await fetch('/api/commodity-stocks');
    if (response.ok) stocks = await response.json();
  } catch {}
  renderStocks();
}

function open(nextKind, trigger) {
  if (!NAMES[nextKind]) return;
  kind = nextKind;
  opener = trigger;
  title.textContent = NAMES[nextKind];
  hover = null;
  body.innerHTML = '<div id="commodity-quote"><p class="fx-empty">Memuat harga…</p></div><div id="commodity-chart"></div><div id="commodity-stocks"></div>';
  dialog.showModal();
  document.body.classList.add('metric-modal-open');
  renderQuote();
  renderStocks();
  loadStocks();
  loadHistory();
  clearInterval(timer);
  timer = setInterval(() => { renderQuote(); loadStocks(); }, 30000);
}

// Commodity tiles in the market panel open the popup instead of the source link.
document.addEventListener('click', (event) => {
  const tile = event.target.closest('.commodity-row .source-asset');
  if (!tile || event.ctrlKey || event.metaKey) return;
  const reading = tile.querySelector('[data-commodity]');
  if (!reading) return;
  event.preventDefault();
  open(reading.dataset.commodity, tile);
});
dialog.querySelector('.cm-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  clearInterval(timer);
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
body.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('.mc-chart');
  const points = svg && chartPoints();
  if (!points) return;
  const next = indexAt(svg, event.clientX, frame(points.length, 220));
  if (next !== hover) { hover = next; renderChart(); }
});
body.addEventListener('pointerleave', () => { if (hover !== null) { hover = null; renderChart(); } });
dialog.addEventListener('click', (event) => {
  const range = event.target.closest('[data-cm-range]');
  if (range) { chartRange = Number(range.dataset.cmRange); hover = null; renderChart(); return; }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

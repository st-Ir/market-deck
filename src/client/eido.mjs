// EIDO snapshot card (IHSG view) and its popup: a summary of how the iShares MSCI
// Indonesia ETF has moved — returns over several horizons, the 52-week range,
// streak, volatility and a price chart — from /api/eido (Yahoo daily closes,
// TradingView's delayed quote for the latest price).
import { flashValue } from './flash.mjs';

const API = '/api/eido';
const dialog = document.getElementById('eido-dialog');
const body = document.getElementById('eido-body');
const RANGES = [['1B', 21], ['3B', 63], ['6B', 126], ['1T', 252], ['2T', Infinity]];
const two = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const tone = (v) => (v > 0 ? 'btc-positive' : v < 0 ? 'btc-negative' : '');

let data = null, failed = false, range = 126, opener = null;

const card = () => document.querySelector('#market-snapshot[data-market="ihsg"] [data-metric="eido"]');

function drawCard() {
  const el = card();
  if (!el) return;
  const value = el.querySelector('.metric-value');
  const delta = el.querySelector('.metric-delta');
  const date = el.querySelector('.metric-date');
  if (!data) {
    date.textContent = failed ? 'EIDO belum tersedia' : 'Memuat EIDO…';
    return;
  }
  const q = data.quote;
  value.innerHTML = two.format(q.value) + '<span> USD</span>';
  flashValue(value, q.value);
  const change = q.changePercent;
  delta.replaceChildren(document.createTextNode(Number.isFinite(change) ? pct.format(change) + '%' : '—'), Object.assign(document.createElement('small'), { textContent: ' Δ1H' }));
  delta.style.color = !Number.isFinite(change) ? 'var(--muted)' : change >= 0 ? 'var(--cyan)' : 'var(--pink)';
  date.textContent = 'NYSE · ' + day(data.asOf) + (q.delayMinutes ? ' · tunda ' + q.delayMinutes + ' mnt' : ' · EOD');
  const svg = el.querySelector('.metric-spark');
  const values = data.points.slice(-20).map((p) => p.close);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', values.map((v, i) => (i / (values.length - 1) * 130).toFixed(2) + ',' + (3 + (max - v) / span * 24).toFixed(2)).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', values.at(-1) >= values[0] ? '#00bcd4' : '#e91e63');
  line.setAttribute('stroke-width', '1.3');
  svg.replaceChildren(line);
  svg.setAttribute('aria-label', 'EIDO 20 sesi terakhir, ' + two.format(values.at(-1)) + ' USD');
  if (dialog.open) drawDialog();
}

// ---- Popup ---------------------------------------------------------------

function stats() {
  const points = data.points, closes = points.map((p) => p.close), last = closes.at(-1);
  const back = (n) => (closes.length > n ? (last / closes[closes.length - 1 - n] - 1) * 100 : null);
  const year = data.asOf.slice(0, 4);
  const ytdBase = points.filter((p) => p.date < year + '-01-01').at(-1)?.close;
  const window = closes.slice(-252);
  const high = Math.max(...window), low = Math.min(...window);
  const returns = closes.slice(-21).map((c, i, a) => (i ? Math.log(c / a[i - 1]) : null)).filter((r) => r !== null);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const vol = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)) * Math.sqrt(252) * 100;
  let streak = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    const dir = Math.sign(closes[i] - closes[i - 1]);
    if (!dir || (streak && Math.sign(streak) !== dir)) break;
    streak += dir;
  }
  return {
    last, high, low, vol, streak,
    highDate: points.slice(-252).find((p) => p.close === high)?.date,
    lowDate: points.slice(-252).find((p) => p.close === low)?.date,
    returns: [['1 minggu', back(5)], ['1 bulan', back(21)], ['3 bulan', back(63)], ['YTD', ytdBase ? (last / ytdBase - 1) * 100 : null], ['1 tahun', back(252)]],
  };
}

function chart() {
  const points = data.points.slice(-Math.min(range, data.points.length));
  const W = 860, H = 230, pad = { l: 8, r: 52, t: 12, b: 24 };
  const closes = points.map((p) => p.close);
  const ma = closes.map((_, i) => (i >= 19 ? closes.slice(i - 19, i + 1).reduce((s, v) => s + v, 0) / 20 : null));
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (max - v) / span * (H - pad.t - pad.b);
  const path = (vals) => vals.map((v, i) => (v === null ? null : x(i).toFixed(1) + ',' + y(v).toFixed(1))).filter(Boolean).join(' ');
  const up = closes.at(-1) >= closes[0];
  const color = up ? '#00bcd4' : '#e91e63';
  const ticks = [max, (max + min) / 2, min];
  const labels = [0, Math.floor(points.length / 2), points.length - 1];
  return '<svg class="eido-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Harga EIDO ' + day(points[0].date, true) + ' sampai ' + day(points.at(-1).date, true) + '">' +
    '<defs><linearGradient id="eido-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
    ticks.map((t) => '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="eido-grid"/><text x="' + (W - pad.r + 6) + '" y="' + (y(t) + 3) + '" class="eido-axis">' + two.format(t) + '</text>').join('') +
    labels.map((i) => '<text x="' + x(i) + '" y="' + (H - 6) + '" class="eido-axis" text-anchor="' + (i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle') + '">' + day(points[i].date, range > 126) + '</text>').join('') +
    '<polygon points="' + x(0) + ',' + (H - pad.b) + ' ' + path(closes) + ' ' + x(points.length - 1) + ',' + (H - pad.b) + '" fill="url(#eido-fill)" stroke="none"/>' +
    '<polyline points="' + path(ma) + '" fill="none" stroke="#929292" stroke-width="1" stroke-dasharray="3 3"/>' +
    '<polyline points="' + path(closes) + '" fill="none" stroke="' + color + '" stroke-width="1.6"/>' +
    '<circle cx="' + x(points.length - 1) + '" cy="' + y(closes.at(-1)) + '" r="3" fill="' + color + '" stroke="none"/>' +
    '<line class="eido-cursor" y1="' + pad.t + '" y2="' + (H - pad.b) + '" hidden/></svg>';
}

function drawDialog() {
  if (!data) {
    body.innerHTML = '<p class="fx-empty">' + (failed ? 'Data EIDO belum dapat dimuat.' : 'Memuat EIDO…') + '</p>';
    return;
  }
  const s = stats(), q = data.quote;
  const position = s.high > s.low ? (s.last - s.low) / (s.high - s.low) * 100 : 50;
  const tile = (label, value, sub, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  body.innerHTML =
    '<div class="metric-detail-summary fx-summary">' +
      tile('Harga · USD', two.format(q.value), (q.source === 'tradingview' ? 'TradingView · tunda ' + q.delayMinutes + ' mnt' : 'Yahoo · penutupan') + ' · ' + day(data.asOf)) +
      tile('1 hari', Number.isFinite(q.changePercent) ? pct.format(q.changePercent) + '%' : '—', Number.isFinite(q.high) ? 'L ' + two.format(q.low) + ' · H ' + two.format(q.high) : 'terhadap penutupan sebelumnya', tone(q.changePercent)) +
      tile('Tren beruntun', s.streak ? Math.abs(s.streak) + ' hari ' + (s.streak > 0 ? 'naik' : 'turun') : 'datar', 'sesi berturut-turut', s.streak > 0 ? 'btc-positive' : s.streak < 0 ? 'btc-negative' : '') +
      tile('Volatilitas 1 bulan', two.format(s.vol) + '%', 'disetahunkan, 21 sesi') +
    '</div>' +
    '<div class="eido-returns">' + s.returns.map(([label, v]) => '<div><span>' + label + '</span><strong class="' + tone(v) + '">' + (Number.isFinite(v) ? pct.format(v) + '%' : '—') + '</strong></div>').join('') + '</div>' +
    '<section class="m2-plot-panel fx-panel eido-range"><header><h3>Rentang 52 minggu <small>' + pct.format((s.last / s.high - 1) * 100) + '% dari tertinggi · ' + pct.format((s.last / s.low - 1) * 100) + '% dari terendah</small></h3></header>' +
      '<div class="eido-range-bar"><i style="left:' + position.toFixed(1) + '%"></i></div>' +
      '<div class="eido-range-labels"><span>' + two.format(s.low) + '<small>' + (s.lowDate ? day(s.lowDate, true) : '') + '</small></span><span>' + two.format(s.high) + '<small>' + (s.highDate ? day(s.highDate, true) : '') + '</small></span></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Harga EIDO <small>garis putus = MA20</small></h3><div class="history-periods" role="group" aria-label="Rentang grafik EIDO">' +
      RANGES.map(([label, n]) => '<button type="button" data-eido-range="' + n + '" aria-pressed="' + (n === range) + '">' + label + '</button>').join('') + '</div></header>' +
      '<div class="eido-chart-wrap">' + chart() + '<div class="eido-readout" hidden></div></div></section>' +
    '<p class="fx-method">EIDO adalah ETF iShares MSCI Indonesia yang diperdagangkan di NYSE dalam dolar AS, jadi pergerakannya memuat harga saham besar Indonesia sekaligus kurs rupiah. Sesi AS berjalan setelah BEI tutup (malam WIB), sehingga EIDO sering dibaca sebagai sinyal arah dana asing untuk sesi IHSG berikutnya. Bukan rekomendasi.</p>';
}

body.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('.eido-chart');
  const readout = body.querySelector('.eido-readout');
  if (!svg || !data) return;
  const points = data.points.slice(-Math.min(range, data.points.length));
  const box = svg.getBoundingClientRect();
  const W = 860, pad = { l: 8, r: 52 };
  const px = (event.clientX - box.left) / box.width * W;
  const i = Math.max(0, Math.min(points.length - 1, Math.round((px - pad.l) / (W - pad.l - pad.r) * (points.length - 1))));
  const cx = pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const cursor = svg.querySelector('.eido-cursor');
  cursor.setAttribute('x1', cx);
  cursor.setAttribute('x2', cx);
  cursor.hidden = false;
  const prev = points[i - 1]?.close;
  readout.hidden = false;
  readout.innerHTML = day(points[i].date, true) + ' · <b>' + two.format(points[i].close) + '</b>' + (prev ? ' <em class="' + tone(points[i].close - prev) + '">' + pct.format((points[i].close / prev - 1) * 100) + '%</em>' : '');
});
body.addEventListener('pointerleave', () => {
  body.querySelector('.eido-cursor')?.setAttribute('hidden', '');
  const readout = body.querySelector('.eido-readout');
  if (readout) readout.hidden = true;
});

async function load() {
  try {
    const response = await fetch(API);
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema !== 1 || !result.points?.length) throw new Error();
    data = result;
    failed = false;
  } catch {
    failed = true;
  }
  drawCard();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-eido-open]');
  if (!trigger) return;
  opener = trigger;
  drawDialog();
  dialog.showModal();
  document.body.classList.add('metric-modal-open');
});
dialog.querySelector('.eido-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  const button = event.target.closest('[data-eido-range]');
  if (button) {
    range = Number(button.dataset.eidoRange);
    drawDialog();
    return;
  }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
// The card is re-rendered when the market switches back to IHSG.
document.addEventListener('market-deck:market', () => drawCard());
load();
setInterval(load, 60000);

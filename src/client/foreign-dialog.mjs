// Foreign-flow dialog for the NET ASING card, from /api/idx-summary (BEI daily
// stock summary; rupiah estimated from foreign volume × regular VWAP). It reads:
// - flow: daily net, running cumulative net, MA5, 5/20-session sums and streaks;
// - intensity: net as % of regular turnover and its z-score vs 60 sessions
//   (|z| ≥ 2 flags an extreme day); foreign participation in turnover;
// - divergence between IHSG and foreign flow over 5 sessions;
// - the stocks foreigners bought/sold most over 1, 5 or 20 sessions, summed from
//   each session's top 15 net buys and sells.
import { attachChartZoom, hiddenSeries, panWindow, zoomWindow } from './chart-zoom.mjs';

const dialog = document.getElementById('foreign-dialog');
const body = document.getElementById('foreign-body');
const W = 720, L = 50, R = 58, PW = W - L - R;
const RANGES = [['1B', 21], ['3B', 63], ['6B', Infinity]];
const DEFAULT_RANGE = 63;
const EXTREME_Z = 2;

const one = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
// Rupiah with sign, in M (miliar) or T (triliun).
const money = (v) => {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  return sign + (a >= 1e12 ? two.format(a / 1e12) + ' T' : whole.format(a / 1e9) + ' M');
};
const tone = (v) => (v > 0 ? 'btc-positive' : v < 0 ? 'btc-negative' : '');

const hidden = hiddenSeries('market-deck:foreign-series');
let rows = [];
let view = null;
let followEnd = true;
let hoverIndex = null;
let opener = null;
let topWindow = 5;

function analyse(points) {
  const out = points.map((p) => ({ ...p }));
  let cumulative = 0, streak = 0;
  out.forEach((p, i) => {
    cumulative += p.netForeign;
    p.cumulative = cumulative;
    const sign = Math.sign(p.netForeign);
    streak = i > 0 && sign !== 0 && sign === Math.sign(out[i - 1].netForeign) ? streak + sign : sign;
    p.streak = streak;
    const sum = (n) => (i >= n - 1 ? out.slice(i - n + 1, i + 1).reduce((s, x) => s + x.netForeign, 0) : null);
    p.sum5 = sum(5);
    p.sum20 = sum(20);
    p.ma5 = p.sum5 === null ? null : p.sum5 / 5;
    p.base = p.regularValue ?? p.totalValue;
    p.intensity = p.base ? p.netForeign / p.base * 100 : null;
    // Regular-market basis: a large negotiated block would otherwise hide the reading.
    p.participation = p.base ? (p.foreignBuy + p.foreignSell) / (2 * p.base) * 100 : null;
    const window = out.slice(Math.max(0, i - 60), i).map((x) => x.intensity).filter((v) => v !== null);
    if (window.length >= 40 && p.intensity !== null) {
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
      p.z = sd ? (p.intensity - mean) / sd : null;
    } else p.z = null;
    p.ihsgChange = p.ihsg?.previous ? (p.ihsg.close / p.ihsg.previous - 1) * 100 : null;
    const back5 = out[i - 5]?.ihsg?.close;
    p.ihsg5 = back5 && p.ihsg ? (p.ihsg.close / back5 - 1) * 100 : null;
  });
  return out;
}

function divergence(p) {
  if (p.ihsg5 === null || p.sum5 === null) return null;
  if (p.ihsg5 >= 1 && p.sum5 < 0) return 'IHSG naik ' + pct.format(p.ihsg5) + '% dalam 5 sesi, tetapi asing net jual ' + money(p.sum5) + ': kenaikan belum didukung asing.';
  if (p.ihsg5 <= -1 && p.sum5 > 0) return 'IHSG turun ' + pct.format(p.ihsg5) + '% dalam 5 sesi, sementara asing net beli ' + money(p.sum5) + ': asing menampung tekanan jual.';
  if (p.ihsg5 >= 1 && p.sum5 > 0) return 'IHSG naik ' + pct.format(p.ihsg5) + '% dalam 5 sesi dan asing net beli ' + money(p.sum5) + ': searah.';
  if (p.ihsg5 <= -1 && p.sum5 < 0) return 'IHSG turun ' + pct.format(p.ihsg5) + '% dalam 5 sesi dan asing net jual ' + money(p.sum5) + ': searah.';
  return null;
}

// Approximate per-stock totals: each session contributes its top 15 net buys and sells.
function topStocks(n) {
  const totals = new Map();
  for (const p of rows.slice(-n)) {
    for (const [code, net] of [...(p.topBuy || []), ...(p.topSell || [])]) totals.set(code, (totals.get(code) || 0) + net);
  }
  const sorted = [...totals].sort((a, b) => b[1] - a[1]);
  return { buy: sorted.filter(([, v]) => v > 0).slice(0, 10), sell: sorted.filter(([, v]) => v < 0).slice(-10).reverse() };
}

// ---- charts ---------------------------------------------------------------

const bounds = () => ({ min: 0, max: Math.max(1, rows.length - 1) });
const presetView = (n) => ({ start: Math.max(0, rows.length - Math.min(n, rows.length)), end: rows.length - 1 });
// Each session gets a slot; bars sit in the middle so the first and last stay whole.
const xOf = (i) => L + (i - view.start + 0.5) / (view.end - view.start + 1) * PW;
const range = () => ({ first: Math.max(0, Math.floor(view.start) - 1), last: Math.min(rows.length - 1, Math.ceil(view.end) + 1) });
const inView = () => rows.slice(Math.max(0, Math.floor(view.start)), Math.ceil(view.end) + 1);

function pathFor(get, scale, first, last) {
  let d = '', pen = false;
  for (let i = first; i <= last; i++) {
    const v = get(rows[i]);
    if (v === null || v === undefined) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + xOf(i).toFixed(2) + ' ' + scale(v).toFixed(2);
    pen = true;
  }
  return d;
}
const frame = (h, t, ph, id, label) => '<svg class="fx-chart-svg chart-zoomable" viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="' + label + '"><defs><clipPath id="' + id + '"><rect x="' + L + '" y="' + (t - 10) + '" width="' + PW + '" height="' + (ph + 20) + '"/></clipPath></defs>';
const cursor = (t, ph) => (hoverIndex === null || !rows[hoverIndex] ? '' : '<line x1="' + xOf(hoverIndex) + '" x2="' + xOf(hoverIndex) + '" y1="' + t + '" y2="' + (t + ph) + '" class="fx-cursor"/>');
function ticks(h) {
  const span = view.end - view.start;
  let out = '';
  for (let k = 0; k <= 5; k++) {
    const i = Math.round(view.start + span * k / 5);
    if (rows[i]) out += '<text x="' + xOf(i).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 5 ? 'end' : 'middle') + '">' + day(rows[i].date) + '</text>';
  }
  return out;
}

function flowChart() {
  const h = 270, t = 18, b = 26, ph = h - t - b;
  const { first, last } = range();
  const visible = inView();
  const amp = Math.max(...visible.map((p) => Math.abs(p.netForeign))) * 1.15 || 1;
  const y = (v) => t + ph / 2 - v / amp * (ph / 2);
  const cum = visible.map((p) => p.cumulative);
  const cmin = Math.min(...cum), cmax = Math.max(...cum), cpad = (cmax - cmin) * 0.1 || Math.abs(cmax) * 0.1 || 1;
  const cy = (v) => t + (cmax + cpad - v) / (cmax - cmin + 2 * cpad) * ph;
  const bar = Math.max(1.5, PW / Math.max(1, view.end - view.start + 1) * 0.68);
  let out = frame(h, t, ph, 'fl-clip-flow', 'Net asing harian dengan kumulatif dan MA5');
  for (const v of [amp / 1.15, amp / 2.3, 0, -amp / 2.3, -amp / 1.15]) {
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="fx-grid' + (v === 0 ? ' fx-zero' : '') + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + money(v).replace(' ', '') + '</text>';
  }
  if (!hidden.has('cumulative')) {
    for (let k = 0; k <= 3; k++) {
      const v = cmax + cpad - (cmax - cmin + 2 * cpad) * k / 3;
      out += '<text x="' + (W - R + 7) + '" y="' + (cy(v) + 4) + '" class="fl-cum-axis">' + money(v).replace(' ', '') + '</text>';
    }
  }
  out += '<g clip-path="url(#fl-clip-flow)">';
  for (let i = first; i <= last; i++) {
    const p = rows[i], top = y(Math.max(0, p.netForeign)), bottom = y(Math.min(0, p.netForeign));
    out += '<rect x="' + (xOf(i) - bar / 2).toFixed(2) + '" y="' + top.toFixed(2) + '" width="' + bar.toFixed(2) + '" height="' + Math.max(0.5, bottom - top).toFixed(2) + '" fill="' + (p.netForeign >= 0 ? '#00bcd4' : '#e91e63') + '" opacity="' + (p.z !== null && Math.abs(p.z) >= EXTREME_Z ? 0.95 : 0.55) + '"/>';
  }
  if (!hidden.has('ma5')) out += '<path d="' + pathFor((p) => p.ma5, y, first, last) + '" fill="none" stroke="#9ad7e0" stroke-width="1.1" stroke-dasharray="4 3"/>';
  if (!hidden.has('cumulative')) out += '<path d="' + pathFor((p) => p.cumulative, cy, first, last) + '" fill="none" stroke="#f5f5f5" stroke-width="1.8"/>';
  return out + '</g>' + cursor(t, ph) + ticks(h) + '</svg>';
}

function participationChart() {
  const h = 130, t = 12, b = 22, ph = h - t - b;
  const { first, last } = range();
  const values = inView().map((p) => p.participation).filter((v) => v !== null);
  const min = Math.floor(Math.min(...values) - 2), max = Math.ceil(Math.max(...values) + 2);
  const y = (v) => t + (max - v) / (max - min) * ph;
  let out = frame(h, t, ph, 'fl-clip-part', 'Partisipasi asing dalam nilai transaksi');
  for (let k = 0; k <= 2; k++) {
    const v = max - (max - min) * k / 2;
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="fx-grid"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + whole.format(v) + '%</text>';
  }
  out += '<g clip-path="url(#fl-clip-part)"><path d="' + pathFor((p) => p.participation, y, first, last) + '" fill="none" stroke="#f5f5f5" stroke-width="1.3"/></g>';
  return out + cursor(t, ph) + '</svg>';
}

function ihsgChart() {
  const h = 170, t = 14, b = 24, ph = h - t - b;
  const { first, last } = range();
  const closes = inView().map((p) => p.ihsg?.close).filter(Boolean);
  const pad = (Math.max(...closes) - Math.min(...closes)) * 0.08 || 10;
  const min = Math.min(...closes) - pad, max = Math.max(...closes) + pad;
  const y = (v) => t + (max - v) / (max - min) * ph;
  let out = frame(h, t, ph, 'fl-clip-ihsg', 'IHSG dengan hari net asing ekstrem');
  for (let k = 0; k <= 3; k++) {
    const v = max - (max - min) * k / 3;
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="fx-grid"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + whole.format(v) + '</text>';
  }
  out += '<g clip-path="url(#fl-clip-ihsg)"><path d="' + pathFor((p) => p.ihsg?.close ?? null, y, first, last) + '" fill="none" stroke="#e91e63" stroke-width="1.3"/>';
  if (!hidden.has('extreme')) {
    for (let i = first; i <= last; i++) {
      const p = rows[i];
      if (p.z === null || Math.abs(p.z) < EXTREME_Z || !p.ihsg) continue;
      out += '<circle cx="' + xOf(i).toFixed(2) + '" cy="' + y(p.ihsg.close).toFixed(2) + '" r="3.6" fill="' + (p.z > 0 ? '#00bcd4' : '#e91e63') + '" stroke="#131313" stroke-width="1"><title>' + day(p.date, true) + ' · net asing ' + money(p.netForeign) + ' (z ' + two.format(p.z) + ')</title></circle>';
    }
  }
  return out + '</g>' + cursor(t, ph) + ticks(h) + '</svg>';
}

const toggle = (key, label, swatch, value) => '<button type="button" class="chart-series" data-fl-series="' + key + '" aria-pressed="' + !hidden.has(key) + '">' + (swatch ? '<i style="background:' + swatch + '"></i>' : '') + label + (value === undefined ? '' : ' <b>' + value + '</b>') + '</button>';
const tile = (label, value, sub, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
const streakText = (s) => (s > 0 ? s + ' sesi net beli' : s < 0 ? -s + ' sesi net jual' : '—');

function drawTop() {
  const host = body.querySelector('#fl-top');
  if (!host) return;
  const { buy, sell } = topStocks(topWindow);
  const list = (items, cls) => items.length ? items.map(([code, v], k) => '<li><span>' + (k + 1) + '</span><b>' + code + '</b><em class="' + cls + '">' + money(v) + '</em></li>').join('') : '<li class="fl-empty">—</li>';
  host.innerHTML = '<div><h4>Net beli asing terbesar</h4><ol>' + list(buy, 'btc-positive') + '</ol></div><div><h4>Net jual asing terbesar</h4><ol>' + list(sell, 'btc-negative') + '</ol></div>';
  body.querySelectorAll('[data-fl-top]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.flTop) === topWindow)));
}

function drawCharts() {
  if (!dialog.open || !rows.length) return;
  const p = rows[hoverIndex ?? Math.min(rows.length - 1, Math.round(view.end))];
  body.querySelector('#fl-flow-legend').innerHTML = '<b>' + day(p.date, true) + '</b><span>Net <b class="' + tone(p.netForeign) + '">' + money(p.netForeign) + '</b></span><span>Beli <b>' + money(p.foreignBuy).replace('+', '') + '</b> · Jual <b>' + money(p.foreignSell).replace('+', '') + '</b></span>' +
    toggle('cumulative', 'Kumulatif', '#f5f5f5', money(p.cumulative)) + toggle('ma5', 'MA5', '#9ad7e0', money(p.ma5));
  body.querySelector('#fl-part-legend').innerHTML = '<span>Partisipasi asing <b>' + (p.participation === null ? '—' : one.format(p.participation) + '%') + '</b></span><span>Intensitas net <b>' + (p.intensity === null ? '—' : pct.format(p.intensity) + '%') + '</b> dari nilai reguler</span><span>z-score <b>' + (p.z === null ? '—' : two.format(p.z)) + '</b></span>';
  body.querySelector('#fl-ihsg-legend').innerHTML = '<span><i style="background:#e91e63"></i>IHSG <b>' + (p.ihsg ? two.format(p.ihsg.close) : '—') + '</b> ' + (p.ihsgChange === null ? '' : pct.format(p.ihsgChange) + '%') + '</span>' + toggle('extreme', 'Net asing ekstrem |z| ≥ 2', 'linear-gradient(90deg,#00bcd4,#e91e63)') + '<span>Streak <b>' + streakText(p.streak) + '</b></span>';
  body.querySelector('#fl-flow-chart').innerHTML = flowChart();
  body.querySelector('#fl-part-chart').innerHTML = participationChart();
  body.querySelector('#fl-ihsg-chart').innerHTML = ihsgChart();
  body.querySelectorAll('[data-fl-range]').forEach((button) => {
    const preset = presetView(Number(button.dataset.flRange));
    button.setAttribute('aria-pressed', String(Math.abs(preset.start - view.start) < 0.5 && Math.abs(preset.end - view.end) < 0.5));
  });
}

function drawDialog() {
  if (!dialog.open) return;
  if (!rows.length) {
    body.innerHTML = '<p class="fx-empty">Memuat data net asing BEI…</p>';
    return;
  }
  const last = rows.at(-1);
  const prev20 = rows.length >= 40 ? rows.at(-21).sum20 : null;
  const avgPart = rows.slice(-20).reduce((s, x) => s + (x.participation || 0), 0) / Math.min(20, rows.length);
  const div = divergence(last);
  body.innerHTML =
    '<p class="fx-coverage">Ringkasan saham BEI · seluruh saham · pasar reguler · ' + rows.length + ' sesi (' + day(rows[0].date, true) + ' – ' + day(last.date, true) + ') · rupiah diestimasi dari volume asing × VWAP</p>' +
    '<div class="metric-detail-summary fx-summary">' +
      tile('Net ' + day(last.date), money(last.netForeign), last.z === null ? 'beli ' + money(last.foreignBuy).replace('+', '') : 'z ' + two.format(last.z) + (Math.abs(last.z) >= EXTREME_Z ? ' · ekstrem' : ''), tone(last.netForeign)) +
      tile('Net 5 sesi', money(last.sum5), 'IHSG ' + (last.ihsg5 === null ? '—' : pct.format(last.ihsg5) + '%'), tone(last.sum5)) +
      tile('Net 20 sesi', money(last.sum20), prev20 === null ? '' : '20 sesi sebelumnya ' + money(prev20), tone(last.sum20)) +
      tile('Streak', streakText(last.streak), 'partisipasi ' + (last.participation === null ? '—' : one.format(last.participation) + '%') + ' (rata-rata 20 sesi ' + one.format(avgPart) + '%)', tone(last.streak)) +
    '</div>' +
    '<p class="tv-reading">' + (div ? div + ' ' : '') + 'Kumulatif sejak ' + day(rows[0].date) + ': ' + money(last.cumulative) + '.</p>' +
    '<div class="fx-toolbar"><div class="history-periods" role="group" aria-label="Rentang grafik">' + RANGES.map(([label, n]) => '<button type="button" data-fl-range="' + n + '" aria-pressed="false">' + label + '</button>').join('') + '</div><span class="chart-hint">Scroll: zoom · seret: geser · klik ganda: reset · klik legenda: on/off</span><button type="button" class="fx-toggle" data-fl-csv>CSV</button></div>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Net asing harian <small>cyan: net beli · pink: net jual · batang tegas: ekstrem · garis putih: kumulatif (kanan)</small></h3></header><div class="m2-legend fx-legend" id="fl-flow-legend"></div><div id="fl-flow-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Partisipasi asing <small>(beli + jual asing) ÷ (2 × nilai reguler)</small></h3></header><div class="m2-legend fx-legend" id="fl-part-legend"></div><div id="fl-part-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>IHSG & net asing ekstrem <small>titik: net beli / jual di luar 2 simpangan baku 60 sesi</small></h3></header><div class="m2-legend fx-legend" id="fl-ihsg-legend"></div><div id="fl-ihsg-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Saham pilihan asing <small>dijumlah dari 15 net beli & jual terbesar tiap sesi</small></h3><div class="history-periods" role="group" aria-label="Rentang saham asing">' + [[1, '1H'], [5, '5H'], [20, '20H']].map(([n, label]) => '<button type="button" data-fl-top="' + n + '" aria-pressed="false">' + label + '</button>').join('') + '</div></header><div class="fl-top" id="fl-top"></div></section>' +
    '<p class="fx-method">BEI menerbitkan beli/jual asing per saham sebagai volume; nilai rupiah diestimasi dengan VWAP pasar reguler tiap saham (uji 12 Nov 2026: +508,9 M vs +510,5 M yang dilaporkan). Intensitas = net ÷ nilai reguler sesi; z-score membandingkan intensitas dengan 60 sesi sebelumnya, |z| ≥ 2 ditandai ekstrem. Divergensi membandingkan perubahan IHSG 5 sesi (≥ 1%) dengan arah net asing 5 sesi. Daftar saham adalah perkiraan karena hanya 15 teratas per sisi per sesi yang tersimpan. Bukan sinyal investasi.</p>' +
    '<p class="fx-source"><a href="https://idx.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/" target="_blank" rel="noopener noreferrer">Ringkasan saham BEI</a></p>';
  drawCharts();
  drawTop();
}

function downloadCsv() {
  const lines = ['tanggal,beli_asing_rp,jual_asing_rp,net_asing_rp,nilai_transaksi_rp,partisipasi_pct,ihsg'];
  for (const p of rows) lines.push([p.date, Math.round(p.foreignBuy), Math.round(p.foreignSell), Math.round(p.netForeign), Math.round(p.totalValue), p.participation === null ? '' : p.participation.toFixed(2), p.ihsg?.close ?? ''].join(','));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
  link.download = 'net-asing-bei-' + rows.at(-1).date + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const zoom = attachChartZoom(body, '.fx-chart-svg', {
  plot: { left: L, width: PW, total: W },
  onZoom(anchor, factor) { view = zoomWindow(view, bounds(), anchor, factor, 10); followEnd = view.end >= rows.length - 1.01; drawCharts(); },
  onPan(shift) { view = panWindow(view, bounds(), shift); followEnd = view.end >= rows.length - 1.01; drawCharts(); },
  onReset() { view = presetView(DEFAULT_RANGE); followEnd = true; drawCharts(); },
});

body.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('.fx-chart-svg');
  if (!svg || !rows.length || zoom.dragging()) return;
  const rect = svg.getBoundingClientRect();
  const anchor = Math.max(0, Math.min(1, ((event.clientX - rect.left) / (rect.width / W) - L) / PW));
  const index = Math.max(0, Math.min(rows.length - 1, Math.round(view.start + anchor * (view.end - view.start + 1) - 0.5)));
  if (index !== hoverIndex) { hoverIndex = index; drawCharts(); }
});
body.addEventListener('pointerleave', () => { if (hoverIndex !== null) { hoverIndex = null; drawCharts(); } });

async function load() {
  try {
    const response = await fetch('/api/idx-summary');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema !== 1 || !result.points?.length) throw new Error();
    const before = rows.length;
    rows = analyse(result.points);
    if (!view) view = presetView(DEFAULT_RANGE);
    else if (followEnd && rows.length !== before) view = panWindow(view, bounds(), (rows.length - 1 - view.end) / (view.end - view.start));
  } catch {}
  drawDialog();
}

// Takes over the card's detail button from the generic history dialog.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-metric="foreign-net"]');
  if (!trigger) return;
  event.stopPropagation();
  opener = trigger;
  hoverIndex = null;
  dialog.showModal();
  document.body.classList.add('metric-modal-open');
  drawDialog();
}, true);
dialog.querySelector('.fl-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  const preset = event.target.closest('[data-fl-range]');
  if (preset) { view = presetView(Number(preset.dataset.flRange)); followEnd = true; drawCharts(); return; }
  const series = event.target.closest('[data-fl-series]');
  if (series) { hidden.toggle(series.dataset.flSeries); drawCharts(); return; }
  const top = event.target.closest('[data-fl-top]');
  if (top) { topWindow = Number(top.dataset.flTop); drawTop(); return; }
  if (event.target.closest('[data-fl-csv]')) { downloadCsv(); return; }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

load();
setInterval(load, 60000);

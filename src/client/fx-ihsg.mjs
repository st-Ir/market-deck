// USD/IDR snapshot card and the USD/IDR vs IHSG comparison dialog. Data comes
// from /api/usd-idr: ECB reference USD/IDR and Yahoo IHSG closes, aligned on IHSG
// sessions, plus a sanity-checked Yahoo intraday USD/IDR quote.
//
// Bias controls: both series get a 20-session MA; correlation is measured on
// daily log returns (price levels that both trend correlate spuriously), over
// rolling 20- and 60-session windows so a one-off episode is visible as such.
import { attachChartZoom, hiddenSeries, panWindow, zoomWindow } from './chart-zoom.mjs';
import { flashValue } from './flash.mjs';

const API = '/api/usd-idr';
const REFRESH_MS = 30000;
const MA = 20;
const RANGES = [['3B', 63], ['6B', 126], ['1T', 250], ['2T', Infinity]];
const DEFAULT_RANGE = 126;

const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const clock = (iso) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace('.', ':');
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let data = null;
let failed = false;
let inverted = true;
let opener = null;
const dialog = document.getElementById('fx-ihsg-dialog');
const body = document.getElementById('fx-ihsg-body');

function movingAverage(values, n) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n];
    return i >= n - 1 ? sum / n : null;
  });
}

function rollingCorrelation(a, b, n) {
  return a.map((_, i) => {
    if (i < n - 1 || a[i] === null) return null;
    const xs = a.slice(i - n + 1, i + 1);
    const ys = b.slice(i - n + 1, i + 1);
    if (xs.includes(null) || ys.includes(null)) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let k = 0; k < n; k++) {
      sxy += (xs[k] - mx) * (ys[k] - my);
      sxx += (xs[k] - mx) ** 2;
      syy += (ys[k] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  });
}

function model() {
  const points = data.points;
  const fx = points.map((p) => p.usdidr);
  const ix = points.map((p) => p.ihsg);
  const logReturns = (values) => values.map((v, i) => (i ? Math.log(v / values[i - 1]) : null));
  const rf = logReturns(fx);
  const ri = logReturns(ix);
  const fxMa = movingAverage(fx, MA);
  const ixMa = movingAverage(ix, MA);
  const corr20 = rollingCorrelation(rf, ri, 20);
  const corr60 = rollingCorrelation(rf, ri, 60);
  const level60 = rollingCorrelation(fx, ix, 60);
  return points.map((p, i) => ({ ...p, fxMa: fxMa[i], ixMa: ixMa[i], corr20: corr20[i], corr60: corr60[i], level60: level60[i], side: fxMa[i] === null ? 0 : p.usdidr <= fxMa[i] ? 1 : -1 }));
}

function corrLabel(value) {
  if (value === null) return 'belum cukup data';
  if (value <= -0.6) return 'berlawanan kuat';
  if (value <= -0.3) return 'berlawanan sedang';
  if (value < 0.3) return 'lemah / tidak konsisten';
  return 'searah';
}

// ---- Snapshot card -------------------------------------------------------

function drawCard() {
  const card = document.querySelector('#market-snapshot[data-market="ihsg"] [data-metric="usd-idr"]');
  if (!card) return;
  const value = card.querySelector('.metric-value');
  const delta = card.querySelector('.metric-delta');
  const date = card.querySelector('.metric-date');
  if (!data) {
    date.textContent = failed ? 'Kurs belum tersedia' : 'Memuat kurs…';
    return;
  }
  const quote = data.quote.usdidr;
  value.textContent = whole.format(quote.value);
  flashValue(value, quote.value);
  const change = quote.changePercent;
  delta.replaceChildren(document.createTextNode(change === null ? '—' : pct.format(change) + '%'), Object.assign(document.createElement('small'), { textContent: ' Δ1H' }));
  // USD/IDR up means a weaker rupiah.
  delta.style.color = change === null ? 'var(--muted)' : change > 0 ? 'var(--pink)' : 'var(--cyan)';
  date.textContent = quote.source === 'yahoo' ? 'Yahoo · ' + day(quote.date) + ' · ' + clock(quote.time) + ' WIB' : 'ECB · ' + day(quote.date) + ' · kurs referensi';
  card.dataset.date = quote.date;
  const spark = card.querySelector('.metric-spark');
  const values = data.fxSpark.map((p) => p.close);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', values.map((v, i) => (i / (values.length - 1) * 130).toFixed(2) + ',' + (3 + (max - v) / span * 24).toFixed(2)).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', values.at(-1) > values[0] ? '#e91e63' : '#00bcd4');
  line.setAttribute('stroke-width', '1.3');
  spark.replaceChildren(line);
  spark.setAttribute('aria-label', 'USD/IDR 30 hari terakhir, ' + whole.format(values[0]) + ' ke ' + whole.format(values.at(-1)));
}

// ---- Dialog --------------------------------------------------------------

// Both panels share the horizontal geometry, so they zoom and pan together.
const W = 720, L = 50, R = 58, PW = W - L - R;
const MAIN = [
  { key: 'ihsg', label: 'IHSG', field: 'ihsg', axis: 'ix', color: '#e91e63', width: 1.2, format: two },
  { key: 'ixMa', label: 'MA20', field: 'ixMa', axis: 'ix', color: '#ff9ec0', width: 2, format: two },
  { key: 'usdidr', label: 'USD/IDR', field: 'usdidr', axis: 'fx', color: '#888', width: 1.2, format: whole },
  { key: 'fxMa', label: 'MA20', field: 'fxMa', axis: 'fx', color: '#f5f5f5', width: 2, format: whole },
];
const MARKS = [
  { key: 'regime', label: 'Arsiran regime' },
  { key: 'cross', label: 'Cross MA20' },
];
const CORR = [
  { key: 'corr20', label: '20 sesi', field: 'corr20', color: '#f5f5f5', width: 1.6 },
  { key: 'corr60', label: '60 sesi', field: 'corr60', color: '#888', width: 1.2 },
  { key: 'level60', label: 'Level 60 sesi (bias tren)', field: 'level60', color: '#e91e63', width: 1, dash: '3 3' },
];

const hidden = hiddenSeries('market-deck:fx-ihsg-series');
let all = [];
let view = null; // { start, end } as fractional indices into `all`
let followEnd = true;
let hoverIndex = null;

function tile(label, value, sub, tone) {
  return '<div><span>' + label + '</span><strong' + (tone ? ' class="' + tone + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
}

const bounds = () => ({ min: 0, max: Math.max(1, all.length - 1) });
const presetView = (n) => ({ start: Math.max(0, all.length - Math.min(n, all.length)), end: all.length - 1 });

function visibleRange() {
  const first = Math.max(0, Math.floor(view.start) - 1);
  const last = Math.min(all.length - 1, Math.ceil(view.end) + 1);
  return { first, last };
}

const xOf = (i) => L + (i - view.start) / (view.end - view.start) * PW;

function pathFor(field, scale, first, last) {
  let d = '', pen = false;
  for (let i = first; i <= last; i++) {
    const v = all[i][field];
    if (v === null || v === undefined) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + xOf(i).toFixed(2) + ' ' + scale(v).toFixed(2);
    pen = true;
  }
  return d;
}

function timeTicks(h) {
  const span = view.end - view.start;
  let out = '';
  for (let k = 0; k <= 5; k++) {
    const i = Math.round(view.start + span * k / 5);
    if (!all[i]) continue;
    out += '<text x="' + xOf(i).toFixed(1) + '" y="' + (h - 9) + '" text-anchor="' + (k === 0 ? 'start' : k === 5 ? 'end' : 'middle') + '">' + day(all[i].date, span > 200) + '</text>';
  }
  return out;
}

function cursor(t, ph) {
  return hoverIndex === null || !all[hoverIndex] ? '' : '<line x1="' + xOf(hoverIndex) + '" x2="' + xOf(hoverIndex) + '" y1="' + t + '" y2="' + (t + ph) + '" class="fx-cursor"/>';
}

function mainChart() {
  const h = 330, t = 31, b = 31, ph = h - t - b;
  const { first, last } = visibleRange();
  const inView = all.slice(Math.max(0, Math.floor(view.start)), Math.ceil(view.end) + 1);
  const extent = (axis) => {
    const shown = MAIN.filter((s) => s.axis === axis && !hidden.has(s.key));
    const values = inView.flatMap((p) => (shown.length ? shown : MAIN.filter((s) => s.axis === axis)).map((s) => p[s.field])).filter((v) => v !== null);
    return [Math.min(...values), Math.max(...values)];
  };
  let [imin, imax] = extent('ix');
  let [fmin, fmax] = extent('fx');
  const ipad = (imax - imin || imax * 0.01) * 0.06, fpad = (fmax - fmin || fmax * 0.002) * 0.06;
  imin -= ipad; imax += ipad; fmin -= fpad; fmax += fpad;
  const iy = (v) => t + (imax - v) / (imax - imin) * ph;
  const fy = (v) => (inverted ? t + (v - fmin) / (fmax - fmin) * ph : t + (fmax - v) / (fmax - fmin) * ph);
  let out = '<svg class="fx-chart-svg chart-zoomable" viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="IHSG skala kiri, USD/IDR skala kanan' + (inverted ? ' dibalik' : '') + ', dengan MA20"><defs><clipPath id="fx-clip-main"><rect x="' + L + '" y="' + t + '" width="' + PW + '" height="' + ph + '"/></clipPath></defs>';
  for (let k = 0; k < 5; k++) {
    const yy = t + k * ph / 4;
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="fx-grid"/>';
    out += '<text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + whole.format(imax - k * (imax - imin) / 4) + '</text>';
    out += '<text x="' + (W - R + 7) + '" y="' + (yy + 4) + '">' + whole.format(inverted ? fmin + k * (fmax - fmin) / 4 : fmax - k * (fmax - fmin) / 4) + '</text>';
  }
  out += '<g clip-path="url(#fx-clip-main)">';
  if (!hidden.has('regime')) {
    for (let i = Math.max(1, first); i <= last;) {
      const side = all[i].side;
      let j = i;
      while (j + 1 <= last && all[j + 1].side === side) j++;
      if (side) out += '<rect x="' + xOf(i - 1).toFixed(2) + '" y="' + t + '" width="' + (xOf(j) - xOf(i - 1)).toFixed(2) + '" height="' + ph + '" fill="' + (side > 0 ? '#00bcd4' : '#e91e63') + '" opacity=".075"/>';
      i = j + 1;
    }
  }
  for (const s of MAIN) {
    if (hidden.has(s.key)) continue;
    out += '<path d="' + pathFor(s.field, s.axis === 'ix' ? iy : fy, first, last) + '" fill="none" stroke="' + s.color + '" stroke-width="' + s.width + '" stroke-linejoin="round"/>';
  }
  if (!hidden.has('cross')) {
    // USD/IDR crossing its MA20: below = rupiah strengthening (cyan), above = weakening (pink).
    for (let i = Math.max(1, first); i <= last; i++) {
      const a = all[i - 1].side, c = all[i].side;
      if (!a || !c || a === c) continue;
      const up = (c > 0) === inverted;
      const cx = xOf(i), cy = fy(all[i].fxMa);
      const tip = up ? cy - 6 : cy + 6, base = up ? cy + 3 : cy - 3;
      out += '<path d="M' + cx.toFixed(1) + ' ' + tip.toFixed(1) + 'L' + (cx - 4.5).toFixed(1) + ' ' + base.toFixed(1) + 'L' + (cx + 4.5).toFixed(1) + ' ' + base.toFixed(1) + 'Z" fill="' + (c > 0 ? '#00bcd4' : '#e91e63') + '" stroke="none"><title>' + day(all[i].date, true) + ' · USD/IDR ' + (c > 0 ? 'turun di bawah' : 'naik di atas') + ' MA20</title></path>';
    }
  }
  out += '</g>' + cursor(t, ph) + timeTicks(h);
  out += '<text x="' + L + '" y="' + (h - 21) + '" class="fx-axis-note">IHSG · poin</text><text x="' + (W - R) + '" y="' + (h - 21) + '" text-anchor="end" class="fx-axis-note">USD/IDR' + (inverted ? ' (dibalik)' : '') + '</text></svg>';
  return out;
}

function corrChart() {
  const h = 150, t = 12, b = 22, ph = h - t - b;
  const { first, last } = visibleRange();
  const y = (v) => t + (1 - v) / 2 * ph;
  let out = '<svg class="fx-chart-svg fx-corr-svg chart-zoomable" viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="Korelasi USD/IDR dan IHSG"><defs><clipPath id="fx-clip-corr"><rect x="' + L + '" y="' + t + '" width="' + PW + '" height="' + ph + '"/></clipPath></defs>';
  out += '<rect x="' + L + '" y="' + y(-0.3) + '" width="' + PW + '" height="' + (y(-1) - y(-0.3)) + '" fill="#00bcd4" opacity=".06"/>';
  for (const v of [1, 0.5, 0, -0.5, -1]) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="fx-grid' + (v === 0 ? ' fx-zero' : '') + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + two.format(v) + '</text>';
  out += '<g clip-path="url(#fx-clip-corr)">';
  for (const s of CORR) {
    if (hidden.has(s.key)) continue;
    out += '<path d="' + pathFor(s.field, y, first, last) + '" fill="none" stroke="' + s.color + '" stroke-width="' + s.width + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '" opacity=".7"' : '') + '/>';
  }
  out += '</g>' + cursor(t, ph) + '<text x="' + (W - R + 7) + '" y="' + (y(-0.65) + 4) + '" class="fx-axis-note">berlawanan</text></svg>';
  return out;
}

function seriesButton(s, value, swatch = s.color) {
  return '<button type="button" class="chart-series" data-fx-series="' + s.key + '" aria-pressed="' + !hidden.has(s.key) + '">' +
    (swatch ? '<i style="background:' + swatch + (s.width >= 1.6 ? ';height:2px' : '') + '"></i>' : '') + s.label + (value === undefined ? '' : ' <b>' + value + '</b>') + '</button>';
}

function drawCharts() {
  if (!dialog?.open || !all.length) return;
  const row = all[hoverIndex ?? Math.min(all.length - 1, Math.round(view.end))];
  const v = (value, f) => (value === null ? '—' : f.format(value));
  body.querySelector('#fx-main-legend').innerHTML = '<b>' + day(row.date, true) + '</b>' +
    MAIN.map((s) => seriesButton(s, v(row[s.field], s.format))).join('') +
    MARKS.map((s) => seriesButton(s, undefined, s.key === 'regime' ? 'linear-gradient(90deg,#00bcd4,#e91e63)' : '')).join('');
  body.querySelector('#fx-corr-legend').innerHTML = CORR.map((s) => seriesButton(s, v(row[s.field], two))).join('') + '<span>' + corrLabel(row.corr20) + '</span>';
  body.querySelector('#fx-main-chart').innerHTML = mainChart();
  body.querySelector('#fx-corr-chart').innerHTML = corrChart();
  body.querySelectorAll('[data-fx-range]').forEach((button) => {
    const preset = presetView(Number(button.dataset.fxRange));
    button.setAttribute('aria-pressed', String(Math.abs(preset.start - view.start) < 0.5 && Math.abs(preset.end - view.end) < 0.5));
  });
  body.querySelector('[data-fx-invert]').setAttribute('aria-pressed', String(inverted));
}

function drawDialog() {
  if (!dialog?.open) return;
  if (!data) {
    body.innerHTML = '<p class="fx-empty">' + (failed ? 'Data belum dapat dimuat. Mencoba lagi tiap menit.' : 'Memuat data…') + '</p>';
    return;
  }
  const last = all.at(-1);
  const fxQuote = data.quote.usdidr, ixQuote = data.quote.ihsg;
  const fxDev = last.fxMa ? (last.usdidr / last.fxMa - 1) * 100 : null;
  const ixDev = last.ixMa ? (last.ihsg / last.ixMa - 1) * 100 : null;
  body.innerHTML =
    '<p class="fx-coverage">USD/IDR ' + (fxQuote.source === 'yahoo' ? 'Yahoo ' + clock(fxQuote.time) + ' WIB' : 'ECB ' + day(fxQuote.date)) + ' · riwayat kurs referensi ECB · IHSG ' + day(ixQuote.date) + ' ' + clock(ixQuote.time) + ' WIB · ' + all.length + ' sesi IHSG</p>' +
    '<div class="metric-detail-summary fx-summary">' +
      tile('USD / IDR', whole.format(fxQuote.value), (fxQuote.changePercent === null ? '—' : pct.format(fxQuote.changePercent) + '%') + ' · vs MA20 ' + (fxDev === null ? '—' : pct.format(fxDev) + '%'), fxQuote.changePercent > 0 ? 'btc-negative' : 'btc-positive') +
      tile('IHSG', two.format(ixQuote.value), (ixQuote.changePercent === null ? '—' : pct.format(ixQuote.changePercent) + '%') + ' · vs MA20 ' + (ixDev === null ? '—' : pct.format(ixDev) + '%'), ixQuote.changePercent < 0 ? 'btc-negative' : 'btc-positive') +
      tile('Korelasi return 20 sesi', last.corr20 === null ? '—' : two.format(last.corr20), corrLabel(last.corr20)) +
      tile('Korelasi return 60 sesi', last.corr60 === null ? '—' : two.format(last.corr60), corrLabel(last.corr60)) +
    '</div>' +
    '<div class="fx-toolbar"><div class="history-periods" role="group" aria-label="Rentang grafik">' +
      RANGES.map(([label, n]) => '<button type="button" data-fx-range="' + n + '" aria-pressed="false">' + label + '</button>').join('') +
    '</div><span class="chart-hint">Scroll: zoom · seret: geser · klik ganda: reset · klik legenda: on/off</span><button type="button" class="fx-toggle" data-fx-invert aria-pressed="' + inverted + '">Sumbu USD/IDR dibalik</button></div>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>USD/IDR & IHSG <small>harga · MA20</small></h3><span class="m2-state ' + (last.side >= 0 ? 'btc-positive' : 'btc-negative') + '">USD/IDR ' + (last.side >= 0 ? 'di bawah' : 'di atas') + ' MA20 · rupiah ' + (last.side >= 0 ? 'menguat' : 'melemah') + '</span></header>' +
      '<div class="m2-legend fx-legend" id="fx-main-legend"></div><div id="fx-main-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Korelasi return harian <small>USD/IDR vs IHSG · rolling</small></h3></header>' +
      '<div class="m2-legend fx-legend" id="fx-corr-legend"></div><div id="fx-corr-chart"></div></section>' +
    '<p class="fx-method">Area cyan: USD/IDR di bawah MA20 (rupiah menguat); area pink: di atas MA20. Segitiga menandai USD/IDR memotong MA20-nya. ' +
      'Korelasi dihitung dari return harian (log), bukan level harga: dua seri yang sama-sama sedang tren bisa tampak berkorelasi padahal tidak; garis korelasi level (putus-putus) hanya pembanding. Jendela 20 dan 60 sesi memperlihatkan apakah hubungan berlawanan itu stabil; di atas −0,3 hubungannya lemah dan tidak layak dijadikan sinyal. ' +
      'Riwayat kurs memakai kurs referensi ECB (sekitar 20.15 WIB) pada tanggal sesi IHSG, atau kurs terakhir sebelumnya bila tidak ada; data harian Yahoo IDR=X tidak dipakai karena memuat penutupan di luar rentang harian. Kurs referensi ditetapkan setelah bursa tutup (16.00 WIB), sehingga korelasi hari yang sama sedikit melebih-lebihkan hubungan. Kuotasi intraday Yahoo hanya dipakai bila selisihnya dengan ECB terakhir di bawah 1,5%. Bukan sinyal investasi.</p>' +
    '<p class="fx-source"><a href="' + escape(data.sourceUrl) + '" target="_blank" rel="noopener noreferrer">ECB · USD/IDR</a> · <a href="' + escape(data.liveSourceUrl) + '" target="_blank" rel="noopener noreferrer">Yahoo IDR=X</a> · <a href="' + escape(data.ihsgSourceUrl) + '" target="_blank" rel="noopener noreferrer">Yahoo ^JKSE</a> · diperbarui ' + clock(data.generatedAt) + ' WIB</p>';
  drawCharts();
}

const zoom = attachChartZoom(body, '.fx-chart-svg', {
  plot: { left: L, width: PW, total: W },
  onZoom(anchor, factor) {
    view = zoomWindow(view, bounds(), anchor, factor, 15);
    followEnd = view.end >= all.length - 1.01;
    drawCharts();
  },
  onPan(shift) {
    view = panWindow(view, bounds(), shift);
    followEnd = view.end >= all.length - 1.01;
    drawCharts();
  },
  onReset() {
    view = presetView(DEFAULT_RANGE);
    followEnd = true;
    drawCharts();
  },
});

body.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('.fx-chart-svg');
  if (!svg || !all.length || zoom.dragging()) return;
  const rect = svg.getBoundingClientRect();
  const anchor = Math.max(0, Math.min(1, ((event.clientX - rect.left) / (rect.width / W) - L) / PW));
  const index = Math.max(0, Math.min(all.length - 1, Math.round(view.start + anchor * (view.end - view.start))));
  if (index !== hoverIndex) {
    hoverIndex = index;
    drawCharts();
  }
});
body.addEventListener('pointerleave', () => {
  if (hoverIndex === null) return;
  hoverIndex = null;
  drawCharts();
});

async function load() {
  try {
    const response = await fetch(API);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (result.schema !== 1 || !result.points?.length || !result.quote?.usdidr) throw new Error('format');
    data = result;
    failed = false;
    const previousLength = all.length;
    all = model();
    if (!view) view = presetView(DEFAULT_RANGE);
    else if (followEnd && all.length !== previousLength) view = panWindow(view, bounds(), (all.length - 1 - view.end) / (view.end - view.start));
  } catch {
    failed = true;
  }
  drawCard();
  drawDialog();
}

function open(trigger) {
  opener = trigger;
  hoverIndex = null;
  dialog.showModal();
  document.body.classList.add('metric-modal-open');
  drawDialog();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-fx-open]');
  if (trigger) open(trigger);
});
dialog.querySelector('.fx-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  const rangeButton = event.target.closest('[data-fx-range]');
  if (rangeButton) {
    view = presetView(Number(rangeButton.dataset.fxRange));
    followEnd = true;
    drawCharts();
    return;
  }
  const series = event.target.closest('[data-fx-series]');
  if (series) {
    hidden.toggle(series.dataset.fxSeries);
    drawCharts();
    return;
  }
  if (event.target.closest('[data-fx-invert]')) {
    inverted = !inverted;
    drawCharts();
    return;
  }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
// The card is re-rendered when the market switches back to IHSG.
document.addEventListener('market-deck:market', () => drawCard());

load();
setInterval(load, REFRESH_MS);

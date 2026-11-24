// Turnover momentum dialog for the NILAI TRANSAKSI card, from /api/idx-turnover
// (BEI daily stock + index summary). Besides history it reads:
// - RVOL: regular-market turnover vs the mean of the previous 20 sessions (today
//   excluded); ≥1,5× is a spike, ≥1,2× high, <0,8× quiet. Negotiated (block)
//   trades stay out of RVOL/MA/percentile so one crossing cannot distort a month
//   of readings; days with ≥30% negotiated value are flagged as blocks;
// - momentum: MA5 vs MA20 of turnover; percentile vs the last 60 sessions;
// - price–volume: accumulation / distribution days (IHSG ±0,2% or more on higher
//   turnover than the previous session), counted over 20 sessions;
// - composition: negotiated share, foreign participation, breadth, and the
//   stocks that drove each spike.
// During the session /api/idx-live adds today as a provisional bar (regular
// market only) with a linear full-day projection; it never enters the MA, RVOL,
// percentile or distribution statistics, which use completed sessions only.
import { attachChartZoom, hiddenSeries, panWindow, zoomWindow } from './chart-zoom.mjs';
import { sessionProgress } from './market-hours.mjs';

const dialog = document.getElementById('turnover-dialog');
const body = document.getElementById('turnover-body');
const W = 720, L = 50, R = 58, PW = W - L - R;
const RANGES = [['1B', 21], ['3B', 63], ['6B', Infinity]];
const DEFAULT_RANGE = 63;
const SPIKE = 1.5, HIGH = 1.2, QUIET = 0.8, BLOCK_SHARE = 30;

const trillion = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const one = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const T = (v) => (v === null || v === undefined ? '—' : trillion.format(v / 1e12) + ' T');
const B = (v) => whole.format(v / 1e9) + ' M';

const hidden = hiddenSeries('market-deck:turnover-series');
let rows = [];
let view = null;
let followEnd = true;
let hoverIndex = null;
let opener = null;
let liveFeed = null;

// Today's session so far, appended after the completed sessions.
function liveRow(feed, history) {
  const t = feed.turnover, index = feed.indices?.COMPOSITE;
  const previous20 = history.slice(-20).map((p) => p.base);
  const mean20 = previous20.length === 20 ? previous20.reduce((sum, v) => sum + v, 0) / 20 : null;
  const progress = sessionProgress(feed.date, feed.time);
  const projected = progress >= 0.1 ? t.regularValue / progress : null;
  return {
    date: feed.date, time: feed.time, provisional: true, progress, projected,
    projectedRvol: projected && mean20 ? projected / mean20 : null,
    totalValue: t.regularValue, regularValue: t.regularValue, nonRegularValue: 0, base: t.regularValue,
    frequency: t.frequency, advancers: t.advancers, decliners: t.decliners,
    ihsg: index ? { close: index.current, previous: index.previous } : null,
    ihsgChange: index?.previous ? (index.current / index.previous - 1) * 100 : null,
    topValue: (t.topValue || []).map(([code, value]) => [code, value, 0]),
    ma5: null, ma20: null, rvol: null, z: null, percentile: null, pv: null, block: false, negoShare: null, foreignShare: null,
  };
}

function analyse(points) {
  const out = points.map((p) => ({ ...p }));
  out.forEach((p) => { p.base = p.regularValue ?? p.totalValue; });
  out.forEach((p, i) => {
    const prev20 = out.slice(Math.max(0, i - 20), i).map((x) => x.base);
    const mean = prev20.length === 20 ? prev20.reduce((s, v) => s + v, 0) / 20 : null;
    const sd = mean === null ? null : Math.sqrt(prev20.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    const last5 = out.slice(Math.max(0, i - 4), i + 1).map((x) => x.base);
    const last20 = out.slice(Math.max(0, i - 19), i + 1).map((x) => x.base);
    p.ma5 = last5.length === 5 ? last5.reduce((s, v) => s + v, 0) / 5 : null;
    p.ma20 = last20.length === 20 ? last20.reduce((s, v) => s + v, 0) / 20 : null;
    p.rvol = mean ? p.base / mean : null;
    p.z = sd ? (p.base - mean) / sd : null;
    p.ihsgChange = p.ihsg?.previous ? (p.ihsg.close / p.ihsg.previous - 1) * 100 : null;
    p.negoShare = p.totalValue ? p.nonRegularValue / p.totalValue * 100 : null;
    p.foreignShare = p.base ? (p.foreignBuy + p.foreignSell) / (2 * p.base) * 100 : null;
    const higher = i > 0 && p.base > out[i - 1].base;
    p.pv = p.ihsgChange === null || i === 0 ? null : p.ihsgChange <= -0.2 && higher ? 'distribution' : p.ihsgChange >= 0.2 && higher ? 'accumulation' : null;
    const window60 = out.slice(Math.max(0, i - 59), i + 1).map((x) => x.base);
    p.percentile = window60.length >= 20 ? window60.filter((v) => v <= p.base).length / window60.length * 100 : null;
    p.block = p.negoShare !== null && p.negoShare >= BLOCK_SHARE;
  });
  return out;
}

const rvolLabel = (r) => (r === null ? '—' : r >= SPIKE ? 'Spike' : r >= HIGH ? 'Tinggi' : r < QUIET ? 'Sepi' : 'Normal');
function reading(p) {
  if (p.rvol === null || p.ihsgChange === null) return 'Belum cukup riwayat.';
  const move = 'IHSG ' + pct.format(p.ihsgChange) + '% dengan RVOL ' + two.format(p.rvol) + '×';
  if (p.ihsgChange >= 0.2 && p.rvol >= HIGH) return move + ': kenaikan dikonfirmasi volume.';
  if (p.ihsgChange <= -0.2 && p.rvol >= HIGH) return move + ': penurunan disertai volume tinggi (tekanan jual).';
  if (p.ihsgChange >= 0.2 && p.rvol < QUIET) return move + ': kenaikan tanpa dukungan volume.';
  if (p.ihsgChange <= -0.2 && p.rvol < QUIET) return move + ': penurunan bervolume tipis.';
  return move + ': volume sejalan dengan rata-rata.';
}

// ---- charts ---------------------------------------------------------------

const bounds = () => ({ min: 0, max: Math.max(1, rows.length - 1) });
const presetView = (n) => ({ start: Math.max(0, rows.length - Math.min(n, rows.length)), end: rows.length - 1 });
// Each session gets a slot; bars sit in the middle so the first and last stay whole.
const xOf = (i) => L + (i - view.start + 0.5) / (view.end - view.start + 1) * PW;
const range = () => ({ first: Math.max(0, Math.floor(view.start) - 1), last: Math.min(rows.length - 1, Math.ceil(view.end) + 1) });
const inView = () => rows.slice(Math.max(0, Math.floor(view.start)), Math.ceil(view.end) + 1);

function pathFor(field, scale, first, last) {
  let d = '', pen = false;
  for (let i = first; i <= last; i++) {
    const v = typeof field === 'function' ? field(rows[i]) : rows[i][field];
    if (v === null || v === undefined) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + xOf(i).toFixed(2) + ' ' + scale(v).toFixed(2);
    pen = true;
  }
  return d;
}

function frame(h, t, ph, id, label) {
  return '<svg class="fx-chart-svg chart-zoomable" viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="' + label + '"><defs><clipPath id="' + id + '"><rect x="' + L + '" y="' + (t - 12) + '" width="' + PW + '" height="' + (ph + 12) + '"/></clipPath></defs>';
}
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

function valueChart() {
  const h = 260, t = 22, b = 26, ph = h - t - b;
  const { first, last } = range();
  const max = Math.max(...inView().map((p) => Math.max(p.totalValue, p.projected || 0))) * 1.12;
  const y = (v) => t + ph - v / max * ph;
  const bar = Math.max(1.5, PW / Math.max(1, view.end - view.start + 1) * 0.68);
  let out = frame(h, t, ph, 'tv-clip-value', 'Nilai transaksi harian dengan MA20 dan MA5') +
    '<defs><pattern id="tv-live-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#f5f5f5" opacity=".08"/><line x1="0" y1="0" x2="0" y2="5" stroke="#00bcd4" stroke-width="2.4"/></pattern></defs>';
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4, yy = y(v);
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="fx-grid"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + one.format(v / 1e12) + 'T</text>';
  }
  out += '<g clip-path="url(#tv-clip-value)">';
  for (let i = first; i <= last; i++) {
    const p = rows[i], x = xOf(i) - bar / 2, color = p.ihsgChange === null ? '#888' : p.ihsgChange >= 0 ? '#00bcd4' : '#e91e63';
    if (p.provisional) {
      if (p.projected > p.base) out += '<rect x="' + x.toFixed(2) + '" y="' + y(p.projected).toFixed(2) + '" width="' + bar.toFixed(2) + '" height="' + (y(p.base) - y(p.projected)).toFixed(2) + '" fill="none" stroke="#f5f5f5" stroke-opacity=".55" stroke-dasharray="3 2"><title>Proyeksi linear sehari ' + T(p.projected) + '</title></rect>';
      out += '<rect x="' + x.toFixed(2) + '" y="' + y(p.base).toFixed(2) + '" width="' + bar.toFixed(2) + '" height="' + (t + ph - y(p.base)).toFixed(2) + '" fill="url(#tv-live-hatch)" stroke="#00bcd4" stroke-width="1"><title>Sesi berjalan ' + p.time + ' WIB · ' + T(p.base) + ' reguler</title></rect>';
      // Right-aligned to the bar: today usually sits at the right edge of the plot.
      out += '<text x="' + (xOf(i) + bar / 2).toFixed(1) + '" y="' + (y(Math.max(p.base, p.projected || 0)) - 5).toFixed(1) + '" text-anchor="end" class="tv-live-label">LIVE</text>';
      continue;
    }
    const regular = hidden.has('nego') ? p.totalValue : p.regularValue;
    out += '<rect x="' + x.toFixed(2) + '" y="' + y(regular).toFixed(2) + '" width="' + bar.toFixed(2) + '" height="' + (t + ph - y(regular)).toFixed(2) + '" fill="' + color + '" opacity="' + (p.rvol >= SPIKE ? 0.95 : 0.55) + '"/>';
    if (!hidden.has('nego') && p.nonRegularValue > 0) out += '<rect x="' + x.toFixed(2) + '" y="' + y(p.totalValue).toFixed(2) + '" width="' + bar.toFixed(2) + '" height="' + (y(regular) - y(p.totalValue)).toFixed(2) + '" fill="#e9a91e" opacity=".75"/>';
  }
  if (!hidden.has('ma20')) out += '<path d="' + pathFor('ma20', y, first, last) + '" fill="none" stroke="#f5f5f5" stroke-width="1.8"/>';
  if (!hidden.has('ma5')) out += '<path d="' + pathFor('ma5', y, first, last) + '" fill="none" stroke="#9ad7e0" stroke-width="1.1" stroke-dasharray="4 3"/>';
  if (!hidden.has('spike')) {
    for (let i = first; i <= last; i++) {
      const p = rows[i];
      if (!(p.rvol >= SPIKE) || p.block) continue;
      const cx = xOf(i), cy = y(p.totalValue) - 5;
      out += '<path d="M' + cx.toFixed(1) + ' ' + cy.toFixed(1) + 'L' + (cx - 4).toFixed(1) + ' ' + (cy - 7).toFixed(1) + 'L' + (cx + 4).toFixed(1) + ' ' + (cy - 7).toFixed(1) + 'Z" fill="#f5f5f5" stroke="none"><title>' + day(p.date, true) + ' · spike reguler ' + two.format(p.rvol) + '×</title></path>';
    }
    for (let i = first; i <= last; i++) {
      const p = rows[i];
      if (!p.block) continue;
      const cx = xOf(i), cy = y(p.totalValue) - 12;
      out += '<rect x="' + (cx - 3.5).toFixed(1) + '" y="' + cy.toFixed(1) + '" width="7" height="7" fill="#e9a91e" stroke="none"><title>' + day(p.date, true) + ' · blok nego ' + one.format(p.negoShare) + '%</title></rect>';
    }
  }
  return out + '</g>' + cursor(t, ph) + ticks(h) + '</svg>';
}

function rvolChart() {
  const h = 130, t = 12, b = 22, ph = h - t - b;
  const { first, last } = range();
  const values = inView().flatMap((p) => [p.rvol, p.projectedRvol]).filter((v) => v !== null && v !== undefined);
  const max = Math.max(2, ...values) * 1.05, min = 0;
  const y = (v) => t + (max - v) / (max - min) * ph;
  let out = frame(h, t, ph, 'tv-clip-rvol', 'RVOL nilai transaksi terhadap rata-rata 20 sesi');
  out += '<rect x="' + L + '" y="' + y(max) + '" width="' + PW + '" height="' + (y(SPIKE) - y(max)) + '" fill="#f5f5f5" opacity=".04"/>';
  for (const [v, cls] of [[1, ' fx-zero'], [SPIKE, ''], [QUIET, '']]) {
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="fx-grid' + cls + '"' + (v === SPIKE ? ' stroke-dasharray="4 3"' : '') + '/>';
    // The quiet line sits close to 1,0×, so it is labelled on the right.
    out += v === QUIET ? '<text x="' + (W - R + 7) + '" y="' + (y(v) + 4) + '" class="fx-axis-note">sepi</text>' : '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + one.format(v) + '×</text>';
  }
  out += '<g clip-path="url(#tv-clip-rvol)"><path d="' + pathFor('rvol', y, first, last) + '" fill="none" stroke="#f5f5f5" stroke-width="1.4"/>';
  for (let i = first; i <= last; i++) {
    const p = rows[i];
    if (p.provisional && p.projectedRvol) out += '<circle cx="' + xOf(i).toFixed(2) + '" cy="' + y(p.projectedRvol).toFixed(2) + '" r="3.5" fill="#131313" stroke="#00bcd4" stroke-width="1.4"><title>RVOL proyeksi ' + two.format(p.projectedRvol) + '× (kasar)</title></circle>';
  }
  out += '</g>';
  out += '<text x="' + (W - R + 7) + '" y="' + (y(SPIKE) + 4) + '" class="fx-axis-note">spike</text>';
  return out + cursor(t, ph) + '</svg>';
}

function ihsgChart() {
  const h = 170, t = 14, b = 24, ph = h - t - b;
  const { first, last } = range();
  const closes = inView().map((p) => p.ihsg?.close).filter(Boolean);
  const pad = (Math.max(...closes) - Math.min(...closes)) * 0.08 || 10;
  const min = Math.min(...closes) - pad, max = Math.max(...closes) + pad;
  const y = (v) => t + (max - v) / (max - min) * ph;
  let out = frame(h, t, ph, 'tv-clip-ihsg', 'IHSG dengan hari akumulasi dan distribusi');
  for (let k = 0; k <= 3; k++) {
    const v = max - (max - min) * k / 3, yy = y(v);
    out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="fx-grid"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + whole.format(v) + '</text>';
  }
  out += '<g clip-path="url(#tv-clip-ihsg)"><path d="' + pathFor((p) => p.ihsg?.close ?? null, y, first, last) + '" fill="none" stroke="#e91e63" stroke-width="1.3"/>';
  if (!hidden.has('pv')) {
    for (let i = first; i <= last; i++) {
      const p = rows[i];
      if (!p.pv || !p.ihsg) continue;
      out += '<circle cx="' + xOf(i).toFixed(2) + '" cy="' + y(p.ihsg.close).toFixed(2) + '" r="3.2" fill="' + (p.pv === 'accumulation' ? '#00bcd4' : '#e91e63') + '" stroke="#131313" stroke-width="1"><title>' + day(p.date, true) + ' · ' + (p.pv === 'accumulation' ? 'hari akumulasi' : 'hari distribusi') + '</title></circle>';
    }
  }
  return out + '</g>' + cursor(t, ph) + ticks(h) + '</svg>';
}

function toggle(key, label, swatch, value) {
  return '<button type="button" class="chart-series" data-tv-series="' + key + '" aria-pressed="' + !hidden.has(key) + '">' + (swatch ? '<i style="background:' + swatch + '"></i>' : '') + label + (value === undefined ? '' : ' <b>' + value + '</b>') + '</button>';
}

function tile(label, value, sub, tone) {
  return '<div><span>' + label + '</span><strong' + (tone ? ' class="' + tone + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
}

function drawCharts() {
  if (!dialog.open || !rows.length) return;
  const p = rows[hoverIndex ?? Math.min(rows.length - 1, Math.round(view.end))];
  body.querySelector('#tv-value-legend').innerHTML = (p.provisional
    ? '<b>' + day(p.date, true) + ' · <span class="tv-live">LIVE ' + p.time + '</span></b><span>Reguler <b>' + T(p.base) + '</b></span><span>Proyeksi <b>' + T(p.projected) + '</b></span>'
    : '<b>' + day(p.date, true) + '</b><span>Nilai <b>' + T(p.totalValue) + '</b></span>') +
    toggle('ma20', 'MA20', '#f5f5f5', T(p.ma20)) + toggle('ma5', 'MA5', '#9ad7e0', T(p.ma5)) +
    toggle('nego', 'Nego', '#e9a91e', p.negoShare === null ? '—' : one.format(p.negoShare) + '%') + toggle('spike', 'Spike ▲ · blok nego ■', 'linear-gradient(90deg,#f5f5f5,#e9a91e)');
  body.querySelector('#tv-rvol-legend').innerHTML = p.provisional ? '<span>RVOL proyeksi <b>' + (p.projectedRvol ? two.format(p.projectedRvol) + '×' : '—') + '</b> · ' + rvolLabel(p.projectedRvol ?? null) + ' (kasar)</span><span>Waktu perdagangan berjalan <b>' + whole.format(p.progress * 100) + '%</b></span>' : '<span>RVOL reguler <b>' + (p.rvol === null ? '—' : two.format(p.rvol) + '×') + '</b> · ' + rvolLabel(p.rvol) + '</span><span>z-score <b>' + (p.z === null ? '—' : two.format(p.z)) + '</b></span><span>Persentil 60 sesi <b>' + (p.percentile === null ? '—' : whole.format(p.percentile)) + '</b></span>';
  body.querySelector('#tv-ihsg-legend').innerHTML = '<span><i style="background:#e91e63"></i>IHSG <b>' + (p.ihsg ? two.format(p.ihsg.close) : '—') + '</b> ' + (p.ihsgChange === null ? '' : pct.format(p.ihsgChange) + '%') + '</span>' +
    toggle('pv', 'Akumulasi / distribusi', 'linear-gradient(90deg,#00bcd4,#e91e63)') +
    '<span>Breadth <b>' + (p.advancers ?? '—') + '↑ ' + (p.decliners ?? '—') + '↓</b></span><span>Asing <b>' + (p.foreignShare === null ? '—' : one.format(p.foreignShare) + '%') + '</b></span>';
  body.querySelector('#tv-value-chart').innerHTML = valueChart();
  body.querySelector('#tv-rvol-chart').innerHTML = rvolChart();
  body.querySelector('#tv-ihsg-chart').innerHTML = ihsgChart();
  body.querySelectorAll('[data-tv-range]').forEach((button) => {
    const preset = presetView(Number(button.dataset.tvRange));
    button.setAttribute('aria-pressed', String(Math.abs(preset.start - view.start) < 0.5 && Math.abs(preset.end - view.end) < 0.5));
  });
}

function drawDialog() {
  if (!dialog.open) return;
  if (!rows.length) {
    body.innerHTML = '<p class="fx-empty">Memuat data nilai transaksi BEI…</p>';
    return;
  }
  const done = rows.filter((p) => !p.provisional);
  const now = rows.at(-1).provisional ? rows.at(-1) : null;
  const last = done.at(-1), prev = done.at(-2);
  const recent = done.slice(-20);
  const distribution = recent.filter((p) => p.pv === 'distribution').length, accumulation = recent.filter((p) => p.pv === 'accumulation').length;
  const momentum = last.ma5 && last.ma20 ? (last.ma5 / last.ma20 - 1) * 100 : null;
  const spikes = done.filter((p) => p.rvol >= SPIKE || p.block).slice(-10).reverse();
  body.innerHTML =
    '<p class="fx-coverage">Ringkasan saham & indeks BEI · ' + done.length + ' sesi (' + day(done[0].date, true) + ' – ' + day(last.date, true) + ') · nilai = reguler + negosiasi' + (now ? ' · <span class="tv-live">LIVE ' + now.time + ' WIB</span> dari feed BEI' : '') + '</p>' +
    '<div class="metric-detail-summary fx-summary">' +
      (now
        ? tile('Sesi berjalan · ' + now.time + ' WIB', T(now.base), 'reguler · ' + whole.format(now.progress * 100) + '% waktu perdagangan · ' + now.advancers + '↑ ' + now.decliners + '↓') +
          tile('Proyeksi sehari (kasar)', now.projected ? T(now.projected) : '—', now.projectedRvol ? 'RVOL ≈ ' + two.format(now.projectedRvol) + '× · ' + rvolLabel(now.projectedRvol) : 'menunggu ≥ 10% sesi', now.projectedRvol >= HIGH ? 'btc-positive' : now.projectedRvol < QUIET ? 'btc-negative' : '')
        : tile('Nilai ' + day(last.date), T(last.totalValue), prev ? pct.format((last.totalValue / prev.totalValue - 1) * 100) + '% vs sesi sebelumnya' : '') +
          tile('RVOL reguler vs 20 sesi', last.rvol === null ? '—' : two.format(last.rvol) + '×', rvolLabel(last.rvol) + (last.z === null ? '' : ' · z ' + two.format(last.z)), last.rvol >= HIGH ? 'btc-positive' : last.rvol < QUIET ? 'btc-negative' : '')) +
      tile('Momentum MA5 / MA20', momentum === null ? '—' : pct.format(momentum) + '%', 'persentil 60 sesi: ' + (last.percentile === null ? '—' : whole.format(last.percentile)), momentum > 0 ? 'btc-positive' : momentum < 0 ? 'btc-negative' : '') +
      tile('Distribusi / akumulasi', distribution + ' / ' + accumulation, 'hari dalam 20 sesi', distribution >= 5 ? 'btc-negative' : '') +
    '</div>' +
    '<p class="tv-reading">' + (now ? '<span class="tv-live">Sesi berjalan ' + now.time + ':</span> IHSG ' + (now.ihsgChange === null ? '—' : pct.format(now.ihsgChange) + '%') + ', nilai reguler ' + T(now.base) + ', breadth ' + now.advancers + '↑ ' + now.decliners + '↓' + (now.projected ? ', proyeksi linear sehari ≈ ' + T(now.projected) + ' (RVOL ≈ ' + two.format(now.projectedRvol) + '×)' : '') + '. Sesi terakhir (' + day(last.date) + '): ' : '') + reading(last) + ' Breadth ' + (last.advancers ?? '—') + ' naik / ' + (last.decliners ?? '—') + ' turun · partisipasi asing ' + (last.foreignShare === null ? '—' : one.format(last.foreignShare) + '%') + ' · nego ' + (last.negoShare === null ? '—' : one.format(last.negoShare) + '%') + '.</p>' +
    '<div class="fx-toolbar"><div class="history-periods" role="group" aria-label="Rentang grafik">' + RANGES.map(([label, n]) => '<button type="button" data-tv-range="' + n + '" aria-pressed="false">' + label + '</button>').join('') + '</div><span class="chart-hint">Scroll: zoom · seret: geser · klik ganda: reset · klik legenda: on/off</span></div>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Nilai transaksi <small>batang cyan: IHSG naik · pink: turun · kuning: negosiasi · garis MA dari nilai reguler</small></h3></header><div class="m2-legend fx-legend" id="tv-value-legend"></div><div id="tv-value-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>RVOL <small>nilai reguler ÷ rata-rata 20 sesi sebelumnya</small></h3></header><div class="m2-legend fx-legend" id="tv-rvol-legend"></div><div id="tv-rvol-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>IHSG & konfirmasi volume <small>titik: hari akumulasi / distribusi</small></h3></header><div class="m2-legend fx-legend" id="tv-ihsg-legend"></div><div id="tv-ihsg-chart"></div></section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Spike & blok terbaru <small>RVOL reguler ≥ 1,5× atau nego ≥ 30% · penggerak terbesar</small></h3></header>' +
      (spikes.length ? '<div class="btc-table-wrap tv-spikes"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nilai</th><th>RVOL reg.</th><th>IHSG</th><th>Nego</th><th>Penggerak (nilai · nego)</th></tr></thead><tbody>' +
        spikes.map((p) => '<tr><td>' + day(p.date, true) + '</td><td>' + (p.block ? '<span class="tv-nego">Blok nego</span>' : 'Spike reguler') + '</td><td>' + T(p.totalValue) + '</td><td>' + (p.rvol === null ? '—' : two.format(p.rvol) + '×') + '</td><td class="' + (p.ihsgChange >= 0 ? 'btc-positive' : 'btc-negative') + '">' + (p.ihsgChange === null ? '—' : pct.format(p.ihsgChange) + '%') + '</td><td>' + one.format(p.negoShare) + '%</td><td>' +
          (p.topValue || []).slice(0, 3).map(([code, value, nego]) => '<b>' + code + '</b> ' + B(value) + (nego > value * 0.5 ? ' <span class="tv-nego">nego</span>' : '')).join(' · ') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<p class="fx-empty">Belum ada spike dalam riwayat yang tersedia.</p>') + '</section>' +
    '<p class="fx-method">RVOL, MA, persentil dan hari akumulasi/distribusi memakai nilai pasar reguler; transaksi negosiasi (blok/crossing) dikeluarkan agar satu transaksi besar tidak mendistorsi pembacaan sebulan, dan hari dengan porsi negosiasi ≥ 30% ditandai sebagai blok nego. RVOL membandingkan nilai reguler sesi dengan rata-rata 20 sesi sebelumnya (sesi itu sendiri tidak ikut dihitung). Hari distribusi: IHSG turun ≥ 0,2% dengan nilai transaksi lebih besar dari sesi sebelumnya; hari akumulasi: naik ≥ 0,2% dengan nilai lebih besar. Lima atau lebih hari distribusi dalam 20 sesi umumnya dibaca sebagai tekanan jual institusi. Spike dengan porsi negosiasi besar sering berasal dari transaksi blok/crossing, bukan minat pasar reguler. Partisipasi asing = (beli + jual asing) ÷ (2 × nilai reguler), memakai estimasi rupiah asing. Selama sesi, batang berpola adalah nilai reguler sejauh ini dari feed live BEI (negosiasi belum termasuk) dan garis putus-putus adalah proyeksi linear sehari: nilai ÷ porsi waktu perdagangan yang sudah lewat. Volume intraday biasanya ramai di awal dan akhir sesi, jadi proyeksi ini kasar; statistik historis tetap memakai sesi yang sudah selesai. Bukan sinyal investasi.</p>' +
    '<p class="fx-source"><a href="https://idx.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/" target="_blank" rel="noopener noreferrer">Ringkasan saham BEI</a> · <a href="https://idx.id/id/data-pasar/ringkasan-perdagangan/ringkasan-indeks/" target="_blank" rel="noopener noreferrer">Ringkasan indeks BEI</a></p>';
  drawCharts();
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
    const live = await fetch('/api/idx-live').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    liveFeed = live?.schema === 1 ? live : null;
    const response = await fetch('/api/idx-turnover');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema !== 1 || !result.points?.length) throw new Error();
    const before = rows.length;
    rows = analyse(result.points);
    if (liveFeed && liveFeed.date > rows.at(-1).date && liveFeed.turnover) rows.push(liveRow(liveFeed, rows));
    if (!view) view = presetView(DEFAULT_RANGE);
    else if (followEnd && rows.length !== before) view = panWindow(view, bounds(), (rows.length - 1 - view.end) / (view.end - view.start));
  } catch {}
  drawDialog();
}

// Takes over the card's detail button from the generic history dialog.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-metric="turnover"]');
  if (!trigger) return;
  event.stopPropagation();
  opener = trigger;
  hoverIndex = null;
  dialog.showModal();
  document.body.classList.add('metric-modal-open');
  drawDialog();
}, true);
dialog.querySelector('.tv-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  const preset = event.target.closest('[data-tv-range]');
  if (preset) { view = presetView(Number(preset.dataset.tvRange)); followEnd = true; drawCharts(); return; }
  const series = event.target.closest('[data-tv-series]');
  if (series) { hidden.toggle(series.dataset.tvSeries); drawCharts(); return; }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

load();
setInterval(load, 15000);

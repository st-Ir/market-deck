// Rates popups opened from the "Harian" rows of the IHSG market panel, on
// /api/rates-id (TradingView daily history; BI-Rate from Trading Economics):
// - SBN 10Y: the yield against IHSG (like the USD/IDR popup), BI-Rate, and the
//   channels through which SBN yields reach the market.
// - Spread SBN − UST 10Y: both yields with the spread marked by a dashed vertical
//   line at the cursor, and the spread relative to its 20-session mean (built
//   like the RVOL chart of the turnover popup).
import { W, dateAxis, frame, grid, indexAt, linePath, movingAverage, scale } from './mini-chart.mjs';

const dialog = document.getElementById('rates-dialog');
const body = document.getElementById('rates-body');
const title = document.getElementById('rates-title');
const eyebrow = document.getElementById('rates-eyebrow');
const RANGES = [['3B', 63], ['6B', 126], ['1T', 252], ['2T', Infinity]];
const WIDE = 1.05, NARROW = 0.95;
const two = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const three = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const signed = (digits) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'exceptZero' });
const day = (date, year) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const tone = (v, invert) => (!Number.isFinite(v) || !v ? '' : (v > 0) !== Boolean(invert) ? 'btc-positive' : 'btc-negative');
const bp = (v) => (Number.isFinite(v) ? signed(0).format(v) + ' bp' : '—');

let data = null, failed = false, mode = 'sbn', range = 126, hover = null, opener = null;

// Value of a { date, close } series on or before each date (calendars differ).
function asOf(points, dates) {
  const out = [];
  let j = 0, last = null;
  for (const date of dates) {
    while (j < points.length && points[j].date <= date) last = points[j++].close;
    out.push(last);
  }
  return out;
}

const view = (n) => Math.min(range, n);

// ---- SBN 10Y ----------------------------------------------------------------

function sbnModel() {
  const dates = data.sbn.map((p) => p.date);
  const sbn = data.sbn.map((p) => p.close);
  return { dates, sbn, ihsg: asOf(data.series.COMPOSITE || [], dates) };
}

function sbnChart(m) {
  const n = view(m.dates.length), from = m.dates.length - n;
  const dates = m.dates.slice(from), sbn = m.sbn.slice(from), ihsg = m.ihsg.slice(from);
  const geo = frame(n, 230, { left: 50 });
  const sy = scale(sbn, geo), iy = scale(ihsg, geo);
  const i = hover ?? n - 1;
  // IHSG labels on the left, yield labels on the right.
  const left = iy.ticks.map((t) => '<text x="' + (geo.L - 6) + '" y="' + (iy.y(t) + 3).toFixed(1) + '" class="mc-axis" text-anchor="end">' + whole.format(t) + '</text>').join('');
  return '<svg class="mc-chart" data-chart="sbn" viewBox="0 0 ' + W + ' 230" role="img" aria-label="Yield SBN 10Y dan IHSG">' +
    grid(geo, sy, (t) => two.format(t) + '%') + left + dateAxis(geo, dates, (d) => day(d, range > 126)) +
    '<path d="' + linePath(ihsg, geo.x, iy.y) + '" fill="none" stroke="#929292" stroke-width="1.2"/>' +
    '<path d="' + linePath(sbn, geo.x, sy.y) + '" fill="none" stroke="#e9a91e" stroke-width="1.7"/>' +
    '<line x1="' + geo.x(i).toFixed(1) + '" x2="' + geo.x(i).toFixed(1) + '" y1="' + geo.T + '" y2="' + geo.B + '" class="mc-cursor"/>' +
    '<circle cx="' + geo.x(i).toFixed(1) + '" cy="' + sy.y(sbn[i]).toFixed(1) + '" r="3" fill="#e9a91e" stroke="none"/></svg>';
}

function drawSbn() {
  const m = sbnModel(), n = m.sbn.length, last = m.sbn[n - 1];
  const change = (k) => (n > k ? (last - m.sbn[n - 1 - k]) * 100 : null);
  const window = m.sbn.slice(-252), high = Math.max(...window), low = Math.min(...window);
  const bi = data.biRate;
  const i = hover ?? view(n) - 1, from = n - view(n);
  const at = from + i, prev = at ? m.sbn[at - 1] : null;
  const tile = (label, value, sub, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  body.innerHTML =
    '<div class="metric-detail-summary fx-summary">' +
      tile('Yield SBN 10Y', three.format(last) + '%', 'TradingView · ' + day(m.dates[n - 1])) +
      // Yields up is bad for bond prices: rises are shown in pink.
      tile('Perubahan', bp(change(1)), '1 hari · 1 bulan ' + bp(change(21)), tone(change(1), true)) +
      tile('BI-Rate', bi ? two.format(bi.value) + '%' : '—', bi ? 'keputusan ' + day(bi.released) + (bi.next ? ' · RDG ' + day(bi.next) : '') : 'belum tersedia') +
      tile('SBN 10Y − BI-Rate', bi ? whole.format((last - bi.value) * 100) + ' bp' : '—', '52 mgg: ' + two.format(low) + '–' + two.format(high) + '%') +
    '</div>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Yield SBN 10Y vs IHSG <small>kuning = yield (kanan) · abu-abu = IHSG (kiri)</small></h3>' + rangeButtons() + '</header>' +
      '<div class="m2-legend fx-legend"><span>' + day(m.dates[at], true) + ' · SBN <b>' + three.format(m.sbn[at]) + '%</b>' + (prev === null ? '' : ' <em class="' + tone(m.sbn[at] - prev, true) + '">' + bp((m.sbn[at] - prev) * 100) + '</em>') + '</span><span>IHSG <b>' + (Number.isFinite(m.ihsg[at]) ? whole.format(m.ihsg[at]) : '—') + '</b></span></div>' +
      sbnChart(m) + '</section>' +
    '<section class="m2-plot-panel fx-panel rates-channels"><header><h3>Jalur dampak yield SBN</h3></header><ul>' +
      '<li><b>Perbankan.</b> Bank memegang SBN dalam jumlah besar: yield naik menurunkan nilai pasar portofolio obligasinya dan menaikkan biaya dana.</li>' +
      '<li><b>Properti & KPR.</b> Bunga KPR dan kredit konstruksi mengikuti arah suku bunga jangka panjang, jadi yield tinggi menekan permintaan.</li>' +
      '<li><b>Rupiah & dana asing.</b> Yield yang naik karena asing menjual SBN biasanya datang bersama rupiah melemah; yield tinggi yang stabil justru bisa menarik dana masuk.</li>' +
      '<li><b>Valuasi saham.</b> Yield 10Y dipakai sebagai acuan tingkat diskonto: yield naik menekan valuasi, terutama saham bertumbuh seperti teknologi.</li>' +
      '<li><b>Biaya utang.</b> Kupon obligasi korporasi baru dan beban bunga APBN ikut naik saat yield SBN naik.</li>' +
      '<li><b>BI-Rate.</b> Kebijakan BI menjadi jangkar ujung pendek kurva; selisih SBN 10Y terhadap BI-Rate menggambarkan premi jangka panjang yang diminta pasar.</li>' +
    '</ul></section>' +
    '<p class="fx-method">Sumber: TradingView (TVC:ID10Y, IDX:COMPOSITE)' + (bi ? ', BI-Rate dari Trading Economics' : '') + '. Bukan rekomendasi.</p>';
}

// ---- Spread SBN − UST 10Y --------------------------------------------------

function spreadModel() {
  const dates = data.sbn.map((p) => p.date);
  const sbn = data.sbn.map((p) => p.close);
  const ust = asOf(data.ust, dates);
  const spread = sbn.map((v, i) => (Number.isFinite(ust[i]) ? (v - ust[i]) * 100 : null));
  // Relative spread: today's spread over the mean of the previous 20 sessions.
  const relative = spread.map((v, i) => {
    if (i < 20 || !Number.isFinite(v)) return null;
    const prev = spread.slice(i - 20, i);
    return prev.every(Number.isFinite) ? v / (prev.reduce((s, x) => s + x, 0) / 20) : null;
  });
  return { dates, sbn, ust, spread, relative, ma20: movingAverage(spread, 20) };
}

const relLabel = (r) => (r === null ? '—' : r >= WIDE ? 'Melebar' : r <= NARROW ? 'Menyempit' : 'Normal');

function yieldsChart(m, from, n) {
  const dates = m.dates.slice(from), sbn = m.sbn.slice(from), ust = m.ust.slice(from);
  const geo = frame(n, 230);
  const s = scale([...sbn, ...ust], geo);
  const i = hover ?? n - 1;
  const x = geo.x(i), top = s.y(Math.max(sbn[i], ust[i])), bottom = s.y(Math.min(sbn[i], ust[i]));
  const spread = (sbn[i] - ust[i]) * 100;
  const labelX = x > geo.R - 120 ? x - 8 : x + 8;
  return '<svg class="mc-chart" data-chart="spread" viewBox="0 0 ' + W + ' 230" role="img" aria-label="Yield SBN 10Y dan UST 10Y">' +
    grid(geo, s, (t) => two.format(t) + '%') + dateAxis(geo, dates, (d) => day(d, range > 126)) +
    '<path d="' + linePath(ust, geo.x, s.y) + '" fill="none" stroke="#f5f5f5" stroke-width="1.4"/>' +
    '<path d="' + linePath(sbn, geo.x, s.y) + '" fill="none" stroke="#e9a91e" stroke-width="1.7"/>' +
    // The spread: a dashed vertical line from UST up to SBN at the cursor.
    '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + top.toFixed(1) + '" y2="' + bottom.toFixed(1) + '" stroke="#00bcd4" stroke-width="1.4" stroke-dasharray="4 3"/>' +
    '<circle cx="' + x.toFixed(1) + '" cy="' + s.y(sbn[i]).toFixed(1) + '" r="3" fill="#e9a91e" stroke="none"/><circle cx="' + x.toFixed(1) + '" cy="' + s.y(ust[i]).toFixed(1) + '" r="3" fill="#f5f5f5" stroke="none"/>' +
    '<text x="' + labelX.toFixed(1) + '" y="' + ((top + bottom) / 2 + 4).toFixed(1) + '" class="mc-spread-label" text-anchor="' + (labelX < x ? 'end' : 'start') + '">' + whole.format(spread) + ' bp</text></svg>';
}

function relativeChart(m, from, n) {
  const dates = m.dates.slice(from), rel = m.relative.slice(from);
  const geo = frame(n, 160, { top: 10, bottom: 22 });
  const finite = rel.filter(Number.isFinite);
  const s = scale(finite, geo, { min: Math.min(0.9, ...finite) - 0.01, max: Math.max(1.1, ...finite) + 0.01 });
  const i = hover ?? n - 1;
  // The three reference lines sit close together: "melebar" is labelled above
  // its line, "menyempit" below, 1,00× on it.
  const ref = (v, label, dash, dy) => '<line x1="' + geo.L + '" x2="' + geo.R + '" y1="' + s.y(v).toFixed(1) + '" y2="' + s.y(v).toFixed(1) + '" class="mc-grid' + (v === 1 ? ' mc-zero' : '') + '"' + (dash ? ' stroke-dasharray="4 3"' : '') + '/>' +
    '<text x="' + (geo.R + 6) + '" y="' + (s.y(v) + dy).toFixed(1) + '" class="mc-axis">' + label + '</text>';
  return '<svg class="mc-chart" data-chart="relative" viewBox="0 0 ' + W + ' 160" role="img" aria-label="Spread relatif terhadap rata-rata 20 sesi">' +
    '<rect x="' + geo.L + '" y="' + geo.T + '" width="' + geo.PW + '" height="' + (s.y(WIDE) - geo.T).toFixed(1) + '" fill="#e91e63" opacity=".05"/>' +
    '<rect x="' + geo.L + '" y="' + s.y(NARROW).toFixed(1) + '" width="' + geo.PW + '" height="' + (geo.B - s.y(NARROW)).toFixed(1) + '" fill="#00bcd4" opacity=".05"/>' +
    ref(1, '1,00×', false, 3) + ref(WIDE, 'melebar', true, -4) + ref(NARROW, 'menyempit', true, 11) +
    dateAxis(geo, dates, (d) => day(d, range > 126)) +
    '<path d="' + linePath(rel, geo.x, s.y) + '" fill="none" stroke="#f5f5f5" stroke-width="1.4"/>' +
    '<line x1="' + geo.x(i).toFixed(1) + '" x2="' + geo.x(i).toFixed(1) + '" y1="' + geo.T + '" y2="' + geo.B + '" class="mc-cursor"/>' +
    (Number.isFinite(rel[i]) ? '<circle cx="' + geo.x(i).toFixed(1) + '" cy="' + s.y(rel[i]).toFixed(1) + '" r="3" fill="#f5f5f5" stroke="none"/>' : '') + '</svg>';
}

function drawSpread() {
  const m = spreadModel(), n = m.dates.length, last = m.spread[n - 1];
  const change = (k) => (n > k && Number.isFinite(m.spread[n - 1 - k]) ? last - m.spread[n - 1 - k] : null);
  const rel = m.relative[n - 1];
  const nv = view(n), from = n - nv, at = from + (hover ?? nv - 1);
  const tile = (label, value, sub, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  const sentence = 'Spread ' + whole.format(last) + ' bp, ' + (rel === null ? '—' : two.format(rel) + '×') + ' rata-rata 20 sesi (' + relLabel(rel).toLowerCase() + '). ' +
    (rel >= WIDE ? 'Premi risiko Indonesia di atas kebiasaan sebulan terakhir: biasanya datang bersama tekanan jual asing di SBN atau rupiah.' : rel <= NARROW ? 'Premi risiko Indonesia di bawah kebiasaan sebulan terakhir: SBN relatif diminati dibanding Treasury.' : 'Premi risiko Indonesia sejalan dengan kebiasaan sebulan terakhir.');
  body.innerHTML =
    '<div class="metric-detail-summary fx-summary">' +
      tile('Spread SBN − UST 10Y', whole.format(last) + ' bp', 'SBN ' + three.format(m.sbn[n - 1]) + '% · UST ' + three.format(m.ust[n - 1]) + '%') +
      tile('Perubahan', bp(change(1)), '1 hari · 1 bulan ' + bp(change(21)), tone(change(1), true)) +
      tile('Spread relatif', rel === null ? '—' : two.format(rel) + '×', relLabel(rel) + ' · vs rata-rata 20 sesi', rel >= WIDE ? 'btc-negative' : rel <= NARROW ? 'btc-positive' : '') +
      tile('Rata-rata 20 sesi', Number.isFinite(m.ma20[n - 1]) ? whole.format(m.ma20[n - 1]) + ' bp' : '—', '52 mgg: ' + whole.format(Math.min(...m.spread.slice(-252).filter(Number.isFinite))) + '–' + whole.format(Math.max(...m.spread.slice(-252).filter(Number.isFinite))) + ' bp') +
    '</div>' +
    '<p class="tv-reading">' + sentence + '</p>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>SBN 10Y vs UST 10Y <small>kuning = SBN · putih = UST · garis putus = spread</small></h3>' + rangeButtons() + '</header>' +
      '<div class="m2-legend fx-legend"><span>' + day(m.dates[at], true) + ' · SBN <b>' + three.format(m.sbn[at]) + '%</b> · UST <b>' + (Number.isFinite(m.ust[at]) ? three.format(m.ust[at]) + '%' : '—') + '</b></span><span>Spread <b>' + (Number.isFinite(m.spread[at]) ? whole.format(m.spread[at]) + ' bp' : '—') + '</b></span></div>' +
      yieldsChart(m, from, nv) + '</section>' +
    '<section class="m2-plot-panel fx-panel"><header><h3>Spread relatif <small>spread ÷ rata-rata 20 sesi sebelumnya · ≥ ' + two.format(WIDE) + '× melebar · ≤ ' + two.format(NARROW) + '× menyempit</small></h3></header>' +
      '<div class="m2-legend fx-legend"><span>' + day(m.dates[at], true) + ' · <b>' + (Number.isFinite(m.relative[at]) ? two.format(m.relative[at]) + '×' : '—') + '</b> · ' + relLabel(m.relative[at]) + '</span></div>' +
      relativeChart(m, from, nv) + '</section>' +
    '<p class="fx-method">Spread = yield SBN 10Y − yield US Treasury 10Y, dalam basis poin. UST diambil pada tanggal yang sama atau sebelumnya karena kalender bursa berbeda. Spread melebar berarti investor meminta imbal hasil lebih tinggi untuk memegang SBN dibanding Treasury. Sumber: TradingView (TVC:ID10Y, TVC:US10Y). Bukan rekomendasi.</p>';
}

// ---- Shell -------------------------------------------------------------------

function rangeButtons() {
  return '<div class="history-periods" role="group" aria-label="Rentang grafik">' + RANGES.map(([label, n]) => '<button type="button" data-rates-range="' + n + '" aria-pressed="' + (n === range) + '">' + label + '</button>').join('') + '</div>';
}

function draw() {
  if (!data) {
    body.innerHTML = '<p class="fx-empty">' + (failed ? 'Data yield belum dapat dimuat.' : 'Memuat data yield…') + '</p>';
    return;
  }
  mode === 'sbn' ? drawSbn() : drawSpread();
}

async function load() {
  try {
    const response = await fetch('/api/rates-id');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema !== 1 || !result.sbn?.length) throw new Error();
    data = result;
    failed = false;
  } catch {
    if (!data) failed = true;
  }
  if (dialog.open) draw();
}

function open(nextMode, trigger) {
  mode = nextMode;
  opener = trigger;
  hover = null;
  eyebrow.textContent = mode === 'sbn' ? 'OBLIGASI PEMERINTAH · KORELASI & DAMPAK' : 'PREMI RISIKO · SBN VS TREASURY';
  title.textContent = mode === 'sbn' ? 'Yield SBN 10Y' : 'Spread SBN − UST 10Y';
  draw();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('metric-modal-open');
  load();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-rates-open]');
  if (trigger) open(trigger.dataset.ratesOpen, trigger);
});
body.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('.mc-chart');
  if (!svg || !data) return;
  const n = view(data.sbn.length);
  const next = indexAt(svg, event.clientX, frame(n, 100, svg.dataset.chart === 'sbn' ? { left: 50 } : undefined));
  if (next !== hover) { hover = next; draw(); }
});
body.addEventListener('pointerleave', () => { if (hover !== null) { hover = null; draw(); } });
dialog.querySelector('.rates-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rates-range]');
  if (button) { range = Number(button.dataset.ratesRange); hover = null; draw(); return; }
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
load();
setInterval(load, 5 * 60e3);

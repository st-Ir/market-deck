import { flashValue } from './flash.mjs';
import { attachChartZoom, panWindow, zoomWindow } from './chart-zoom.mjs';
import { BTC_CHART_PLOT, renderPositionChart } from './btc-position-charts.mjs';

const fundingPercent = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4, signDisplay: 'exceptZero' });
const settlementPercent = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 6, signDisplay: 'exceptZero' });
const interestPercent = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
const dateTime = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const getCard = () => document.querySelector('#market-snapshot[data-market="bitcoin"] [data-metric="perpetual-position"]');
const timestamp = (format, iso) => format.format(new Date(iso)).replace('.', ':') + ' WIB';
const finiteTime = (iso) => Number.isFinite(Date.parse(iso));
const displayTime = (iso) => finiteTime(iso) ? timestamp(dateTime, iso) : '—';
const displayPercent = (value, format) => Number.isFinite(value) ? format.format(value) + '%' : '—';
const displayAmount = (value) => Number.isFinite(value) ? amount.format(value) + ' BTC' : '—';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const tone = (value) => value > 0 ? 'btc-positive' : value < 0 ? 'btc-negative' : '';
const dialog = document.getElementById('btc-position-dialog');
const body = document.getElementById('btc-position-body');
const chartViews = new Map();
const chartSelector = '[data-position-chart]';
const disclosureSelector = '[data-position-disclosure]';
const tableSelector = '[data-position-history]';

let data = null;
let pending = false;
let failed = false;
let opener = null;

const isLive = () => data && !failed && Date.now() - Date.parse(data.asOf) < 3 * 60_000;

function drawSpark(spark, points) {
  const history = (points ?? []).filter((point) => Number.isFinite(point.value) && finiteTime(point.time));
  const first = history[0], last = history.at(-1);
  const duration = Date.parse(last?.time) - Date.parse(first?.time);
  const hidden = history.length < 2 || !(duration > 0);
  spark.toggleAttribute('hidden', hidden);
  if (hidden) return;
  const values = history.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const path = history.map(({ time: at, value }, index) => {
    const x = (Date.parse(at) - Date.parse(first.time)) / duration * 130;
    const y = max === min ? 15 : 3 + (max - value) / (max - min) * 24;
    return (index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }).join('');
  spark.querySelector('path').setAttribute('d', path);
  spark.classList.toggle('pink-spark', last.value < first.value);
  spark.setAttribute('aria-label', 'Open interest dalam BTC selama 24 jam, sampai ' + timestamp(dateTime, last.time));
}

function draw(card = getCard()) {
  if (!card) return;
  const source = card.querySelector('.metric-date');
  if (!data) {
    source.textContent = failed ? 'Data perpetual belum tersedia' : 'Memuat sumber…';
    return;
  }

  const { venue, symbol, asOf, funding, openInterest } = data;
  const interval = funding.intervalHours > 0 ? ' ' + amount.format(funding.intervalHours) + 'J' : '';
  const label = card.querySelector('.position-funding-label');
  label.textContent = 'Funding' + interval;
  label.title = finiteTime(funding.nextAt) ? 'Funding berikutnya ' + timestamp(dateTime, funding.nextAt) : 'Funding rate';
  const main = card.querySelector('.metric-value');
  main.textContent = displayPercent(funding.ratePercent, fundingPercent);
  main.setAttribute('aria-label', 'Funding rate ' + main.textContent);
  if (card.dataset.venue !== venue) delete main.dataset.flashValue;
  card.dataset.venue = venue;
  flashValue(main, funding.ratePercent);
  const change = card.querySelector('.position-oi-change');
  const delta = openInterest?.change24hPercent;
  change.textContent = displayPercent(delta, interestPercent);
  change.classList.toggle('btc-positive', delta > 0);
  change.classList.toggle('btc-negative', delta < 0);
  change.parentElement.title = Number.isFinite(delta) && finiteTime(openInterest.asOf) && finiteTime(openInterest.previousAsOf)
    ? `Open interest ${amount.format(openInterest.value)} ${openInterest.unit} · ${timestamp(dateTime, openInterest.previousAsOf)} – ${timestamp(dateTime, openInterest.asOf)}`
    : 'Perubahan open interest 24 jam belum tersedia';
  const fresh = isLive();
  source.textContent = venue + (fresh ? ' · Live · ' : ' · Terakhir · ') + timestamp(fresh ? time : dateTime, asOf);
  source.title = 'Perpetual ' + symbol + ' · ' + timestamp(dateTime, asOf);
  drawSpark(card.querySelector('.snapshot-spark'), openInterest?.points);
}

function tile(title, value, note = '', color = '') {
  return `<div><span>${title}</span><strong class="${color}">${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

function history(key, title, heading, points, field, format) {
  const rows = (points ?? []).filter((point) => finiteTime(point.time) && Number.isFinite(point[field]));
  const content = rows.length
    ? `<div class="btc-table-wrap" role="region" aria-label="${title}" tabindex="0" data-position-history="${key}"><table>
      <thead><tr><th scope="col">Waktu (WIB)</th><th scope="col">${heading}</th></tr></thead>
      <tbody>${rows.slice().reverse().map((row) => `<tr><th scope="row">${dateTime.format(new Date(row.time)).replace('.', ':')}</th><td>${format(row[field])}</td></tr>`).join('')}</tbody>
    </table></div>`
    : '<p class="btc-empty">Riwayat belum tersedia.</p>';
  return `<details class="btc-history-disclosure" data-position-disclosure="${key}"><summary>${title}${rows.length ? ` <small>${rows.length} observasi</small>` : ''}</summary>${content}</details>`;
}

function detailMarkup() {
  if (!data) return `<p class="btc-empty" role="status">${failed ? 'Data perpetual belum tersedia.' : 'Memuat data perpetual BTC…'}</p>`;
  const { venue, symbol, funding, asOf, openInterest } = data;
  const interval = funding.intervalHours > 0 ? 'Setiap ' + amount.format(funding.intervalHours) + ' jam' : '';
  const previous = openInterest?.points?.find((point) => point.time === openInterest.previousAsOf);
  const baseline = finiteTime(openInterest?.previousAsOf)
    ? [previous && displayAmount(previous.value), displayTime(openInterest.previousAsOf)].filter(Boolean).join(' · ')
    : '';
  const status = isLive() ? 'Live' : 'Data terakhir';
  const sourceUrl = venue === 'Binance' ? 'https://www.binance.com/en/futures/BTCUSDT' : 'https://www.gate.com/futures/USDT/BTC_USDT';
  const chartHint = funding.points?.length > 1 || openInterest?.points?.length > 1
    ? '<p class="turnover-chart-hint">Roda mouse: zoom · Seret: geser · Klik ganda: reset</p>' : '';
  return `<p class="btc-coverage position-coverage">${escape(venue)} · ${escape(symbol)} · ${status} · ${displayTime(asOf)}</p>
    <div class="metric-detail-summary position-summary">
      ${tile('Funding rate', displayPercent(funding.ratePercent, fundingPercent), interval, tone(funding.ratePercent))}
      ${tile('Funding berikutnya', finiteTime(funding.nextAt) ? timestamp(time, funding.nextAt) : '—', finiteTime(funding.nextAt) ? date.format(new Date(funding.nextAt)) : '')}
      ${tile('Open interest', displayAmount(openInterest?.value), openInterest ? displayTime(openInterest.asOf) : '')}
      ${tile('Perubahan OI 24 jam', displayPercent(openInterest?.change24hPercent, interestPercent),
        baseline && 'Pembanding · ' + baseline, tone(openInterest?.change24hPercent))}
    </div>
    ${chartHint}
    ${renderPositionChart(data, 'funding', chartViews.get('funding'))}
    ${history('funding', 'Riwayat pembayaran funding', 'Funding rate', funding.points, 'ratePercent', (value) => displayPercent(value, settlementPercent))}
    ${renderPositionChart(data, 'open-interest', chartViews.get('open-interest'))}
    ${history('oi', 'Riwayat open interest', 'Open interest (BTC)', openInterest?.points, 'value', (value) => amount.format(value))}
    <details class="btc-method" data-position-disclosure="method">
      <summary>Sumber &amp; metode</summary>
      <p>Funding rate di ringkasan mengikuti pembacaan terbaru dari bursa. Grafik dan tabel funding memakai pembayaran yang sudah tercatat.</p>
      <p>Perubahan open interest membandingkan ukuran posisi dalam BTC dengan sampel sekitar 24 jam sebelumnya dari kontrak yang sama.
      <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${escape(venue)} Futures</a></p>
    </details>`;
}

function drawDetail() {
  const open = new Set([...body.querySelectorAll(disclosureSelector + '[open]')].map((el) => el.dataset.positionDisclosure));
  const positions = new Map([...body.querySelectorAll(tableSelector)].map((el) => [
    el.dataset.positionHistory, { top: el.scrollTop, left: el.scrollLeft },
  ]));
  const top = body.scrollTop;
  const active = document.activeElement;
  const focusSelector = chartSelector + ', ' + tableSelector + ', ' + disclosureSelector + '>summary';
  const key = (el) => el.dataset.positionChart ?? el.dataset.positionHistory ?? el.parentElement?.dataset.positionDisclosure;
  const focusedKey = active?.matches(focusSelector) ? key(active) : null;
  body.innerHTML = detailMarkup();
  for (const el of body.querySelectorAll(disclosureSelector)) el.open = open.has(el.dataset.positionDisclosure);
  for (const el of body.querySelectorAll(tableSelector)) {
    const position = positions.get(el.dataset.positionHistory);
    if (position) {
      el.scrollTop = position.top;
      el.scrollLeft = position.left;
    }
  }
  if (focusedKey) [...body.querySelectorAll(focusSelector)]
    .find((el) => el.localName === active.localName && key(el) === focusedKey)?.focus({ preventScroll: true });
  body.scrollTop = top;
}

function adjustChart(svg, update) {
  if (!dialog.open || !data) return;
  const key = svg.dataset.positionChart;
  const current = body.querySelector(`[data-position-chart="${key}"]`);
  if (!current) return;
  const { viewStart, viewEnd, viewMin, viewMax } = current.dataset;
  const view = { start: Number(viewStart), end: Number(viewEnd) };
  const bounds = { min: Number(viewMin), max: Number(viewMax) };
  const next = update?.(view, bounds);
  if (next?.start === view.start && next?.end === view.end) return;
  if (next) chartViews.set(key, next); else chartViews.delete(key);
  const focused = document.activeElement === current;
  current.closest('.m2-plot-panel').outerHTML = renderPositionChart(data, key, next);
  if (focused) body.querySelector(`[data-position-chart="${key}"]`)?.focus({ preventScroll: true });
}

function zoomChart(svg, anchor, factor) {
  const minSpan = svg.dataset.positionChart === 'funding' ? 8 * 3_600_000 : 30 * 60_000;
  adjustChart(svg, (view, bounds) => zoomWindow(view, bounds, anchor, factor, Math.min(minSpan, bounds.max - bounds.min)));
}

attachChartZoom(body, chartSelector, {
  plot: BTC_CHART_PLOT,
  onZoom(anchor, factor, svg) { zoomChart(svg, anchor, factor); },
  onPan(shift, svg) { adjustChart(svg, (view, bounds) => panWindow(view, bounds, shift)); },
  onReset(svg) { adjustChart(svg); },
});
body.addEventListener('keydown', (event) => {
  const svg = event.target.closest(chartSelector);
  if (!svg || !['+', '=', '-', 'Home'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Home') adjustChart(svg);
  else zoomChart(svg, 0.5, event.key === '-' ? 1.25 : 0.8);
});

async function load() {
  if (!getCard() || pending) return;
  pending = true;
  try {
    const response = await fetch('/api/btc-perpetual-position', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema !== 1 || !Number.isFinite(result.funding?.ratePercent) || !finiteTime(result.asOf) || !result.venue) throw new Error();
    if (data?.venue !== result.venue) chartViews.clear();
    data = result;
    failed = false;
  } catch {
    failed = true;
  } finally {
    pending = false;
    draw();
    if (dialog.open) drawDetail();
  }
}

document.getElementById('market-snapshot').addEventListener('click', (event) => {
  const button = event.target.closest('[data-position-open]');
  if (!button) return;
  opener = button;
  chartViews.clear();
  body.replaceChildren();
  drawDetail();
  dialog.showModal();
  body.scrollTop = 0;
  document.body.classList.add('metric-modal-open');
  load();
});
dialog.querySelector('.btc-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});

document.addEventListener('market-deck:market', () => {
  draw();
  load();
});
load();
setInterval(load, 30_000);

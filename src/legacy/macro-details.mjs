import { attachChartZoom, hiddenSeries, panWindow, zoomWindow } from '../client/chart-zoom.mjs';
import { BTC_CHART_PLOT } from '../client/btc-turnover-charts.mjs';
import { renderMacroHistoryChart } from '../client/macro-history-charts.mjs';

const byId = (id) => document.getElementById(id);
const grid = byId('macro-grid');
const pulse = byId('pulse-grid');
const comparisonRoot = byId('macro-score-history');
const dialog = byId('macro-detail-dialog');
const body = dialog.querySelector('.metric-detail-body');
const content = byId('macro-detail-content');
const refreshButton = byId('refresh-macro-detail');
const chartSelector = '[data-macro-chart]';
const seriesToggleSelector = '[data-macro-series-toggle]';
const disclosureSelector = '[data-macro-history-fold]';
const tableSelector = '[data-macro-history-table]';
const nowcastPeriodSelector = '[data-macro-nowcast-period]';
const historySections = new Map();
const chartViews = new Map();
const comparisonSections = new Map();
const comparisonViews = new Map();
const hiddenMacroSeries = hiddenSeries('global-macro-hidden-series');
const definitions = {
  liquidity: { title: 'Likuiditas', shortScope: 'M2 empat ekonomi + cadangan bank AS', low: 'Ketat', middle: 'Netral', high: 'Longgar' },
  growth: { title: 'Growth', shortScope: 'Aktivitas ekonomi AS', low: 'Lemah', middle: 'Netral', high: 'Kuat' },
  inflation: { title: 'Inflasi', shortScope: 'Inflasi PCE AS', low: 'Di bawah acuan', middle: 'Dekat acuan', high: 'Tekanan tinggi', inverted: true },
  risk: { title: 'Risk appetite', shortScope: 'Saham dan kredit AS', low: 'Defensif', middle: 'Netral', high: 'Risk-on' },
};
const keys = Object.keys(definitions);
const comparisonStyles = {
  liquidity: { color: 'var(--cyan)' },
  growth: { color: 'var(--pink)' },
  inflation: { color: '#e9a91e' },
  risk: { color: '#ae9bdf' },
};
const comparisonKey = 'scores-overview';
const scoreFormat = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const valueFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
const nowcastValueFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });
const mathFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const fullDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const formatScore = (value) => isScore(value) ? scoreFormat.format(value) : '—';
const formatMath = (value) => Number.isFinite(value) ? mathFormat.format(value) : '—';
const nowcastKinds = { nowcast: 'Nowcast', derived: 'Turunan nowcast', actual: 'Aktual terakhir' };

let data = null;
let pending = false;
let failed = false;
let active;
let opener;

function dateLabel(value, format = fullDate) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? format.format(parsed) : '—';
}

function quantity(value, unit = '', format = valueFormat) {
  if (!Number.isFinite(value)) return '—';
  return format.format(value) + (['%', '×'].includes(unit) ? unit : unit ? ' ' + unit : '');
}

function sourceLink(label, url) {
  try {
    if (new URL(url).protocol === 'https:') {
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    }
  } catch {}
  return esc(label);
}

function state(key, score) {
  const model = definitions[key];
  if (!isScore(score)) return { label: data || failed ? 'Data belum cukup' : 'Memuat data…', tone: 'neutral' };
  const rounded = Math.round(score * 10) / 10;
  if (rounded < 40) return { label: model.low, tone: model.inverted ? 'positive' : 'negative' };
  if (rounded > 60) return { label: model.high, tone: model.inverted ? 'negative' : 'positive' };
  return { label: model.middle, tone: 'neutral' };
}

function button(key) {
  return `<button type="button" class="macro-open" data-macro-detail="${key}" aria-label="Lihat indikator dan perhitungan ${definitions[key].title}" aria-haspopup="dialog" aria-controls="macro-detail-dialog"></button>`;
}

grid.innerHTML = keys.map((key) => `<article class="macro-card" data-macro-card="${key}">
  <div class="macro-label">${definitions[key].title}<svg aria-hidden="true"><use href="#i-next"/></svg></div>
  <h3 class="macro-state"><i></i><span></span></h3>
  <p class="macro-copy">${definitions[key].shortScope}</p>
  <div class="macro-score-meter" role="meter" aria-label="Skor ${definitions[key].title}" aria-valuemin="0" aria-valuemax="100" hidden><i></i></div>
  <div class="macro-card-foot"><span class="macro-card-date"></span><strong class="macro-card-score"></strong></div>
  ${button(key)}
</article>`).join('');

pulse.innerHTML = keys.map((key) => `<article class="pulse-item" data-macro-pulse="${key}">
  <div class="pulse-label">${definitions[key].title}</div>
  <div class="pulse-state"><i></i><span></span></div>
  <div class="pulse-ticks" aria-hidden="true">${'<span></span>'.repeat(13)}</div>
  <p class="pulse-score"></p>
  ${button(key)}
</article>`).join('');

function renderDashboard() {
  for (const key of keys) {
    const model = data?.models[key];
    const score = model?.score;
    const reading = state(key, score);
    const card = grid.querySelector('[data-macro-card="' + key + '"]');
    const quick = pulse.querySelector('[data-macro-pulse="' + key + '"]');
    card.dataset.tone = quick.dataset.tone = reading.tone;
    card.querySelector('.macro-state span').textContent = reading.label;
    card.querySelector('.macro-card-score').textContent = isScore(score) ? formatScore(score) + ' / 100' : '—';
    const cardDate = model?.asOf ? 'Obs. terbaru ' + dateLabel(model.asOf, shortDate) : '';
    const status = model?.status === 'partial' ? 'Sebagian data' : failed && data ? 'Data terakhir' : '';
    card.querySelector('.macro-card-date').textContent = [cardDate, status].filter(Boolean).join(' · ');
    const meter = card.querySelector('.macro-score-meter');
    meter.hidden = !isScore(score);
    if (!meter.hidden) {
      meter.setAttribute('aria-valuenow', String(Math.round(score * 10) / 10));
      meter.style.setProperty('--score', score + '%');
    }
    quick.querySelector('.pulse-state span').textContent = reading.label;
    quick.querySelector('.pulse-score').textContent = isScore(score) ? formatScore(score) + ' / 100' : '—';
    const ticks = isScore(score) ? Math.round(score / 100 * 13) : 0;
    quick.querySelectorAll('.pulse-ticks span').forEach((tick, index) => tick.classList.toggle('filled', index < ticks));
  }
  if (data || failed) renderComparison();
}

function renderComparison() {
  const series = {
    key: comparisonKey,
    title: 'Riwayat skor Global Macro',
    comparison: keys.map((id) => ({
      id,
      title: definitions[id].title,
      points: data?.models[id].history,
      forecast: data?.models[id].forecast,
      hidden: hiddenMacroSeries.has(id),
      ...comparisonStyles[id],
    })),
  };
  comparisonSections.set(comparisonKey, series);
  const focused = document.activeElement;
  const buttonKey = focused?.dataset.macroSeriesToggle;
  const restoreFocus = comparisonRoot.contains(focused) && (buttonKey || focused.matches(chartSelector));
  comparisonRoot.innerHTML = renderMacroHistoryChart(series, comparisonViews.get(comparisonKey));
  if (restoreFocus) {
    const selector = buttonKey ? `[data-macro-series-toggle="${buttonKey}"]` : chartSelector;
    comparisonRoot.querySelector(selector)?.focus({ preventScroll: true });
  }
}

function historyMarkup(series, indicators) {
  const { key, title, points, unit, composite } = series;
  historySections.set(key, series);
  const chart = renderMacroHistoryChart(series, chartViews.get(key));
  if (!points.length) return `<div class="macro-history">${chart}</div>`;
  const tableTitle = esc(composite ? 'Tabel riwayat skor makro' : 'Tabel riwayat ' + title);
  const rows = points.slice().reverse().map((point) => `<tr>
    <th scope="row">${dateLabel(point.date)}</th>
    ${composite ? '' : `<td>${esc(quantity(point.value, unit))}</td>`}
    <td>${formatScore(point.score)}</td>
    ${composite ? `<td>${point.availableIndicators} / ${indicators}</td>` : ''}
  </tr>`).join('');
  return `<div class="macro-history">${chart}
    <details class="btc-history-disclosure" data-macro-history-fold="${key}">
      <summary>${tableTitle} <small>${points.length} observasi</small></summary>
      <div class="btc-table-wrap" role="region" aria-label="${tableTitle}" tabindex="0" data-macro-history-table="${key}">
        <table><thead><tr><th scope="col">Tanggal observasi</th>${composite ? '' : '<th scope="col">Nilai indikator</th>'}
          <th scope="col">Skor / 100</th>${composite ? '<th scope="col">Indikator tersedia</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      </div>
    </details>
  </div>`;
}

function indicatorMarkup(row, forecast = false) {
  const provenance = row.source && sourceLink(row.source, row.sourceUrl);
  const observation = (forecast
    ? [nowcastKinds[row.kind], row.observedAt && 'Observasi ' + dateLabel(row.observedAt), provenance]
    : [row.period && esc(row.period), row.asOf && (!row.period || row.period === 'Penutupan harian') && dateLabel(row.asOf), provenance]
  ).filter(Boolean).join(' · ');
  const linked = (row.sources ?? []).map(({ label, url }) => sourceLink(label, url)).join(' · ');
  const notes = [row.reference, row.note].filter(Boolean).map(esc).join(' ');
  const format = forecast ? nowcastValueFormat : valueFormat;
  const raw = (row.readings ?? []).map((item) =>
    `<span>${esc(item.label)} <b>${esc(quantity(item.value, item.unit, format))}</b></span>`).join('');
  const effective = Number.isFinite(row.effectiveWeight) && Math.abs(row.effectiveWeight - row.weight) >= 0.01
    ? ' · efektif ' + formatMath(row.effectiveWeight) + '%' : '';
  const forecastAttrs = forecast ? ` data-macro-nowcast-indicator="${esc(row.id)}" data-kind="${esc(row.kind)}"` : '';
  return `<article class="macro-indicator"${forecastAttrs}>
    <header><h4>${esc(row.label)}</h4><strong>${esc(quantity(row.value, row.unit, format))}</strong></header>
    <p class="macro-provenance">${observation}</p>
    <dl class="macro-indicator-score">
      <div><dt>Skor indikator</dt><dd>${isScore(row.score) ? formatScore(row.score) + ' / 100' : '—'}</dd></div>
      <div><dt>Bobot</dt><dd>${formatMath(row.weight)}%${forecast ? `<small>Efektif ${Number.isFinite(row.effectiveWeight) ? formatMath(row.effectiveWeight) + '%' : '—'}</small>` : effective}</dd></div>
      <div><dt>Kontribusi</dt><dd>${Number.isFinite(row.contribution) ? formatMath(row.contribution) + ' poin' : '—'}</dd></div>
    </dl>
    ${row.transform ? `<p class="macro-step"><b>Nilai indikator</b> ${esc(row.transform)}</p>` : ''}
    ${raw ? `<div class="macro-raw-readings">${raw}</div>` : ''}
    ${row.calibration ? `<p class="macro-step"><b>Skor indikator</b> ${esc(row.calibration)}</p>` : ''}
    ${notes ? `<p class="macro-indicator-note">${notes}</p>` : ''}
    ${linked ? `<p class="macro-provenance macro-component-links">${linked}</p>` : ''}
    ${forecast ? '' : historyMarkup({ key: row.id, title: row.label, points: row.history ?? [], unit: row.unit })}
  </article>`;
}

function scoreEquation(model) {
  if (!isScore(model.score) || !Number.isFinite(model.availableWeight) || model.availableWeight <= 0) return '';
  const terms = model.indicators.filter(({ contribution }) => Number.isFinite(contribution))
    .map(({ score, weight }) => `(${formatMath(score)} × ${formatMath(weight)})`).join(' + ');
  return terms ? `[${terms}] ÷ ${formatMath(model.availableWeight)} ≈ ${formatScore(model.score)}` : '';
}

function combinedMarkup(model) {
  const rules = data.rules;
  const equation = scoreEquation(model);
  const missing = `Skor memerlukan minimal ${rules.minimumIndicators} indikator dan ${rules.minimumCoverage}% bobot awal tersedia.`;
  return `<section class="macro-aggregation"><h3>Perhitungan skor akhir</h3>
    <p>Jumlah (skor indikator × bobot) ÷ total bobot dari indikator yang tersedia. Rentang tengah 40–60.</p>
    ${equation ? `<code>${equation}</code>` : ''}
    ${!isScore(model.score) ? `<p>${missing}</p>` : model.status === 'partial' ? `<p>Bobot dihitung ulang dari ${formatMath(model.coverage)}% bobot awal yang tersedia.</p>` : ''}
  </section>`;
}

function nowcastPeriodMarkup(period, open) {
  const title = esc(period.period || dateLabel(period.date));
  const updated = dateLabel(period.updatedAt);
  const rules = data.rules;
  const equation = scoreEquation(period);
  const missing = `Skor memerlukan minimal ${rules.minimumIndicators} indikator dan ${rules.minimumCoverage}% bobot awal tersedia.`;
  return `<details class="macro-nowcast-period btc-history-disclosure" data-macro-nowcast-period="${esc(period.date)}"${open ? ' open' : ''}>
    <summary><span>${title}<small>${updated === '—' ? 'Tanggal pembaruan belum tersedia' : `Diperbarui <time datetime="${esc(period.updatedAt)}">${updated}</time>`}</small></span>
      <strong>${isScore(period.score) ? `${formatScore(period.score)} / 100` : 'Skor belum tersedia'}</strong></summary>
    <div class="macro-nowcast-period-content">
      <div class="macro-nowcast-indicators">${period.indicators.map((row) => indicatorMarkup(row, true)).join('')}</div>
      <div class="macro-nowcast-total">
        <h4>Perhitungan skor nowcast</h4>
        <p>${formatMath(period.availableIndicators)} dari ${period.indicators.length} indikator · ${formatMath(period.coverage)}% bobot awal tersedia.</p>
        ${equation ? `<p>Jumlah (skor indikator × bobot) ÷ total bobot yang tersedia.</p><code data-macro-nowcast-equation>${equation}</code>`
          : `<p>${esc(period.reason || missing)}</p>`}
      </div>
    </div>
  </details>`;
}

function nowcastMarkup(forecast) {
  const periods = [...(forecast?.periods ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const source = forecast?.source ? sourceLink(forecast.source, forecast.sourceUrl) : '';
  return `<section class="macro-aggregation macro-nowcast" aria-labelledby="macro-nowcast-title" data-macro-nowcast>
    <h3 id="macro-nowcast-title">Detail nowcast</h3>
    ${forecast?.note || source ? `<p class="macro-provenance">${esc(forecast.note)}${forecast.note && source ? ' ' : ''}${source}</p>` : ''}
    ${periods.length ? periods.map((period, index) => nowcastPeriodMarkup(period, index === 0)).join('')
      : `<p role="status">${data || failed ? 'Nowcast belum tersedia.' : 'Memuat nowcast…'}</p>`}
  </section>`;
}

function renderDialog() {
  const model = data?.models[active];
  const score = model?.score;
  const reading = state(active, score);
  const top = body.scrollTop;
  const expanded = new Set([...content.querySelectorAll(disclosureSelector + '[open]')]
    .map((el) => el.dataset.macroHistoryFold));
  const tablePositions = new Map([...content.querySelectorAll(tableSelector)].map((el) => [
    el.dataset.macroHistoryTable, { top: el.scrollTop, left: el.scrollLeft },
  ]));
  const nowcastDisclosure = new Map([...content.querySelectorAll(nowcastPeriodSelector)]
    .map((el) => [el.dataset.macroNowcastPeriod, el.open]));
  const focusSelector = `${chartSelector}, ${tableSelector}, ${disclosureSelector}>summary, ${nowcastPeriodSelector}>summary`;
  const focusKey = (el) => el.dataset.macroChart ?? el.dataset.macroHistoryTable
    ?? el.parentElement?.dataset.macroHistoryFold ?? el.parentElement?.dataset.macroNowcastPeriod;
  const focused = document.activeElement?.matches(focusSelector) ? document.activeElement : null;
  const focusedKey = focused && focusKey(focused);
  historySections.clear();
  byId('macro-detail-title').textContent = definitions[active].title;
  byId('macro-detail-overview').innerHTML = `<div><span>SKOR MAKRO</span><strong data-tone="${reading.tone}">${formatScore(score)}${isScore(score) ? ' <small>/ 100</small>' : ''}</strong></div>
    <div><span>STATUS</span><strong>${reading.label}</strong></div>
    ${model?.indicators?.length ? `<div><span>DATA TERSEDIA</span><strong>${model.availableIndicators} <small>/ ${model.indicators.length}</small></strong></div>` : ''}`;
  byId('macro-detail-note').textContent = [model?.scope || definitions[active].shortScope, model?.note,
    failed && data ? 'Pembaruan gagal. Data terakhir ditampilkan.' : ''].filter(Boolean).join(' ');
  refreshButton.disabled = pending;
  const nowcast = active === 'growth' || active === 'inflation' ? nowcastMarkup(model?.forecast) : '';
  if (model?.indicators?.length) {
    const scoreHistory = historyMarkup({ key: 'score', title: 'Riwayat skor makro', points: model.history ?? [], composite: true }, model.indicators.length);
    const hasHistory = model.history?.length || model.indicators.some((row) => row.history?.length);
    const hint = hasHistory ? '<p class="turnover-chart-hint">Roda mouse: zoom · Seret: geser · Klik ganda: reset</p>' : '';
    const historyNote = hasHistory
      ? '<p class="macro-history-note">Riwayat memakai data revisi terbaru menurut periode observasi. Skor pada tiap tanggal menggabungkan observasi terbaru yang masih dalam batas usia seri. Waktu rilis awal tidak direkonstruksi.</p>' : '';
    content.innerHTML = nowcast + combinedMarkup(model) + hint + scoreHistory + historyNote + '<h3 class="macro-indicators-title">Indikator dan cara hitung</h3>' +
      model.indicators.map((row) => indicatorMarkup(row)).join('');
  } else {
    content.innerHTML = nowcast + `<p class="macro-availability" role="status">${data || failed ? 'Data indikator belum tersedia.' : 'Memuat indikator makro…'}</p>`;
  }
  for (const el of content.querySelectorAll(disclosureSelector)) el.open = expanded.has(el.dataset.macroHistoryFold);
  for (const el of content.querySelectorAll(nowcastPeriodSelector)) {
    const open = nowcastDisclosure.get(el.dataset.macroNowcastPeriod);
    if (open !== undefined) el.open = open;
  }
  for (const el of content.querySelectorAll(tableSelector)) {
    const position = tablePositions.get(el.dataset.macroHistoryTable);
    if (position) {
      el.scrollTop = position.top;
      el.scrollLeft = position.left;
    }
  }
  if (focused) [...content.querySelectorAll(focusSelector)]
    .find((el) => el.localName === focused.localName && focusKey(el) === focusedKey)?.focus({ preventScroll: true });
  body.scrollTop = top;
}

function bindHistoryZoom(root, sections, views, redraw) {
  function changeView(svg, update) {
    const key = svg.dataset.macroChart;
    const series = sections.get(key);
    const chart = `[data-macro-chart="${key}"]`;
    const current = root.querySelector(chart);
    if (!current || !series) return;
    const { viewStart, viewEnd, viewMin, viewMax, viewMinSpan } = current.dataset;
    const view = { start: Number(viewStart), end: Number(viewEnd) };
    const bounds = { min: Number(viewMin), max: Number(viewMax) };
    const next = update?.(view, bounds, Number(viewMinSpan));
    if (next?.start === view.start && next?.end === view.end) return;
    if (next) views.set(key, next); else views.delete(key);
    if (redraw) {
      redraw();
      return;
    }
    const focused = document.activeElement === current;
    current.closest('.m2-plot-panel').outerHTML = renderMacroHistoryChart(series, next);
    if (focused) root.querySelector(chart)?.focus({ preventScroll: true });
  }

  function zoomChart(svg, anchor, factor) {
    changeView(svg, (view, bounds, minSpan) => zoomWindow(view, bounds, anchor, factor, minSpan));
  }

  attachChartZoom(root, chartSelector, {
    plot: BTC_CHART_PLOT,
    onZoom(anchor, factor, svg) { zoomChart(svg, anchor, factor); },
    onPan(shift, svg) { changeView(svg, (view, bounds) => panWindow(view, bounds, shift)); },
    onReset(svg) { changeView(svg); },
  });
  root.addEventListener('keydown', (event) => {
    const svg = event.target.closest(chartSelector);
    if (!svg || !['+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') changeView(svg);
    else zoomChart(svg, 0.5, event.key === '-' ? 1.25 : 0.8);
  });
}

bindHistoryZoom(comparisonRoot, comparisonSections, comparisonViews, renderComparison);
bindHistoryZoom(body, historySections, chartViews);
comparisonRoot.addEventListener('click', (event) => {
  const id = event.target.closest(seriesToggleSelector)?.dataset.macroSeriesToggle;
  if (!keys.includes(id)) return;
  hiddenMacroSeries.toggle(id);
  renderComparison();
});

async function load() {
  if (pending) return;
  pending = true;
  refreshButton.disabled = true;
  try {
    const result = await fetch('/api/macro-scores', { signal: AbortSignal.timeout(45_000) });
    if (!result.ok) throw new Error();
    const payload = await result.json();
    if (payload.schema !== 1 || !payload.rules || !keys.every((key) => Array.isArray(payload.models?.[key]?.indicators))) throw new Error();
    data = payload;
    failed = false;
  } catch {
    failed = true;
  } finally {
    pending = false;
    refreshButton.disabled = false;
    renderDashboard();
    if (dialog.open) renderDialog();
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-macro-detail]');
  const key = button?.dataset.macroDetail;
  if (!keys.includes(key)) return;
  opener = button;
  active = key;
  chartViews.clear();
  content.replaceChildren();
  body.scrollTop = 0;
  renderDialog();
  dialog.showModal();
  body.scrollTop = 0;
  document.body.classList.add('metric-modal-open');
  if (!data || failed) load();
});
byId('close-macro-detail').addEventListener('click', () => dialog.close());
refreshButton.addEventListener('click', load);
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});

renderDashboard();
load();
setInterval(load, 15 * 60_000);

import { BTC_CHART_PLOT, DAY, levels, panel, renderBtcChartFrame } from './btc-turnover-charts.mjs';

const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthDate = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const axisNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3, notation: 'compact' });
const valueNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
const scoreNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const defaultColor = '#00bcd4';
const forecastDash = '5 3';

function timeline(points, field) {
  const byTime = new Map();
  for (const point of points ?? []) {
    const time = Date.parse(point.date);
    if (Number.isFinite(time)) byTime.set(time, { time, value: point[field], score: point.score, updatedAt: point.updatedAt });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function observationInterval(rows) {
  const intervals = rows.slice(1).map((row, i) => row.time - rows[i].time).sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)] ?? 0;
}

function line(rows, x, y, gap, color, dash) {
  let previous = null;
  const points = [];
  for (const row of rows) {
    if (!Number.isFinite(row.value)) {
      previous = null;
      continue;
    }
    const connect = previous !== null && row.time - previous <= gap;
    points.push((connect ? 'L' : 'M') + x(row.time).toFixed(1) + ',' + y(row.value).toFixed(1));
    previous = row.time;
  }
  const markers = rows.map((row, index) => {
    if (!Number.isFinite(row.value)) return '';
    const before = rows[index - 1], after = rows[index + 1];
    const connected = (Number.isFinite(before?.value) && row.time - before.time <= gap)
      || (Number.isFinite(after?.value) && after.time - row.time <= gap);
    return connected ? '' : `<path d="M${x(row.time)},${y(row.value)}h.01" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  if (!points.length) return '';
  return `<path d="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.7" vector-effect="non-scaling-stroke"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${markers}`;
}

function comparisonTooltip(histories) {
  const cursors = histories.map(() => -1);
  return (time) => histories.map(({ title, rows, gap, projections }, i) => {
    while (rows[cursors[i] + 1]?.time <= time) cursors[i]++;
    const row = rows[cursors[i]];
    const projection = projections.findLast((point) => point.time <= time);
    if (projection && (!row || projection.time > row.time) && time - projection.time <= gap) {
      const updated = Date.parse(projection.updatedAt);
      const period = projection.time === time ? '' : ' ' + fullDate.format(projection.time);
      const vintage = Number.isFinite(updated) ? ` · pembaruan ${fullDate.format(updated)}` : '';
      return `${escape(title)} ${scoreNumber.format(projection.value)} / 100 (nowcast${period}${vintage})`;
    }
    if (!Number.isFinite(row?.value) || time - row.time > gap) return `${escape(title)} —`;
    return `${escape(title)} ${scoreNumber.format(row.value)} / 100${row.time === time ? '' : ` (${fullDate.format(row.time)})`}`;
  }).join('\n');
}

function comparisonLegend(histories) {
  const buttons = histories.map(({ id, title, color, hidden }) =>
    `<button type="button" data-macro-series-toggle="${id}" aria-pressed="${!hidden}"><i style="background:${color}" aria-hidden="true"></i>${escape(title)}</button>`).join('');
  const projected = histories.some(({ projections }) => projections.length)
    ? '<span class="macro-forecast-key"><i aria-hidden="true"></i>Nowcast</span>' : '';
  return buttons + projected;
}

export function renderMacroHistoryChart({ key, title, points, unit = '', composite = false, comparison }, range) {
  const scoreScale = composite || Boolean(comparison);
  const histories = (comparison ?? [{ points, color: defaultColor }]).map((series) => {
    const rows = timeline(series.points, scoreScale ? 'score' : 'value');
    const interval = observationInterval(rows);
    const projections = timeline(series.forecast?.points, 'score').filter((row) => Number.isFinite(row.value));
    return { ...series, rows, projections, interval, gap: Math.max(5 * DAY, interval * 3.2) };
  });
  const rows = histories.flatMap((series) => [...series.rows, ...series.projections]);
  const plotted = histories.filter((series) => !series.hidden);
  const heading = escape(title);
  const detail = scoreScale ? '0–100' : escape(unit);
  const legends = comparison ? comparisonLegend(histories) : '';
  if (new Set(rows.filter((row) => Number.isFinite(row.value)).map((row) => row.time)).size < 2) {
    return panel(heading, detail, '<p class="btc-empty" role="status">Riwayat belum cukup untuk grafik.</p>', legends);
  }

  const lower = Math.min(...rows.map((row) => row.time));
  const upper = Math.max(...rows.map((row) => row.time));
  const interval = Math.max(...histories.map((series) => series.interval));
  const minSpan = Math.min(upper - lower, Math.max(5 * DAY, interval * 2));
  const requested = Math.round(range?.end - range?.start);
  const span = requested > 0 ? Math.max(minSpan, Math.min(requested, upper - lower)) : upper - lower;
  const start = Number.isFinite(range?.start) ? Math.max(lower, Math.min(Math.round(range.start), upper - span)) : upper - span;
  const end = start + span;
  const { left, width } = BTC_CHART_PLOT;
  const x = (time) => left + (time - start) / span * width;
  const observations = plotted.flatMap(({ rows, projections }) => [...rows, ...projections]).filter((row) => Number.isFinite(row.value));
  const visible = observations.filter((row) => row.time >= start && row.time <= end);
  const visibleTimes = [...new Set(visible.map((row) => row.time))].sort((a, b) => a - b);
  const scaled = (visible.length ? visible : observations).map((row) => row.value);
  const low = Math.min(...scaled), high = Math.max(...scaled);
  const margin = high === low ? Math.max(Math.abs(high) * 0.05, 0.01) : (high - low) * 0.1;
  const min = scoreScale ? 0 : low - margin;
  const max = scoreScale ? 100 : high + margin;
  const ticks = scoreScale
    ? [0, 25, 50, 75, 100].map((value) => ({ value, threshold: value === 50 }))
    : levels(min, max);
  const format = span > 120 * DAY ? monthDate : shortDate;
  const dates = Array.from({ length: 5 }, (_, i) => {
    const time = start + span * i / 4;
    return { x: x(time), text: format.format(time) };
  });
  const chart = renderBtcChartFrame({
    key, label: heading, attribute: 'data-macro-chart', height: comparison ? 258 : 204, min, max, ticks, dates,
    format: (value) => axisNumber.format(value),
    view: { start, end, min: lower, max: upper, minSpan }, observations: visibleTimes.length,
    plot(y, top, bottom) {
      const compareAt = comparison && comparisonTooltip(plotted);
      const hits = visibleTimes.map((time, i) => {
        const from = i ? x((visibleTimes[i - 1] + time) / 2) : left;
        const to = i < visibleTimes.length - 1 ? x((time + visibleTimes[i + 1]) / 2) : left + width;
        let label;
        if (compareAt) {
          label = '\n' + compareAt(time);
        } else {
          const row = visible[i];
          const value = composite ? scoreNumber.format(row.value) + ' / 100'
            : valueNumber.format(row.value) + (unit ? ' ' + detail : '');
          const score = !composite && Number.isFinite(row.score) ? ' · Skor ' + scoreNumber.format(row.score) + ' / 100' : '';
          label = ' · ' + value + score;
        }
        return `<rect data-turnover-hit x="${from}" y="${top}" width="${to - from}" height="${bottom - top}"><title>${fullDate.format(time)}${label}</title></rect>`;
      }).join('');
      return plotted.map(({ id, rows, gap, color, projections }) => {
        const context = (points) => points.filter((row) => row.time >= start - gap && row.time <= end + gap);
        const actual = line(context(rows), x, y, gap, color);
        if (!comparison) return actual;
        const last = rows.at(-1);
        const distance = projections[0]?.time - last?.time;
        const anchor = Number.isFinite(last?.value) && distance > 0 && distance <= gap;
        const forecast = line(anchor ? [last, ...projections] : projections, x, y, gap, color, forecastDash);
        return `<g data-macro-series="${id}">${actual}${forecast ? `<g data-macro-forecast>${forecast}</g>` : ''}</g>`;
      }).join('') + hits;
    },
  });
  const hint = comparison ? `<p class="turnover-chart-hint">${plotted.length ? 'Roda mouse untuk zoom · Seret untuk geser · Klik ganda untuk reset' : 'Pilih skor di legenda untuk menampilkan garis.'}</p>` : '';
  const credits = plotted.filter(({ forecast, projections }) => projections.length && forecast.sourceUrl);
  const notes = credits.map(({ forecast }) => escape(forecast.note ?? '')).filter(Boolean).join(' ');
  const links = credits.map(({ forecast }) => `<a href="${escape(forecast.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(forecast.source)}</a>`);
  const sources = links.length ? `<p class="macro-forecast-sources">${notes ? notes + ' ' : ''}${links.join(' · ')}</p>` : '';
  return panel(heading, detail, chart + hint + sources, legends);
}

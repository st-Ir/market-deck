import { BTC_CHART_PLOT, DAY, decimal, levels, panel, renderBtcChartFrame } from './btc-turnover-charts.mjs';

export { BTC_CHART_PLOT };

const HOUR = 3_600_000;
const CYAN = '#00bcd4';
const PINK = '#e91e63';
const localDate = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
const localTime = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localStamp = (time) => localDate.format(time) + ' ' + localTime.format(time).replace('.', ':');
const rate = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6, signDisplay: 'exceptZero' });
const axisRate = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });
const axisInterest = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

function samples(points, field) {
  const rows = new Map();
  for (const point of points ?? []) {
    const time = Date.parse(point.time);
    if (Number.isFinite(time) && Number.isFinite(point[field])) rows.set(time, { time, value: point[field] });
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

function plotInterest(rows, x, y) {
  const segments = rows.map((row, index) => {
    const hasGap = index === 0 || row.time - rows[index - 1].time > HOUR;
    return (hasGap ? 'M' : 'L') + x(row.time).toFixed(1) + ',' + y(row.value).toFixed(1);
  }).join(' ');
  const dots = rows.map((row, index) => {
    const isolated = (!index || row.time - rows[index - 1].time > HOUR)
      && (index === rows.length - 1 || rows[index + 1].time - row.time > HOUR);
    return isolated ? `<path d="M${x(row.time)},${y(row.value)}h.01" fill="none" stroke="${CYAN}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : '';
  }).join('');
  return `<path d="${segments}" fill="none" stroke="${CYAN}" stroke-width="1.7" vector-effect="non-scaling-stroke"/>${dots}`;
}

export function renderPositionChart(data, key, range) {
  if (key !== 'funding' && key !== 'open-interest') return '';
  const funding = key === 'funding';
  const title = funding ? 'Riwayat funding rate' : 'Riwayat open interest';
  const detail = funding ? 'Penyelesaian · % · WIB' : 'BTC · WIB';
  const rows = funding ? samples(data?.funding?.points, 'ratePercent') : samples(data?.openInterest?.points, 'value');
  if (!rows.length) return panel(title, detail, '<p class="btc-empty">Riwayat belum tersedia.</p>');
  if (rows.length === 1) {
    const [{ time, value }] = rows;
    return panel(title, detail, `<p class="btc-empty">${localStamp(time)} WIB · ${funding ? rate.format(value) + '%' : decimal.format(value) + ' BTC'}</p>`);
  }

  // Leave room around the first and last discrete funding events.
  const padding = funding ? Math.min(rows[1].time - rows[0].time, rows.at(-1).time - rows.at(-2).time) / 2 : 0;
  const lower = rows[0].time - padding, upper = rows.at(-1).time + padding;
  const requested = range?.end - range?.start;
  const span = requested > 0 ? Math.min(requested, upper - lower) : upper - lower;
  const start = Number.isFinite(range?.start) ? Math.max(lower, Math.min(range.start, upper - span)) : upper - span;
  const end = start + span;
  const { left, width } = BTC_CHART_PLOT;
  const x = (time) => left + (time - start) / span * width;
  const visible = rows.filter(({ time }) => time >= start && time <= end);
  const scaleRows = visible.length ? visible : rows;
  const lowest = Math.min(...scaleRows.map(({ value }) => value));
  const highest = Math.max(...scaleRows.map(({ value }) => value));
  const spread = funding ? Math.max(Math.abs(lowest), Math.abs(highest), 0.0003) * 1.15 : Math.max(highest - lowest, 1) * 0.14;
  const min = funding ? (lowest < 0 ? -spread : 0) : Math.max(0, lowest - spread);
  const max = funding ? (highest < 0 ? 0 : spread) : highest + spread;
  const tickLevels = funding && min < 0 && max > 0 ? [min, min / 2, 0, max / 2, max].map((value) => ({ value })) : levels(min, max);
  const ticks = tickLevels.map(({ value }) => ({ value, threshold: funding && value === 0 }));
  const format = funding ? (value) => axisRate.format(value) + '%' : (value) =>
    value >= 1000 ? axisInterest.format(value / 1000) + ' K' : axisInterest.format(value);
  const dates = Array.from({ length: 5 }, (_, i) => {
    const time = start + span * i / 4;
    const text = span > DAY ? localDate.format(time) :
      (i === 0 || i === 4) && localDate.format(start) !== localDate.format(end) ? localStamp(time) : localTime.format(time).replace('.', ':');
    return { x: x(time), text };
  });
  const content = renderBtcChartFrame({
    key, label: title, attribute: 'data-position-chart', height: 202, min, max, ticks, format, dates,
    view: { start, end, min: lower, max: upper }, observations: visible.length,
    plot(y, top, bottom) {
      const interestContext = rows.filter(({ time }) => time >= start - HOUR && time <= end + HOUR);
      const barWidth = Math.max(2, Math.min(28, width / Math.max(1, visible.length) * 0.72));
      const series = funding ? visible.map(({ time, value }) =>
        `<rect x="${x(time) - barWidth / 2}" y="${Math.min(y(value), y(0))}" width="${barWidth}" height="${Math.max(1, Math.abs(y(value) - y(0)))}" fill="${value < 0 ? PINK : CYAN}" opacity=".8"/>`).join('')
        : plotInterest(interestContext, x, y);
      const hits = visible.map(({ time, value }, index) => {
        const from = index ? x((visible[index - 1].time + time) / 2) : left;
        const to = index < visible.length - 1 ? x((time + visible[index + 1].time) / 2) : left + width;
        const text = funding ? rate.format(value) + '%' : decimal.format(value) + ' BTC';
        return `<rect data-turnover-hit x="${from}" y="${top}" width="${to - from}" height="${bottom - top}"><title>${localStamp(time)} WIB · ${text}</title></rect>`;
      }).join('');
      return series + hits;
    },
  });
  return panel(title, detail, content);
}

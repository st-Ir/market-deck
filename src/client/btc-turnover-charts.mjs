export const DAY = 86_400_000;
export const SPIKE = 1.5;
export const BTC_CHART_PLOT = { left: 9, width: 942, total: 960 };

const AXIS_WIDTH = 57;
const TOP = 12;
const DEFAULT_ROWS = 90;
const CYAN = '#00bcd4';
const PINK = '#e91e63';
const YELLOW = '#e9a91e';

export const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const whole = (value) => Number.isFinite(value) ? integer.format(value) : '—';
export const ratio = (value) => Number.isFinite(value) ? decimal.format(value) + '×' : '—';
export const percent = (value) => Number.isFinite(value) ? signed.format(value) + '%' : '—';
export const tone = (value) => value > 0 ? 'btc-positive' : value < 0 ? 'btc-negative' : '';
export const day = (value, full = false) => (full ? longDate : shortDate).format(new Date(value));
export const timestamp = (value) => day(value, true) + ' ' + new Date(value).toISOString().slice(11, 16) + ' UTC';

export function cash(value) {
  if (!Number.isFinite(value)) return '—';
  const units = [[1e12, ' T'], [1e9, ' B'], [1e6, ' M'], [1e3, ' K']];
  const [divisor, suffix] = units.find(([unit]) => Math.abs(value) >= unit) || [1, ''];
  return decimal.format(value / divisor) + suffix;
}

export function composition(data, market) {
  if (!data || market !== 'combined') return '';
  return `Spot ${cash(data.spot)} · Perpetual ${cash(data.perpetual)}`;
}

function legend(label, color, dashed = false) {
  const swatch = dashed ? `repeating-linear-gradient(90deg,${color} 0 4px,transparent 4px 7px)` : color;
  return `<span><i style="background:${swatch}"></i>${label}</span>`;
}

export function panel(title, detail, content, legends = '') {
  return `<section class="m2-plot-panel"><header><h3>${title}${detail ? ` <small>${detail}</small>` : ''}</h3></header>${legends ? `<div class="m2-legend">${legends}</div>` : ''}${content}</section>`;
}

function path(rows, field, x, y, color, dash = '') {
  let points = '';
  let previousDay = null;
  for (const [index, row] of rows.entries()) {
    if (!Number.isFinite(row[field])) continue;
    const date = Date.parse(row.date);
    const start = previousDay === null || date - previousDay !== DAY;
    points += `${start ? 'M' : 'L'}${x(index).toFixed(1)},${y(row[field]).toFixed(1)} `;
    previousDay = date;
  }
  return `<path d="${points}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function viewport(rows, view) {
  const maxRows = rows.length;
  const span = view ? Math.max(1, Math.min(view.end - view.start, maxRows)) : Math.min(DEFAULT_ROWS, maxRows);
  const start = view ? Math.max(0, Math.min(view.start, maxRows - span)) : maxRows - span;
  const end = start + span;
  const offset = Math.floor(start);
  return { visible: rows.slice(offset, Math.ceil(end)), start, end, maxRows, offset, span };
}

export function renderBtcChartFrame({ key, label, height, min, max, ticks, format, dates, plot,
  view, observations, attribute = 'data-btc-chart' }) {
  const { left, width, total } = BTC_CHART_PLOT;
  const right = left + width;
  const bottom = height - 24;
  const y = (value) => bottom - (value - min) / (max - min) * (bottom - TOP);
  const axis = ticks.map(({ value }) =>
    `<text x="${AXIS_WIDTH - 5}" y="${y(value) + 4}" text-anchor="end">${format(value)}</text>`).join('');
  const grid = ticks.map(({ value, threshold }) =>
    `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" vector-effect="non-scaling-stroke" class="${threshold ? 'btc-turnover-threshold' : 'btc-turnover-grid'}"/>`).join('');

  const dateLabels = dates.map(({ x, text }) => {
    const position = x / total * 100;
    const anchor = position < 9 ? ' is-start' : position > 91 ? ' is-end' : '';
    return `<span class="btc-turnover-date${anchor}" style="left:${position}%">${text}</span>`;
  }).join('');
  const clip = `btc-turnover-clip-${key}`;
  const lowerBound = Number.isFinite(view.min) ? ` data-view-min="${view.min}"` : '';
  const zoomLimit = Number.isFinite(view.minSpan) ? ` data-view-min-span="${view.minSpan}"` : '';

  return `<div class="btc-turnover-chart-layout" style="--btc-chart-height:${height}px">
    <svg class="btc-turnover-chart-axis" viewBox="0 0 ${AXIS_WIDTH} ${height}" aria-hidden="true">${axis}</svg>
    <div class="btc-turnover-chart-plot">
      <svg class="btc-turnover-chart chart-zoomable" ${attribute}="${key}" data-view-start="${view.start}" data-view-end="${view.end}"${lowerBound}${zoomLimit} data-view-max="${view.max}" data-visible-count="${observations}" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" role="img" aria-label="${label}. ${observations} observasi. Roda mouse atau +/− untuk zoom." tabindex="0">
        <defs><clipPath id="${clip}"><rect x="${left}" y="${TOP - 1}" width="${width}" height="${bottom - TOP + 4}"/></clipPath></defs>
        ${grid}<g clip-path="url(#${clip})">${plot(y, TOP, bottom)}</g>
      </svg>
      <div class="btc-turnover-chart-dates" aria-hidden="true">${dateLabels}</div>
    </div>
  </div>`;
}

function chart({ visible, start, end, maxRows, offset, span }, { tooltip, plot, ...style }) {
  const { left, width } = BTC_CHART_PLOT;
  const slot = width / span;
  const x = (index) => left + (offset + index + 0.5 - start) * slot;
  const firstTick = Math.max(0, Math.ceil(start - offset - 0.5));
  const lastTick = Math.min(visible.length - 1, Math.floor(end - offset - 0.5));
  const steps = Math.max(1, Math.min(4, lastTick - firstTick));
  const tickIndexes = [...new Set(Array.from({ length: steps + 1 }, (_, i) =>
    Math.round(firstTick + (lastTick - firstTick) * i / steps)))];
  return renderBtcChartFrame({
    ...style, view: { start, end, max: maxRows }, observations: visible.length,
    dates: tickIndexes.map((index) => ({ x: x(index), text: day(visible[index].date) })),
    plot(y, top, bottom) {
      const hits = visible.map((row, index) =>
        `<rect data-turnover-hit x="${x(index) - slot / 2}" y="${top}" width="${slot}" height="${bottom - top}"><title>${day(row.date, true)} · ${tooltip(row)}</title></rect>`).join('');
      return plot(x, y, slot * 0.76) + hits;
    },
  });
}

export function levels(min, max) {
  return Array.from({ length: 4 }, (_, i) => ({ value: min + (max - min) * i / 3 }));
}

const emptyHistory = '<p class="btc-empty">Riwayat harian belum tersedia.</p>';

function marker(x, y, color) {
  return `<path d="M${x},${y}h.01" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
}

export function volumeChart(rows, market, view) {
  if (!rows.length) return panel('Nilai transaksi harian', 'USDT', emptyHistory);
  const frame = viewport(rows, view);
  const label = 'Nilai transaksi harian dalam USDT';
  const max = Math.max(1, ...frame.visible.flatMap((row) => [row.volume, row.ma5 ?? 0, row.ma20 ?? 0])) * 1.07;
  const averageColor = market === 'combined' ? YELLOW : market === 'spot' ? PINK : CYAN;
  const plots = chart(frame, {
    key: `${market}-volume`, label, height: 222, min: 0, max, ticks: levels(0, max), format: cash,
    tooltip: (row) => {
      const split = market === 'combined' ? ` · ${composition(row, market)}` : '';
      return `${cash(row.volume)} USDT${split} · MA5 ${cash(row.ma5)} · MA20 ${cash(row.ma20)}`;
    },
    plot(x, y, width) {
      const bars = frame.visible.map((row, i) => {
        const spot = row.spot ?? 0;
        const left = x(i) - width / 2;
        const spotBar = market === 'perpetual' ? '' :
          `<rect x="${left}" y="${y(spot)}" width="${width}" height="${Math.max(0, y(0) - y(spot))}" fill="${CYAN}" opacity=".75"/>`;
        const perpBar = market === 'spot' ? '' :
          `<rect x="${left}" y="${y(row.volume)}" width="${width}" height="${Math.max(0, y(spot) - y(row.volume))}" fill="${PINK}" opacity=".75"/>`;
        return spotBar + perpBar;
      }).join('');
      return bars + path(frame.visible, 'ma5', x, y, averageColor, '4 3') + path(frame.visible, 'ma20', x, y, averageColor);
    },
  });
  const legends = (market !== 'perpetual' ? legend('Spot', CYAN) : '') +
    (market !== 'spot' ? legend('Perpetual', PINK) : '') + legend('MA5', averageColor, true) + legend('MA20', averageColor);
  return panel('Nilai transaksi harian', 'USDT', plots, legends);
}

export function rvolChart(rows, market = 'combined', view) {
  if (!rows.some((row) => Number.isFinite(row.rvol))) {
    return panel('RVOL harian', '', '<p class="btc-empty">Perlu 20 hari sebelumnya untuk menghitung RVOL.</p>');
  }
  const frame = viewport(rows, view);
  const max = Math.max(2, ...frame.visible.map((row) => row.rvol ?? 0)) * 1.08;
  const label = 'RVOL harian dengan garis rata-rata 1× dan ambang lonjakan 1,5×';
  const plots = chart(frame, {
    key: `${market}-rvol`, label, height: 142, min: 0, max,
    ticks: [{ value: 0 }, { value: 1 }, { value: SPIKE, threshold: true }], format: ratio,
    tooltip: (row) => `RVOL ${ratio(row.rvol)}`,
    plot(x, y) {
      return path(frame.visible, 'rvol', x, y, CYAN) + frame.visible.map((row, i) =>
        row.rvol >= SPIKE ? marker(x(i), y(row.rvol), PINK) : '').join('');
    },
  });
  return panel('RVOL harian', 'Dibanding rata-rata 20 hari sebelumnya', plots, legend('RVOL', CYAN) + legend('Lonjakan ≥ 1,5×', PINK));
}

export function priceChart(rows, market, view) {
  const historicalCloses = rows.map((row) => row.close).filter(Number.isFinite);
  if (!historicalCloses.length) return '';
  const frame = viewport(rows, view);
  const closes = frame.visible.map((row) => row.close).filter(Number.isFinite);
  const range = closes.length ? closes : historicalCloses;
  const min = Math.min(...range) * 0.99;
  const max = Math.max(...range) * 1.01;
  const plots = chart(frame, {
    key: `${market}-price`, label: 'Harga penutupan BTC dan konfirmasi nilai transaksi',
    height: 162, min, max, ticks: levels(min, max), format: cash,
    tooltip: (row) => `BTC ${cash(row.close)} USDT · ${percent(row.change)}${row.confirmation ? ' · volume lebih tinggi' : ''}`,
    plot(x, y) {
      return path(frame.visible, 'close', x, y, YELLOW) + frame.visible.map((row, i) =>
        row.confirmation && Number.isFinite(row.close)
          ? marker(x(i), y(row.close), row.confirmation === 'up' ? CYAN : PINK) : '').join('');
    },
  });
  const label = market === 'perpetual' ? 'Penutupan perpetual' : 'Penutupan spot';
  const legends = legend(label, YELLOW) + legend('Naik dengan volume lebih tinggi', CYAN) + legend('Turun dengan volume lebih tinggi', PINK);
  return panel('Harga BTC &amp; konfirmasi volume', 'USDT', plots, legends);
}

export function etfVolumeChart(rows, view, estimate = false) {
  if (!rows.length) return panel('Nilai transaksi ETF per sesi', 'USD', emptyHistory);
  const frame = viewport(rows, view);
  const max = Math.max(1, ...frame.visible.map((row) => row.volume ?? 0)) * 1.07;
  const label = (estimate ? 'Estimasi nilai' : 'Nilai') + ' transaksi ETF spot Bitcoin AS per sesi';
  const plots = chart(frame, {
    key: 'etf-volume', label, height: 162, min: 0, max, ticks: levels(0, max), format: cash,
    tooltip: (row) => `${estimate ? 'Estimasi ' : ''}${cash(row.volume)} USD`,
    plot(x, y, width) {
      return frame.visible.map((row, i) => Number.isFinite(row.volume)
        ? `<rect x="${x(i) - width / 2}" y="${y(row.volume)}" width="${width}" height="${y(0) - y(row.volume)}" fill="${CYAN}" opacity=".8"/>` : '').join('');
    },
  });
  return panel('Nilai transaksi ETF per sesi', estimate ? 'Estimasi USD' : 'USD', plots);
}

// Small helpers for the inline SVG line charts in the commodity and rates popups:
// plot geometry in a viewBox 860 units wide (440 on phones, so the charts keep
// their height and readable labels), value scales with rounded ticks, null-aware
// line paths, and the series index under the pointer.
export const W = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches ? 440 : 860;

export function frame(n, height, { left = 10, right = 58, top = 12, bottom = 24 } = {}) {
  const PW = W - left - right, PH = height - top - bottom;
  return { n, height, L: left, R: W - right, T: top, B: height - bottom, PW, PH, x: (i) => left + (n > 1 ? i / (n - 1) : 0.5) * PW };
}

// Linear scale over the finite values, padded; ticks at "nice" steps.
export function scale(values, geo, { pad = 0.08, min: forceMin, max: forceMax, count = 4 } = {}) {
  const finite = values.filter(Number.isFinite);
  let min = forceMin ?? Math.min(...finite), max = forceMax ?? Math.max(...finite);
  if (!finite.length) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  if (forceMin === undefined) min -= span * pad;
  if (forceMax === undefined) max += span * pad;
  const raw = (max - min) / count, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return { min, max, ticks, y: (v) => geo.T + (max - v) / (max - min) * geo.PH };
}

export function linePath(values, x, y) {
  let d = '', pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) { pen = false; return; }
    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    pen = true;
  });
  return d;
}

export function indexAt(svg, clientX, geo) {
  const box = svg.getBoundingClientRect();
  const ux = (clientX - box.left) / box.width * W;
  return Math.max(0, Math.min(geo.n - 1, Math.round((ux - geo.L) / geo.PW * (geo.n - 1))));
}

// Horizontal grid lines with labels on the right axis.
export function grid(geo, s, format) {
  return s.ticks.map((t) => '<line x1="' + geo.L + '" x2="' + geo.R + '" y1="' + s.y(t).toFixed(1) + '" y2="' + s.y(t).toFixed(1) + '" class="mc-grid"/>' +
    '<text x="' + (geo.R + 6) + '" y="' + (s.y(t) + 3).toFixed(1) + '" class="mc-axis">' + format(t) + '</text>').join('');
}

// Three date labels along the bottom.
export function dateAxis(geo, dates, format) {
  const n = dates.length;
  return [0, Math.floor((n - 1) / 2), n - 1].map((i, k) => '<text x="' + geo.x(i).toFixed(1) + '" y="' + (geo.height - 6) + '" class="mc-axis" text-anchor="' + ['start', 'middle', 'end'][k] + '">' + format(dates[i]) + '</text>').join('');
}

export const movingAverage = (values, n) => values.map((_, i) => {
  if (i < n - 1) return null;
  const window = values.slice(i - n + 1, i + 1);
  return window.every(Number.isFinite) ? window.reduce((s, v) => s + v, 0) / n : null;
});

export function correlation(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 10) return null;
  const n = pairs.length, mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? { r: sxy / Math.sqrt(sxx * syy), beta: sxy / sxx, n } : null;
}

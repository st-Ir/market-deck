import { loadGrowthNowcast } from './macro-growth-nowcast';
import { loadInflationNowcast } from './macro-inflation-nowcast';

const DAY = 86_400_000;
const FRED = 'https://fred.stlouisfed.org';
const FED_PCE_TARGET = 2;
const PRESSURE_POINTS_PER_PP = 12.5;
const GROWTH_COMPARISON_MONTHS = 60;
const MONTH_LABEL = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const growthCalibration = '100 × (jumlah YoY historis di bawah nilai terbaru + 0,5 × jumlah yang sama) ÷ jumlah pembanding';
const inflationCalibration = 'Batasi 50 + 12,5 × (inflasi dalam % − 2) ke rentang 0–100';

const growthSpecs = [
  { id: 'real-gdp', series: 'GDPC1', label: 'PDB riil AS · YoY', rawLabel: 'PDB riil',
    rawUnit: 'miliar USD riil (SAAR)', source: 'BEA · FRED', monthsPerPeriod: 3, weight: 100 / 3 },
  { id: 'industrial-production', series: 'INDPRO', label: 'Produksi industri AS · YoY', rawLabel: 'Indeks produksi',
    rawUnit: 'poin indeks', source: 'Federal Reserve · FRED', monthsPerPeriod: 1, weight: 100 / 3 },
  { id: 'payrolls', series: 'PAYEMS', label: 'Payroll nonpertanian AS · YoY', rawLabel: 'Payroll',
    rawUnit: 'ribu pekerjaan', source: 'BLS · FRED', monthsPerPeriod: 1, weight: 100 / 3 },
];

const inflationSpecs = [
  { id: 'pce-headline', series: 'PCEPI', label: 'Inflasi PCE AS · YoY', rawLabel: 'Indeks PCE',
    rawUnit: 'poin indeks', source: 'BEA · FRED', monthsPerPeriod: 1, lookback: 12, weight: 50 },
  { id: 'pce-core', series: 'PCEPILFE', label: 'Inflasi PCE inti · YoY', rawLabel: 'Indeks PCE inti',
    rawUnit: 'poin indeks', source: 'BEA · FRED', monthsPerPeriod: 1, lookback: 12, weight: 30 },
  { id: 'pce-core-momentum', series: 'PCEPILFE', label: 'Momentum PCE inti · 3 bulan', rawLabel: 'Indeks PCE inti',
    rawUnit: 'poin indeks', source: 'BEA · FRED', monthsPerPeriod: 1, lookback: 3, weight: 20 },
];

const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const observationEnd = (date, monthsPerPeriod) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + monthsPerPeriod, 0);
const isoDay = (time) => new Date(time).toISOString().slice(0, 10);
const periodLabel = (date, monthsPerPeriod) => monthsPerPeriod === 3
  ? 'Triwulan ' + Math.ceil(Number(date.slice(5, 7)) / 3) + ' ' + date.slice(0, 4)
  : MONTH_LABEL.format(Date.parse(date));

function parseFred(csv, series) {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const [dateColumn, seriesColumn] = header.split(',');
  if (!/^(observation_date|date)$/i.test(dateColumn) || seriesColumn !== series) {
    throw new Error('Format seri FRED ' + series + ' tidak dikenal');
  }
  const points = new Map();
  for (const line of lines) {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (/^\d{4}-(0[1-9]|1[0-2])-01$/.test(date) && Number.isFinite(value) && value > 0) {
      points.set(date, { date, value });
    }
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function loadFred(series, now) {
  const start = String(now.getUTCFullYear() - 12) + '-01-01';
  const response = await fetch(FRED + '/graph/fredgraph.csv?id=' + series + '&cosd=' + start, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('FRED ' + series + ' HTTP ' + response.status);
  return parseFred(await response.text(), series);
}

function observation(spec, points, now, lookback, annualize = 1) {
  const usable = points.filter((point) => observationEnd(point.date, spec.monthsPerPeriod) <= now);
  const byMonth = new Map(usable.map((point) => [monthIndex(point.date), point]));
  const current = usable.at(-1);
  const previous = current ? byMonth.get(monthIndex(current.date) - lookback) : null;
  const rate = (later, earlier) => ((later.value / earlier.value) ** annualize - 1) * 100;
  return { usable, byMonth, current, previous, value: previous ? rate(current, previous) : null, rate };
}

function baseReading(spec, observation, lookback, now) {
  const { current, previous, value } = observation;
  const ageLimit = spec.monthsPerPeriod === 3 ? 170 : 95;
  let note;
  if (!current) note = 'Data sumber belum tersedia.';
  else if (!previous) note = 'Observasi pembanding ' + lookback + ' bulan lalu belum tersedia.';
  else if (now - observationEnd(current.date, spec.monthsPerPeriod) > ageLimit * DAY) {
    note = 'Data melewati batas usia ' + ageLimit + ' hari sejak akhir periode.';
  }
  return {
    id: spec.id,
    label: spec.label,
    weight: spec.weight,
    value,
    unit: '%',
    asOf: current?.date ?? null,
    ...(current && { period: periodLabel(current.date, spec.monthsPerPeriod) }),
    source: spec.source,
    sourceUrl: FRED + '/series/' + spec.series,
    score: null,
    historyMaxAgeDays: ageLimit,
    ...(note && { note }),
    readings: [
      current && { label: spec.rawLabel + ' terbaru', value: current.value, unit: spec.rawUnit },
      previous && { label: spec.rawLabel + ' ' + lookback + ' bulan lalu', value: previous.value, unit: spec.rawUnit },
    ].filter(Boolean),
  };
}

function historicalRates(spec, obs, lookback) {
  return obs.usable.flatMap((row) => {
    const month = monthIndex(row.date);
    const previous = obs.byMonth.get(month - lookback);
    return previous ? [{
      month,
      date: new Date(observationEnd(row.date, spec.monthsPerPeriod)).toISOString().slice(0, 10),
      value: obs.rate(row, previous),
    }] : [];
  });
}

function growthIndicator(spec, points, now) {
  const obs = observation(spec, points, now, 12);
  const rates = historicalRates(spec, obs, 12);
  const required = spec.monthsPerPeriod === 3 ? 16 : 48;
  const ranked = rates.map(({ month, date, value }, index) => {
    const past = rates.slice(Math.max(0, index - GROWTH_COMPARISON_MONTHS), index)
      .filter((row) => row.month >= month - GROWTH_COMPARISON_MONTHS);
    const below = past.filter((row) => row.value < value).length;
    const equal = past.filter((row) => row.value === value).length;
    const count = past.length;
    return { date, value, below, equal, count, score: count >= required ? 100 * (below + 0.5 * equal) / count : null };
  });
  const result = {
    ...baseReading(spec, obs, 12, now),
    transform: '100 × (level terbaru ÷ level pada periode yang sama tahun lalu − 1)',
    calibration: growthCalibration,
    history: ranked.slice(-GROWTH_COMPARISON_MONTHS / spec.monthsPerPeriod).map(({ date, value, score }) => ({ date, value, score })),
  };
  if (result.note) return result;
  const latest = ranked.at(-1);
  if (latest?.score == null) return { ...result, note: 'Riwayat YoY belum cukup untuk persentil.' };
  return {
    ...result,
    score: latest.score,
    reference: 'Lima tahun sebelum observasi terbaru · ' + latest.below + ' lebih rendah, ' + latest.equal + ' sama, ' + latest.count + ' pembanding',
  };
}

const inflationPressure = (value) => Math.max(0, Math.min(100, 50 + PRESSURE_POINTS_PER_PP * (value - FED_PCE_TARGET)));

function inflationIndicator(spec, points, now) {
  const annualize = 12 / spec.lookback;
  const obs = observation(spec, points, now, spec.lookback, annualize);
  const result = {
    ...baseReading(spec, obs, spec.lookback, now),
    transform: annualize === 1
      ? '100 × (indeks terbaru ÷ indeks 12 bulan sebelumnya − 1)'
      : '100 × ((indeks terbaru ÷ indeks 3 bulan sebelumnya)⁴ − 1)',
    calibration: inflationCalibration,
    reference: '2% per tahun · target jangka panjang Fed untuk PCE headline',
    history: historicalRates(spec, obs, spec.lookback).slice(-GROWTH_COMPARISON_MONTHS)
      .map(({ date, value }) => ({ date, value, score: inflationPressure(value) })),
  };
  if (result.note) return result;
  return {
    ...result,
    score: inflationPressure(obs.value),
  };
}

function growthForecast(nowcast, points, indicators, now) {
  if (!nowcast) return null;
  const spec = growthSpecs[0];
  const actual = observation(spec, points.get(spec.series), now, 12);
  if (actual.current?.date >= nowcast.date) return null;
  const month = monthIndex(nowcast.date);
  const end = observationEnd(nowcast.date, spec.monthsPerPeriod);
  const previous = actual.byMonth.get(month - spec.monthsPerPeriod);
  const yearAgo = actual.byMonth.get(month - 12);
  const level = previous && previous.value * (1 + nowcast.rate / 100) ** 0.25;
  const gdp = Number.isFinite(level) && level > 0
    ? growthIndicator(spec, [...actual.usable, { date: nowcast.date, value: level }], new Date(end)) : null;
  const projected = {
    id: spec.id,
    label: spec.label,
    kind: 'nowcast',
    weight: spec.weight,
    unit: '%',
    value: gdp?.value ?? null,
    score: gdp?.score ?? null,
    transform: 'Level proyeksi = PDB riil triwulan sebelumnya × (1 + GDPNow ÷ 100)^(1/4). YoY = 100 × (level proyeksi ÷ PDB riil triwulan yang sama tahun lalu − 1).',
    calibration: growthCalibration,
    reference: gdp?.reference,
    note: gdp ? gdp.note : 'Level PDB riil triwulan sebelumnya diperlukan untuk mengubah GDPNow ke YoY.',
    readings: [
      { label: 'GDPNow · QoQ disetahunkan (SAAR)', value: nowcast.rate, unit: '%' },
      { label: 'PDB riil triwulan sebelumnya', value: previous?.value, unit: spec.rawUnit },
      { label: 'Estimasi level PDB riil', value: level, unit: spec.rawUnit },
      { label: 'PDB riil triwulan yang sama tahun lalu', value: yearAgo?.value, unit: spec.rawUnit },
    ],
  };

  const date = isoDay(end);
  const recent = indicators.slice(1).map((row) => {
    const latest = row.history.findLast((point) => point.date <= date);
    const stale = latest && end - Date.parse(latest.date) > row.historyMaxAgeDays * DAY;
    return {
      id: row.id,
      label: row.label,
      kind: 'actual',
      observedAt: latest?.date,
      value: latest?.value ?? null,
      unit: row.unit,
      weight: row.weight,
      score: stale ? null : latest?.score ?? null,
      source: row.source,
      sourceUrl: row.sourceUrl,
      calibration: row.calibration,
      reference: !stale && latest?.date === row.history.at(-1)?.date ? row.reference : undefined,
      note: stale ? `Observasi melewati batas usia ${row.historyMaxAgeDays} hari pada akhir periode nowcast.`
        : latest ? null : 'Observasi YoY belum tersedia.',
    };
  });
  return {
    source: 'GDPNow Atlanta Fed',
    sourceUrl: 'https://www.atlantafed.org/research-and-data/data/gdpnow',
    note: 'Growth menggabungkan nowcast PDB dengan data produksi industri dan payroll terakhir.',
    periods: [{
      date,
      period: periodLabel(nowcast.date, spec.monthsPerPeriod),
      updatedAt: nowcast.updatedAt,
      indicators: [projected, ...recent],
      reason: projected.score === null ? 'Skor nowcast Growth memerlukan skor PDB riil YoY.' : null,
    }],
  };
}

function inflationForecast(nowcasts, points, indicators, now) {
  const [headline, core, momentum] = inflationSpecs;
  const latestActual = indicators.map((row) => row.asOf).filter(Boolean).sort().at(-1);
  const coreLevels = new Map(points.get(core.series).filter(({ date }) => observationEnd(date, 1) <= now)
    .map(({ date, value }) => [monthIndex(date), { value, estimated: false }]));
  const projections = [];
  for (const nowcast of nowcasts) {
    const { date, updatedAt, headlineYoY, coreYoY, coreMoM } = nowcast;
    if (latestActual && date <= latestActual) continue;
    const month = monthIndex(date);
    const previous = coreLevels.get(month - 1);
    const reference = coreLevels.get(month - momentum.lookback);
    const level = previous && Number.isFinite(coreMoM) && coreMoM > -100
      ? previous.value * (1 + coreMoM / 100) : null;
    if (level !== null) coreLevels.set(month, { value: level, estimated: true });
    const momentumValue = level !== null && reference ? ((level / reference.value) ** 4 - 1) * 100 : null;
    const forecastIndicators = [[headline, headlineYoY], [core, coreYoY], [momentum, momentumValue]]
      .map(([spec, value]) => ({
        id: spec.id,
        label: spec.label,
        kind: spec === momentum ? 'derived' : 'nowcast',
        weight: spec.weight,
        unit: '%',
        value,
        score: Number.isFinite(value) ? inflationPressure(value) : null,
        calibration: inflationCalibration,
      }));
    Object.assign(forecastIndicators[2], {
      transform: 'Indeks proyeksi = indeks bulan sebelumnya × (1 + PCE inti MoM ÷ 100). Momentum disetahunkan = 100 × ((indeks proyeksi ÷ indeks 3 bulan sebelumnya)⁴ − 1).',
      note: momentumValue === null ? 'Perhitungan memerlukan estimasi MoM dan kedua level indeks pembanding.' : null,
      readings: [
        { label: 'Nowcast PCE inti · MoM', value: coreMoM, unit: '%' },
        { label: `Indeks bulan sebelumnya${previous ? (previous.estimated ? ' (estimasi)' : ' (aktual)') : ''}`, value: previous?.value, unit: core.rawUnit },
        { label: 'Estimasi indeks bulan target', value: level, unit: core.rawUnit },
        { label: `Indeks 3 bulan sebelumnya${reference ? (reference.estimated ? ' (estimasi)' : ' (aktual)') : ''}`, value: reference?.value, unit: core.rawUnit },
      ],
    });
    projections.push({
      date: isoDay(observationEnd(date, 1)),
      period: periodLabel(date, 1),
      updatedAt,
      indicators: forecastIndicators,
      reason: latestActual ? null : 'Seri aktual PCE belum tersedia sebagai pembanding.',
    });
  }
  return {
    source: 'Inflation Nowcasting Cleveland Fed',
    sourceUrl: 'https://www.clevelandfed.org/our-research/indicators-and-data/inflation-nowcasting',
    periods: projections,
  };
}

export async function loadMacroGrowthInflation(now = new Date()) {
  const series = [...new Set([...growthSpecs, ...inflationSpecs].map((spec) => spec.series))];
  const [entries, gdpNowcast, pceNowcasts] = await Promise.all([
    Promise.all(series.map(async (id) => [id, await loadFred(id, now).catch(() => [])])),
    loadGrowthNowcast(now).catch(() => null),
    loadInflationNowcast(now).catch(() => []),
  ]);
  const points = new Map(entries);
  const growth = growthSpecs.map((spec) => growthIndicator(spec, points.get(spec.series), now));
  const inflation = inflationSpecs.map((spec) => inflationIndicator(spec, points.get(spec.series), now));
  return {
    growth: {
      scope: 'Aktivitas ekonomi AS',
      note: 'Skor tinggi menunjukkan pertumbuhan lebih kuat dibanding riwayat lima tahun tiap seri. Nilai 50 setara dengan median historis. Rilis triwulanan dan bulanan dapat memiliki periode observasi berbeda.',
      indicators: growth,
      forecast: growthForecast(gdpNowcast, points, growth, now),
    },
    inflation: {
      scope: 'Tekanan harga konsumen AS',
      note: 'Skor di atas 50 menunjukkan tekanan di atas acuan 2%. Target resmi Fed berlaku untuk PCE headline. PCE inti dan momentumnya memakai 2% sebagai acuan analitis.',
      indicators: inflation,
      forecast: inflationForecast(pceNowcasts, points, inflation, now),
    },
  };
}

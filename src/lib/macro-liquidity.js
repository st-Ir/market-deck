const DAY = 86_400_000;
const WEEK = 7 * DAY;
const THREE_YEARS_IN_WEEKS = 156;
const RESERVES_URL = 'https://fred.stlouisfed.org/series/WRESBAL';
const M2_SOURCE = 'https://fred.stlouisfed.org/series/M2SL';

function moveMonth(time, months) {
  const current = new Date(time);
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(current.getUTCDate(), lastDay));
  return first.getTime();
}

function ordered(points, now) {
  const rows = new Map();
  for (const point of points ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date)) continue;
    const time = Date.parse(point.date + 'T00:00:00Z');
    if (Number.isFinite(time) && time <= now && point.value > 0 && Number.isFinite(point.value)) {
      rows.set(time, { ...point, time });
    }
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

function growth(current, previous) {
  return current && previous ? (current.value / previous.value - 1) * 100 : null;
}

function percentile(value, past, minimum) {
  if (value === null || past.length < minimum) return { score: null, reference: past.length + ' observasi pembanding tersedia.' };
  const less = past.filter((item) => item < value).length;
  const equal = past.filter((item) => item === value).length;
  return {
    score: (less + equal / 2) / past.length * 100,
    reference: `${less} di bawah · ${equal} sama · ${past.length} observasi sebelumnya`,
  };
}

function levelReadings(latest, previous, multiplier, unit) {
  return [latest, previous].filter(Boolean).map((row) => ({
    label: (row === latest ? 'Terakhir' : 'Pembanding') + ' · ' + row.date,
    value: row.value * multiplier,
    unit,
  }));
}

function m2Indicator(feed, now) {
  const values = ordered(feed?.points, now);
  const latest = values.at(-1);
  const comparison = (point) => {
    const target = moveMonth(point.time, -3);
    return values.findLast((row) => row.time <= target && row.time >= target - 7 * DAY);
  };
  const previous = latest && comparison(latest);
  const months = new Map();
  for (const row of values) months.set(row.date.slice(0, 7), row);
  const monthly = [...months.values()].map((row) => ({ ...row, change: growth(row, comparison(row)) }));
  const ranked = monthly.map((row, index) => {
    const start = moveMonth(row.time, -36);
    const past = monthly.slice(Math.max(0, index - 36), index).filter((point) => point.time >= start)
      .map((point) => point.change).filter(Number.isFinite);
    return { date: row.date, value: row.change, ...percentile(row.change, past, 24) };
  });
  const value = ranked.at(-1)?.value ?? null;
  const calibration = ranked.at(-1) ?? percentile(null, [], 24);
  const fxDate = latest?.fxDate ?? latest?.date;
  const isCurrent = latest && now - Date.parse(fxDate + 'T00:00:00Z') <= 45 * DAY;
  const referenceMonths = Object.values(feed?.components ?? {})
    .map(({ label, referenceMonth }) => referenceMonth ? label + ' ' + referenceMonth : null).filter(Boolean);
  const freshness = latest && !isCurrent ? 'Kurs terakhir lebih dari 45 hari. Skor ditahan.' : '';
  const snapshot = feed?.delivery === 'snapshot' ? 'Memakai snapshot bertanggal saat sumber pembaruan gagal.' : '';
  const sources = Object.values(feed?.components ?? {})
    .filter(({ sourceUrl }) => sourceUrl).map(({ label, sourceUrl }) => ({ label, url: sourceUrl }));
  if (feed?.fxSourceUrl) sources.push({ label: 'Kurs acuan ECB', url: feed.fxSourceUrl });
  return {
    id: 'global-m2-3m',
    label: 'Pertumbuhan proxy M2 3 bulan',
    weight: 65,
    value,
    unit: '%',
    asOf: latest?.date ?? null,
    period: previous ? previous.date + ' – ' + latest.date : undefined,
    source: 'Fed/FRED · ECB · PBOC · BOJ',
    sourceUrl: M2_SOURCE,
    sources,
    score: isCurrent ? calibration.score : null,
    historyMaxAgeDays: 45,
    history: ranked.filter((row) => Number.isFinite(row.value)).map(({ date, value, score }) => ({ date, value, score })),
    transform: '(M2 total dalam USD terbaru ÷ M2 total dalam USD tiga bulan kalender sebelumnya − 1) × 100. Jika tanggal pembanding kosong, dipakai observasi terakhir dalam 7 hari sebelum tanggal itu. Seri menjumlahkan AS, area euro, China, dan Jepang pada kurs acuan harian.',
    calibration: 'Persentil = 100 × (jumlah pertumbuhan lebih rendah + 0,5 × jumlah yang sama) ÷ jumlah pembanding. Pembanding adalah perubahan 3 bulan pada observasi terakhir tiap bulan selama 3 tahun sebelumnya, minimal 24 bulan.',
    reference: calibration.reference,
    note: [
      fxDate && 'Tanggal kurs ' + fxDate + '.',
      referenceMonths.length && 'Bulan referensi M2: ' + referenceMonths.join(' · ') + '.',
      feed?.availabilityAssumption && 'M2 bulan t mulai dipakai pada tanggal 1 bulan t+2 sebagai asumsi ketersediaan.',
      'Kurs USD dapat mengubah nilai total ketika jumlah uang lokal belum berubah.',
      'Riwayat memakai observasi terakhir tiap bulan dan observasi terbaru bulan berjalan.',
      snapshot, freshness,
    ].filter(Boolean).join(' '),
    readings: levelReadings(latest, previous, 1, 'triliun USD'),
  };
}

async function reserveBalances(now) {
  const fromYear = new Date(now).getUTCFullYear() - 7;
  const response = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=WRESBAL&cosd=' + fromYear + '-01-01', {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('FRED WRESBAL HTTP ' + response.status);
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (!/^observation_date,WRESBAL$/i.test(lines[0].replace(/^\uFEFF/, ''))) throw new Error('Kolom WRESBAL tidak tersedia');
  return lines.slice(1).map((line) => {
    const [observation, value] = line.split(',');
    return { date: observation, value: Number(value) };
  });
}

function reserveIndicator(points, now) {
  const values = ordered(points, now);
  const latest = values.at(-1);
  const byTime = new Map(values.map((row) => [row.time, row]));
  const comparison = (row) => byTime.get(row.time - 13 * WEEK);
  const previous = latest && comparison(latest);
  const weekly = values.map((row) => ({ ...row, change: growth(row, comparison(row)) }));
  const offset = Math.max(0, weekly.length - THREE_YEARS_IN_WEEKS);
  const ranked = weekly.slice(offset).map((row, index) => {
    const end = index + offset;
    const start = row.time - THREE_YEARS_IN_WEEKS * WEEK;
    const past = weekly.slice(Math.max(0, end - THREE_YEARS_IN_WEEKS), end).filter((point) => point.time >= start)
      .map((point) => point.change).filter(Number.isFinite);
    return { date: row.date, value: row.change, ...percentile(row.change, past, 104) };
  });
  const value = ranked.at(-1)?.value ?? null;
  const calibration = ranked.at(-1) ?? percentile(null, [], 104);
  const isCurrent = latest && now - latest.time <= 21 * DAY;
  return {
    id: 'fed-reserves-13w',
    label: 'Pertumbuhan cadangan bank di Fed 13 minggu',
    weight: 35,
    value,
    unit: '%',
    asOf: latest?.date ?? null,
    period: previous ? previous.date + ' – ' + latest.date : undefined,
    source: 'Federal Reserve H.4.1 · FRED',
    sourceUrl: RESERVES_URL,
    score: isCurrent ? calibration.score : null,
    historyMaxAgeDays: 21,
    history: ranked.filter((row) => Number.isFinite(row.value)).map(({ date, value, score }) => ({ date, value, score })),
    transform: '(Rata-rata cadangan bank AS pada minggu terakhir ÷ rata-rata 13 minggu sebelumnya − 1) × 100.',
    calibration: 'Persentil = 100 × (jumlah pertumbuhan lebih rendah + 0,5 × jumlah yang sama) ÷ jumlah pembanding. Pembanding memakai perubahan 13 minggu pada 156 minggu sebelumnya, minimal 104 minggu.',
    reference: calibration.reference,
    note: latest
      ? 'WRESBAL adalah rata-rata mingguan berakhir Rabu tanpa penyesuaian musiman.' + (isCurrent ? '' : ' Pembacaan lebih dari 21 hari. Skor ditahan.')
      : 'Seri WRESBAL belum tersedia.',
    readings: levelReadings(latest, previous, 0.001, 'miliar USD'),
  };
}

export async function macroLiquidity(loadEndpoint, now = Date.now()) {
  const [money, reserves] = await Promise.allSettled([loadEndpoint('btc-m2'), reserveBalances(now)]);
  const indicators = [
    m2Indicator(money.status === 'fulfilled' ? money.value : null, now),
    reserveIndicator(reserves.status === 'fulfilled' ? reserves.value : null, now),
  ];
  return {
    scope: 'Uang beredar AS, area euro, China, dan Jepang serta cadangan bank di Federal Reserve AS.',
    note: 'Skor 50 menunjukkan posisi di tengah pembanding historis. Data M2 memakai angka bulanan yang sudah tersedia dan kurs harian, sedangkan cadangan Fed dipublikasikan mingguan.',
    indicators,
  };
}

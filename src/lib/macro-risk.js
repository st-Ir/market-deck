const DAY = 86_400_000;
const LOOKBACK = 252;
const SMA_LENGTH = 100;
const MAX_AGE_DAYS = 7;
const marketDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

const VIX = {
  id: 'vix',
  label: 'Volatilitas implisit VIX',
  weight: 40,
  unit: 'poin',
  source: 'Cboe · FRED',
  sourceUrl: 'https://fred.stlouisfed.org/series/VIXCLS',
  transform: 'Nilai penutupan harian VIX. VIX mengukur volatilitas S&P 500 yang tersirat oleh harga opsi untuk 30 hari ke depan.',
  inverted: true,
};

const CREDIT = {
  id: 'high-yield-spread',
  label: 'Spread kredit high yield AS',
  weight: 30,
  unit: 'bps',
  source: 'ICE BofA · FRED',
  sourceUrl: 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2',
  transform: 'Spread opsi-terkoreksi ICE BofA US High Yield terhadap kurva Treasury, dalam persen, dikalikan 100 untuk mendapatkan basis poin.',
  inverted: true,
};

const EQUITY = {
  id: 'equity-trend',
  label: 'Tren S&P 500',
  weight: 30,
  unit: '%',
  source: 'S&P Dow Jones Indices · FRED',
  sourceUrl: 'https://fred.stlouisfed.org/series/SP500',
  transform: '(Penutupan S&P 500 ÷ SMA 100 sesi − 1) × 100. SMA adalah rata-rata 100 penutupan hingga tanggal yang dinilai.',
  inverted: false,
};

async function fredCloses(series, today) {
  const from = new Date(Date.parse(today) - 4 * 365 * DAY).toISOString().slice(0, 10);
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=${from}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`FRED ${series} HTTP ${response.status}`);
  const [header, ...lines] = (await response.text()).trim().split(/\r?\n/);
  if (header.split(',')[1]?.trim() !== series) throw new Error(`FRED ${series} tidak cocok dengan permintaan`);
  return lines.flatMap((line) => {
    const [date, raw] = line.split(',');
    return raw && raw !== '.' ? [{ date, value: Number(raw) }] : [];
  });
}

function validCloses(rows, today) {
  const points = new Map();
  for (const { date, value } of rows) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
      && Number.isFinite(value) && value > 0) points.set(date, value);
  }
  return [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function recent(date, today) {
  return date && Date.parse(today) - Date.parse(date) <= MAX_AGE_DAYS * DAY;
}

async function vixCloses(loadEndpoint, today) {
  const fromFred = await fredCloses('VIXCLS', today).then((rows) => validCloses(rows, today)).catch(() => []);
  if (fromFred.length > LOOKBACK && recent(fromFred.at(-1)?.date, today)) return { rows: fromFred, meta: VIX };
  const existing = await loadEndpoint('vix').catch(() => null);
  const fromCboe = validCloses(existing?.points?.map(({ date, close }) => ({ date, value: close })) ?? [], today);
  if (fromCboe.length > LOOKBACK && (fromCboe.at(-1)?.date ?? '') >= (fromFred.at(-1)?.date ?? '')) {
    return { rows: fromCboe, meta: { ...VIX, source: 'Cboe', sourceUrl: 'https://www.cboe.com/tradable-products/vix/vix-historical-data/' } };
  }
  return { rows: fromFred, meta: VIX };
}

function equityTrend(rows) {
  let running = 0;
  return rows.flatMap(({ date, value }, index) => {
    running += value;
    if (index >= SMA_LENGTH) running -= rows[index - SMA_LENGTH].value;
    if (index < SMA_LENGTH - 1) return [];
    const average = running / SMA_LENGTH;
    return [{
      date,
      value: (value / average - 1) * 100,
      readings: [
        { label: 'Penutupan S&P 500', value, unit: 'poin' },
        { label: 'SMA 100 sesi', value: average, unit: 'poin' },
      ],
    }];
  });
}

function riskPercentile(value, baseline, inverted) {
  if (baseline.length < LOOKBACK) return { score: null };
  const lower = baseline.filter((row) => row.value < value).length;
  const equal = baseline.filter((row) => row.value === value).length;
  const percentile = (lower + 0.5 * equal) / LOOKBACK * 100;
  return { lower, equal, score: inverted ? 100 - percentile : percentile };
}

function indicator(meta, rows, today) {
  const { inverted, ...fields } = meta;
  const latest = rows.at(-1);
  const baseline = rows.slice(-(LOOKBACK + 1), -1);
  const start = Math.max(0, rows.length - 2 * LOOKBACK);
  const result = {
    ...fields,
    value: latest?.value ?? null,
    asOf: latest?.date ?? null,
    period: 'Penutupan harian',
    score: null,
    historyMaxAgeDays: MAX_AGE_DAYS,
    history: rows.slice(start).map(({ date, value }, index) => {
      const end = start + index;
      const { score } = riskPercentile(value, rows.slice(Math.max(0, end - LOOKBACK), end), inverted);
      return { date, value, score };
    }),
    calibration: `Persentil = 100 × (jumlah nilai pembanding yang lebih rendah + 0,5 × jumlah nilai yang sama) ÷ ${LOOKBACK}. ${inverted ? 'Skor = 100 − persentil.' : 'Skor = persentil.'}`,
    readings: latest?.readings ?? [],
  };
  if (!latest) return { ...result, note: 'Sumber belum mengembalikan observasi yang dapat dipakai.' };
  if (!recent(latest.date, today)) return { ...result, note: `Observasi sudah lebih lama dari ${MAX_AGE_DAYS} hari kalender terhadap tanggal pasar AS.` };
  if (baseline.length !== LOOKBACK) return { ...result, note: `Tersedia ${baseline.length} dari ${LOOKBACK} observasi pembanding yang dibutuhkan.` };

  const { lower, equal, score } = riskPercentile(latest.value, baseline, inverted);
  return {
    ...result,
    score,
    reference: `${LOOKBACK} observasi sebelumnya (${baseline[0].date}–${baseline.at(-1).date}) · ${lower} di bawah nilai terbaru · ${equal} setara.`,
  };
}

export async function macroRisk(loadEndpoint) {
  const today = marketDate.format(new Date());
  const [vix, credit, equity] = await Promise.all([
    vixCloses(loadEndpoint, today),
    fredCloses('BAMLH0A0HYM2', today).then((rows) => validCloses(rows, today)).catch(() => []),
    fredCloses('SP500', today).then((rows) => validCloses(rows, today)).catch(() => []),
  ]);
  return {
    scope: 'Pasar AS · volatilitas, kredit, dan ekuitas',
    note: 'Proksi selera risiko pasar AS. Skor 50 adalah titik tengah persentil historis. Penutupan tiap seri dapat terbit pada tanggal yang berbeda.',
    indicators: [
      indicator(vix.meta, vix.rows, today),
      indicator(CREDIT, credit.map(({ date, value }) => ({
        date,
        value: value * 100,
        readings: [{ label: 'Spread sumber', value, unit: '%' }],
      })), today),
      indicator(EQUITY, equityTrend(equity), today),
    ],
  };
}

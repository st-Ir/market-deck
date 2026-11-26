import archive from '@/data/macro-fred.json';

const TIMEOUT = 8_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function observations(entries, start) {
  const points = new Map();
  for (const [date, raw] of entries) {
    const value = Number(raw);
    if (DATE.test(date) && date >= start && Number.isFinite(value) && value > 0) {
      points.set(date, { date, value });
    }
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function apiObservations(series, start, key) {
  const params = new URLSearchParams({ series_id: series, api_key: key, file_type: 'json', observation_start: start });
  const response = await fetch('https://api.stlouisfed.org/fred/series/observations?' + params, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return observations((data.observations ?? []).map(({ date, value }) => [date, value]), start);
}

async function publicObservations(series, start, csvUrl) {
  const params = new URLSearchParams({ id: series, cosd: start });
  const response = await fetch(csvUrl + '?' + params, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) return [];
  const [header, ...lines] = (await response.text()).trim().split(/\r?\n/);
  const [dateColumn, valueColumn] = header.split(',');
  if (!/^(observation_date|date)$/i.test(dateColumn) || valueColumn?.trim().replace(/_\d{8}$/, '') !== series) return [];
  return observations(lines.map((line) => line.split(',')), start);
}

export async function fredObservations(series, start) {
  const archived = observations(archive.series[series] ?? [], start);
  const archiveEnd = archived.at(-1)?.date ?? '';
  const reachesArchive = (rows) => rows.length > 0 && rows.at(-1).date >= archiveEnd;
  const key = process.env.FRED_API_KEY?.trim();
  if (key) {
    const rows = await apiObservations(series, start, key).catch(() => []);
    if (reachesArchive(rows)) return { rows, archivedAt: null };
  }
  const sources = [
    'https://fred.stlouisfed.org/graph/fredgraph.csv',
    'https://alfred.stlouisfed.org/graph/alfredgraph.csv',
  ];
  for (const source of sources) {
    const rows = await publicObservations(series, start, source).catch(() => []);
    if (reachesArchive(rows)) return { rows, archivedAt: null };
  }
  return { rows: archived, archivedAt: archived.length ? archive.capturedOn : null };
}

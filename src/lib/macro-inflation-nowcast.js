const CLEVELAND_NOWCAST = 'https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting';
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const easternDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const isoDate = (value) => new Date(value).toISOString().slice(0, 10);
const cellText = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
  .replace(/&minus;|&#8722;|−/g, '-').replace(/\s+/g, ' ').trim();

function tableRows(html, caption) {
  for (const [table] of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)) {
    const title = table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/i)?.[1];
    if (title && cellText(title).toLowerCase() === caption) {
      const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)]
        .map((match) => cellText(match[1]).toLowerCase());
      const columns = ['month', 'pce', 'core pce', 'updated'].map((header) => headers.indexOf(header));
      const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/i)?.[1];
      if (columns.some((column) => column < 0) || body == null) break;
      return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((row) => {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)]
          .map((cell) => cellText(cell[1]));
        return columns.map((column) => cells[column]);
      });
    }
  }
  throw new Error('Format tabel Cleveland Fed tidak dikenal: ' + caption);
}

function parsePeriod(label) {
  const [month, year] = (label ?? '').split(' ');
  const index = months.indexOf(month);
  return index >= 0 && /^\d{4}$/.test(year) ? isoDate(Date.UTC(Number(year), index, 1)) : null;
}

function parseUpdated(label, now) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(label ?? '');
  if (!match) return null;
  const [month, day] = match.slice(1).map(Number);
  const easternDay = Date.parse(easternDate.format(now));
  const year = new Date(easternDay).getUTCFullYear();
  let date = new Date(Date.UTC(year, month - 1, day));
  if (date > easternDay) date = new Date(Date.UTC(year - 1, month - 1, day));
  return date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? isoDate(date) : null;
}

const readPercent = (value) => /^-?(?:\d+\.?\d*|\.\d+)$/.test(value ?? '') ? Number(value) : null;

function parseInflationNowcast(html, now) {
  const byDate = new Map();
  const tables = [
    ['inflation, month-over-month percent change', 'coreMoM'],
    ['inflation, year-over-year percent change', 'coreYoY'],
  ];
  for (const [caption, coreField] of tables) {
    for (const [month, headline, core, updated] of tableRows(html, caption)) {
      const date = parsePeriod(month);
      const updatedAt = parseUpdated(updated, now);
      if (!date || !updatedAt) continue;
      const existing = byDate.get(date);
      if (existing && existing.updatedAt > updatedAt) continue;
      const row = existing?.updatedAt === updatedAt ? existing
        : { date, updatedAt, headlineYoY: null, coreYoY: null, coreMoM: null };
      if (coreField === 'coreYoY') row.headlineYoY = readPercent(headline);
      row[coreField] = readPercent(core);
      byDate.set(date, row);
    }
  }
  return [...byDate.values()].filter((row) => [row.headlineYoY, row.coreYoY, row.coreMoM].some(Number.isFinite))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadInflationNowcast(now = new Date()) {
  const response = await fetch(CLEVELAND_NOWCAST, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('Cleveland Fed HTTP ' + response.status);
  return parseInflationNowcast(await response.text(), now);
}

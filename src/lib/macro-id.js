// Macro readings for the IHSG market panel. liveMacroIndicators() is the primary
// (TradingView) path; the rest below is the end-of-day fallback.
// - Daily: the 10-year SBN yield (Trading Economics page description, e.g. "The
//   yield on Indonesia 10Y Bond Yield rose to 7.63% on November 12, 2026, marking
//   a 0.08 percentage points increase") and its spread over the US 10Y close of
//   the same session (Yahoo ^TNX), plus EIDO, the NYSE-listed MSCI Indonesia ETF,
//   as the overnight read of offshore sentiment.
// - releaseIndicator() reads monthly releases (PMI, consumer confidence, trade
//   balance) from the release table on an indicator page. It is not shown in the
//   IHSG panel; kept for the Global Macro section.
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const MONTHLY_INDICATORS = [
  { key: 'pmi', label: 'PMI manufaktur', page: 'indonesia/manufacturing-pmi', unit: '', group: 'monthly' },
  { key: 'confidence', label: 'Keyakinan konsumen', page: 'indonesia/consumer-confidence', unit: '', group: 'monthly' },
  { key: 'trade', label: 'Neraca dagang', page: 'indonesia/balance-of-trade', unit: 'USD mlr', group: 'monthly' },
];
const SBN_PAGE = 'indonesia/government-bond-yield';

const number = (text) => {
  const match = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
};

async function page(path) {
  const url = 'https://tradingeconomics.com/' + path;
  const html = await fetch(url, { cache: 'no-store', headers: UA, signal: AbortSignal.timeout(20000) }).then((r) => {
    if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
    return r.text();
  });
  return { url, html, description: html.match(/name="description" content="([^"]+)"/)?.[1] ?? '' };
}

function parseReleases(html) {
  const rows = [];
  for (const row of html.matchAll(/<tr data-id="\d+"[^>]*an-estimate-row[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cell = (id) => row[1].match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)<\\/td>'))?.[1].replace(/<[^>]+>/g, '').trim() ?? '';
    const date = row[1].match(/<td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/)?.[1];
    if (!date) continue;
    rows.push({ date, reference: cell('reference'), actual: number(cell('actual')), previous: number(cell('previous')) });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function releaseIndicator(def) {
  const { url, html, description } = await page(def.page);
  const rows = parseReleases(html);
  const latest = rows.filter((r) => r.actual !== null).at(-1);
  if (!latest) {
    // Some pages have no release table; their description still states the reading,
    // e.g. "increased to 54 points in October from 52.40 points in September of 2026".
    const m = description.match(/to (-?[\d.,]+) [A-Za-z ]*?in (\w+) from (-?[\d.,]+)/);
    if (!m) throw new Error(`${def.page}: tabel rilis tidak terbaca`);
    return { ...def, value: number(m[1]), previous: number(m[3]), period: m[2].slice(0, 3), released: null, next: null, sourceUrl: url };
  }
  const next = rows.find((r) => r.date > latest.date && r.actual === null);
  return { ...def, value: latest.actual, previous: latest.previous, period: latest.reference, released: latest.date, next: next?.date ?? null, sourceUrl: url };
}

async function sbn10y() {
  const { url, description } = await page(SBN_PAGE);
  const m = description.match(/(rose|fell|remained|was)[^0-9-]*?(-?[\d.]+)% on (\w+) (\d{1,2}), (\d{4})(?:, marking a ([\d.]+) percentage points? (increase|decrease))?/);
  if (!m) throw new Error(`${SBN_PAGE}: format tidak dikenali`);
  const [, , value, month, dayOfMonth, year, pp, direction] = m;
  const changeBp = pp ? (direction === 'decrease' ? -1 : 1) * Number(pp) * 100 : 0;
  return {
    key: 'sbn10y', label: 'Yield SBN 10Y', group: 'daily', unit: '%', value: Number(value), change: changeBp, changeUnit: 'bp',
    released: `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${dayOfMonth.padStart(2, '0')}`, sourceUrl: url,
  };
}

// ust10y: daily US 10Y closes [{ date, close }] keyed by New York date;
// eido: Yahoo quote for EIDO { value, changePercent, date }.
// Live path: TradingView quotes for TVC:ID10Y, TVC:US10Y (both streaming) and
// AMEX:EIDO (15-minute delay). The spread is taken between the two current yields.
export function liveMacroIndicators(tv) {
  const id = tv['TVC:ID10Y'], us = tv['TVC:US10Y'], eido = tv['AMEX:EIDO'];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const chart = (symbol) => 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol);
  const items = [
    { key: 'sbn10y', label: 'Yield SBN 10Y', group: 'daily', unit: '%', value: id.close, change: id.changeAbs * 100, changeUnit: 'bp', released: today, live: true, delayMinutes: id.delayMinutes, sourceUrl: chart('TVC:ID10Y') },
    { key: 'sbn-spread', label: 'Spread SBN − UST 10Y', group: 'daily', unit: 'bp', value: (id.close - us.close) * 100, change: (id.changeAbs - us.changeAbs) * 100, changeUnit: 'bp', released: today, live: true, delayMinutes: Math.max(id.delayMinutes, us.delayMinutes), sourceUrl: chart('TVC:US10Y') },
  ];
  if (eido) items.push({ key: 'eido', label: 'EIDO', note: 'ETF MSCI Indonesia · NYSE', group: 'daily', unit: 'USD', value: eido.close, change: eido.changePercent, changeUnit: '%', released: today, live: true, delayMinutes: eido.delayMinutes, sourceUrl: chart('AMEX:EIDO') });
  return { schema: 1, source: 'TradingView', generatedAt: new Date().toISOString(), items, delivery: 'feed' };
}

// Fallback path (end-of-day): Trading Economics SBN yield, Yahoo ^TNX and EIDO.
export async function macroIndicators({ ust10y, eido }) {
  const items = [];
  try {
    const sbn = await sbn10y();
    items.push(sbn);
    // Indonesia's premium over Treasuries, both taken at the same session date; it
    // widens when foreign holders demand more to hold rupiah bonds.
    const closes = (ust10y || []).filter((p) => p.date <= sbn.released);
    const [previous, current] = closes.slice(-2);
    if (current) {
      items.push({
        key: 'sbn-spread', label: 'Spread SBN − UST 10Y', group: 'daily', unit: 'bp',
        value: (sbn.value - current.close) * 100,
        change: previous ? sbn.change - (current.close - previous.close) * 100 : null, changeUnit: 'bp',
        released: sbn.released, ustDate: current.date, sourceUrl: 'https://finance.yahoo.com/quote/%5ETNX/',
      });
    }
  } catch (error) {
    console.warn('[macro-id] SBN 10Y:', error.message);
    items.push({ key: 'sbn10y', label: 'Yield SBN 10Y', group: 'daily', unit: '%', value: null, sourceUrl: 'https://tradingeconomics.com/' + SBN_PAGE });
  }
  if (eido?.value) {
    items.push({ key: 'eido', label: 'EIDO', note: 'ETF MSCI Indonesia · NYSE', group: 'daily', unit: 'USD', value: eido.value, change: eido.changePercent, changeUnit: '%', released: eido.date, sourceUrl: 'https://finance.yahoo.com/quote/EIDO/' });
  }
  return { schema: 1, source: 'Trading Economics · Yahoo Finance', generatedAt: new Date().toISOString(), items, delivery: 'feed' };
}

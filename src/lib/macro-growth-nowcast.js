const ATLANTA_RESEARCH_DATA = 'https://www.atlantafed.org/data/research-data';
const FRED_GDPNOW = 'https://fred.stlouisfed.org/series/GDPNOW';
const percentPattern = /^([+-]?\d+(?:\.\d+)?)%$/;
const quarterPattern = /\b(\d{4}):Q([1-4])\b/;

const observationPattern = /\bQ([1-4])\s+(\d{4}):\s*<span\b[^>]*class="series-meta-observation-value"[^>]*>\s*([+-]?\d+(?:\.\d+)?)\s*<\/span>/i;
const updatePattern = /<span\b[^>]*class="series-meta-updated-date"[^>]*>\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*<\/span>/i;

function reading(quarter, year, rate, updated, now) {
  const quarterStart = Date.UTC(Number(year), (Number(quarter) - 1) * 3, 1);
  if (!Number.isFinite(rate) || rate <= -100 || !Number.isFinite(updated)
    || updated < quarterStart || updated > now.getTime()) return null;

  return {
    date: new Date(quarterStart).toISOString().slice(0, 10),
    updatedAt: new Date(updated).toISOString().slice(0, 10),
    rate,
  };
}

async function fromAtlanta(now) {
  const response = await fetch(ATLANTA_RESEARCH_DATA, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return null;
  const { ResearchData } = await response.json();
  const estimate = ResearchData?.find((item) => item.IconAlias === 'GDPNow');
  const quarter = quarterPattern.exec(estimate?.Name);
  const rate = percentPattern.exec(estimate?.Indicator?.trim());
  const updateDay = estimate?.UpdatedDate?.slice(0, 10);
  if (!quarter || !rate || !/^\d{4}-\d{2}-\d{2}$/.test(updateDay)) return null;
  return reading(quarter[2], quarter[1], Number(rate[1]), Date.parse(updateDay), now);
}

async function fromFred(now) {
  const response = await fetch(FRED_GDPNOW, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return null;
  const html = await response.text();
  const observation = html.match(observationPattern);
  const update = html.match(updatePattern);
  if (!observation || !update) return null;
  const [, quarter, year, rawRate] = observation;
  return reading(quarter, year, Number(rawRate), Date.parse(update[1] + ' UTC'), now);
}

export async function loadGrowthNowcast(now = new Date()) {
  const atlanta = await fromAtlanta(now).catch(() => null);
  return atlanta ?? fromFred(now).catch(() => null);
}

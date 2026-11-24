export const GDP_NOW_SOURCE = 'https://fred.stlouisfed.org/series/GDPNOW';

const observationPattern = /\bQ([1-4])\s+(\d{4}):\s*<span\b[^>]*class="series-meta-observation-value"[^>]*>\s*([+-]?\d+(?:\.\d+)?)\s*<\/span>/i;
const updatePattern = /<span\b[^>]*class="series-meta-updated-date"[^>]*>\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*<\/span>/i;

export async function loadGrowthNowcast(now = new Date()) {
  try {
    const response = await fetch(GDP_NOW_SOURCE, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const html = await response.text();
    // The FRED series header publishes the active quarter, rate and update date together.
    const observation = html.match(observationPattern);
    const update = html.match(updatePattern);
    if (!observation || !update) return null;

    const [, quarter, year, rawRate] = observation;
    const rate = Number(rawRate);
    const updated = Date.parse(update[1] + ' UTC');
    const quarterStart = Date.UTC(Number(year), (Number(quarter) - 1) * 3, 1);
    if (!Number.isFinite(rate) || rate <= -100 || !Number.isFinite(updated)
      || updated < quarterStart || updated > now.getTime()) return null;

    return {
      date: new Date(quarterStart).toISOString().slice(0, 10),
      updatedAt: new Date(updated).toISOString().slice(0, 10),
      rate,
    };
  } catch {
    return null;
  }
}

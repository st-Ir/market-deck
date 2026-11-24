import { shiftDay } from '../legacy/btc-data.mjs';

const DAY = 86_400_000;
const MAX_TICKER_AGE = 3 * 60_000;
const MAX_WINDOW_SKEW = 2 * 60_000;
const sum = (rows, field) => rows.every((row) => Number.isFinite(row[field]))
  ? rows.reduce((total, row) => total + row[field], 0)
  : null;
const shareOf = (value, average) => average > 0 ? value / average : null;

function dailyRows(sources, market, today) {
  const spot = new Map(sources.spot?.points?.map((row) => [row.date, row]));
  const perpetual = new Map(sources.perpetual?.points?.map((row) => [row.date, row]));
  const primary = market === 'perpetual' ? perpetual : spot;
  const dates = [...primary.keys()].filter((date) => date < today).sort();
  return dates.flatMap((date) => {
    const s = market === 'perpetual' ? null : spot.get(date);
    const p = market === 'spot' ? null : perpetual.get(date);
    if (market === 'combined' && !p) return [];
    const segments = [s, p].filter(Boolean);
    const volume = sum(segments, 'volume');
    if (volume === null) return [];
    return [{
      date, volume, spot: s?.volume ?? null, perpetual: p?.volume ?? null,
      close: s?.close ?? p?.close ?? null,
      trades: sum(segments, 'trades'), buy: sum(segments, 'buy'),
      sell: sum(segments, 'sell'), net: sum(segments, 'net'),
    }];
  });
}

// Require complete consecutive UTC days for each historical comparison.
function windowEnding(rows, end, count, date) {
  if (end < count || rows[end - 1].date !== date) return [];
  const first = rows[end - count].date;
  return Date.parse(date) - Date.parse(first) === (count - 1) * DAY
    ? rows.slice(end - count, end)
    : [];
}

function mean(rows) {
  return rows.length ? sum(rows, 'volume') / rows.length : null;
}

function analyse(rows) {
  return rows.map((row, index) => {
    const yesterday = shiftDay(row.date, -1);
    const [prev] = windowEnding(rows, index, 1, yesterday);
    const previous60 = windowEnding(rows, index, 60, yesterday);
    const change = prev?.close > 0 && row.close > 0 ? (row.close / prev.close - 1) * 100 : null;
    let confirmation = null;
    if (prev && row.volume > prev.volume && change !== null) {
      if (change >= 0.2) confirmation = 'up';
      if (change <= -0.2) confirmation = 'down';
    }
    return {
      ...row, change, confirmation,
      volumeChange: prev?.volume > 0 ? (row.volume / prev.volume - 1) * 100 : null,
      ma5: mean(windowEnding(rows, index + 1, 5, row.date)),
      ma20: mean(windowEnding(rows, index + 1, 20, row.date)),
      rvol: shareOf(row.volume, mean(windowEnding(rows, index, 20, yesterday))),
      percentile: previous60.length ? previous60.filter((prior) => prior.volume <= row.volume).length / 60 * 100 : null,
    };
  });
}

function rollingTurnover(sources, market, rows, now) {
  const s = sources.spot?.rolling;
  const p = sources.perpetual?.rolling;
  const segments = market === 'combined' ? [s, p] : [market === 'spot' ? s : p];
  if (segments.some((point) => {
    if (!Number.isFinite(point?.volume)) return true;
    const start = Date.parse(point.from);
    const end = Date.parse(point.to);
    return !Number.isFinite(start) || !Number.isFinite(end) || end <= start
      || end < now - MAX_TICKER_AGE || end > now + MAX_WINDOW_SKEW;
  })) return null;
  if (market === 'combined' && ['from', 'to'].some((key) =>
    Math.abs(Date.parse(s[key]) - Date.parse(p[key])) > MAX_WINDOW_SKEW
  )) return null;

  const { from, to } = segments.reduce((earliest, segment) => segment.to < earliest.to ? segment : earliest);
  const yesterday = shiftDay(to.slice(0, 10), -1);
  const history = rows.filter((row) => row.date <= yesterday);
  const volume = sum(segments, 'volume');
  const relative = (count) => shareOf(volume, mean(windowEnding(history, history.length, count, yesterday)));
  return {
    from, to, volume, trades: sum(segments, 'trades'),
    spot: market === 'perpetual' ? null : s.volume,
    perpetual: market === 'spot' ? null : p.volume,
    rvol: relative(20), ratio7: relative(7), ratio30: relative(30),
  };
}

export function buildBtcTurnover(sources, market, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = analyse(dailyRows(sources, market, today));
  const latest = rows.at(-1) ?? null;
  const rolling = rollingTurnover(sources, market, rows, now);
  if (!latest && !rolling) return null;

  const monthRows = rows.filter((row) => row.date.startsWith(today.slice(0, 7)));
  const month = monthRows.length ? {
    volume: sum(monthRows, 'volume'), spot: sum(monthRows, 'spot'), perpetual: sum(monthRows, 'perpetual'),
    days: monthRows.length, from: monthRows[0].date, to: monthRows.at(-1).date,
  } : null;
  const recent = latest ? rows.filter((row) => row.date >= shiftDay(latest.date, -19)) : [];
  return {
    rows, latest, rolling, month,
    spotVenue: market !== 'perpetual' && sources.spot ? 'Binance' : null,
    perpetualVenue: market !== 'spot' && sources.perpetual ? (sources.perpetual.venue === 'Gate' ? 'Gate' : 'Binance') : null,
    archive: market !== 'spot' && sources.perpetual?.delivery === 'archive',
    rising: recent.filter((row) => row.confirmation === 'up').length,
    falling: recent.filter((row) => row.confirmation === 'down').length,
  };
}

export function preferredBtcTurnover(models) {
  if (models.combined?.rolling) return 'combined';
  const markets = ['combined', 'spot', 'perpetual'];
  const newest = markets.reduce((best, market) => (
    (models[market]?.latest?.date ?? '') > (models[best]?.latest?.date ?? '') ? market : best
  ), 'combined');
  const combinedDay = models.combined?.latest?.date;
  const newestDay = models[newest]?.latest?.date;
  if (combinedDay && combinedDay >= shiftDay(newestDay, -3)) return 'combined';
  return newestDay ? newest : markets.find((market) => models[market]?.rolling) ?? 'combined';
}

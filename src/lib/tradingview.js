// Quotes from TradingView's public scanner endpoint (the one its widgets and
// screener use). It is unofficial and may change; callers keep a fallback.
// update_mode tells whether a symbol streams in real time or with an exchange
// delay ("delayed_streaming_600" = 10 minutes).
export async function tradingViewQuotes(tickers) {
  const response = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbols: { tickers }, columns: ['close', 'change', 'change_abs', 'update_mode', 'high', 'low', 'Perf.W', 'Perf.1M'] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`TradingView HTTP ${response.status}`);
  const json = await response.json();
  const quotes = {};
  for (const { s, d } of json.data || []) {
    const [close, changePercent, changeAbs, mode, high, low, perfWeek, perfMonth] = d;
    if (!Number.isFinite(close)) continue;
    const delay = String(mode || '').match(/delayed_streaming_(\d+)/);
    quotes[s] = { close, changePercent, changeAbs, high, low, perfWeek, perfMonth, delayMinutes: delay ? Math.round(Number(delay[1]) / 60) : 0, mode };
  }
  return quotes;
}

export const tradingViewChart = (symbol) => 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol);

// Daily bars from TradingView's chart data feed (the websocket its charts and
// widgets use). Unofficial like the scanner above; callers keep a fallback.
// Returns [{ date, close }] keyed by the exchange-local session date.
const TV_SOCKET = 'wss://data.tradingview.com/socket.io/websocket?from=chart&type=chart';
const frame = (message) => {
  const text = JSON.stringify(message);
  return '~m~' + text.length + '~m~' + text;
};

// Several symbols share one connection (TradingView drops parallel anonymous
// connections), each in its own chart session (an anonymous session holds one
// series). Resolves { symbol: points | null }.
export function tradingViewHistories(symbols, bars = 520) {
  return new Promise((resolve) => {
    const socket = new WebSocket(TV_SOCKET, { headers: { origin: 'https://www.tradingview.com' } });
    const prefix = 'cs_' + Math.random().toString(36).slice(2, 12) + '_';
    const state = symbols.map((symbol) => ({ symbol, zone: 'UTC', rows: [], done: false, points: null }));
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(Object.fromEntries(state.map((s) => [s.symbol, s.points])));
    };
    const timer = setTimeout(finish, 25000);
    const send = (m, p) => socket.send(frame({ m, p }));
    const complete = (s) => {
      s.done = true;
      // A daily bar is stamped at its session open, which for bonds, FX and
      // CPO is the previous evening (TVC:ID10Y opens 17:00 New York); 12 hours
      // later always falls on the trading date in exchange time.
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: s.zone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const byDate = new Map(s.rows.filter((r) => Number.isFinite(r.close)).map((r) => [day.format(new Date((r.t + 12 * 3600) * 1000)), r.close]));
      const points = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, close]) => ({ date, close }));
      s.points = points.length ? points : null;
      if (state.every((x) => x.done)) finish();
    };
    socket.addEventListener('open', () => {
      send('set_auth_token', ['unauthorized_user_token']);
      state.forEach((s, i) => {
        send('chart_create_session', [prefix + i, '']);
        send('resolve_symbol', [prefix + i, 'sym', '=' + JSON.stringify({ symbol: s.symbol, adjustment: 'splits' })]);
        send('create_series', [prefix + i, 's1', 's1', 'sym', '1D', bars, '']);
      });
    });
    socket.addEventListener('message', ({ data }) => {
      for (const part of String(data).split(/~m~\d+~m~/).filter(Boolean)) {
        if (part.startsWith('~h~')) { socket.send('~m~' + part.length + '~m~' + part); continue; }
        let msg;
        try { msg = JSON.parse(part); } catch { continue; }
        if (msg.m === 'protocol_error') return finish();
        // Every chart message names its session first: prefix + symbol index.
        const s = typeof msg.p?.[0] === 'string' && msg.p[0].startsWith(prefix) ? state[Number(msg.p[0].slice(prefix.length))] : null;
        if (!s || s.done) continue;
        if (msg.m === 'symbol_resolved') s.zone = msg.p[2]?.timezone || s.zone;
        if (msg.m === 'timescale_update' || msg.m === 'du') {
          const rows = msg.p[1]?.s1?.s;
          // Live updates ("du") carry only the latest bar: merge by time.
          if (rows?.length) {
            const byTime = new Map(s.rows.map((r) => [r.t, r]));
            for (const r of rows) byTime.set(r.v[0], { t: r.v[0], close: r.v[4] });
            s.rows = [...byTime.values()].sort((a, b) => a.t - b.t);
          }
        }
        if (['series_completed', 'symbol_error', 'series_error', 'critical_error'].includes(msg.m)) complete(s);
      }
    });
    socket.addEventListener('error', finish);
    socket.addEventListener('close', finish);
  });
}

export async function tradingViewHistory(symbol, bars) {
  const points = (await tradingViewHistories([symbol], bars))[symbol];
  if (!points) throw new Error(`TradingView ${symbol}: data tidak tersedia`);
  return points;
}

// Intraday market state from the BEI homepage feeds (idx.id), refreshed every few
// seconds during the session:
// - home/GetIndexList: current level and % change of IHSG, LQ45 and the sectors;
// - Home/GetTopValue (all traded stocks): regular-market value, frequency and
//   breadth so far. Negotiated trades and foreign flow are not in these feeds.
// The stock/index summaries used elsewhere are end-of-day; this fills the gap
// until BEI publishes the day's summary.
const getJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`BEI live HTTP ${response.status}`);
  return response.json();
};
const idNumber = (text) => Number(String(text).replace(/\./g, '').replace(',', '.').replace('%', ''));

export async function idxLive() {
  const [stamp, indices, stocks] = await Promise.all([
    getJson('https://idx.id/primary/StockData/GetLastTimeLivefeed'),
    getJson('https://idx.id/primary/home/GetIndexList'),
    getJson('https://idx.id/primary/Home/GetTopValue?resultCount=2000'),
  ]);
  const feedTime = String(stamp).replace(/"/g, ''); // e.g. 2026-11-13T11:20:47 (WIB)
  const traded = stocks.filter((s) => s.Frequency > 0);
  return {
    schema: 1,
    source: 'Bursa Efek Indonesia · live',
    date: feedTime.slice(0, 10),
    time: feedTime.slice(11, 16),
    generatedAt: new Date().toISOString(),
    indices: Object.fromEntries(indices.map((i) => {
      const current = idNumber(i.Current), previous = idNumber(i.Closing);
      return [i.IndexCode, { current, previous, percent: previous ? (current / previous - 1) * 100 : null, time: i.Time }];
    })),
    turnover: {
      regularValue: traded.reduce((s, x) => s + x.Value, 0),
      frequency: traded.reduce((s, x) => s + x.Frequency, 0),
      stocks: traded.length,
      advancers: traded.filter((x) => x.Change > 0).length,
      decliners: traded.filter((x) => x.Change < 0).length,
      unchanged: traded.filter((x) => x.Change === 0).length,
      topValue: traded.slice().sort((a, b) => b.Value - a.Value).slice(0, 5).map((x) => [x.Code, Math.round(x.Value)]),
    },
    delivery: 'feed',
  };
}

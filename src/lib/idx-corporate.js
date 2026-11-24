// Corporate-action agenda from BEI's calendar (idx.id Home/GetCalendar): dividend
// cum/ex/recording/payment dates, rights (HMETD), bonus shares, AGMs (RUPS) and
// public expose. The client filters it to the user's portfolio and watchlist.
const CALENDAR_URL = 'https://idx.id/primary/Home/GetCalendar?range=m&lang=id&date=';
const SOURCE_PAGE = 'https://idx.id/id/perusahaan-tercatat/aksi-korporasi/';
const ACTIONS = ['Dividen Tunai Interim', 'Dividen Tunai', 'Dividen Saham', 'Saham Bonus', 'HMETD', 'Stock Split', 'Reverse Stock Split', 'Waran'];
const STEPS = { cum: 'Cum', ex: 'Ex', dps: 'Recording (DPS)', pembayaran: 'Pembayaran', distribusi: 'Distribusi' };
const WIB = (iso) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace('.', ':');

// Bond and sukuk events (coupons, bondholder meetings, maturities) can carry an
// issuer's stock code but are not stock corporate actions.
const DEBT = /obligasi|sukuk|kupon|ijarah|surat (berharga|perbendaharaan)|jatuh tempo|pembayaran pokok|\bETF\b|\brup(o|su)\b/i;

function describe(event) {
  const text = event.description.replace(/\s+/g, ' ').trim();
  if (DEBT.test(text) || /^rup(o|su)$/i.test(event.Jenis || '')) return null;
  if (/^Hasil (Tahunan|Insidentil)/i.test(text)) return { title: /Insidentil/i.test(text) ? 'Hasil public expose insidentil' : 'Hasil public expose', kind: 'expose' };
  const rightsTrading = text.match(/^tanggal (awal|akhir) perdagangan hmetd/i);
  if (rightsTrading) return { title: `${rightsTrading[1].toLowerCase() === 'awal' ? 'Awal' : 'Akhir'} perdagangan HMETD`, kind: 'dividend' };
  const dated = text.match(/^tanggal (\w+) (.+)$/i);
  if (dated) {
    const action = ACTIONS.find((a) => dated[2].toLowerCase().startsWith(a.toLowerCase()));
    if (action) return { title: `${STEPS[dated[1].toLowerCase()] ?? dated[1]} ${action.toLowerCase().replace('hmetd', 'HMETD')}`, kind: 'dividend' };
  }
  if (/^Pemberitahuan RUPS/i.test(text)) {
    const time = event.TglWaktuRups?.startsWith('1911') ? '' : WIB(event.TglWaktuRups) + ' WIB';
    return { title: 'RUPS', detail: [time, event.location && !/informasikan kemudian/i.test(event.location) ? event.location : ''].filter(Boolean).join(' · '), kind: 'meeting' };
  }
  if (/^Hasil RUPS/i.test(text)) return { title: /Luar Biasa/i.test(text) ? 'Hasil RUPSLB' : 'Hasil RUPS', kind: 'meeting' };
  if (/public expose/i.test(text)) return { title: /^Materi/i.test(text) ? 'Materi public expose' : /^Hasil/i.test(text) ? 'Hasil public expose' : 'Public expose', kind: 'expose' };
  if (/Pembelian Kembali Saham|Buyback/i.test(text)) return { title: 'Laporan buyback', kind: 'buyback' };
  return { title: text.replace(/\s+(PT\s.*|\S+(?:\s\S+)*\sTbk\.?)$/, ''), kind: 'other' };
}

const monthParam = (offset) => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
};

const getJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`BEI HTTP ${response.status}: ${url}`);
  return response.json();
};
const pdfUrl = (path) => (path ? new URL(path.startsWith('/') ? path : '/' + path, 'https://idx.id').href : SOURCE_PAGE);

// UMA (unusual market activity) and trading suspensions, newest 100 each. A stock
// whose latest notice is a suspension is reported as currently suspended.
// Notices covering several stocks (">1 Kode") name them only inside the PDF.
async function marketAlerts() {
  const [uma, suspend, summary] = await Promise.all([
    getJson('https://idx.id/primary/Home/GetUmaData?resultCount=100'),
    getJson('https://idx.id/primary/Home/GetSuspendData?resultCount=100&lang=id'),
    getJson('https://idx.id/primary/TradingSummary/GetStockSummary?length=9999&start=0').catch(() => null),
  ]);
  // Regular-market trades after a suspension date mean it was lifted, e.g. by a
  // multi-stock notice that does not list the codes.
  const traded = new Map((summary?.data || []).filter((r) => r.Frequency > 0).map((r) => [r.StockCode, r.Date.slice(0, 10)]));
  const alerts = [
    ...(uma.Results || []).filter((r) => /^[A-Z]{4}$/.test(r.CompanyID || '')).map((r) => ({
      symbol: r.CompanyID, kind: 'uma', title: 'UMA (aktivitas pasar tidak wajar)', date: r.UMADate.slice(0, 10), sourceUrl: pdfUrl(r.Attachment),
    })),
    ...(suspend.Results || []).filter((r) => /^[A-Z]{4}$/.test(r.Kode || '')).map((r) => ({
      symbol: r.Kode, kind: r.Info_Type === 'Unsuspend' ? 'unsuspend' : 'suspend', title: r.Info_Type === 'Unsuspend' ? 'Suspensi dicabut' : 'Suspensi perdagangan', date: r.Date.slice(0, 10), at: r.Date, sourceUrl: pdfUrl(r.Data_Download),
    })),
  ].sort((a, b) => ((b.at || b.date) > (a.at || a.date) ? 1 : -1));
  const suspended = {};
  for (const alert of alerts.filter((a) => a.kind !== 'uma')) {
    if (!(alert.symbol in suspended)) suspended[alert.symbol] = alert.kind === 'suspend' ? alert.date : null;
  }
  return {
    alerts: alerts.map(({ at, ...alert }) => alert),
    suspended: Object.fromEntries(Object.entries(suspended).filter(([symbol, since]) => since && !(traded.get(symbol) > since))),
    alertsCoverage: { umaFrom: uma.Results?.at(-1)?.UMADate?.slice(0, 10) ?? null, suspendFrom: suspend.Results?.at(-1)?.Date?.slice(0, 10) ?? null },
  };
}

export async function idxCorporateActions() {
  const [months, warnings] = await Promise.all([
    Promise.all([0, 1].map(async (offset) => (await getJson(CALENDAR_URL + monthParam(offset))).Results || [])),
    marketAlerts().catch((error) => {
      console.warn('[idx-corporate] UMA/suspensi gagal:', error.message);
      return { alerts: [], suspended: {}, alertsCoverage: null };
    }),
  ]);
  const seen = new Set();
  const events = months.flat().flatMap((event) => {
    if (!/^[A-Z]{4}$/.test(event.title || '') || seen.has(event.id)) return [];
    seen.add(event.id);
    const described = describe(event);
    if (!described) return [];
    const { title, detail, kind } = described;
    return [{ id: String(event.id), symbol: event.title, title, detail: detail || undefined, kind, date: event.start.slice(0, 10), source: 'IDX', verified: true, sourceUrl: SOURCE_PAGE }];
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)));
  return {
    schema: 1,
    source: 'IDX',
    sourceUrl: SOURCE_PAGE,
    status: 'ready',
    checkedAt: new Date().toISOString(),
    events,
    ...warnings,
  };
}

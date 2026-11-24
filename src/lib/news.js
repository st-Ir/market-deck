// Market headlines for the Sentiment panel: Google News RSS searches per topic,
// kept only when they pass every quality rule below, then the two most
// important of the last 24 hours (48 if too few), by the score in importance().
// Headlines and links only; the articles stay on the publishers' sites.
// Quality rules:
// - the outlet is on a short list of established newsrooms with editorial
//   accountability (national wire, business dailies, global wires); aggregators,
//   portals and regional/ sub-brand pages of other sites are not on it;
// - the headline is news, not a format or a pitch: videos, photo galleries,
//   live blogs, stock tips and target prices, quizzes, sponsored or promotional
//   pieces, and clickbait wording are dropped;
// - the same story from several outlets is shown once.
const TOPICS = [
  { key: 'pasar', label: 'Pasar', query: 'IHSG OR "Bursa Efek Indonesia"' },
  { key: 'moneter', label: 'Moneter', query: '"Bank Indonesia" OR "BI-Rate" OR "BI Rate"' },
  { key: 'global', label: 'Global', query: '"The Fed" OR "Wall Street" OR "ekonomi global"' },
  { key: 'rupiah', label: 'Rupiah & SBN', query: 'rupiah OR "yield SBN" OR "obligasi pemerintah"' },
  { key: 'komoditas', label: 'Komoditas', query: '"harga batu bara" OR "harga CPO" OR "harga nikel" OR "harga minyak" OR "harga emas"' },
  { key: 'ekonomi', label: 'Ekonomi RI', query: '"ekonomi Indonesia" OR APBN OR inflasi OR "neraca dagang"' },
];
// Outlets by exact host; anything else returned by the search is dropped.
const OUTLETS = {
  'www.antaranews.com': 'ANTARA', 'en.antaranews.com': 'ANTARA',
  'www.bloombergtechnoz.com': 'Bloomberg Technoz', 'www.bloomberg.com': 'Bloomberg', 'www.reuters.com': 'Reuters',
  'www.ft.com': 'Financial Times', 'www.wsj.com': 'WSJ',
  'www.kontan.co.id': 'Kontan', 'investasi.kontan.co.id': 'Kontan', 'keuangan.kontan.co.id': 'Kontan', 'nasional.kontan.co.id': 'Kontan', 'industri.kontan.co.id': 'Kontan', 'internasional.kontan.co.id': 'Kontan',
  'www.bisnis.com': 'Bisnis.com', 'market.bisnis.com': 'Bisnis.com', 'ekonomi.bisnis.com': 'Bisnis.com', 'finansial.bisnis.com': 'Bisnis.com', 'kabar24.bisnis.com': 'Bisnis.com',
  'katadata.co.id': 'Katadata', 'investor.id': 'Investor Daily',
  'money.kompas.com': 'Kompas', 'bisnis.tempo.co': 'Tempo', 'www.thejakartapost.com': 'The Jakarta Post',
};
// Headline formats and wording that are not news reporting.
const REJECT = [
  /\b(video|foto|galeri|infografis|live|live update|podcast|kuis|quiz)\b/i,
  /\b(rekomendasi saham|saham pilihan|saham potensial|saham rekomendasi|target harga|buy on weakness|cuan|trading plan|bocoran)\b/i,
  /\b(advertorial|sponsored|promo|diskon|giveaway|lowongan)\b/i,
  /\b(viral|heboh|geger|bikin kaget|bikin syok|wow|ternyata|ini dia|simak|cek di sini|begini cara)\b/i,
  // Press-release and ceremonial items: product launches, offers, inaugurations, awards.
  /\b(tawarkan|luncurkan|meluncurkan|resmikan|meresmikan|lantik|melantik|gandeng|raih penghargaan|penghargaan|gadai|cashback|undian|seremoni|ulang tahun)\b/i,
  /\?\s*$/,
];
const MIN_TITLE = 30;
const LIMIT = 2;
const WINDOWS_HOURS = [24, 48];
// Market-moving subjects and their weight in the importance score.
const SUBJECTS = [
  [/\b(bi-?rate|suku bunga|rdg|bank indonesia|the fed|fomc|powell)\b/i, 3],
  [/\b(inflasi|pdb|pertumbuhan ekonomi|neraca (dagang|perdagangan)|cadangan devisa|apbn|defisit)\b/i, 3],
  [/\b(rupiah)\b.*\b(rekor|terlemah|terkuat|anjlok|ambles|tembus)\b|\b(rekor|terlemah|terkuat|anjlok|ambles|tembus)\b.*\brupiah\b/i, 3],
  [/\b(ihsg)\b.*\b(ditutup|anjlok|ambles|melonjak|rekor|sepekan)\b/i, 2],
  [/\b(asing|net sell|net buy|msci|ftse|indeks global)\b/i, 2],
  [/\b(yield|sbn|obligasi|surat utang|lelang)\b/i, 2],
  [/\b(wall street|tarif|trump|china|perang|geopolitik|resesi)\b/i, 2],
  [/\b(minyak|batu bara|cpo|sawit|nikel|emas)\b/i, 1],
];
const WIRES = new Set(['ANTARA', 'Reuters', 'Bloomberg', 'Bloomberg Technoz', 'Financial Times', 'WSJ']);
// Significant words of a headline (four letters or more, so "ihsg" counts),
// without common Indonesian function words.
const STOPWORDS = new Set(['yang', 'dari', 'untuk', 'pada', 'dengan', 'akan', 'juga', 'hari', 'jadi', 'masih', 'usai', 'saat', 'atas', 'para', 'oleh', 'dalam', 'tengah', 'karena', 'bisa', 'lagi', 'sudah', 'belum']);
const words = (title) => new Set(title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)));

const decode = (text) => String(text ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();
const tag = (xml, name) => decode(xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'))?.[1]);

function outletOf(url) {
  try {
    return OUTLETS[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}

async function topicItems(topic) {
  const url = 'https://news.google.com/rss/search?' + new URLSearchParams({ q: topic.query + ' when:2d', hl: 'id', gl: 'ID', ceid: 'ID:id' });
  const response = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Google News ${topic.key} HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const sourceUrl = item.match(/<source url="([^"]+)"/)?.[1];
    const outlet = sourceUrl && outletOf(sourceUrl);
    if (!outlet) return null;
    // Google appends " - <source name>" to every title.
    const raw = tag(item, 'title'), suffix = ' - ' + tag(item, 'source');
    // Some outlets also append their section ("… - Market").
    const title = (raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw).replace(/\s+-\s+(Market|Economic|Ekonomi|Finansial|Bisnis|News|Global|Nasional|Politik|Teknologi)$/i, '').trim();
    const time = Date.parse(tag(item, 'pubDate'));
    if (title.length < MIN_TITLE || REJECT.some((re) => re.test(title)) || !Number.isFinite(time)) return null;
    return { title, url: tag(item, 'link'), outlet, time: new Date(time).toISOString(), topic: topic.key };
  }).filter(Boolean);
}

// Importance score of a headline within its pool:
// - subject: weight of each market-moving subject it names (SUBJECTS);
// - coverage: +1 for each other outlet running a headline that shares at least
//   three significant words (the story is widely reported), up to +3;
// - source: +1 for a national or global wire;
// - recency: +1 when published in the last 6 hours.
function importance(item, pool, now) {
  const subject = SUBJECTS.reduce((sum, [re, weight]) => sum + (re.test(item.title) ? weight : 0), 0);
  const own = words(item.title);
  const outlets = new Set(pool.filter((other) => other !== item && other.outlet !== item.outlet && [...words(other.title)].filter((w) => own.has(w)).length >= 3).map((other) => other.outlet));
  return subject + Math.min(3, outlets.size) + (WIRES.has(item.outlet) ? 1 : 0) + (now - Date.parse(item.time) <= 6 * 3600e3 ? 1 : 0);
}

export async function marketNews() {
  const results = await Promise.allSettled(TOPICS.map(topicItems));
  const now = Date.now();
  const seen = new Set();
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((item) => Date.parse(item.time) <= now + 5 * 60e3)
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .filter((item) => {
      // One story, once: compare the first words of the headline.
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // The LIMIT most important headlines in the shortest window that has enough
  // of them, at most one per topic, shown newest first.
  let items = [];
  for (const hours of WINDOWS_HOURS) {
    const pool = all.filter((item) => Date.parse(item.time) >= now - hours * 3600e3);
    const picked = [], topics = new Set();
    for (const item of pool.map((item) => ({ ...item, score: importance(item, pool, now) })).sort((a, b) => b.score - a.score || (a.time < b.time ? 1 : -1))) {
      if (topics.has(item.topic)) continue;
      picked.push(item);
      topics.add(item.topic);
      if (picked.length === LIMIT) break;
    }
    items = picked.sort((a, b) => (a.time < b.time ? 1 : -1));
    if (items.length >= LIMIT) break;
  }
  if (!items.length) throw new Error('headline belum tersedia');
  return {
    schema: 1,
    source: 'Google News (media terpilih)',
    generatedAt: new Date().toISOString(),
    items,
    delivery: 'feed',
  };
}

import { fearGreedState } from '../legacy/agenda-data.mjs';

const byId = (id) => document.getElementById(id);
const card = byId('market-sentiment');
const snapshot = byId('market-snapshot');
const title = byId('fear-greed-title');
const compact = byId('fear-greed-compact');
const reading = byId('fear-greed-reading');
const meter = byId('fear-greed-meter');
const scale = byId('fear-greed-scale');
const parts = byId('fear-greed-parts');
const source = byId('fear-greed-source');
const dateLabel = byId('fear-greed-date');
const method = byId('fear-greed-method');
const methodText = method.querySelector('p');
const markets = {
  ihsg: {
    name: 'IHSG', path: '/api/ihsg-fear-greed', maxAge: 5, interval: 60_000,
    source: 'BEI', url: 'https://www.idx.id/id/investor/pantau/', period: 'Penutupan',
  },
  bitcoin: {
    name: 'BTC', path: '/api/btc-fear-greed', maxAge: 3, interval: 5 * 60_000,
    source: 'Binance Spot', url: 'https://www.binance.com/en/trade/BTC_USDT', period: 'Harian UTC',
  },
};
const state = new Map();
const activeMarket = () => snapshot.dataset.market === 'bitcoin' ? 'bitcoin' : 'ihsg';
const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const rawFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const color = (value) => value < 45 ? 'var(--pink)' : value <= 55 ? 'var(--muted)' : 'var(--cyan)';

function indicators(data, point) {
  return Object.entries(data.labels ?? {}).map(([key, label]) => {
    const score = point.components?.[key];
    const indicator = data.indicators?.[key];
    const raw = point.raw?.[key];
    const rawText = Number.isFinite(raw) ? rawFormat.format(raw) + (indicator?.unit ?? '') : '';
    const description = indicator?.description ?? data.descriptions?.[key] ?? '';
    const details = [description, rawText && 'Nilai dasar ' + rawText].filter(Boolean).join(' · ');
    return `<div class="sentiment-part" title="${escape(details)}">
      <span><em>${escape(label)}</em><b>${isScore(score) ? score : '—'}</b></span>
      ${isScore(score) ? `<i style="--v:${score}%;--c:${color(score)}" aria-hidden="true"></i>` : ''}
    </div>`;
  }).join('');
}

function render() {
  const market = activeMarket();
  const config = markets[market];
  const entry = state.get(market);
  const data = entry?.data;
  const [latest, previous] = data?.points ?? [];
  const head = 'Fear & Greed ' + config.name;
  title.textContent = head;
  source.href = config.url;
  source.querySelector('span').textContent = 'Dihitung · ' + config.source;
  const ready = isScore(latest?.value);
  meter.hidden = scale.hidden = !ready;
  source.hidden = method.hidden = !ready;
  if (!ready) {
    card.dataset.status = entry?.failed ? 'unavailable' : 'loading';
    compact.innerHTML = '<span class="sentiment-scope">—</span>';
    reading.textContent = entry?.failed ? 'Skor belum tersedia.' : 'Memuat skor…';
    parts.replaceChildren();
    dateLabel.textContent = '';
    return;
  }

  const { value, date, live } = latest;
  const age = Date.now() - Date.parse(date + 'T00:00:00Z');
  const stale = age >= config.maxAge * 86_400_000 || data.delivery === 'snapshot' || data.delivery === 'archive';
  const classification = escape(latest.classification || fearGreedState(value));
  const coloredState = `<span class="sentiment-state" style="color:${color(value)}">${classification}</span>`;
  card.dataset.status = stale ? 'stale' : live ? 'intraday' : 'ready';
  compact.innerHTML = `<strong>${value}</strong>${stale ? '<span>Arsip</span>' : coloredState}`;
  reading.innerHTML = `<strong>${value}</strong><span>/ 100</span>${coloredState}`;
  meter.querySelector('i').style.left = value + '%';
  meter.setAttribute('aria-label', head + ' ' + value + ' dari 100');
  parts.innerHTML = indicators(data, latest);
  const delta = Object.hasOwn(latest, 'change') ? latest.change : isScore(previous?.value) ? value - previous.value : null;
  const time = live && !stale ? 'Estimasi intraday · ' + live + ' WIB' :
    (stale ? 'Arsip' : config.period) + ' · ' + dateFormat.format(Date.parse(date + 'T00:00:00Z'));
  dateLabel.textContent = time + (Number.isFinite(delta) ? ' · ' + (delta > 0 ? '+' : '') + delta + ' poin' : '');
  const partial = latest.missingComponents?.length ? ' Komponen dengan tanda — menunggu data.' : '';
  methodText.textContent = (data.method ?? '') + partial;
}

async function load(market) {
  const config = markets[market];
  const entry = state.get(market) ?? {};
  const now = Date.now();
  if (entry.loading || (entry.data && now - entry.requestedAt < config.interval - 1000)) return;
  entry.loading = true;
  entry.requestedAt = now;
  state.set(market, entry);
  try {
    const response = await fetch(config.path, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.schema !== 1 || data.scope !== config.name || !isScore(data.points?.[0]?.value)
      || !Number.isFinite(Date.parse(data.points[0].date + 'T00:00:00Z'))) throw new Error();
    entry.data = data;
    entry.failed = false;
  } catch {
    entry.failed = true;
  } finally {
    entry.loading = false;
    if (market === activeMarket()) render();
  }
}

const preferenceKey = 'market-deck:fear-greed-open';
try { card.open = localStorage.getItem(preferenceKey) === '1'; } catch {}
card.addEventListener('toggle', () => {
  try { localStorage.setItem(preferenceKey, card.open ? '1' : '0'); } catch {}
});

function update() {
  render();
  load(activeMarket());
}

document.addEventListener('market-deck:market', update);
setInterval(() => load(activeMarket()), 60_000);
update();

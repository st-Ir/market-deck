// During the BEI session the NILAI TRANSAKSI card shows the live regular-market
// value from /api/idx-live instead of yesterday's end-of-day total, until BEI
// publishes the day's summary. Negotiated trades are not in the live feed.
import { flashValue } from './flash.mjs';

const trillion = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let live = null;

function overlay() {
  const card = document.querySelector('#market-snapshot[data-market="ihsg"] [data-metric="turnover"]');
  if (!card || !live) return;
  const daily = document.getElementById('turnover-period')?.dataset.period !== 'monthly';
  const eodDate = card.getAttribute('data-date');
  if (!daily || !eodDate || live.date <= eodDate) return;
  const t = live.turnover;
  card.querySelector('.metric-value').replaceChildren(document.createTextNode(trillion.format(t.regularValue / 1e12)), Object.assign(document.createElement('span'), { textContent: ' T' }));
  flashValue(card.querySelector('.metric-value'), t.regularValue);
  const delta = card.querySelector('.metric-delta');
  delta.innerHTML = '<span class="live-dot"></span> <small>LIVE</small>';
  delta.style.color = 'var(--cyan)';
  delta.title = 'Nilai sesi berjalan belum sebanding dengan sesi penuh; Δ20H kembali setelah ringkasan BEI terbit.';
  const date = card.querySelector('.metric-date');
  date.textContent = live.time + ' WIB · reguler · ' + t.advancers + '↑ ' + t.decliners + '↓';
  date.title = 'Nilai transaksi pasar reguler sejauh ini (' + t.stocks + ' saham, ' + t.frequency.toLocaleString('id-ID') + ' transaksi). Negosiasi belum termasuk.';
}

async function load() {
  try {
    const response = await fetch('/api/idx-live');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema === 1 && result.turnover) live = result;
  } catch {}
  overlay();
}

document.addEventListener('market-deck:turnover-drawn', overlay);
document.addEventListener('market-deck:market', () => setTimeout(overlay, 0));
load();
setInterval(load, 15000);

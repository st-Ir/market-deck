// Market status in the chart header: a symbol for the BEI session state (open,
// istirahat, belum buka, tutup, libur; the full text is the tooltip) and the
// latest price with today's change. IHSG from the BEI live feed (/api/idx-live),
// Bitcoin from Binance's public 24 h ticker, both every 15 s. A weekday whose
// BEI live feed still carries an older date during session hours is a holiday.
import { flashValue } from './flash.mjs';
import { jakartaNow, marketStatus } from './market-hours.mjs';

const host = document.getElementById('market-status');
const BINANCE_TICKER = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT';
const price = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
let feedDate = null;
const quotes = { ihsg: null, bitcoin: null };

const bitcoinView = () => document.getElementById('market-snapshot')?.dataset.market === 'bitcoin';

function render() {
  if (!host) return;
  const bitcoin = bitcoinView();
  const now = jakartaNow();
  const status = bitcoin
    ? { state: 'open', label: 'Kripto · 24 jam · Binance live' }
    : marketStatus({ holiday: Boolean(feedDate) && feedDate < now.date && now.minutes >= 555 });
  const quote = quotes[bitcoin ? 'bitcoin' : 'ihsg'];
  host.dataset.state = status.state;
  host.title = status.label;
  // Open keeps the pulsing dot; the other states get their own symbol.
  host.querySelector('i').innerHTML = status.state === 'open' ? '' : '<svg aria-hidden="true"><use href="#i-st-' + status.state + '"/></svg>';
  const text = host.querySelector('span');
  if (!quote) {
    text.innerHTML = '<span class="sr-only">' + status.label + '</span>—';
    return;
  }
  text.innerHTML = '<span class="sr-only">' + status.label + ' · </span><b class="ms-price">' + price.format(quote.value) + '</b>' +
    (Number.isFinite(quote.change) ? ' <em class="' + (quote.change >= 0 ? 'up' : 'down') + '">' + pct.format(quote.change) + '%</em>' : '');
  flashValue(text.querySelector('.ms-price'), quote.value);
}

async function load() {
  try {
    if (bitcoinView()) {
      const t = await fetch(BINANCE_TICKER).then((r) => (r.ok ? r.json() : null));
      if (t?.lastPrice) quotes.bitcoin = { value: Number(t.lastPrice), change: Number(t.priceChangePercent) };
    } else {
      const live = await fetch('/api/idx-live').then((r) => (r.ok ? r.json() : null));
      if (live?.date) feedDate = live.date;
      const c = live?.indices?.COMPOSITE;
      if (c?.current) quotes.ihsg = { value: c.current, change: c.percent };
    }
  } catch {}
  render();
}

document.addEventListener('market-deck:market', () => setTimeout(() => { render(); load(); }, 0));
render();
load();
setInterval(render, 20000);
setInterval(load, 15000);

// Macro readings under the commodity tiles in the IHSG market panel, from
// /api/macro-id: daily SBN 10Y yield and its spread over Treasuries (EIDO has
// its own snapshot card, client/eido.mjs).
// SBN 10Y and the spread open their popups (client/rates-dialog.mjs); other rows
// link to their source.
import { keyedFlasher } from './flash.mjs';

const flashRows = keyedFlasher();
const nf = (digits) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (digits) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'exceptZero' });
const day = (date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const MONTHS = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'Mei', Jun: 'Jun', Jul: 'Jul', Aug: 'Agu', Sep: 'Sep', Oct: 'Okt', Nov: 'Nov', Dec: 'Des' };
const ORDER = {
  daily: ['sbn10y', 'sbn-spread'],
};

let data = null;

function value(item) {
  if (item.value === null || item.value === undefined) return '—';
  if (item.unit === '%') return nf(2).format(item.value) + '%';
  if (item.unit === 'bp') return nf(0).format(item.value) + ' <small>bp</small>';
  if (item.unit === 'USD') return nf(2).format(item.value) + ' <small>USD</small>';
  if (item.unit === 'USD mlr') return nf(item.value >= 100 ? 1 : 2).format(item.value) + ' <small>mlr USD</small>';
  return nf(item.value >= 100 ? 1 : 2).format(item.value);
}

function change(item) {
  if (item.change !== undefined && item.change !== null) {
    const digits = item.changeUnit === 'bp' ? 1 : 2;
    return '<em class="' + (item.change > 0 ? 'up' : item.change < 0 ? 'down' : '') + '">' + signed(digits).format(item.change) + (item.changeUnit === 'bp' ? ' bp' : '%') + '</em>';
  }
  if (item.previous === null || item.previous === undefined || item.value === null) return '';
  const diff = item.value - item.previous;
  if (Math.abs(diff) < 1e-9) return '<em>tetap</em>';
  return '<em class="' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') + nf(Math.abs(diff) >= 10 ? 1 : 2).format(Math.abs(diff)) + '</em>';
}

function meta(item) {
  const parts = item.note ? [item.note] : [];
  if (item.live) {
    parts.push(item.delayMinutes ? 'tunda ' + item.delayMinutes + ' mnt' : 'live');
    if (item.key === 'sbn-spread') parts.push('premi risiko vs AS');
    return parts.join(' · ');
  }
  if (item.period) parts.push(MONTHS[item.period] ?? item.period);
  else if (item.released) parts.push(day(item.released));
  if (item.next) parts.push('rilis ' + day(item.next));
  if (item.key === 'sbn-spread') parts.push('premi risiko vs AS');
  return parts.join(' · ');
}

const POPUPS = { sbn10y: 'sbn', 'sbn-spread': 'spread' };

function row(item) {
  const popup = POPUPS[item.key];
  const tag = popup ? 'button' : item.sourceUrl ? 'a' : 'div';
  const link = popup ? ' type="button" data-rates-open="' + popup + '" aria-haspopup="dialog" aria-controls="rates-dialog"' : item.sourceUrl ? ' href="' + item.sourceUrl + '" target="_blank" rel="noopener noreferrer"' : '';
  return '<' + tag + ' class="macro-row"' + link + ' title="' + item.label + (item.previous !== undefined && item.previous !== null ? ' · sebelumnya ' + item.previous : '') + '">' +
    '<span class="macro-row-label">' + item.label + '<small>' + meta(item) + '</small></span>' +
    '<span class="macro-row-value" data-key="' + item.key + '" data-value="' + (item.value ?? '') + '">' + value(item) + change(item) + '</span></' + tag + '>';
}

function render() {
  const host = document.getElementById('macro-watch');
  if (!host) return;
  if (!data) return;
  const byKey = new Map(data.items.map((item) => [item.key, item]));
  const group = (title, keys) => {
    const items = keys.map((k) => byKey.get(k)).filter(Boolean);
    return items.length ? '<div class="macro-group"><h3>' + title + '</h3>' + items.map(row).join('') + '</div>' : '';
  };
  host.innerHTML = group('Harian', ORDER.daily);
  flashRows(host.querySelectorAll('.macro-row-value'), (el) => el.dataset.key, (el) => (el.dataset.value === '' ? NaN : Number(el.dataset.value)));
}

async function load() {
  try {
    const response = await fetch('/api/macro-id');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema === 1 && result.items?.length) data = result;
  } catch {
    const host = document.getElementById('macro-watch');
    if (host && !data) host.innerHTML = '<p class="macro-watch-empty">Indikator makro belum dapat dimuat.</p>';
  }
  render();
}

document.addEventListener('market-deck:watchlist', render);
load();
setInterval(load, 30e3);

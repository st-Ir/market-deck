// Minimal sector strip: one icon + today's move per IDX-IC sector, strongest
// first, from /api/idx-sectors (BEI index summary). IHSG leads as the reference.
// One click on a chip names the sector in a small popover; a double click (or the
// popover's button) opens a heatmap of every stock in that sector, largest move
// first, from /api/idx-sector-stocks. IHSG view only.
import { keyedFlasher } from './flash.mjs';

const flashChips = keyedFlasher();
const flashTiles = keyedFlasher();
const card = document.getElementById('sector-card');
const rowsHost = document.getElementById('sector-rows');
const note = document.getElementById('sector-note');
const dialog = document.getElementById('sector-dialog');
const dialogTitle = document.getElementById('sector-dialog-title');
const dialogBody = document.getElementById('sector-dialog-body');
const pct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const share = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const day = (date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (code) => '<svg aria-hidden="true"><use href="#' + (code === 'COMPOSITE' ? 'i-market' : 'i-sec-' + code) + '"/></svg>';
const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

let data = null;

function chip(item, scale) {
  const v = item.change1;
  const strength = Math.min(1, Math.abs(v) / scale);
  const color = v >= 0 ? '0,188,212' : '233,30,99';
  return '<button type="button" class="sector-chip' + (item.code === 'COMPOSITE' ? ' sector-ref-chip' : '') + '" data-key="' + item.code + '" data-value="' + v.toFixed(2) + '" aria-label="' + escape(item.name) + ' ' + pct.format(v) + '%" style="--tint:rgba(' + color + ',' + (0.06 + strength * 0.3).toFixed(3) + ')">' +
    icon(item.code) + '<em class="' + (v >= 0 ? 'up' : 'down') + '">' + pct.format(v) + '</em></button>';
}

function render() {
  card.hidden = document.getElementById('market-snapshot')?.dataset.market === 'bitcoin';
  if (card.hidden) hidePopover();
  if (!data) return;
  const ihsg = data.benchmarks.find((b) => b.code === 'COMPOSITE');
  const sectors = data.sectors.filter((s) => s.change1 !== null).sort((a, b) => b.change1 - a.change1);
  const scale = Math.max(0.5, ...sectors.map((s) => Math.abs(s.change1)));
  rowsHost.innerHTML = (ihsg && ihsg.change1 !== null ? chip(ihsg, scale) : '') + sectors.map((s) => chip(s, scale)).join('');
  flashChips(rowsHost.querySelectorAll('.sector-chip'), (el) => el.dataset.key, (el) => Number(el.dataset.value));
  note.textContent = data.liveTime ? data.liveTime + ' WIB' : day(data.asOf);
  if (popoverKey) placePopover();
}

async function load() {
  try {
    const response = await fetch('/api/idx-sectors');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema === 1 && result.sectors?.length) data = result;
  } catch {
    if (!data) rowsHost.innerHTML = '<span class="sector-empty">Indeks sektoral BEI belum dapat dimuat.</span>';
  }
  render();
}

const itemOf = (code) => (code === 'COMPOSITE' ? data?.benchmarks.find((b) => b.code === code) : data?.sectors.find((s) => s.code === code));

// ---- One click: small popover naming the sector ----------------------------
const popover = document.createElement('div');
popover.className = 'sector-pop';
popover.setAttribute('role', 'tooltip');
popover.hidden = true;
document.body.append(popover);
let popoverKey = null;
// Double tap zooms on phones, so there the popover's button is the way in.
const touch = window.matchMedia('(hover: none)');

function showPopover(button) {
  const item = itemOf(button.dataset.key);
  if (!item) return;
  const ihsg = data.benchmarks.find((b) => b.code === 'COMPOSITE');
  const ref = item.code === 'COMPOSITE';
  const gap = ihsg && ihsg.change1 !== null ? item.change1 - ihsg.change1 : null;
  const versus = ref ? 'Acuan seluruh sektor' : gap === null ? '' : (gap >= 0 ? 'Unggul ' : 'Tertinggal ') + pct.format(gap).replace(/^[+-]/, '') + ' poin vs IHSG';
  popover.innerHTML = '<div class="sector-pop-head">' + icon(item.code) + '<b>' + escape(ref ? 'IHSG · Komposit' : item.name) + '</b><em class="' + tone(item.change1) + '">' + pct.format(item.change1) + '%</em></div>' +
    '<p>' + versus + (!ref && item.valueShare ? ' · ' + share.format(item.valueShare) + '% nilai transaksi' : '') + '</p>' +
    '<button type="button" data-heatmap="' + item.code + '">' + (touch.matches ? 'Ketuk untuk' : 'Klik 2× ·') + ' lihat heatmap emiten →</button>';
  popover.hidden = false;
  popoverKey = item.code;
  placePopover();
}

// Anchored under its chip; the strip is re-rendered every 15 s, so look it up by key.
function placePopover() {
  const button = popoverKey && rowsHost.querySelector('[data-key="' + popoverKey + '"]');
  if (!button) return hidePopover();
  const box = button.getBoundingClientRect();
  const width = popover.offsetWidth;
  popover.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, box.left + box.width / 2 - width / 2)) + 'px';
  popover.style.top = box.bottom + 6 + 'px';
}

function hidePopover() {
  popover.hidden = true;
  popoverKey = null;
}

rowsHost.addEventListener('click', (event) => {
  const button = event.target.closest('.sector-chip');
  if (!button) return;
  event.stopPropagation();
  // The second click of a double click keeps the popover until the heatmap opens.
  if (event.detail > 1) return;
  if (popoverKey === button.dataset.key) hidePopover();
  else showPopover(button);
});
rowsHost.addEventListener('dblclick', (event) => {
  const button = event.target.closest('.sector-chip');
  if (button) openHeatmap(button.dataset.key, button);
});
popover.addEventListener('click', (event) => {
  const button = event.target.closest('[data-heatmap]');
  if (button) openHeatmap(button.dataset.heatmap, rowsHost.querySelector('[data-key="' + button.dataset.heatmap + '"]'));
});
document.addEventListener('click', (event) => { if (!popover.contains(event.target)) hidePopover(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hidePopover(); });
window.addEventListener('scroll', () => { if (popoverKey) placePopover(); }, { passive: true });
window.addEventListener('resize', hidePopover);

// ---- Double click: heatmap of every stock in the sector --------------------
let openKey = null, opener = null, stocks = null, timer = 0;

function tileColor(v) {
  if (!v) return 'rgba(255,255,255,.06)';
  const strength = Math.min(1, Math.abs(v) / 5);
  return 'rgba(' + (v > 0 ? '0,188,212' : '233,30,99') + ',' + (0.12 + strength * 0.68).toFixed(3) + ')';
}

function renderHeatmap() {
  if (!openKey) return;
  const item = itemOf(openKey);
  // Rows: [code, name, sub-sector, price, % change, value], sorted by |change| on the server.
  const list = !stocks ? null : openKey === 'COMPOSITE'
    ? Object.values(stocks.sectors).flat().sort((a, b) => Math.abs(b[4]) - Math.abs(a[4]) || b[5] - a[5])
    : stocks.sectors[openKey];
  if (!list) {
    dialogBody.innerHTML = '<p class="fx-empty">' + (stocks === false ? 'Data emiten BEI belum dapat dimuat.' : 'Memuat emiten…') + '</p>';
    return;
  }
  const up = list.filter((s) => s[4] > 0).length, down = list.filter((s) => s[4] < 0).length;
  const value = list.reduce((sum, s) => sum + s[5], 0);
  const stat = (label, text, cls) => '<div><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</strong></div>';
  dialogBody.innerHTML =
    '<div class="sector-heat-summary">' +
      stat('Indeks', item ? pct.format(item.change1) + '%' : '—', item ? tone(item.change1) : '') +
      stat('Naik', number.format(up), 'up') + stat('Turun', number.format(down), 'down') + stat('Tetap', number.format(list.length - up - down)) +
      stat('Nilai transaksi', 'Rp' + compact.format(value)) +
    '</div>' +
    '<div class="sector-heat-legend"><span>−5%</span><i></i><span>+5%</span><small>Urut dari perubahan harga terbesar, naik maupun turun</small></div>' +
    '<div class="sector-heat" role="list">' + list.map(([code, name, sub, price, change, val]) =>
      '<a role="listitem" class="sector-tile" href="https://www.tradingview.com/chart/?symbol=IDX%3A' + code + '" target="_blank" rel="noopener noreferrer" data-key="' + code + '" data-value="' + price + '" style="background:' + tileColor(change) + '" title="' + escape(name) + (sub ? ' · ' + escape(sub) : '') + '&#10;Harga ' + number.format(price) + ' · ' + pct.format(change) + '%&#10;Nilai Rp' + compact.format(val) + '">' +
      '<b>' + code + '</b><em>' + pct.format(change) + '%</em></a>').join('') + '</div>' +
    '<p class="fx-method">' + number.format(list.length) + ' emiten yang ditransaksikan · ' + (stocks.liveTime ? 'live ' + stocks.liveTime + ' WIB' : 'penutupan ' + day(stocks.asOf)) + ' · sektor dari profil emiten BEI · klik kotak untuk chart TradingView.</p>';
  flashTiles(dialogBody.querySelectorAll('.sector-tile'), (el) => el.dataset.key, (el) => Number(el.dataset.value));
}

async function loadStocks() {
  try {
    const response = await fetch('/api/idx-sector-stocks');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema === 1) stocks = result;
  } catch {
    if (!stocks) stocks = false;
  }
  renderHeatmap();
}

function openHeatmap(code, trigger) {
  const item = itemOf(code);
  if (!item) return;
  hidePopover();
  openKey = code;
  opener = trigger;
  dialogTitle.textContent = code === 'COMPOSITE' ? 'IHSG · seluruh sektor' : item.name;
  if (stocks === false) stocks = null;
  renderHeatmap();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('metric-modal-open');
  loadStocks();
  clearInterval(timer);
  timer = setInterval(loadStocks, 15000);
}

dialog.querySelector('.sd-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  clearInterval(timer);
  openKey = null;
  document.body.classList.remove('metric-modal-open');
  if (opener?.isConnected) opener.focus();
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

document.addEventListener('market-deck:market', render);
load();
// The server overlays BEI's live index feed during the session.
setInterval(load, 15000);

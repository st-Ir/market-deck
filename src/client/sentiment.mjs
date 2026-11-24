// Sentiment panel: headlines only, from established newsrooms that passed the
// quality rules in lib/news.js (/api/market-news), on what is moving the market
// from outside it, newest first, each with its publication date and time (WIB);
// the outlet is in the tooltip; each links to the article.
const list = document.getElementById('news-list');
const updated = document.getElementById('news-updated');
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const published = (iso) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return date + ' · ' + clock.format(d).replace('.', ':') + ' WIB';
};

let data = null;

function render() {
  if (!data) return;
  list.innerHTML = data.items.map((item) => '<li><a href="' + escape(item.url) + '" target="_blank" rel="noopener noreferrer" title="' + escape(item.outlet) + '"><span class="news-title">' + escape(item.title) + '</span><time datetime="' + escape(item.time) + '">' + published(item.time) + '</time></a></li>').join('');
  updated.textContent = clock.format(new Date(data.generatedAt)).replace('.', ':') + ' WIB';
}

async function load() {
  try {
    const response = await fetch('/api/market-news');
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.schema === 1 && result.items?.length) data = result;
  } catch {
    if (!data) list.innerHTML = '<li class="news-empty">Headline belum dapat dimuat.</li>';
  }
  render();
}

load();
setInterval(load, 10 * 60e3);

// ---- Agenda: economic calendar and corporate action share one panel --------
const agenda = document.getElementById('market-agenda');
agenda?.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-agenda-tab]');
  if (!tab) return;
  agenda.querySelectorAll('[data-agenda-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
  agenda.querySelectorAll('[data-agenda-pane]').forEach((pane) => { pane.hidden = pane.dataset.agendaPane !== tab.dataset.agendaTab; });
});

// ---- Equal height on phones ---------------------------------------------------
// Side by side, the grid stretches both cards; stacked on phones they get the
// taller card's height as their minimum, while the agenda is closed and the
// Sentiment panel is not collapsed.
const panel = document.getElementById('market-news');
const phone = window.matchMedia('(max-width: 600px)');
function equalize() {
  if (!panel || !agenda) return;
  panel.style.minHeight = agenda.style.minHeight = '';
  if (!phone.matches || agenda.open || panel.classList.contains('is-collapsed')) return;
  const height = Math.max(panel.offsetHeight, agenda.offsetHeight);
  panel.style.minHeight = agenda.style.minHeight = height + 'px';
}
let pending = 0;
const schedule = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(equalize); };
new MutationObserver(schedule).observe(list, { childList: true, subtree: true, characterData: true });
if (agenda) {
  new MutationObserver(schedule).observe(agenda.querySelector('summary'), { childList: true, subtree: true, characterData: true });
  agenda.addEventListener('toggle', schedule);
}
phone.addEventListener('change', schedule);
window.addEventListener('resize', schedule);

// ---- Collapse on phones ---------------------------------------------------------
// The heading toggles the panel down to just "Sentiment"; the choice is remembered.
// Desktop always shows the headlines.
const head = panel?.querySelector('.news-head');
const COLLAPSED_KEY = 'market-deck:news-collapsed';
function setCollapsed(collapsed) {
  panel.classList.toggle('is-collapsed', collapsed && phone.matches);
  if (phone.matches) {
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', String(!collapsed));
  } else {
    ['role', 'tabindex', 'aria-expanded'].forEach((name) => head.removeAttribute(name));
  }
  schedule();
}
let collapsed = false;
try { collapsed = localStorage.getItem(COLLAPSED_KEY) === '1'; } catch {}
if (head) {
  const toggle = () => {
    if (!phone.matches) return;
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
    setCollapsed(collapsed);
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
  phone.addEventListener('change', () => setCollapsed(collapsed));
  setCollapsed(collapsed);
}
schedule();

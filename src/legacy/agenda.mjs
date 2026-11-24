import {normalizeSymbols,personalCorporateActions,calendarMonthEvents,upcomingCalendarEvents} from './agenda-data.mjs';
import {iconMarkup,appendIcon} from './ui-icons.mjs';
const agendaById=id=>document.getElementById(id);
const agendaEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const agendaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const agendaDateLabel=date=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const agendaMonthLabel=month=>new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
const calendarIcon='<svg aria-hidden="true"><use href="#i-calendar"/></svg>';
async function agendaFetch(path){const response=await fetch(path,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Data belum tersedia');return response.json()}

let agendaSelection={portfolio:[],watchlist:[]},corporateData=null;
const selectionKey='market-deck:personal-symbols:v1';
try{const saved=JSON.parse(localStorage.getItem(selectionKey)||'null');if(saved)agendaSelection={portfolio:normalizeSymbols(saved.portfolio),watchlist:normalizeSymbols(saved.watchlist)}}catch{}
// UMA / suspension notices for the chosen stocks: last 30 days, plus any
// suspension that is still in force.
const ALERT_DAYS=30;
function personalAlerts(symbols){
 const chosen=new Set(symbols),cutoff=new Date(Date.parse(agendaToday()+'T00:00:00Z')-ALERT_DAYS*86400000).toISOString().slice(0,10),suspended=corporateData?.suspended||{};
 const alerts=(corporateData?.alerts||[]).filter(a=>chosen.has(a.symbol)&&a.date>=cutoff);
 const active=Object.entries(suspended).filter(([symbol])=>chosen.has(symbol)).map(([symbol,since])=>({symbol,since}));
 return {alerts,active};
}
function corporateLink(article,href,label){
 try{const url=new URL(href);if(url.protocol==='https:'&&/^(?:www\.)?idx\.(?:co\.id|id)$/.test(url.hostname)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label+' ';appendIcon(link,'external');article.append(link)}}catch{}
}
function renderCorporateActions(){
 const held=new Set(agendaSelection.portfolio),symbols=[...new Set([...agendaSelection.portfolio,...agendaSelection.watchlist])],events=personalCorporateActions(corporateData?.events||[],agendaSelection,agendaToday());
 const {alerts,active}=personalAlerts(symbols),flag=new Map();
 for(const a of alerts)if(a.kind==='uma'&&!flag.has(a.symbol))flag.set(a.symbol,'uma');
 for(const a of active)flag.set(a.symbol,'suspend');
 const next=events[0],recentUma=alerts.find(a=>a.kind==='uma');
 agendaById('corporate-next').innerHTML=active.length?`<span class="corporate-warning">${agendaEscape(active.map(a=>a.symbol).join(', ')+' · sedang disuspensi')}</span><small>sejak ${agendaDateLabel(active[0].since)}</small>`
  :recentUma?`<span class="corporate-warning">${agendaEscape(recentUma.symbol+' · UMA')}</span><small>${agendaDateLabel(recentUma.date)}</small>`
  :next?`<span>${agendaEscape(next.symbol+' · '+next.title)}</span><small>${agendaDateLabel(next.date)}</small>`
  :`<span>${symbols.length?'Tidak ada agenda terdekat':'Pilih saham portofolio atau watchlist'}</span><small>${symbols.length?symbols.length+' saham pilihan':'Belum ada saham dipilih'}</small>`;
 agendaById('personal-symbols').innerHTML=symbols.map(symbol=>`<span data-held="${held.has(symbol)}"${flag.has(symbol)?' data-alert="'+flag.get(symbol)+'"':''} title="${(held.has(symbol)?'Portofolio':'Watchlist')+(flag.get(symbol)==='suspend'?' · sedang disuspensi':flag.get(symbol)==='uma'?' · UMA ${ALERT_DAYS} hari terakhir':'')}">${symbol}</span>`).join('');
 const body=agendaById('corporate-content');body.replaceChildren();
 for(const a of active){
  const article=document.createElement('article');article.className='corporate-event corporate-alert';article.dataset.kind='suspend';
  const title=document.createElement('strong');title.textContent=a.symbol+' · Sedang disuspensi';
  const date=document.createElement('p');date.textContent='Sejak '+agendaDateLabel(a.since)+' · belum ada pengumuman pencabutan';article.append(title,date);
  corporateLink(article,(corporateData.alerts.find(x=>x.symbol===a.symbol&&x.kind==='suspend')||{}).sourceUrl,'Pengumuman BEI');body.append(article);
 }
 for(const a of alerts.filter(a=>!(a.kind==='suspend'&&active.some(x=>x.symbol===a.symbol)))){
  const article=document.createElement('article');article.className='corporate-event corporate-alert';article.dataset.kind=a.kind;
  const title=document.createElement('strong');title.textContent=a.symbol+' · '+a.title;
  const date=document.createElement('p');date.textContent=agendaDateLabel(a.date);article.append(title,date);
  corporateLink(article,a.sourceUrl,'Pengumuman BEI');body.append(article);
 }
 if(events.length){
  for(const event of events.slice(0,5)){
   const article=document.createElement('article');article.className='corporate-event';
   const title=document.createElement('strong');title.textContent=event.symbol+' · '+event.title;
   const date=document.createElement('p');date.textContent=agendaDateLabel(event.date)+(event.detail?' · '+event.detail:'');article.append(title,date);
   corporateLink(article,event.sourceUrl,'Pengumuman IDX');body.append(article);
  }
 }else if(!alerts.length&&!active.length){
  body.innerHTML=`<div class="agenda-empty"><p>${symbols.length?(corporateData?.status==='ready'?'Tidak ada agenda, UMA, atau suspensi untuk saham pilihanmu.':'Daftar saham sudah tersimpan. Data IDX belum dapat dimuat.'):'Pilih saham portofolio atau watchlist untuk melihat corporate action.'}</p>${!symbols.length?'<button type="button" class="agenda-button" data-edit-symbols>Pilih saham</button>':'<a href="https://idx.id/id/perusahaan-tercatat/aksi-korporasi/" target="_blank" rel="noopener noreferrer">Buka IDX '+iconMarkup('external')+'</a>'}</div>`;
 }
 const warnings=alerts.length+active.filter(a=>!alerts.some(x=>x.symbol===a.symbol&&x.kind==='suspend')).length;
 agendaById('corporate-note').textContent=!symbols.length?'Hanya saham pilihanmu · Sumber IDX':corporateData?.status==='ready'?'Sumber IDX · '+events.length+' agenda'+(warnings?' · '+warnings+' peringatan':'')+' · UMA & suspensi '+ALERT_DAYS+' hari':'Sumber IDX · Data belum terhubung';
}
const selectionDialog=agendaById('personal-symbols-dialog');let selectionOpener=null;
function openSelection(button){selectionOpener=button;agendaById('portfolio-symbols').value=agendaSelection.portfolio.join(', ');agendaById('watchlist-symbols').value=agendaSelection.watchlist.join(', ');agendaById('symbols-error').textContent='';selectionDialog.showModal();document.body.classList.add('agenda-dialog-open')}
document.addEventListener('click',event=>{const button=event.target.closest('[data-edit-symbols]');if(button)openSelection(button)});
agendaById('close-symbols-dialog').addEventListener('click',()=>selectionDialog.close());agendaById('cancel-symbols-dialog').addEventListener('click',()=>selectionDialog.close());
selectionDialog.addEventListener('click',event=>{if(event.target!==selectionDialog)return;const box=selectionDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)selectionDialog.close()});
selectionDialog.addEventListener('close',()=>{document.body.classList.remove('agenda-dialog-open');selectionOpener?.focus()});
agendaById('personal-symbols-form').addEventListener('submit',event=>{
 event.preventDefault();
 try{
  const next={portfolio:normalizeSymbols(agendaById('portfolio-symbols').value),watchlist:normalizeSymbols(agendaById('watchlist-symbols').value)};
  try{localStorage.setItem(selectionKey,JSON.stringify(next))}catch{agendaById('symbols-error').textContent='Penyimpanan browser tidak tersedia. Izinkan penyimpanan lalu coba lagi.';return}
  agendaSelection=next;renderCorporateActions();selectionDialog.close();
 }catch(error){agendaById('symbols-error').textContent=error.message}
});
renderCorporateActions();
agendaFetch('/api/corporate-actions').then(data=>{corporateData=data;renderCorporateActions()}).catch(()=>{});

let economicData=null,calendarMonth=agendaToday().slice(0,7),calendarCountry='all',calendarBusy=false;
const countryLabels={all:'AS + ID',US:'AS',ID:'Indonesia'};
function monthShift(month,step){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+step);return date.toISOString().slice(0,7)}
function renderEconomicCalendar(){
 agendaById('calendar-month').textContent=agendaMonthLabel(calendarMonth);agendaById('calendar-filter').innerHTML=countryLabels[calendarCountry]+iconMarkup('switch');agendaById('calendar-filter').setAttribute('aria-label','Cakupan '+countryLabels[calendarCountry]+'. Klik untuk mengganti negara.');
 const rows=economicData?.events||[],available=rows.map(e=>e.date.slice(0,7)).sort();
 agendaById('calendar-prev').disabled=!rows.length||calendarMonth<=agendaToday().slice(0,7);agendaById('calendar-next').disabled=!rows.length||calendarMonth>=available.at(-1);
 const upcoming=upcomingCalendarEvents(rows,calendarCountry),ids=new Set(upcoming.map(e=>e.id));
 const events=calendarMonthEvents(rows,calendarMonth,calendarCountry).filter(e=>ids.has(e.id)),host=agendaById('economic-events'),now=Date.now(),today=agendaToday(),next=upcoming[0],nextId=next?.id;
 if(next){const date=next.startsAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(next.startsAt)):next.date,clock=next.startsAt?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(next.startsAt)).replace('.',':')+' WIB':'Jam menyusul'+(next.country==='US'?' · tanggal AS':'');agendaById('economic-next').innerHTML='<span>'+agendaEscape(next.title)+'</span><small>'+agendaDateLabel(date)+' · '+clock+'</small>'}
 else agendaById('economic-next').innerHTML='<span>'+(economicData?'Belum ada agenda mendatang':'Jadwal belum tersedia')+'</span><small>Sumber resmi · '+countryLabels[calendarCountry]+'</small>';
 host.innerHTML=events.length?events.map(event=>{
  const date=event.startsAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.startsAt)):event.date;
  const month=new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  const clock=event.startsAt?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(event.startsAt)).replace('.',':')+' WIB':'Jam menyusul'+(event.country==='US'?' · tanggal AS':' · WIB');
  const past=event.startsAt?Date.parse(event.startsAt)<now:event.date<today;
  return `<a class="economic-event ${event.id===nextId?'is-next':''}" data-past="${past}" href="${agendaEscape(event.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${agendaEscape(event.detail)} · ${agendaEscape(event.source.toUpperCase())}" aria-label="${agendaEscape(event.title+', '+agendaDateLabel(date)+', '+clock+'. Buka sumber resmi, tab baru')}"><div class="calendar-day">${date.slice(-2)}<small>${month}</small></div><div><div class="economic-event-title"><span class="country-code">${event.country==='US'?'AS':'ID'}</span>${agendaEscape(event.title)}</div><small class="event-clock">${clock} · ${agendaEscape(event.source==='fed'?'The Fed':event.source.toUpperCase())}</small></div><span class="event-arrow">${iconMarkup('external')}</span></a>`;
 }).join(''):`<p class="calendar-no-events">${economicData?'Belum ada jadwal terverifikasi pada cakupan ini.':'Jadwal belum dapat dimuat.'}</p>`;
 const notes=agendaById('calendar-source-list');notes.replaceChildren();
 for(const source of economicData?.sources||[]){
  const li=document.createElement('li'),name=document.createElement('span'),stamp=document.createElement('span');name.textContent=source.name;stamp.textContent=(source.state==='snapshot'?'Arsip · ':'Diperiksa · ')+(source.checkedAt?agendaDateLabel(source.checkedAt.slice(0,10)):'—');li.append(name,stamp);notes.append(li);
 }
}
async function loadCalendar(){
 if(calendarBusy)return;calendarBusy=true;agendaById('reload-calendar').disabled=true;
 try{economicData=await agendaFetch('/api/economic-calendar');renderEconomicCalendar()}catch{if(!economicData)renderEconomicCalendar()}finally{calendarBusy=false;agendaById('reload-calendar').disabled=false}
}
agendaById('calendar-prev').addEventListener('click',()=>{calendarMonth=monthShift(calendarMonth,-1);renderEconomicCalendar()});
agendaById('calendar-next').addEventListener('click',()=>{calendarMonth=monthShift(calendarMonth,1);renderEconomicCalendar()});
agendaById('calendar-filter').addEventListener('click',()=>{calendarCountry={all:'US',US:'ID',ID:'all'}[calendarCountry];renderEconomicCalendar()});
agendaById('reload-calendar').addEventListener('click',loadCalendar);
loadCalendar();setInterval(loadCalendar,15*60*1000);

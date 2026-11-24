export function normalizeSymbols(value){
 const input=Array.isArray(value)?value.join(' '):String(value||'');
 const values=input.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(s=>s.replace(/^IDX:/,'').replace(/\.JK$/,''));
 if(values.some(s=>! /^[A-Z]{4}$/.test(s)))throw new Error('Gunakan kode saham 4 huruf, mis. BBCA, BBRI.');
 const unique=[...new Set(values)];if(unique.length>50)throw new Error('Maksimal 50 saham per daftar.');return unique;
}
export function personalCorporateActions(events,selection,today){
 const symbols=new Set([...normalizeSymbols(selection.portfolio),...normalizeSymbols(selection.watchlist)]);
 if(!symbols.size)return [];
 return events.filter(e=>symbols.has(e.symbol)&&e.date>=today&&e.source==='IDX'&&e.verified===true).sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol));
}
export function calendarMonthEvents(events,month,country='all'){
 return events.filter(e=>{
  const localDate=e.startsAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.startsAt)):e.date;
  return localDate.startsWith(month)&&(country==='all'||e.country===country);
 }).sort((a,b)=>(a.startsAt||a.date+'T23:59:59').localeCompare(b.startsAt||b.date+'T23:59:59')||a.title.localeCompare(b.title));
}
export function fearGreedState(value){return value<=25?'Extreme fear':value<45?'Fear':value<=55?'Netral':value<75?'Greed':'Extreme greed'}
export function upcomingCalendarEvents(events,country='all',now=Date.now()){
 return events.filter(event=>{
  if(country!=='all'&&event.country!==country)return false;
  if(event.startsAt)return Date.parse(event.startsAt)>=now;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:event.zone||'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  return event.date>=today;
 }).sort((a,b)=>(a.startsAt||a.date+'T23:59:59Z').localeCompare(b.startsAt||b.date+'T23:59:59Z')||a.title.localeCompare(b.title));
}

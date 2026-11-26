import {treasurySpread,treasuryHistory} from './treasury-data.mjs';
const host=document.getElementById('cross-asset-list'),dialog=document.getElementById('treasury-dialog'),body=document.getElementById('treasury-body'),nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}),shortN=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2});
const day=d=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T00:00:00Z'));
const pct=n=>typeof n==='number'?nf.format(n)+'%':'—',bp=n=>typeof n==='number'?(n>0?'+':'')+shortN.format(n)+' bp':'—';
const stamp=q=>q.timePrecision==='day'?day(q.asOf):new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(q.asOf))+' WIB';
const tone=n=>typeof n!=='number'?'':n<0?'treasury-negative':'treasury-positive';
const tile=(label,value)=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>';
let quote,curve,intraday,loading=false,tab='curve',range='1D',selectedDate,trigger;
function spark(values){if(!values?.length)return '';const min=Math.min(...values),span=Math.max(...values)-min||1;return '<polyline points="'+values.map((v,i)=>(i/Math.max(1,values.length-1)*130).toFixed(2)+','+(25-(v-min)/span*22).toFixed(2)).join(' ')+'" fill="none" stroke="#00bcd4" stroke-width="1.3"/>'}
function currentQuote() {
 const daily = curve?.points.filter((point) => Number.isFinite(point.yields['10Y']));
 const latest = daily?.at(-1);
 if (!latest || (quote && Date.parse(quote.asOf) >= Date.parse(latest.date))) return quote;
 const previous = daily.at(-2);
 return {
  value: latest.yields['10Y'],
  changeBp: previous ? (latest.yields['10Y'] - previous.yields['10Y']) * 100 : null,
  asOf: latest.date,
  timePrecision: 'day',
  source: 'U.S. Treasury · EOD',
  delivery: curve.delivery,
 };
}
function quoteLabel(reading) {
 const archived = reading.delivery === 'snapshot' || Date.now() - Date.parse(reading.asOf) > 4 * 86400000;
 return (archived ? 'Arsip · ' : '') + reading.source + ' · ' + stamp(reading);
}
function drawCard() {
 const card = host.querySelector('[data-open-us10y]');
 const reading = currentQuote();
 if (!card || !reading) return;
 card.querySelector('[data-us10y-value]').textContent = pct(reading.value);
 const change = card.querySelector('[data-us10y-change]');
 change.textContent = bp(reading.changeBp);
 change.className = tone(reading.changeBp);
 change.title = 'Perubahan yield terhadap penutupan pembanding penyedia. 1 bp = 0,01 poin persentase.';
 card.querySelector('[data-us10y-stamp]').textContent = quoteLabel(reading);
 card.dataset.asOf = reading.asOf;
 const values = reading.points?.length
  ? reading.points.slice(-90).map((point) => point.value)
  : curve?.points.slice(-20).map((point) => point.yields['10Y']);
 card.querySelector('.treasury-card-spark').innerHTML = spark(values?.filter(Number.isFinite));
}
function chart(series,{curveMode=false,previous=[]}={}){
 if(!series.length)return '<p class="treasury-empty">Data grafik belum tersedia.</p>';
 const w=820,h=270,left=47,right=23,top=22,bottom=38,width=w-left-right,height=h-top-bottom,all=[...series,...previous].map(p=>p.value),min=Math.min(...all)-.025,max=Math.max(...all)+.025,y=v=>top+(max-v)/(max-min)*height;
 const xs=series.map(p=>p.x),start=Math.min(...xs),end=Math.max(...xs),x=v=>left+(v-start)/(end-start||1)*width;
 let out='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+(curveMode?'Kurva par yield Treasury menurut tenor; satuan persen':'Riwayat yield US 10Y dalam persen')+'">';
 for(let i=0;i<5;i++){const value=max-(max-min)*i/4,yy=y(value);out+='<line x1="'+left+'" x2="'+(w-right)+'" y1="'+yy+'" y2="'+yy+'" class="treasury-grid"/><text x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end">'+shortN.format(value)+'%</text>'}
 const line=(points,color,dashed)=>'<polyline fill="none" stroke="'+color+'" stroke-width="'+(dashed?1.2:1.8)+'" '+(dashed?'stroke-dasharray="4 4"':'')+' points="'+points.map(p=>x(p.x).toFixed(2)+','+y(p.value).toFixed(2)).join(' ')+'"/>';
 if(previous.length)out+=line(previous,'#777',true);out+=line(series,'#00bcd4',false);
 if(curveMode){for(const p of series){const selected=p.key==='10Y';out+='<circle cx="'+x(p.x)+'" cy="'+y(p.value)+'" r="'+(selected?4:2.5)+'" fill="'+(selected?'#e91e63':'#00bcd4')+'"><title>'+p.key+' · '+pct(p.value)+'</title></circle><text class="treasury-tenor-label" x="'+x(p.x)+'" y="'+(h-13)+'" text-anchor="middle">'+p.key+'</text>';if(selected)out+='<text class="treasury-point-label" x="'+x(p.x)+'" y="'+(y(p.value)-11)+'" text-anchor="middle">10Y · '+pct(p.value)+'</text>'}}
 else{const last=series.at(-1);out+='<circle cx="'+x(last.x)+'" cy="'+y(last.value)+'" r="3" fill="#00bcd4"/>';for(const i of [...new Set([0,Math.floor((series.length-1)/2),series.length-1])]){const p=series[i];out+='<text x="'+x(p.x)+'" y="'+(h-13)+'" text-anchor="'+(i===0?'start':i===series.length-1?'end':'middle')+'">'+p.label+'</text>'}}
 return out+'</svg>';
}
function render(){
 const latest=curve?.points.at(-1);if(!selectedDate&&latest)selectedDate=latest.date;
 const reading=currentQuote();
 body.innerHTML=(reading?'<div class="treasury-live"><div><strong>'+pct(reading.value)+'</strong><span class="'+tone(reading.changeBp)+'">'+bp(reading.changeBp)+'</span></div><small></small></div>':'')+'<div class="treasury-toolbar"><div class="history-periods" role="group" aria-label="Tampilan Treasury"><button type="button" data-treasury-tab="curve" aria-pressed="'+(tab==='curve')+'">Kurva tenor</button><button type="button" data-treasury-tab="history" aria-pressed="'+(tab==='history')+'">Grafik US 10Y</button></div>'+(tab==='curve'&&latest?'<label class="treasury-date-label">Tanggal <input id="treasury-date" type="date" aria-label="Tanggal kurva Treasury" min="'+curve.points[0].date+'" max="'+latest.date+'" value="'+selectedDate+'"></label>':'')+'</div>';
 if(reading)body.querySelector('.treasury-live small').textContent=quoteLabel(reading);
 if(tab==='curve'){
  const point=curve?.points.find(p=>p.date===selectedDate),index=curve?.points.indexOf(point),previous=index>0?curve.points[index-1]:null;
  if(!point){body.innerHTML+='<p class="treasury-empty">Tidak ada publikasi Treasury pada tanggal ini. Pilih tanggal sesi lain.</p>';sources();return}
  const tenors=curve.tenors,series=tenors.map((key,i)=>({key,x:i,value:point.yields[key]})).filter(p=>p.value!==null),before=previous?tenors.map((key,i)=>({key,x:i,value:previous.yields[key]})).filter(p=>p.value!==null):[];
  body.innerHTML+='<p class="treasury-caption">Par yield Treasury · '+day(point.date)+' · EOD</p><div class="metric-detail-summary">'+tile('Treasury 10Y',pct(point.yields['10Y']))+tile('10Y − 2Y',bp(treasurySpread(point,'2Y')))+tile('10Y − 3M',bp(treasurySpread(point,'3M')))+'</div><div class="treasury-chart">'+chart(series,{curveMode:true,previous:before})+'</div><div class="treasury-legend"><span><i></i>'+day(point.date)+'</span>'+(previous?'<span><i></i>'+day(previous.date)+'</span>':'')+'</div><dl class="treasury-tenors">'+tenors.map(key=>'<div class="'+(key==='10Y'?'selected':'')+'"><dt>'+key+'</dt><dd>'+pct(point.yields[key])+'</dd></div>').join('')+'</dl>';
 }else{
  body.innerHTML+='<div class="history-periods treasury-ranges" role="group" aria-label="Rentang grafik US 10Y">'+['1D','1M','3M','1Y'].map(r=>'<button type="button" data-treasury-range="'+r+'" aria-pressed="'+(range===r)+'">'+r+'</button>').join('')+'</div>';
  let series=[],caption;
  if(range==='1D'){series=(intraday?.points||[]).map(p=>({x:Date.parse(p.time),value:p.value,label:new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(p.time))}));caption=(intraday?.source||'US 10Y')+' · intraday 1 menit · sesi AS '+(intraday?day(intraday.asOf):'—')+' · jam grafik WIB'}
  else{const points=treasuryHistory(curve?.points,range);series=points.map(p=>({x:Date.parse(p.date),value:p.yields['10Y'],label:new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',...(range==='1Y'?{year:'2-digit'}:{}),timeZone:'UTC'}).format(new Date(p.date))}));caption='Par yield Treasury 10Y · penutupan harian · '+(latest?day(latest.date):'—')}
  body.innerHTML+='<p class="treasury-caption">'+caption+'</p><div class="treasury-chart treasury-history-chart">'+chart(series)+'</div>'+(series.length?'<div class="treasury-history-summary"><span>'+series.length+' observasi</span><span>Terakhir <strong>'+pct(series.at(-1).value)+'</strong></span></div>':'<p class="treasury-caption">Intraday belum tersedia dari sumber ini; riwayat harian dapat dibuka lewat 1M, 3M, atau 1Y.</p>');
 }
 sources();
}
function sources(){body.innerHTML+='<details class="treasury-sources"><summary>Sumber & pembaruan</summary><p>Kuotasi ^TNX dari Yahoo Finance diperbarui setiap 60 detik saat panel BTC terbuka. Cadangannya adalah data tertunda Cboe TNX, par yield harian U.S. Treasury, dan arsip bertanggal. Tanggal dan jam mengacu pada observasi penyedia.</p><p>U.S. Treasury menerbitkan kurva tenor dan riwayat par yield setiap sesi. Kuotasi indeks dan par yield resmi dapat berbeda. 1 bp = 0,01 poin persentase.</p><p><a href="https://finance.yahoo.com/quote/%5ETNX/" target="_blank" rel="noopener noreferrer">Yahoo Finance</a> · <a href="https://www.cboe.com/us/indices/dashboard/tnx/" target="_blank" rel="noopener noreferrer">Cboe TNX</a> · <a href="'+(curve?.sourceUrl||'https://home.treasury.gov/resource-center/data-chart-center/interest-rates')+'" target="_blank" rel="noopener noreferrer">U.S. Treasury</a></p></details>'}
document.addEventListener('click',event=>{const button=event.target.closest('[data-open-us10y]');if(!button)return;trigger=button;selectedDate=curve?.asOf;tab='curve';render();dialog.showModal();document.body.classList.add('metric-modal-open');load()});
document.getElementById('close-treasury').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{document.body.classList.remove('metric-modal-open');if(trigger?.isConnected)trigger.focus()});dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()});
body.addEventListener('click',event=>{const button=event.target.closest('[data-treasury-tab],[data-treasury-range]');if(!button)return;if(button.dataset.treasuryTab)tab=button.dataset.treasuryTab;if(button.dataset.treasuryRange)range=button.dataset.treasuryRange;render()});
body.addEventListener('change',event=>{if(event.target.id==='treasury-date'){selectedDate=event.target.value;render()}});
function acceptQuote(reading) {
 const time = Date.parse(reading?.asOf);
 if (reading?.schema !== 1 || reading.unit !== 'percent' || !Number.isFinite(reading.value) || !Number.isFinite(time)) return;
 if (!quote || time >= Date.parse(quote.asOf)) quote = reading;
 if (reading.points?.length && (!intraday || time >= Date.parse(intraday.asOf))) intraday = reading;
}
function acceptCurve(reading) {
 if (reading?.schema !== 1 || reading.unit !== 'percent' || !reading.points?.length) return;
 if (!curve || reading.asOf >= curve.asOf) curve = reading;
}
async function readData(path) {
 const response = await fetch(path);
 if (response.ok) return response.json();
}
async function load() {
 if (document.getElementById('market-snapshot').dataset.market !== 'bitcoin' && !dialog.open) return;
 drawCard();
 if (loading) return;
 loading = true;
 try {
  if (!quote || !curve) {
   const seed = await readData('/api/treasury-seed').catch(() => null);
   if (seed?.schema === 1) {
    acceptQuote({ ...seed.quote, delivery: seed.quote?.delivery ?? seed.delivery });
    acceptCurve({ ...seed.curve, delivery: seed.curve?.delivery ?? seed.delivery });
    drawCard();
    if (dialog.open) render();
   }
  }
  await Promise.allSettled([
   readData('/api/us10y-quote').then(acceptQuote),
   readData('/api/treasury-curve').then(acceptCurve),
  ]);
  drawCard();
  if (dialog.open) render();
  const label = host.querySelector('[data-us10y-stamp]');
  if (label && !currentQuote()) label.textContent = 'Sumber belum tersedia';
 } finally {
  loading = false;
 }
}
document.addEventListener('market-deck:market',load);setInterval(load,60000);load();

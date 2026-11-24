import {marketStatsView,barLayout} from './market-stats-data.mjs';
import {vixContext} from './metric-history-data.mjs';
import {createMetricDetails} from './metric-details.mjs';
import {turnoverView} from './turnover-data.mjs';
import {iconMarkup} from './ui-icons.mjs';
import {foreignReadingState} from './foreign-flow-data.mjs';
const host=document.getElementById('market-snapshot');let period='daily',valuePeriod='daily',data,loading,dataError=false,vixData,vixLoading=false,vixError=false,turnoverData,turnoverLoading=false,turnoverError=false;
const details=createMetricDetails(kind=>kind==='vix'?vixData:kind==='turnover'?turnoverData:kind==='foreign-net'?data:null,kind=>kind==='vix'?vixError:kind==='turnover'?turnoverError:dataError);
const number=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),percentage=new Intl.NumberFormat('id-ID',{maximumFractionDigits:1});
const day=date=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
const money=value=>{const absolute=Math.abs(value),unit=absolute>=1e12?'T':absolute>=1e9?'M':absolute>=1e6?'jt':'',divisor=absolute>=1e12?1e12:absolute>=1e9?1e9:absolute>=1e6?1e6:1;return {value:number.format(value/divisor),unit}};
function plot(svg,rows,field,diverging){
 const values=rows.map(row=>row[field]),layout=barLayout(values,diverging);svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg',axis=document.createElementNS(ns,'line');
 for(const [key,value] of Object.entries({x1:0,x2:130,y1:layout.zero,y2:layout.zero,stroke:'#555555','stroke-width':.5}))axis.setAttribute(key,value);svg.append(axis);
 layout.bars.forEach((bar,index)=>{
  const rect=document.createElementNS(ns,'rect');for(const key of ['x','y','width','height'])rect.setAttribute(key,bar[key]);
  rect.setAttribute('fill',bar.positive?'#00bcd4':'#e91e63');rect.setAttribute('data-value',values[index]);
  const title=document.createElementNS(ns,'title'),amount=money(values[index]);title.textContent=day(rows[index].to||rows[index].date)+' · Rp '+amount.value+' '+amount.unit;rect.append(title);svg.append(rect);
 });
 svg.setAttribute('aria-label',(diverging?'Net asing; batang di atas nol berarti net buy, di bawah nol net sell.':'Nilai transaksi harian dalam rupiah.')+' '+rows.length+' periode sampai '+day(rows.at(-1).to||rows.at(-1).date));
}
function card(kind,value,delta,date,rows,field,diverging,asOf=data?.asOf){
 const el=host.querySelector('[data-metric="'+kind+'"]');if(!el)return;
 const amount=money(value);el.querySelector('.metric-value').replaceChildren(document.createTextNode(amount.value),Object.assign(document.createElement('span'),{textContent:' '+amount.unit}));
 el.querySelector('.metric-value').style.color=diverging&&value<0?'var(--pink)':'var(--text)';
 const change=el.querySelector('.metric-delta');change.replaceChildren(document.createTextNode(delta===null?'—':(delta>0?'+':'')+percentage.format(delta)+'%'),Object.assign(document.createElement('small'),{textContent:' Δ20H'}));change.style.color=delta===null?'var(--muted)':delta>=0?'var(--cyan)':'var(--pink)';
 el.querySelector('.metric-date').textContent='Rp · '+date;
 el.setAttribute('data-date',asOf);plot(el.querySelector('.metric-spark'),rows,field,diverging);
}
function draw(){
 if(host.dataset.market!=='ihsg')return;
 const button=document.getElementById('flow-period');button.innerHTML=(period==='daily'?'Harian':'Mingguan')+iconMarkup('switch');button.setAttribute('aria-label','Ubah net asing ke '+(period==='daily'?'mingguan':'harian'));button.title=button.getAttribute('aria-label');button.dataset.period=period;
 const state=foreignReadingState(data,turnoverData?.asOf),el=host.querySelector('[data-metric="foreign-net"]'),svg=el.querySelector('.metric-spark');el.dataset.status=state;
 if(state==='official'){
  const view=marketStatsView(data.points,period);if(!view)return;svg.removeAttribute('hidden');
  const range=period==='weekly'&&view.flow.from!==view.flow.to?day(view.flow.from)+'–'+day(view.flow.to):day(view.flow.to);
  card('foreign-net',view.flow.value,view.flowDelta,range,view.flowBars,'value',true);el.dataset.source='BEI';if(data.method==='estimate'){const date=el.querySelector('.metric-date'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),weekday=![0,6].includes(new Date(today+'T00:00:00Z').getUTCDay()),pending=period==='daily'&&weekday&&view.flow.to<today&&document.getElementById('market-status')?.dataset.state!=='holiday';date.textContent='BEI est. · '+range+(pending?' · hari ini ±16.30':' · EOD');date.title='BEI menerbitkan data asing (ringkasan saham) setelah bursa tutup, sekitar 16.15–17.00 WIB. Tidak ada data asing intraday atau per sesi dari BEI.'}
 }else{
  svg.replaceChildren();svg.setAttribute('hidden','');el.querySelector('.metric-delta').innerHTML='— <small>Δ20H</small>';el.querySelector('.metric-delta').style.color='var(--muted)';el.querySelector('.metric-delta').title='Riwayat pembanding dengan cakupan yang sama belum tersedia';
  el.querySelector('.metric-value').textContent='—';el.querySelector('.metric-value').style.color='var(--muted)';el.querySelector('.metric-date').textContent=period==='weekly'?'Pekan terbaru belum tersedia':'Menunggu data harian';el.removeAttribute('data-date');el.dataset.source='unavailable';
 }
 updateStatsSources();
}
function updateStatsSources(){
 // The source notes under the cards were removed; nothing to update.
 if(host.dataset.market!=='ihsg'||!document.getElementById('stats-source-label'))return;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const archive=data&&(Date.parse(today)-Date.parse(data.asOf))/86400000>3;
 const state=foreignReadingState(data,turnoverData?.asOf);
 document.getElementById('stats-source-label').textContent='Net '+(state==='official'?(data.method==='estimate'?'BEI est. ':'BEI ')+day(data.asOf):'belum tersedia')+' · Nilai BEI '+(turnoverData?day(turnoverData.asOf):'—')+' · Sumber';
 const copy=document.getElementById('stats-source-copy');copy.replaceChildren();
 if(data?.method==='estimate')copy.append('Net asing BEI dihitung dari ringkasan saham harian seluruh saham. BEI menerbitkan beli/jual asing sebagai volume, sehingga nilai rupiah diestimasi dengan volume × harga rata-rata (VWAP) pasar reguler tiap saham. Uji 12 Nov 2026: +508,9 M vs +510,5 M yang dilaporkan untuk pasar reguler. Angka seluruh pasar (termasuk negosiasi) bisa berbeda. ');
 copy.append(archive?'Arsip BEI hingga '+day(data.asOf)+' tetap dapat dilihat di detail. ':'Riwayat BEI mengikuti tanggal laporannya. ');
 copy.append('Mingguan dan Δ20H ditahan sampai riwayat terbaru dengan cakupan sama tersedia. Jika data BEI sudah menyusul sesi terbaru, sumber BEI diprioritaskan. Nilai transaksi dapat dialihkan antara harian dan bulan berjalan. ');
 copy.append('Nilai transaksi memakai penjumlahan Value (reguler) + NonRegularValue dari seluruh baris ringkasan saham BEI yang lengkap. Bulan ini menjumlah sesi yang sudah tersedia, bukan proyeksi satu bulan. Data hanya sesi selesai; akhir pekan menampilkan sesi terakhir. ');
 if(data){const source=document.createElement('a');source.href=data.sourceUrl;source.textContent='Laporan investor BEI';source.target='_blank';source.rel='noopener noreferrer';copy.append(source,' · ')}
 if(turnoverData){const source=document.createElement('a');source.href=turnoverData.sourceUrl;source.textContent='Ringkasan saham BEI';source.target='_blank';source.rel='noopener noreferrer';copy.append(source,' · diakses '+day(turnoverData.generatedAt.slice(0,10))+' '+turnoverData.generatedAt.slice(0,4)+'. ')}
 copy.append('USD/IDR memakai kuotasi Yahoo Finance (IDR=X), diperbarui tiap menit; buka kartunya untuk perbandingan dengan IHSG.');
}
function drawTurnover(){
 if(host.dataset.market!=='ihsg'||!turnoverData)return;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),view=turnoverView(turnoverData.points,valuePeriod,today,turnoverData.missingDates);
 const el=host.querySelector('[data-metric="turnover"]');if(!el||!view)return;
 const button=document.getElementById('turnover-period');button.innerHTML=(valuePeriod==='daily'?'Harian':'Bulan ini')+iconMarkup('switch');button.setAttribute('aria-label','Ubah nilai transaksi ke '+(valuePeriod==='daily'?'bulan ini':'harian'));button.dataset.period=valuePeriod;
 if(view.value===null){el.querySelector('.metric-value').textContent='—';el.querySelector('.metric-delta').textContent='—';el.querySelector('.metric-date').textContent='Bulan ini · belum tersedia';el.querySelector('.metric-spark').replaceChildren();return}
 card('turnover',view.value,view.delta,day(view.to),view.bars,'totalValue',false,turnoverData.asOf);
 const weekend=[0,6].includes(new Date(today+'T00:00:00Z').getUTCDay());
 el.querySelector('.metric-date').textContent=valuePeriod==='monthly'?new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(today.slice(0,7)+'-01T00:00:00Z'))+' · '+view.sessions+' sesi · s.d. '+day(view.to):day(view.to)+' · EOD'+(weekend?' · Bursa tutup':'');
 updateStatsSources();
 draw();
 document.dispatchEvent(new CustomEvent('market-deck:turnover-drawn'));
}
async function loadTurnover(){
 if(host.dataset.market!=='ihsg')return;drawTurnover();if(turnoverLoading)return;turnoverLoading=true;
 try{const response=await fetch('/api/idx-turnover');if(!response.ok)throw new Error();const result=await response.json();if(result.schema!==1||result.unit!=='IDR'||!result.points?.length)throw new Error();turnoverData=result;turnoverError=false;drawTurnover()}
 catch{turnoverError=true;if(!turnoverData){const label=host.querySelector('[data-metric="turnover"] .metric-date');if(label)label.textContent='Data BEI belum tersedia'}}
 finally{turnoverLoading=false;details.refresh()}
}
async function load(){
 if(host.dataset.market!=='ihsg')return;draw();
 if(loading)return;loading=true;
 try{const response=await fetch('/api/idx-summary');if(!response.ok)throw new Error();const result=await response.json();if(result.schema!==1||!Array.isArray(result.points)||result.unit!=='IDR')throw new Error();data=result;dataError=false;draw()}
 catch{dataError=true;draw()}
 finally{loading=false;details.refresh()}
}
function drawVix(){
 if(host.dataset.market!=='ihsg'||!vixData)return;const el=host.querySelector('[data-metric="vix"]');if(!el)return;
 const context=vixContext(vixData.points);el.querySelector('.metric-value').textContent=number.format(context.last.close);
 const delta=el.querySelector('.metric-delta');delta.replaceChildren(document.createTextNode(context.change===null?'—':(context.change>0?'+':'')+percentage.format(context.change)+'%'),Object.assign(document.createElement('small'),{textContent:' Δ1H'}));delta.style.color=context.change===null?'var(--muted)':context.change>0?'var(--pink)':'var(--cyan)';
 el.querySelector('.metric-date').textContent='S&P 500 · '+day(vixData.asOf)+' · EOD';el.dataset.date=vixData.asOf;
 const svg=el.querySelector('.metric-spark'),rows=vixData.points.slice(-20),values=rows.map(row=>row.close),min=Math.min(...values),max=Math.max(...values),span=max-min||1,path=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 path.setAttribute('points',values.map((value,index)=>(index/(values.length-1)*130).toFixed(2)+','+(3+(max-value)/span*24).toFixed(2)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',context.change>0?'#e91e63':'#00bcd4');path.setAttribute('stroke-width','1.3');svg.replaceChildren(path);svg.setAttribute('aria-label','VIX, penutupan '+number.format(context.last.close)+' poin per '+day(vixData.asOf)+'. Volatilitas ekspektasi S&P 500, bukan indeks volatilitas IHSG.');
}
async function loadVix(){
 if(host.dataset.market!=='ihsg')return;drawVix();if(vixLoading)return;vixLoading=true;
 try{const response=await fetch('/api/vix');if(!response.ok)throw new Error();const result=await response.json();if(result.schema!==1||result.symbol!=='VIX'||!Array.isArray(result.points)||!result.points.length)throw new Error();vixData=result;vixError=false;drawVix()}
 catch{vixError=true;if(!vixData&&host.dataset.market==='ihsg'){const label=host.querySelector('[data-metric="vix"] .metric-date');if(label)label.textContent='Sumber Cboe belum tersedia'}}
 finally{vixLoading=false;details.refresh()}
}
host.addEventListener('click',event=>{
 if(event.target.closest('#flow-period')){period=period==='daily'?'weekly':'daily';draw();return}
 if(event.target.closest('#turnover-period')){valuePeriod=valuePeriod==='daily'?'monthly':'daily';drawTurnover();return}
 const button=event.target.closest('[data-open-metric]');if(button)details.open(button.dataset.openMetric,button,button.closest('.snapshot-stat'));
});
document.addEventListener('market-deck:market',()=>{load();loadTurnover()});load();loadTurnover();setInterval(()=>{load();loadTurnover()},60000);

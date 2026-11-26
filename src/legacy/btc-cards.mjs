import {btcFlowHistory,btcFlowDelta,btcEtfIsRecent,m2Projection,m2Analysis,shiftDay} from './btc-data.mjs';
import {barLayout} from './market-stats-data.mjs';
import {iconMarkup} from './ui-icons.mjs';
import {attachChartZoom,hiddenSeries,panWindow,zoomWindow} from '../client/chart-zoom.mjs';
import {buildBtcTurnover,preferredBtcTurnover} from '../client/btc-turnover-data.mjs';
import {renderBtcTurnover,renderBtcTurnoverChart} from '../client/btc-turnover-view.mjs';
import {BTC_CHART_PLOT} from '../client/btc-turnover-charts.mjs';
// Zoom window of the M2 chart in ms (null = default 185 days to today) and switched-off series.
let m2View=null,m2Bounds=null;const m2Hidden=hiddenSeries('market-deck:m2-series'),DAY_MS=86400000,isoDay=ms=>new Date(ms).toISOString().slice(0,10);
const $=id=>document.getElementById(id),host=$('market-snapshot'),dialog=$('btc-detail-dialog'),body=$('btc-detail-body'),settings=$('m2-settings-dialog');
const nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),one=new Intl.NumberFormat('id-ID',{maximumFractionDigits:1});
const day=(date,year=false)=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(date.slice(0,10)+'T00:00:00Z'));
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date());
const cash=n=>{if(n===null||n===undefined||!Number.isFinite(n))return '—';const a=Math.abs(n),d=a>=1e12?1e12:a>=1e9?1e9:a>=1e6?1e6:a>=1e3?1e3:1;return nf.format(n/d)+(d===1e12?' T':d===1e9?' B':d===1e6?' M':d===1e3?' K':'')};
const signed=n=>(n>0?'+':'')+cash(n),pct=n=>n===null||!Number.isFinite(n)?'—':(n>0?'+':'')+nf.format(n)+'%',tone=n=>n>=0?'btc-positive':'btc-negative';
const tile=(label,value,cls='')=>'<div><span>'+label+'</span><strong class="'+cls+'">'+value+'</strong></div>';
const data={},failed=new Set(),pending=new Set();
const turnoverLabels={combined:'Spot + perpetual',spot:'Spot',perpetual:'Perpetual'};
let turnoverModels={};
const turnoverChartViews=new Map();
let flowPeriod='daily',active,trigger,model,selectedDate,calendarMonth=today().slice(0,7),historyLimit=30;
let prefs={lag:78,sma:30};try{const saved=JSON.parse(localStorage.getItem('market-deck:m2-settings')||'null');if(saved&&Number.isInteger(saved.lag)&&saved.lag>=0&&saved.lag<=180&&Number.isInteger(saved.sma)&&saved.sma>=5&&saved.sma<=200)prefs=saved}catch{}
function sourceLink(url,label){return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+' '+iconMarkup('external')+'</a>'}
function bars(values,dates,width=130,height=30,titles=null){
 const layout=barLayout(values,true,width,height);return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Net buy di atas nol; net sell di bawah nol"><line x1="0" x2="'+width+'" y1="'+layout.zero+'" y2="'+layout.zero+'" stroke="#555" stroke-width=".6"/>'+layout.bars.map((b,i)=>'<rect x="'+b.x+'" y="'+b.y+'" width="'+b.width+'" height="'+b.height+'" fill="'+(b.positive?'#00bcd4':'#e91e63')+'"><title>'+(titles?titles[i]:day(dates[i])+' · '+signed(values[i]))+'</title></rect>').join('')+'</svg>';
}
function spark(el,points,field,diverging=false){if(!el||!points?.length)return;el.setAttribute('aria-label','Riwayat '+points.length+' hari sampai '+day(points.at(-1).date));if(diverging){el.innerHTML=bars(points.map(p=>p[field]),points.map(p=>p.date)).replace(/^<svg[^>]+>|<\/svg>$/g,'');return}const values=points.map(p=>p[field]),min=Math.min(...values),span=Math.max(...values)-min||1;el.innerHTML='<polyline fill="none" stroke="#00bcd4" stroke-width="1.3" points="'+values.map((v,i)=>(i/Math.max(1,values.length-1)*130).toFixed(2)+','+(28-(v-min)/span*26).toFixed(2)).join(' ')+'"/>'}
// ETF + spot per day, from the first ETF day to the latest settled one. Days the ETFs
// did not trade (weekends, US holidays) count ETF as 0, so weekly/monthly sums keep
// the weekend spot flow. Stale or missing ETF → spot alone, labelled.
function btcCombinedFlow(){
 const etf=data.etf?.points||[],spot=data.spot?.points||[];
 if(!etf.length||!btcEtfIsRecent(etf.at(-1).date))return {label:'Spot saja · ETF belum tersedia',points:spot.map(p=>({date:p.date,net:p.net,etf:null,spot:p.net}))};
 const first=etf[0].date,lastDay=etf.at(-1).date,days=new Map();
 for(const p of spot)if(p.date>=first&&p.date<=lastDay)days.set(p.date,{date:p.date,etf:0,spot:p.net});
 for(const p of etf){const d=days.get(p.date)||{date:p.date,etf:0,spot:null};d.etf=p.net;days.set(p.date,d)}
 return {label:'ETF + Spot',points:[...days.values()].sort((x,y)=>x.date.localeCompare(y.date)).map(d=>({...d,net:d.etf+(d.spot||0)}))};
}
function drawCards(){
 if(host.dataset.market!=='bitcoin')return;
 const flow=host.querySelector('[data-metric="btc-flow"]'),volume=host.querySelector('[data-metric="btc-volume"]'),m2=host.querySelector('[data-metric="btc-m2"]');if(!flow||!volume||!m2)return;
 // Front of the card: one combined figure, ETF net creation + Binance spot taker net,
 // on days both exist (ETF trading days). Stale or missing ETF → spot alone, labelled.
 const combined=btcCombinedFlow(),point=combined.points.at(-1),value=flow.querySelector('.metric-value');
 if(point){value.textContent=signed(point.net);value.className='metric-value '+tone(point.net);flow.querySelector('.metric-delta').innerHTML=pct(btcFlowDelta(combined.points))+' <small>Δ20H</small>';flow.querySelector('.metric-date').textContent=combined.label+' · '+day(point.date);spark(flow.querySelector('svg.metric-spark'),combined.points.slice(-20),'net',true);flow.dataset.date=point.date}
 else flow.querySelector('.metric-date').textContent=failed.has('etf')&&failed.has('spot')?'Sumber belum tersedia':'Memuat sumber…';

 drawVolumeCard(volume);
 m2.querySelector('[data-lag-label]').textContent=prefs.lag+' hari';
 if(data.m2?.points?.length){const series=m2Projection(data.m2.points,prefs),last=series.at(-1),prev=series.at(-2),change=(last.value/prev.value-1)*100;m2.querySelector('.metric-value').textContent=pct(change);m2.querySelector('.metric-value').className='metric-value '+tone(change);m2.querySelector('.metric-delta').innerHTML='<span class="btc-state '+(last.side>=0?'btc-positive':'btc-negative')+'">'+(last.cross?'Cross '+(last.cross==='up'?'naik':'turun'):last.side>0?'Di atas SMA':'Di bawah SMA')+'</span>';m2.querySelector('.metric-date').textContent=(data.m2.delivery==='snapshot'?'Arsip · ':'')+'Δ1H · '+day(data.m2.asOf)+' · SMA '+prefs.sma+' · proxy USD';spark(m2.querySelector('svg.metric-spark'),data.m2.points.slice(-45),'value');m2.dataset.date=data.m2.asOf}
}
function tab(label,key,value,current){return '<button type="button" '+key+'="'+value+'" aria-pressed="'+(value===current)+'">'+label+'</button>'}
function historyTable(groups,spot=false){return '<div class="btc-table-wrap"><table><thead><tr><th>Periode</th><th>Net '+(spot?'USDT':'USD')+'</th>'+(spot?'<th>Taker buy</th><th>Taker sell</th>':'')+'<th>Sesi</th></tr></thead><tbody>'+groups.slice().reverse().slice(0,historyLimit).map(g=>'<tr><td>'+day(g.from,true)+(g.to!==g.from?' – '+day(g.to):'')+'</td><td class="'+tone(g.net)+'">'+signed(g.net)+'</td>'+(spot?'<td>'+cash(g.buy)+'</td><td>'+cash(g.sell)+'</td>':'')+'<td>'+g.sessions+'</td></tr>').join('')+'</tbody></table></div>'+(groups.length>historyLimit?'<button class="btc-more" data-btc-more type="button">Tampilkan 30 periode lagi</button>':'');}
const periodLabel=g=>day(g.from,true)+(g.to!==g.from?' – '+day(g.to):'');
function sumBy(points,field){const out=new Map();for(const g of btcFlowHistory(points.map(p=>({date:p.date,net:p[field]||0})),flowPeriod))out.set(g.key,g.net);return out}
function flowColumn(title,source,isEtf){
 if(!source?.points?.length)return '<section class="btc-flow-col"><h3 class="btc-col-title">'+title+'</h3><p class="btc-empty">Sumber belum tersedia.</p></section>';
 const groups=btcFlowHistory(source.points,flowPeriod),last=groups.at(-1),week=btcFlowHistory(source.points,'weekly').at(-1),month=btcFlowHistory(source.points,'monthly').at(-1),recent=groups.slice(-40);
 let out='<section class="btc-flow-col"><h3 class="btc-col-title">'+title+'</h3><p class="btc-coverage">'+(isEtf?'USD · '+(source.source||'Farside'):'USDT · Binance BTCUSDT · hari UTC')+' · s.d. '+day(source.asOf,true)+'</p>';
 out+='<div class="metric-detail-summary">'+tile('Periode terakhir',signed(last.net),tone(last.net))+tile('Pekan',signed(week.net),tone(week.net))+tile('Bulan',signed(month.net),tone(month.net))+'</div>';
 out+='<div class="btc-flow-chart btc-flow-chart-sm">'+bars(recent.map(g=>g.net),recent.map(g=>g.to),440,110)+'</div>';
 if(isEtf)out+='<h4 class="btc-subtitle">Per fund · '+periodLabel(last)+'</h4><div class="btc-fund-grid">'+source.funds.map(f=>'<div><span>'+f+'</span><strong class="'+(last.funds[f]===null?'':tone(last.funds[f]))+'">'+(last.funds[f]===null?'—':signed(last.funds[f]))+'</strong></div>').join('')+'</div>';
 return out+historyTable(groups,!isEtf)+'</section>';
}
function renderFlow(){
 body.innerHTML='<div class="btc-toolbar"><div class="history-periods" role="group" aria-label="Periode flow">'+tab('Harian','data-flow-period','daily',flowPeriod)+tab('Mingguan','data-flow-period','weekly',flowPeriod)+tab('Bulanan','data-flow-period','monthly',flowPeriod)+'</div></div>';
 const combined=btcCombinedFlow();
 if(combined.points.length){
  const groups=btcFlowHistory(combined.points,flowPeriod),etfSum=sumBy(combined.points,'etf'),spotSum=sumBy(combined.points,'spot'),last=groups.at(-1),week=btcFlowHistory(combined.points,'weekly').at(-1),month=btcFlowHistory(combined.points,'monthly').at(-1),recent=groups.slice(-60);
  const titles=recent.map(g=>periodLabel(g)+' · gabungan '+signed(g.net)+' · ETF '+signed(etfSum.get(g.key))+' · spot '+signed(spotSum.get(g.key)));
  body.innerHTML+='<section class="btc-flow-combined"><h3 class="btc-col-title">Gabungan · '+combined.label+'</h3><p class="btc-coverage">USD ≈ USDT · '+day(combined.points[0].date,true)+' – '+day(combined.points.at(-1).date,true)+' · arahkan kursor ke batang untuk rincian ETF / spot</p><div class="metric-detail-summary">'+tile('Periode terakhir · '+periodLabel(last),signed(last.net),tone(last.net))+tile('Pekan terakhir',signed(week.net),tone(week.net))+tile('Bulan terakhir',signed(month.net),tone(month.net))+'</div><div class="btc-flow-chart">'+bars(recent.map(g=>g.net),recent.map(g=>g.to),900,150,titles)+'</div></section>';
 }
 body.innerHTML+='<div class="btc-flow-split">'+flowColumn('ETF spot Bitcoin AS',data.etf,true)+flowColumn('Spot Binance',data.spot,false)+'</div>';
 body.innerHTML+='<p class="btc-method">Gabungan = net creation/redemption ETF spot Bitcoin AS + taker net BTCUSDT Binance (taker buy − taker sell), USDT dianggap setara USD. Hari ETF tidak berdagang dihitung 0, jadi akhir pekan hanya berisi spot; gabungan berhenti di hari ETF terakhir yang sudah settle. Spot bukan arus modal bersih dan hanya mencakup Binance. Angka ETF dibulatkan penyedia; sel kosong tetap —. '+(data.etf?sourceLink(data.etf.sourceUrl,data.etf.source||'Farside')+' · ':'')+(data.spot?sourceLink(data.spot.sourceUrl,'Binance Spot'):'')+'</p>';
}
const volumeLoading=()=>['spot','perpetual'].some(key=>!data[key]&&!failed.has(key));

function drawVolumeCard(card) {
 const market=preferredBtcTurnover(turnoverModels),summary=turnoverModels[market];
 const rolling=summary?.rolling,point=rolling||summary?.latest;
 const period=card.querySelector('.btc-volume-period');
 period.textContent=rolling?'Live 24J':point?'Harian':'24J';
 period.classList.toggle('is-live',!!rolling);
 card.querySelector('.metric-value').textContent=cash(point?.volume);
 const delta=card.querySelector('.metric-delta');
 delta.classList.add('btc-ratios');
 delta.innerHTML=point?.rvol==null?'—':nf.format(point.rvol)+'× <small>RVOL 20H</small>';
 const label=card.querySelector('.metric-date');
 const timestamp=rolling?day(rolling.to)+' '+rolling.to.slice(11,16)+' UTC':point?day(point.date)+' UTC':'';
 label.textContent=point?turnoverLabels[market]+' · USDT · '+timestamp:volumeLoading()?'Memuat sumber…':'Sumber belum tersedia';
 label.title=point?[summary.spotVenue&&'Spot '+summary.spotVenue,summary.perpetualVenue&&'Perpetual '+summary.perpetualVenue,'BTCUSDT',timestamp].filter(Boolean).join(' · '):'';
 const svg=card.querySelector('svg.metric-spark');
 const rows=summary?.rows.slice(-20)||[];
 const layout=barLayout(rows.map(row=>row.volume),false,130,30);
 svg.innerHTML=layout.bars.map((bar,i)=>{
  const row=rows[i],color=row.change<0?'var(--pink)':'var(--cyan)';
  return '<rect x="'+bar.x+'" y="'+bar.y+'" width="'+bar.width+'" height="'+bar.height+'" fill="'+color+'"><title>'+day(row.date)+' · '+cash(row.volume)+' USDT</title></rect>';
 }).join('');
 svg.setAttribute('aria-label',rows.length?'Nilai transaksi harian '+turnoverLabels[market]+' dalam USDT sampai '+day(rows.at(-1).date):'Riwayat belum tersedia');
}

function renderVolume() {
 const tableSelector='[data-btc-turnover-table]';
 const disclosureSelector='[data-btc-turnover-disclosure]';
 const focusSelector='[data-btc-chart], '+tableSelector+', '+disclosureSelector+'>summary';
 const focusKey=el=>el.dataset.btcChart??el.dataset.btcTurnoverTable??el.parentElement?.dataset.btcTurnoverDisclosure;
 const focused=dialog.open&&document.activeElement?.matches(focusSelector)?document.activeElement:null;
 const focusedKey=focused?focusKey(focused):null;
 const top=dialog.open?body.scrollTop:0;
 const expanded=new Set(dialog.open?[...body.querySelectorAll(disclosureSelector+'[open]')].map(el=>el.dataset.btcTurnoverDisclosure):[]);
 const positions=new Map(dialog.open?[...body.querySelectorAll(tableSelector)].map(el=>[
  el.dataset.btcTurnoverTable,{left:el.scrollLeft,top:el.scrollTop},
 ]):[]);
 body.innerHTML=renderBtcTurnover({
  models:turnoverModels,etf:data.etfTurnover,loading:volumeLoading(),
  etfLoading:!data.etfTurnover&&!failed.has('etfTurnover'),
  chartViews:turnoverChartViews,
 });
 for(const el of body.querySelectorAll(disclosureSelector))el.open=expanded.has(el.dataset.btcTurnoverDisclosure);
 for(const el of body.querySelectorAll(tableSelector)){
  const position=positions.get(el.dataset.btcTurnoverTable);
  if(position){el.scrollLeft=position.left;el.scrollTop=position.top}
 }
 if(focused)[...body.querySelectorAll(focusSelector)].find(el=>el.localName===focused.localName&&focusKey(el)===focusedKey)?.focus({preventScroll:true});
 body.scrollTop=top;
}

function alterTurnoverChart(svg, update) {
 if(active!=='btc-volume'||!dialog.open)return;
 const key=svg.dataset.btcChart;
 const current=body.querySelector('[data-btc-chart="'+key+'"]');
 const panel=current?.closest('.m2-plot-panel');
 if(!panel)return;
 const {viewStart,viewEnd,viewMax}=current.dataset;
 const view={start:Number(viewStart),end:Number(viewEnd)},bounds={min:0,max:Number(viewMax)};
 const next=update?.(view,bounds);
 if(next?.start===view.start&&next?.end===view.end)return;
 if(next)turnoverChartViews.set(key,next);else turnoverChartViews.delete(key);
 const focused=document.activeElement===current;
 panel.outerHTML=renderBtcTurnoverChart({models:turnoverModels,etf:data.etfTurnover,key,view:next});
 if(focused)body.querySelector('[data-btc-chart="'+key+'"]')?.focus({preventScroll:true});
}

const zoomTurnoverChart=(svg,anchor,factor)=>alterTurnoverChart(svg,(view,bounds)=>
 zoomWindow(view,bounds,anchor,factor,Math.min(7,bounds.max)));
attachChartZoom(body,'[data-btc-chart]',{
 plot:BTC_CHART_PLOT,
 onZoom(anchor,factor,svg){zoomTurnoverChart(svg,anchor,factor)},
 onPan(shift,svg){alterTurnoverChart(svg,(view,bounds)=>panWindow(view,bounds,shift))},
 onReset(svg){alterTurnoverChart(svg)},
});
body.addEventListener('keydown',event=>{
 if(!event.target.matches('[data-btc-chart]')||!['+','=','-','Home'].includes(event.key))return;
 event.preventDefault();
 if(event.key==='Home')alterTurnoverChart(event.target);
 else zoomTurnoverChart(event.target,.5,event.key==='-'?1.25:.8);
});
function chartM2(){
 const series=model.projected,now=today(),dataEnd=series.at(-1).date>now?series.at(-1).date:now;m2Bounds={min:Date.parse(series[0].date),max:Date.parse(dataEnd)};m2View=m2View?panWindow(m2View,m2Bounds,0):{start:Math.max(m2Bounds.min,Date.parse(shiftDay(now,-185))),end:m2Bounds.max};
 const startMs=m2View.start,endMs=m2View.end,start=isoDay(Math.ceil(startMs/DAY_MS)*DAY_MS),end=isoDay(Math.floor(endMs/DAY_MS)*DAY_MS),visible=series.filter(p=>p.date>=start&&p.date<=end&&p.sma!==null),prices=(data.spot?.points||[]).filter(p=>p.date>=start&&p.date<=now&&p.date<=end);
 if(data.spot?.rolling.to.slice(0,10)===now&&now>=start&&now<=end&&!prices.some(p=>p.date===now))prices.push({date:now,close:data.spot.rolling.close});
 if(!visible.length)return '<p class="btc-empty">Riwayat belum cukup.</p>';
 const w=720,h=330,l=47,r=56,t=31,b=31,pw=w-l-r,ph=h-t-b,x=d=>l+(Date.parse(d)-startMs)/(endMs-startMs)*pw;
 const m2Fields=[['value','m2'],['sma','sma']].filter(([,key])=>!m2Hidden.has(key)).map(([field])=>field),fields=m2Fields.length?m2Fields:['value','sma'];
 const min=Math.min(...visible.map(p=>Math.min(...fields.map(f=>p[f]))))*.998,max=Math.max(...visible.map(p=>Math.max(...fields.map(f=>p[f]))))*1.002,y=v=>t+(max-v)/(max-min)*ph;
 const pmin=Math.min(...prices.map(p=>p.close))*.98,pmax=Math.max(...prices.map(p=>p.close))*1.02,py=v=>t+(pmax-v)/(pmax-pmin)*ph;
 let out='<svg id="m2-chart-svg" class="chart-zoomable" viewBox="0 0 '+w+' '+h+'" role="img" tabindex="0" aria-label="Global M2 dan SMA pada skala kiri triliun USD, BTC skala kanan USD; M2 digeser '+prefs.lag+' hari ke depan"><defs><pattern id="m2-future-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="#e91e63" stroke-opacity=".13" stroke-width="2"/></pattern></defs>';
 if(!m2Hidden.has('regime'))for(let i=1;i<visible.length;i++){const p=visible[i],old=visible[i-1];out+='<rect x="'+x(old.date)+'" y="'+t+'" width="'+Math.max(.2,x(p.date)-x(old.date))+'" height="'+ph+'" fill="'+(p.side>=0?'#00bcd4':'#e91e63')+'" opacity=".075"/>'}
 {const f0=Math.max(l,x(now)),f1=Math.min(w-r,x(dataEnd));if(f1>f0)out+='<rect x="'+f0+'" y="'+t+'" width="'+(f1-f0)+'" height="'+ph+'" fill="url(#m2-future-pattern)"/>';if(x(now)>=l&&x(now)<=w-r)out+='<line x1="'+x(now)+'" x2="'+x(now)+'" y1="'+(t-15)+'" y2="'+(t+ph)+'" stroke="#ddd" stroke-dasharray="3 4"/><text x="'+(x(now)+5)+'" y="20">Hari ini</text>'}
 for(let i=0;i<5;i++){const yy=t+i*ph/4;out+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yy+'" y2="'+yy+'" class="m2-grid-line"/><text x="'+(l-8)+'" y="'+(yy+4)+'" text-anchor="end">'+one.format(max-i*(max-min)/4)+'</text>'+(prices.length?'<text x="'+(w-r+7)+'" y="'+(yy+4)+'">'+one.format((pmax-i*(pmax-pmin)/4)/1000)+'k</text>':'')}
 const line=(arr,field,scale,color,width)=>'<polyline points="'+arr.map(p=>x(p.date).toFixed(2)+','+scale(p[field]).toFixed(2)).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="'+width+'"/>';
 if(!m2Hidden.has('m2'))out+=line(visible,'value',y,'#888',1.3);if(!m2Hidden.has('sma'))out+=line(visible,'sma',y,'#f5f5f5',2);if(prices.length&&!m2Hidden.has('btc'))out+=line(prices,'close',py,'#e91e63',1.3);
 let labelX=-100;for(const p of m2Hidden.has('cross')?[]:visible.filter(p=>p.cross).slice(-24)){const xx=x(p.date),yy=y(p.value),up=p.cross==='up',color=up?'#00bcd4':'#e91e63';out+='<line x1="'+xx+'" x2="'+xx+'" y1="'+t+'" y2="'+(t+ph)+'" stroke="'+color+'" stroke-dasharray="2 4" opacity=".8"/><path data-m2-date="'+p.date+'" d="M'+(xx-5)+' '+(yy+(up?5:-5))+'L'+xx+' '+(yy+(up?-5:5))+'L'+(xx+5)+' '+(yy+(up?5:-5))+'Z" fill="'+color+'" stroke="#ddd" stroke-width=".7"/>';if(xx-labelX>50&&Math.abs(xx-x(now))>65){out+='<text x="'+xx+'" y="'+(t-7)+'" text-anchor="middle" fill="'+color+'">'+day(p.date)+'</text>';labelX=xx}}
 for(let i=0;i<6;i++){const d=shiftDay(start,Math.round((Date.parse(end)-Date.parse(start))/86400000*i/5));out+='<text x="'+x(d)+'" y="'+(h-8)+'" text-anchor="middle">'+day(d)+'</text>'}
 if(selectedDate&&selectedDate>=start&&selectedDate<=end)out+='<line x1="'+x(selectedDate)+'" x2="'+x(selectedDate)+'" y1="'+t+'" y2="'+(t+ph)+'" stroke="#fff" opacity=".55"/>';
 out+='<text x="'+l+'" y="'+(h-21)+'" class="m2-axis-note">M2 · T USD</text><text x="'+(w-r)+'" y="'+(h-21)+'" text-anchor="end" class="m2-axis-note">BTC · USD (kanan)</text></svg>';return out;
}
function calendarM2(){
 const first=new Date(calendarMonth+'-01T00:00:00Z'),days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),pad=(first.getUTCDay()+6)%7,map=new Map(model.projected.map(p=>[p.date,p])),crosses=new Map(model.crosses.map(p=>[p.date,p]));
 let out='<div class="m2-calendar-head"><h3>'+new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(first)+'</h3><div><button type="button" data-month-step="-1" aria-label="Bulan sebelumnya">'+iconMarkup('prev')+'</button><label class="m2-month-picker" aria-label="Pilih bulan kalender M2">'+iconMarkup('calendar')+'<input type="month" id="m2-calendar-month" value="'+calendarMonth+'" aria-label="Bulan kalender M2"></label><button type="button" data-month-step="1" aria-label="Bulan berikutnya">'+iconMarkup('next')+'</button></div></div><div class="m2-calendar-week">'+['SEN','SEL','RAB','KAM','JUM','SAB','MIN'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="m2-calendar-days">'+'<span></span>'.repeat(pad);
 for(let i=1;i<=days;i++){const date=calendarMonth+'-'+String(i).padStart(2,'0'),p=map.get(date),cross=crosses.get(date);out+='<button type="button" data-m2-date="'+date+'" class="'+(p?.sma?(p.side>=0?'m2-day-up':'m2-day-down'):'m2-day-empty')+(date===today()?' m2-day-today':'')+(date===selectedDate?' m2-day-selected':'')+(date>today()?' m2-day-future':'')+'" aria-label="'+day(date,true)+(cross?' crossing '+(cross.cross==='up'?'naik':'turun'):'')+'" aria-pressed="'+(date===selectedDate)+'"><span>'+i+'</span>'+(cross?'<b>'+(cross.cross==='up'?'▲':'▼')+'</b>':'')+'</button>'}
 return out+'</div><p class="m2-calendar-key"><i></i> Di atas SMA <i></i> Di bawah SMA <span>Garis putus: tanggal setelah hari ini</span></p>';
}
function renderM2(){
 if(!data.m2){body.innerHTML='<p class="btc-empty">Sumber M2 belum tersedia.</p>';return}
 const oldHistory=dialog.open?$('m2-cross-history'):null;
 const historyOpen=!!oldHistory?.open;
 const oldTable=oldHistory?.querySelector('.m2-cross-table');
 const historyPosition=oldTable?{left:oldTable.scrollLeft,top:oldTable.scrollTop,body:body.scrollTop}:null;
 const historyFocus=oldHistory?.contains(document.activeElement)?document.activeElement:null;
 model=m2Analysis(data.m2.points,data.spot?.points||[],prefs,today());const series=model.projected,selected=series.find(p=>p.date===selectedDate)||series.filter(p=>p.date<=today()).at(-1)||series.at(-1);selectedDate=selected.date;
 const btcPoint=data.spot?.points.find(p=>p.date===selectedDate)||(data.spot?.rolling.to.slice(0,10)===selectedDate?{close:data.spot.rolling.close,intraday:true}:null),toggle=(key,inner)=>'<button type="button" class="chart-series" data-m2-series="'+key+'" aria-pressed="'+!m2Hidden.has(key)+'">'+inner+'</button>',legend='<b>'+day(selectedDate,true)+'</b>'+toggle('sma','<i class="legend-sma"></i>SMA <b>'+nf.format(selected.sma)+'</b>')+toggle('m2','<i class="legend-m2"></i>M2 <b>'+nf.format(selected.value)+'</b>')+toggle('btc','<i class="legend-btc"></i>BTC <b>'+(btcPoint?cash(btcPoint.close)+(btcPoint.intraday?'*':''):'—')+'</b>')+toggle('regime','<i style="background:linear-gradient(90deg,#00bcd4,#e91e63)"></i>Arsiran')+toggle('cross','Cross')+'<span class="chart-hint">Scroll: zoom · seret: geser · klik ganda: reset</span>';
 body.innerHTML='<div class="m2-top"><section class="m2-plot-panel"><header><h3>Proyeksi M2 <small>· chart BTC · hari kalender</small></h3><button type="button" class="m2-offset-button" data-open-m2-settings>'+prefs.lag+' <span>hari</span> '+iconMarkup('tools')+'</button></header><div class="m2-legend">'+legend+'<span class="m2-state '+(selected.side>=0?'btc-positive':'btc-negative')+'">M2 '+(selected.side>=0?'di atas':'di bawah')+' SMA</span></div>'+chartM2()+'<p class="m2-projection-note">Garis M2/SMA digeser; area setelah hari ini bukan prediksi BTC. * BTC hari berjalan.</p></section><section class="m2-calendar-panel" aria-label="Kalender crossing M2">'+calendarM2()+'</section></div>';
 body.innerHTML+='<div class="m2-statistics">'+tile('Korelasi level M2 vs BTC',model.levelCorrelation===null?'—':nf.format(model.levelCorrelation))+tile('Pekan dengan arah sama',model.sameDirection===null?'—':Math.round(model.sameDirection)+'%')+tile('Korelasi perubahan 1 minggu',model.weeklyCorrelation===null?'—':nf.format(model.weeklyCorrelation))+'</div><div class="m2-statistic-notes"><span>Level pada tanggal selaras · '+model.aligned.length+' hari</span><span>'+model.weeks+' pekan tidak tumpang tindih</span><span>Jeda '+prefs.lag+' hari · sampel 1 tahun</span></div>';
 const max=Math.max(...Object.values(model.regimes).map(r=>Math.abs(r.return)),Math.abs(model.buyHold),1);
 body.innerHTML+='<section class="m2-regimes"><h3>Total pergerakan BTC, dikelompokkan menurut rezim SMA M2</h3>'+[['up','Saat SMA M2 naik'],['flat','Saat SMA M2 datar'],['down','Saat SMA M2 turun'],['hold','Buy & hold']].map(([key,label])=>{const row=key==='hold'?{return:model.buyHold,days:model.days}:model.regimes[key];return '<div class="m2-regime-row"><div><strong>'+label+'</strong><small>'+row.days+' hari</small></div><div class="m2-regime-track"><i></i><span class="m2-regime-bar '+key+'" style="width:'+Math.abs(row.return)/max*47+'%;'+(row.return<0?'right:50%':'left:50%')+'"></span></div><b class="'+tone(row.return)+'">'+pct(row.return)+'</b></div>'}).join('')+'</section>';
 body.innerHTML+='<details class="btc-history-disclosure" id="m2-cross-history"'+(historyOpen?' open':'')+'><summary>Riwayat Cross M2 <small>SMA '+prefs.sma+' · '+model.crosses.length+' crossing</small></summary>'+
  '<div class="btc-table-wrap m2-cross-table" role="region" aria-label="Tabel riwayat Cross M2" tabindex="0"><table><caption class="sr-only">Riwayat cross garis M2 × SMA '+prefs.sma+'</caption><thead><tr><th>Tanggal tampil / asal</th><th>Cross</th><th>Durasi</th><th>Jarak maks.</th><th>BTC 14 hari sebelum</th><th>BTC 14 hari sesudah</th><th>Searah?</th></tr></thead><tbody>'+model.crosses.slice().reverse().map(p=>'<tr class="'+(p.date===selectedDate?'m2-cross-selected':'')+'"><td><button type="button" data-m2-date="'+p.date+'">'+day(p.date,true)+'</button><small>Asal '+day(p.sourceDate)+(p.future?' · bergeser ke depan':'')+'</small></td><td class="'+(p.cross==='up'?'btc-positive':'btc-negative')+'">'+(p.cross==='up'?'▲ Naik':'▼ Turun')+'</td><td>'+p.bars+' hari</td><td>'+nf.format(p.maxGap)+'%</td><td class="'+tone(p.beforeReturn)+'">'+pct(p.beforeReturn)+'</td><td class="'+tone(p.afterReturn)+'">'+pct(p.afterReturn)+'</td><td>'+(p.agrees===null?'<span class="m2-pill">Belum lengkap</span>':'<span class="m2-pill '+(p.agrees?'yes':'no')+'">'+(p.agrees?'Ya':'Tidak')+'</span>')+'</td></tr>').join('')+'</tbody></table></div></details>';
 const archivedM2 = data.m2.delivery === 'snapshot';
 const componentSources = Object.values(data.m2.components).map((component) =>
  '<span>'+sourceLink(component.sourceUrl,component.label)+' · '+component.referenceMonth+
  (archivedM2 || component.delivery === 'snapshot' ? ' · Arsip' : '')+'</span>').join('');
 body.innerHTML+='<details class="btc-method m2-method"><summary>Sumber & metode · M2 '+day(data.m2.asOf,true)+' · proxy empat ekonomi</summary><p>AS + euro area + China + Jepang, dikonversi ke USD dengan kurs ECB. M2 bulanan ditahan antarobservasi; perubahan harian juga berasal dari kurs, bukan pengukuran uang baru setiap hari. Ini mencakup empat ekonomi, bukan seluruh dunia. Definisi nasional, seasonal adjustment dan basis stok/rata-rata berbeda.</p><p>Asumsi ketersediaan: M2 bulan t mulai dipakai pada tanggal 1 bulan t+2. Jeda pilihanmu '+prefs.lag+' hari diterapkan terpisah setelah itu. Data revisi terbaru, bukan vintage rilis historis; statistik di atas bersifat deskriptif dalam sampel dan bukan backtest tanpa lookahead. Korelasi level tidak membuktikan hubungan sebab-akibat.</p><p>Cross = perubahan tanda M2 − SMA. Durasi dihitung sampai cross berikutnya atau ujung data, sehingga baris terakhir masih berjalan. Jarak maks. = deviasi maksimum M2 terhadap SMA pada segmen tersebut. Rezim memakai perubahan SMA 7 hari; datar bila ±0,02%. Return BTC dikompaun per rezim pada tanggal yang lengkap, tanpa biaya transaksi. Return 14 hari sesudah ditahan bila belum lengkap.</p><div class="m2-source-list">'+componentSources+'<span>'+sourceLink(data.m2.fxSourceUrl,'Kurs ECB')+' · '+data.m2.asOf+(archivedM2?' · Arsip':'')+'</span></div><p data-m2-refresh-note hidden></p></details>';
 const refreshNote = body.querySelector('[data-m2-refresh-note]');
 refreshNote.textContent = archivedM2 ? 'Penyegaran gagal. Grafik memakai arsip sampai '+day(data.m2.asOf,true)+'.' : data.m2.refreshNote ?? '';
 refreshNote.hidden = !refreshNote.textContent;
 if(historyPosition){
  const history=$('m2-cross-history');
  const table=history.querySelector('.m2-cross-table');
  table.scrollLeft=historyPosition.left;
  table.scrollTop=historyPosition.top;
  body.scrollTop=historyPosition.body;
  if(historyFocus){
   const button=historyFocus.dataset.m2Date?history.querySelector('[data-m2-date="'+historyFocus.dataset.m2Date+'"]'):null;
   (button??(historyFocus===oldTable?table:history.querySelector('summary'))).focus({preventScroll:true});
  }
 }
}
function renderDialog(){if(active==='btc-flow')renderFlow();else if(active==='btc-volume')renderVolume();else renderM2()}
function openDetail(kind,button){active=kind;trigger=button;historyLimit=30;if(kind==='btc-volume')turnoverChartViews.clear();dialog.classList.toggle('m2-detail',kind==='btc-m2');dialog.classList.toggle('btc-turnover-detail',kind==='btc-volume');$('btc-detail-title').textContent=kind==='btc-flow'?'ETF / Spot flow':kind==='btc-volume'?'Nilai transaksi BTC':'Global M2';$('btc-detail-eyebrow').textContent=kind==='btc-m2'?'LIKUIDITAS · BTC':kind==='btc-volume'?'BITCOIN · MOMENTUM':'BITCOIN · DATA PASAR';renderDialog();dialog.showModal();if(kind==='btc-volume')body.scrollTop=0;document.body.classList.add('metric-modal-open')}
let settingsTrigger;
function openSettings(button){settingsTrigger=button;$('m2-lag').value=prefs.lag;$('m2-lag-range').value=prefs.lag;$('m2-sma').value=prefs.sma;settings.showModal()}
host.addEventListener('click',event=>{
 const action=event.target.closest('[data-btc-action]');
 if(action){openSettings(action);return}
 const button=event.target.closest('[data-btc-open]');
 if(button)openDetail(button.dataset.btcOpen,button);
});
for(const target of [dialog,settings]){target.querySelector('.btc-close').addEventListener('click',()=>target.close());target.addEventListener('click',event=>{if(event.target!==target)return;const r=target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)target.close()})}
dialog.addEventListener('close',()=>{document.body.classList.remove('metric-modal-open');trigger?.focus()});settings.addEventListener('close',()=>settingsTrigger?.isConnected&&settingsTrigger.focus());
$('m2-lag-range').addEventListener('input',e=>$('m2-lag').value=e.target.value);$('m2-lag').addEventListener('input',e=>$('m2-lag-range').value=e.target.value);
$('m2-settings-form').addEventListener('submit',event=>{event.preventDefault();if(!event.target.reportValidity())return;prefs={lag:Number($('m2-lag').value),sma:Number($('m2-sma').value)};try{localStorage.setItem('market-deck:m2-settings',JSON.stringify(prefs))}catch{}selectedDate=null;drawCards();if(dialog.open&&active==='btc-m2')renderM2();settings.close()});
function redrawM2Chart(){const svg=$('m2-chart-svg');if(svg&&model)svg.outerHTML=chartM2()}
attachChartZoom(body,'#m2-chart-svg',{plot:{left:47,width:617,total:720},onZoom(anchor,factor){m2View=zoomWindow(m2View,m2Bounds,anchor,factor,14*DAY_MS);redrawM2Chart()},onPan(shift){m2View=panWindow(m2View,m2Bounds,shift);redrawM2Chart()},onReset(){m2View=null;redrawM2Chart()}});
body.addEventListener('click',event=>{
 const series=event.target.closest('[data-m2-series]');if(series){m2Hidden.toggle(series.dataset.m2Series);series.setAttribute('aria-pressed',String(!m2Hidden.has(series.dataset.m2Series)));redrawM2Chart();return}
 const period=event.target.closest('[data-flow-period]'),date=event.target.closest('[data-m2-date]'),month=event.target.closest('[data-month-step]');
 if(period){flowPeriod=period.dataset.flowPeriod;historyLimit=30;renderFlow()}else if(event.target.closest('[data-btc-more]')){historyLimit+=30;renderFlow()}else if(event.target.closest('[data-open-m2-settings]'))openSettings(event.target.closest('button'));else if(date){selectedDate=date.dataset.m2Date;calendarMonth=selectedDate.slice(0,7);renderM2()}else if(month){const d=new Date(calendarMonth+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(month.dataset.monthStep));calendarMonth=d.toISOString().slice(0,7);renderM2()}
});
body.addEventListener('change',event=>{if(event.target.id==='m2-calendar-month'&&/^\d{4}-\d{2}$/.test(event.target.value)){calendarMonth=event.target.value;renderM2()}});
body.addEventListener('keydown',event=>{if(event.target.id!=='m2-chart-svg'||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();selectedDate=shiftDay(selectedDate,event.key==='ArrowLeft'?-1:1);calendarMonth=selectedDate.slice(0,7);renderM2();$('m2-chart-svg')?.focus()});
async function loadSource(key,url){
 if(pending.has(key))return;
 pending.add(key);
 try{
  const response=await fetch(url);
  if(!response.ok)throw new Error();
  const result=await response.json();
  if(result.schema!==1||!result.points?.length)throw new Error();
  data[key]=result;
  failed.delete(key);
 }catch{failed.add(key)}
 finally{pending.delete(key)}
 const turnoverSource=key==='spot'||key==='perpetual';
 if(turnoverSource){
  const now=Date.now();
  turnoverModels=Object.fromEntries(Object.keys(turnoverLabels).map(market=>[market,buildBtcTurnover(data,market,now)]));
 }
 drawCards();
 if(key==='m2'&&failed.has(key)&&!data.m2){
  const date=host.querySelector('[data-metric="btc-m2"] .metric-date');
  if(date)date.textContent='Sumber belum tersedia';
 }
 if(dialog.open&&(active==='btc-volume'?turnoverSource||key==='etfTurnover':key!=='perpetual'&&key!=='etfTurnover'))renderDialog();
}
function load(){
 if(host.dataset.market!=='bitcoin')return;
 drawCards();
 for(const [key,url] of Object.entries({spot:'/api/btc-spot',perpetual:'/api/btc-perpetual',etf:'/api/btc-etf',etfTurnover:'/api/btc-etf-turnover',m2:'/api/btc-m2'}))loadSource(key,url);
}
document.addEventListener('market-deck:market',load);setInterval(load,60000);load();

import {aggregateMetricHistory,vixContext,historyCsv} from './metric-history-data.mjs';
import {barLayout} from './market-stats-data.mjs';
import {appendIcon} from './ui-icons.mjs';
const $=id=>document.getElementById(id),num=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),integer=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0});
const date=value=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
const shortDate=value=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
const cash=value=>{const a=Math.abs(value),base=a>=1e12?1e12:a>=1e9?1e9:a>=1e6?1e6:1,suffix=a>=1e12?' T':a>=1e9?' M':a>=1e6?' jt':'';return num.format(value/base)+suffix};
const svgNode=(tag,attributes={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);return el};
function periodLabel(group,period){return period==='monthly'?new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(group.key+'-01T00:00:00Z')):group.from===group.to?date(group.from):shortDate(group.from)+' – '+date(group.to)}
function tile(label,value,tone){const el=document.createElement('div'),name=document.createElement('span'),reading=document.createElement('strong');name.textContent=label;reading.textContent=value;if(tone)reading.className=tone;el.append(name,reading);return el}
export function createMetricDetails(getData,getError=()=>false){
 const dialog=$('metric-detail-dialog');let active=null,period='weekly',page=0,groups=[],dataset,trigger,context;
 const names={'foreign-net':'Net asing',turnover:'Nilai transaksi',vix:'VIX', 'btc-price':'BTC / USD','btc-volume':'Volume BTC','btc-dominance':'Dominasi BTC','eth-btc':'ETH / BTC'};
 function close(){dialog.close()}
 $('close-metric-detail').addEventListener('click',close);
 dialog.addEventListener('close',()=>{document.body.classList.remove('metric-modal-open');if(trigger?.isConnected)trigger.focus()});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()});
 function chart(){
  const host=$('metric-history-chart');host.replaceChildren();
  const width=Math.max(280,Math.round(host.clientWidth||720)),height=162,left=38,right=12,top=12,bottom=25,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':names[active]+' per '+({daily:'hari',weekly:'minggu',monthly:'bulan'}[period])+', '+groups.length+' periode pada rentang data tersedia'});
  const values=groups.map(group=>active==='vix'?group.close:active==='foreign-net'?group.netForeign:group.totalValue);
  const axisLabel=(text,x,y,anchor='start')=>{const label=svgNode('text',{x,y,'text-anchor':anchor});label.textContent=text;svg.append(label)};
  if(active==='vix'){
   const minimum=Math.min(...values),maximum=Math.max(...values),span=maximum-minimum||1;
   const xy=values.map((value,index)=>(left+index/Math.max(1,values.length-1)*plotWidth).toFixed(2)+','+(top+(maximum-value)/span*plotHeight).toFixed(2)).join(' ');
   for(const y of [top,top+plotHeight/2,top+plotHeight])svg.append(svgNode('line',{x1:left,x2:width-right,y1:y,y2:y,stroke:'#292929','stroke-width':.7}));
   svg.append(svgNode('polyline',{points:xy,fill:'none',stroke:'#00bcd4','stroke-width':1.4,'vector-effect':'non-scaling-stroke'}));axisLabel(num.format(maximum),2,top+4);axisLabel(num.format(minimum),2,top+plotHeight);
  }else{
   const layout=barLayout(values,active==='foreign-net',plotWidth,plotHeight);
   svg.append(svgNode('line',{x1:left,x2:width-right,y1:top+layout.zero,y2:top+layout.zero,stroke:'#555555','stroke-width':.7}));axisLabel('0',left-9,top+layout.zero+3,'end');
   layout.bars.forEach((bar,index)=>{
    const slot=plotWidth/values.length,barWidth=Math.min(28,bar.width),rect=svgNode('rect',{x:left+index*slot+(slot-barWidth)/2,y:top+bar.y,width:barWidth,height:bar.height,fill:bar.positive?'#00bcd4':'#e91e63','data-value':values[index]});
    const title=svgNode('title');title.textContent=periodLabel(groups[index],period)+' · Rp '+integer.format(values[index]);rect.append(title);svg.append(rect);
   });
  }
  const indices=[...new Set([0,Math.floor((groups.length-1)/2),groups.length-1])];
  const spansYears=groups[0].from.slice(0,4)!==groups.at(-1).to.slice(0,4);
  indices.forEach(index=>axisLabel(period==='monthly'?periodLabel(groups[index],period):spansYears?date(groups[index].to):shortDate(groups[index].to),active==='vix'?left+index/Math.max(1,groups.length-1)*plotWidth:left+(index+.5)/groups.length*plotWidth,height-3,active==='vix'?(index===0?'start':index===groups.length-1?'end':'middle'):'middle'));
  host.append(svg);
 }
 function table(){
  const table=$('metric-history-table'),head=table.querySelector('thead'),body=table.querySelector('tbody');head.replaceChildren();body.replaceChildren();
  const headers=active==='foreign-net'?['Periode','Net (Rp)','Beli asing (Rp)','Jual asing (Rp)','Sesi']:active==='turnover'?['Periode','Nilai transaksi (Rp)','Rata-rata / sesi (Rp)','Sesi']:['Periode','Close','Open','High','Low','Sesi'];
  const header=document.createElement('tr');headers.forEach(text=>{const th=document.createElement('th');th.scope='col';th.textContent=text;header.append(th)});head.append(header);
  const totalPages=Math.max(1,Math.ceil(groups.length/20));page=Math.min(page,totalPages-1);const newest=groups.slice().reverse(),visible=newest.slice(page*20,page*20+20);
  visible.forEach(group=>{
   const row=document.createElement('tr');row.dataset.from=group.from;row.dataset.to=group.to;
   const fields=active==='foreign-net'?['netForeign','foreignBuy','foreignSell','sessions']:active==='turnover'?['totalValue','averageValue','sessions']:['close','open','high','low','sessions'];
   const name=document.createElement('td');name.textContent=periodLabel(group,period);row.append(name);
   fields.forEach(field=>{const cell=document.createElement('td'),value=group[field];cell.textContent=field==='sessions'?integer.format(value):active==='vix'?num.format(value):cash(value);if(active!=='vix'&&field!=='sessions')cell.title='Rp '+integer.format(value);if(field==='netForeign'){cell.className=value>=0?'metric-positive':'metric-negative';if(value>0)cell.textContent='+'+cell.textContent}row.append(cell)});body.append(row);
  });
  $('metric-history-caption').textContent='Riwayat '+names[active]+' '+({daily:'harian',weekly:'mingguan',monthly:'bulanan'}[period]);
  $('metric-history-count').textContent=groups.length+' periode · '+dataset.points.length+' sesi tersedia';$('metric-history-page').textContent=(page+1)+' / '+totalPages;
  $('history-prev').disabled=page===0;$('history-next').disabled=page>=totalPages-1;
 }
 function render(){
  $('metric-detail-title').textContent=names[active]||context?.title||'Detail';
  dataset=getData(active);const isActual=['foreign-net','turnover','vix'].includes(active);
  for(const id of ['metric-detail-tools','metric-history-chart','metric-history-scroll','metric-history-pagination'])$(id).hidden=!isActual||!dataset;
  $('metric-detail-summary').replaceChildren();$('metric-detail-source').replaceChildren();$('metric-history-note').textContent='';
  if(!dataset){const failed=getError(active);$('metric-detail-eyebrow').textContent=failed?'DATA BELUM TERSEDIA':'MEMUAT DATA';$('metric-detail-coverage').textContent=failed?'Sumber riwayat belum dapat dimuat. Coba buka kembali setelah koneksi pulih.':'Memuat riwayat '+names[active].toLowerCase()+'…';return}
  groups=aggregateMetricHistory(dataset.points,active,period);
  if(!groups.length){$('metric-detail-coverage').textContent='Riwayat belum tersedia.';return}
  const first=dataset.points[0].date,last=dataset.asOf;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),archive=(Date.parse(today)-Date.parse(last))/86400000>3;
  const estimate=active==='foreign-net'&&dataset.method==='estimate';
  $('metric-detail-eyebrow').textContent=active==='vix'?'VOLATILITAS GLOBAL':estimate?'RINGKASAN SAHAM BEI · ESTIMASI RUPIAH':'RIWAYAT BEI · RUPIAH';
  $('metric-detail-coverage').textContent=estimate?'Seluruh saham · pasar reguler · '+date(first)+' – '+date(last)+' · '+dataset.points.length+' sesi':(active==='foreign-net'?'Riwayat BEI · ':'')+date(first)+' – '+date(last)+' · '+dataset.points.length+' sesi · '+(active==='vix'?'Penutupan AS (EOD)':archive?'Arsip laporan BEI':'Laporan BEI (EOD)');
  const latest=groups.at(-1),unitPeriod={daily:'sesi',weekly:'pekan',monthly:'bulan'}[period];
  if(active==='foreign-net')$('metric-detail-summary').append(tile('Net '+unitPeriod+(estimate?' (estimasi)':' arsip BEI'),cash(latest.netForeign),latest.netForeign>=0?'metric-positive':'metric-negative'),tile(estimate?'Beli asing (est.)':'Beli asing (arsip)',cash(latest.foreignBuy)),tile(estimate?'Jual asing (est.)':'Jual asing (arsip)',cash(latest.foreignSell)));
  else if(active==='turnover')$('metric-detail-summary').append(tile('Nilai '+unitPeriod+' terakhir',cash(latest.totalValue)),tile('Rata-rata / sesi',cash(latest.averageValue)),tile('Jumlah sesi',String(latest.sessions)));
  else{const vix=vixContext(dataset.points);$('metric-detail-summary').append(tile('VIX penutupan',num.format(vix.last.close)),tile('Rata-rata 20 sesi',num.format(vix.average20)),tile('Persentil '+vix.rankSessions+' sesi',num.format(vix.percentile)))}
  document.querySelectorAll('[data-history-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.historyPeriod===period)));
  chart();table();
  $('metric-history-note').textContent=active==='vix'?'VIX mengukur ekspektasi volatilitas S&P 500 selama 30 hari, disetahunkan. Gunakan sebagai konteks risiko global untuk IHSG. Riwayat mingguan/bulanan memakai OHLC periode, bukan penjumlahan VIX.':active==='foreign-net'?'Net buy di atas nol; net sell di bawah nol. Beli, jual, dan net dijumlahkan dari seluruh sesi yang tersedia dalam tiap periode.':'Nilai transaksi dijumlahkan per periode; rata-rata dihitung per sesi bursa yang tersedia.';
  const source=document.createElement('a');source.href=dataset.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent=active==='vix'?'Sumber Cboe':'Sumber Bursa Efek Indonesia';
  $('metric-detail-source').append(source,active==='vix'?' · Poin indeks; data penutupan harian. Persentil membandingkan penutupan terakhir dengan maksimal 252 sesi tersedia.':active==='turnover'?' · Nilai = Σ Value (reguler) + Σ NonRegularValue, setiap saham dihitung sekali. Riwayat lama bersumber dari matriks investor BEI dengan cakupan yang sama. Bulan berjalan hanya menjumlah sesi yang tersedia; sesi kosong tidak diisi nol. '+(dataset.missingDates?.length?'Ada tanggal yang belum berhasil dimuat. ':'')+'Sumber diakses '+date(dataset.generatedAt.slice(0,10))+'.':estimate?' · '+'Net asing BEI dihitung dari ringkasan saham harian seluruh saham. BEI menerbitkan beli/jual asing sebagai volume, sehingga nilai rupiah diestimasi dengan volume × harga rata-rata (VWAP) pasar reguler tiap saham. Uji 12 Nov 2026: +508,9 M vs +510,5 M yang dilaporkan untuk pasar reguler. Angka seluruh pasar (termasuk negosiasi) bisa berbeda. '+'Periode pada tepi cakupan dapat parsial. ':' · Seluruh pasar saham, satuan rupiah. Periode pada tepi cakupan dapat parsial. '+(archive?'Riwayat BEI terbaru belum tersambung. ':'')+'Seluruh riwayat yang tersambung ditampilkan tanpa mengisi sesi kosong.');
 }
 document.querySelectorAll('[data-history-period]').forEach(button=>button.addEventListener('click',()=>{period=button.dataset.historyPeriod;page=0;render()}));
 $('history-prev').addEventListener('click',()=>{if(page>0){page--;table()}});$('history-next').addEventListener('click',()=>{if((page+1)*20<groups.length){page++;table()}});
 $('download-metric-csv').addEventListener('click',()=>{if(!groups.length||!dataset)return;const url=URL.createObjectURL(new Blob([historyCsv(groups,active)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=active+'-'+period+'-'+dataset.asOf+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
 return {open(key,button,card){active=key;period=key==='vix'?'daily':'weekly';page=0;trigger=button;context={title:card.querySelector('.snapshot-label')?.textContent.replace('DEMO','').trim(),value:card.querySelector('.snapshot-main strong')?.textContent.trim()};render();dialog.showModal();document.body.classList.add('metric-modal-open');if(dataset&&groups.length&&['foreign-net','turnover','vix'].includes(active))chart()},refresh(){if(dialog.open)render()}};
}

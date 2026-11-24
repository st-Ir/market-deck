import {flashValue} from '../client/flash.mjs';
import {mountMarketChart} from '../client/market-chart.mjs';

const $=selector=>document.querySelector(selector);
function updateClock(){$('#local-time').textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace('.',':')+' WIB'}
updateClock();setInterval(updateClock,30000);
// One chart viewport with a market selector.
const markets={
 ihsg:{symbol:'IDX:COMPOSITE',name:'IHSG',exchange:'IDX',description:'Indonesia Composite Index'},
 bitcoin:{symbol:'BITSTAMP:BTCUSD',name:'Bitcoin',exchange:'BTC',description:'BTC / USD · Bitstamp'}
};
const chart={card:$('#chart-card'),container:$('#tradingview-chart'),button:$('#expand-chart'),...markets.ihsg};
let activeMarket='ihsg';
// Summary cards retain their own data source and disclosure.
const marketPanels={
 ihsg:{
  stats:[
   {label:'NET ASING',metric:'foreign-net'},
   {label:'NILAI TRANSAKSI',metric:'turnover'},
   {label:'EIDO',metric:'eido'},
   {label:'USD / IDR',metric:'usd-idr'}
  ],
 },
 bitcoin:{
  stats:[
   {label:'ETF / SPOT FLOW',metric:'btc-flow'},
   {label:'NILAI TRANSAKSI BTC',metric:'btc-volume'},
   {label:'GLOBAL M2',metric:'btc-m2'},
   {label:'POSISI PERPETUAL BTC',metric:'perpetual-position'}
  ],
 }
};
function snapshotCard(item){
 if(item.metric==='perpetual-position')return `<article class="snapshot-stat metric-stat btc-stat" data-metric="perpetual-position">
  <button class="metric-open" type="button" data-position-open aria-label="Buka detail Posisi Perpetual BTC" aria-haspopup="dialog" aria-controls="btc-position-dialog"></button>
  <div class="snapshot-label"><span>${item.label}</span><span class="position-funding-label">Funding</span></div>
  <div class="snapshot-main">
    <strong class="metric-value" aria-label="Funding rate belum tersedia">—</strong>
    <span class="snapshot-change metric-delta"><b class="position-oi-change">—</b> <small>OI 24J</small></span>
  </div>
  <p class="metric-date">Memuat sumber…</p>
  <svg class="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" hidden><path /></svg>
 </article>`;
 if(item.metric?.startsWith('btc-')){
  const accessory=item.metric==='btc-volume'
   ?'<span class="btc-volume-period">24J</span>'
   :item.metric==='btc-m2'
    ?'<button class="metric-period" data-btc-action="m2-settings" type="button" aria-label="Atur jeda dan SMA Global M2"><svg class="ui-icon"><use href="#i-tools"/></svg><span data-lag-label>78 hari</span></button>'
    :'<svg aria-hidden="true"><use href="#i-market"/></svg>';
  return `<article class="snapshot-stat metric-stat btc-stat" data-metric="${item.metric}"><button class="metric-open" type="button" data-btc-open="${item.metric}" aria-label="Buka detail ${item.label.toLowerCase()}" aria-haspopup="dialog" aria-controls="btc-detail-dialog"></button><div class="snapshot-label"><span>${item.label}</span>${accessory}</div><div class="snapshot-main"><strong class="metric-value">—</strong><span class="snapshot-change metric-delta">—</span></div><p class="metric-date">Memuat sumber…</p><svg class="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>`;
 }
 if(item.metric==='eido')return `<article class="snapshot-stat metric-stat" data-metric="eido"><button class="metric-open" type="button" data-eido-open aria-label="Buka ringkasan pergerakan EIDO" aria-haspopup="dialog" aria-controls="eido-dialog"></button><div class="snapshot-label">EIDO<svg aria-hidden="true"><use href="#i-globe"/></svg></div><div class="snapshot-main"><strong class="metric-value">—</strong><span class="snapshot-change metric-delta">— <small>Δ1H</small></span></div><p class="metric-date">Memuat EIDO…</p><svg class="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>`;
 if(item.metric==='usd-idr')return `<article class="snapshot-stat metric-stat fx-stat" data-metric="usd-idr"><button class="metric-open" type="button" data-fx-open aria-label="Buka perbandingan USD/IDR dan IHSG" aria-haspopup="dialog" aria-controls="fx-ihsg-dialog"></button><div class="snapshot-label"><span>USD / IDR</span><svg aria-hidden="true"><use href="#i-switch"/></svg></div><div class="snapshot-main"><strong class="metric-value">—</strong><span class="snapshot-change metric-delta">— <small>Δ1H</small></span></div><p class="metric-date">Memuat kurs…</p><svg class="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>`;
 const open=`<button class="metric-open" type="button" data-open-metric="${item.metric}" aria-label="Buka detail ${item.label.toLowerCase()}" aria-haspopup="dialog" aria-controls="metric-detail-dialog"></button>`;
 if(item.metric)return `<article class="snapshot-stat metric-stat" data-metric="${item.metric}">${open}<div class="snapshot-label"><span>${item.label}</span>${['foreign-net','turnover'].includes(item.metric)?'<button class="metric-period" id="'+(item.metric==='turnover'?'turnover-period':'flow-period')+'" type="button" aria-label="'+(item.metric==='turnover'?'Ubah nilai transaksi ke bulan ini':'Ubah net asing ke mingguan')+'">Harian <svg class="ui-icon" aria-hidden="true"><use href="#i-switch"/></svg></button>':'<svg aria-hidden="true"><use href="#i-market"/></svg>'}</div><div class="snapshot-main"><strong class="metric-value">—</strong><span class="snapshot-change metric-delta" title="${item.metric==='vix'?'Perubahan penutupan harian':'Perubahan terhadap 20 sesi bursa sebelumnya'}">— <small>${item.metric==='vix'?'Δ1H':'Δ20H'}</small></span></div><p class="metric-date">Memuat ${item.metric==='vix'?'VIX':'data BEI'}…</p><svg class="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>`;
}
function renderMarketPanels(market){
 const panel=marketPanels[market];const snapshot=$('#market-snapshot');
 snapshot.setAttribute('aria-label','Ringkasan '+markets[market].name);snapshot.dataset.market=market;
 snapshot.innerHTML=panel.stats.map(snapshotCard).join('');

}
// The side panel tracks market context, with provider quotes instead of sample prices.
const crossAssets={
 // IHSG: five commodities, then daily macro readings (client/macro-watch.mjs).
 // USD/IDR has its own snapshot card, so it is not repeated here.
 ihsg:{intro:'Batu bara, CPO, Brent, nikel, emas, lalu yield SBN 10Y dan spread-nya.',items:[
  {symbol:'coal',label:'Batu bara',detail:'Referensi CFD · USD/ton · harian',channel:'Ekspor energi',external:true,quote:'coal'},
  {symbol:'cpo',label:'CPO',detail:'Referensi CFD · MYR/ton · harian',channel:'Ekspor sawit',external:true,quote:'cpo'},
  {symbol:'brent',label:'Brent',detail:'Referensi CFD · USD/barel · harian',channel:'Energi & inflasi',external:true,quote:'brent'},
  {symbol:'nickel',label:'Nikel',detail:'Referensi CFD · USD/ton · harian',channel:'Ekspor mineral',external:true,quote:'nickel'},
  {symbol:'gold',label:'Emas',detail:'Referensi CFD · USD/troy oz · harian',channel:'Aset aman',external:true,quote:'gold'}
 ]},
 bitcoin:{intro:'DXY, US 10Y, Nasdaq 100, emas, dan Brent.',items:[
  {symbol:'CAPITALCOM:DXY',label:'DXY',detail:'Dolar AS CFD · Capital.com · poin',channel:'Kondisi dolar'},
  {symbol:'TVC:US10Y',label:'US 10Y',detail:'Yield Treasury 10 tahun · %',channel:'Yield & diskonto',external:true,treasury:true},
  {symbol:'FOREXCOM:NAS100',label:'Nasdaq 100',detail:'US 100 CFD · poin',channel:'Risk appetite'},
  {symbol:'OANDA:XAUUSD',label:'Emas',detail:'Spot · USD/troy oz',channel:'Pembanding nilai'},
  {symbol:'TVC:UKOIL',label:'Brent',detail:'Minyak CFD · USD/barel',channel:'Energi & inflasi'}
 ]}
};
let quotesPromise;
function loadQuotesScript(){
 if(customElements.get('tv-tickers'))return Promise.resolve();
 if(quotesPromise)return quotesPromise;
 quotesPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.type='module';script.src='https://widgets.tradingview-widget.com/w/id/tv-tickers.js';
  script.onload=()=>customElements.whenDefined('tv-tickers').then(resolve);
  script.onerror=()=>{script.remove();quotesPromise=null;reject(new Error('Harga tidak dapat dimuat'))};
  document.head.appendChild(script);
 });return quotesPromise;
}
let commodityData,commodityLoading=false;
function drawCommodityQuotes(){
 for(const [kind,quote] of Object.entries(commodityData?.quotes||{})){
  const label=document.querySelector('[data-commodity="'+kind+'"]'),date=document.querySelector('[data-commodity-date="'+kind+'"]');if(!label||!date)continue;
  const number=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),value=document.createElement('strong'),change=document.createElement('span');value.textContent=number.format(quote.value);change.textContent=quote.changePercent===null?'':(quote.changePercent>0?'+':'')+number.format(quote.changePercent)+'%';change.style.color=quote.changePercent<0?'var(--pink)':'var(--cyan)';label.replaceChildren(value,change);flashValue(label,quote.value);
  const stamp=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(quote.asOf+'T00:00:00Z'));date.textContent=quote.sourceShort==='TV'?'TV · '+(quote.delayMinutes?'tunda '+quote.delayMinutes+' mnt':'live'):(label.closest('.commodity-row')?'TE · ':'Trading Economics · ')+stamp;date.title=quote.sourceShort==='TV'?(quote.instrument||quote.symbol)+' · '+quote.unit+' · TradingView'+(quote.delayMinutes?' · tertunda '+quote.delayMinutes+' menit sesuai bursa':' · realtime'):'Referensi CFD '+quote.unit+' · harian · tanggal harga '+quote.asOf;
  const tile=label.closest('a');tile.setAttribute('aria-label',quote.label+' '+number.format(quote.value)+' '+quote.unit+', buka sumber.');if(quote.sourceUrl)tile.href=quote.sourceUrl;
 }
}
async function loadCommodityQuotes(){
 drawCommodityQuotes();if(commodityLoading)return;commodityLoading=true;
 try{const response=await fetch('/api/context-prices');if(!response.ok)throw new Error();const result=await response.json();if(result.schema!==1||!result.quotes)throw new Error();commodityData=result;drawCommodityQuotes()}
 catch{if(!commodityData)document.querySelectorAll('[data-commodity-date]').forEach(el=>el.textContent='Sumber belum tersedia')}
 finally{commodityLoading=false}
}
setInterval(()=>{if(activeMarket==='ihsg')loadCommodityQuotes()},30000);
const COMMODITY_PAGES={coal:'coal',cpo:'palm-oil',brent:'brent-crude-oil',nickel:'nickel',gold:'gold'};
function assetUrl(item){return item.quote?'https://tradingeconomics.com/commodity/'+COMMODITY_PAGES[item.quote]:'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(item.symbol)}
let watchlistGeneration=0;
function treasuryCardMarkup(){return `<button class="source-asset treasury-quote-card" type="button" data-open-us10y aria-label="Buka grafik US 10Y dan kurva yield Treasury" aria-haspopup="dialog" aria-controls="treasury-dialog"><span class="source-asset-title"><strong>US 10Y</strong><svg class="ui-icon" aria-hidden="true"><use href="#i-market"/></svg></span><span class="treasury-card-reading"><strong data-us10y-value>—</strong><span data-us10y-change>—</span></span><small data-us10y-stamp>Memuat yield…</small><svg class="treasury-card-spark" viewBox="0 0 130 28" aria-hidden="true"></svg></button>`}
async function renderWatchlist(market,announce=false){
 const generation=++watchlistGeneration;
 const context=crossAssets[market];const container=$('#cross-asset-list');
 const external=context.items.filter(item=>item.external);const quoted=context.items.filter(item=>!item.external);
 $('#watchlist-market').textContent=markets[market].name;
 $('#watchlist-intro').textContent=context.intro;
 container.setAttribute('aria-label','Pantauan lintas aset untuk '+markets[market].name);
 const compact=!quoted.length;
 container.innerHTML=(external.length?`<div class="source-assets${compact?' commodity-row':''}">${external.map(item=>item.treasury?treasuryCardMarkup():`<a class="source-asset" href="${assetUrl(item)}" target="_blank" rel="noopener noreferrer" title="${item.detail}" aria-label="Lihat harga ${item.label} di sumber, tab baru"><span class="source-asset-title"><strong>${item.label}</strong><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h8v8M13 3 3 13"/></svg></span>${compact?'':`<small>${item.detail}</small>`}${item.quote?`<span class="commodity-reading" data-commodity="${item.quote}">—</span><span class="commodity-date" data-commodity-date="${item.quote}">Memuat harga…</span>`:'<span class="source-asset-access">Buka sumber</span>'}</a>`).join('')}</div>`:'')+(compact?'<div class="macro-watch" id="macro-watch"><p class="macro-watch-empty">Memuat indikator makro…</p></div>':`<div class="cross-asset-quotes"><div class="quotes-label"><span>HARGA · Δ%</span></div><div class="quotes-host" style="--rows:${quoted.length}"><span class="quote-loading" role="status">Memuat harga…</span><tv-tickers direction="vertical" symbols="${quoted.map(item=>item.symbol).join(',')}" item-size="compact" hide-chart hide-logo theme="dark" transparent aria-label="Harga pantauan ${markets[market].name}"></tv-tickers></div></div><details class="asset-context"><summary>Detail<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><dl>${context.items.map(item=>`<div><dt>${item.label}<small>${item.quote?'Trading Economics':item.symbol.split(':')[1]}</small></dt><dd>${item.channel}<small>${item.detail}</small></dd></div>`).join('')}</dl></details>`);
 document.dispatchEvent(new CustomEvent('market-deck:watchlist',{detail:{market}}));
 if(market==='ihsg')loadCommodityQuotes();
 if(announce)$('#watchlist-announcement').textContent='Pantauan pasar diperbarui untuk '+markets[market].name+'.';
 if(compact)return;
 const timer=setTimeout(()=>{if(generation===watchlistGeneration)container.querySelectorAll('.quote-loading').forEach(label=>label.textContent='Koneksi harga belum tersedia.')},20000);
 try{
  await loadQuotesScript();if(generation!==watchlistGeneration)return;
  clearTimeout(timer);container.querySelectorAll('.quote-loading').forEach(label=>label.remove());
 }catch(error){
  clearTimeout(timer);if(generation!==watchlistGeneration)return;
  const links=document.createElement('div');links.className='quote-fallbacks';
  quoted.forEach(item=>{
   const link=document.createElement('a');link.className='quote-fallback';link.href=assetUrl(item);link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.label+' · lihat harga';link.insertAdjacentHTML('beforeend',' <svg class="ui-icon"><use href="#i-external"/></svg>');links.appendChild(link);
  });container.querySelector('.quotes-host').replaceChildren(links);
 }
}
function updateExpandLabel(){
 const expanded=chart.card.classList.contains('expanded');
 const label=(expanded?'Kecilkan':'Perbesar')+' chart '+chart.name;
 chart.button.setAttribute('aria-label',label);chart.button.title=label;chart.button.setAttribute('aria-expanded',String(expanded));
}
function setExpanded(expanded){
 chart.card.classList.toggle('expanded',expanded);document.body.classList.toggle('no-scroll',expanded);updateExpandLabel();
 window.dispatchEvent(new Event('resize'));if(!expanded)chart.button.focus();
}
$('#toggle-chart-tools').addEventListener('click',()=>{
 const open=chart.card.classList.toggle('tools-open');const button=$('#toggle-chart-tools');
 button.setAttribute('aria-pressed',String(open));button.setAttribute('aria-label',open?'Sembunyikan alat chart':'Tampilkan alat chart');button.title=button.getAttribute('aria-label');
 window.dispatchEvent(new Event('resize'));
});
chart.button.addEventListener('click',()=>setExpanded(!chart.card.classList.contains('expanded')));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&chart.card.classList.contains('expanded'))setExpanded(false)});
document.querySelectorAll('[data-market]').forEach(button=>button.addEventListener('click',()=>{
 const market=button.dataset.market;if(market===activeMarket)return;
 activeMarket=market;Object.assign(chart,markets[market]);
 chart.card.dataset.symbol=chart.symbol;chart.card.setAttribute('aria-label','Chart TradingView '+chart.name);chart.container.setAttribute('aria-label','Grafik '+chart.name+' dari TradingView');
 document.querySelectorAll('[data-market]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 updateExpandLabel();loadChart(chart);renderWatchlist(market,true);renderMarketPanels(market);
 document.dispatchEvent(new CustomEvent('market-deck:market',{detail:{market}}));
}));
updateExpandLabel();
const chartViews=new Map();
// Use the same token payload as the official Web Component theme adapter.
const chartTheme={theme:'dark',transparent:false,tokens:{
 '--tv-widget-background-color':'#131313','--tv-widget-popup-background-color':'#131313',
 '--tv-widget-tooltip-background-color':'#202020','--tv-widget-text-color':'#f5f5f5',
 '--tv-widget-text-secondary-color':'#929292','--tv-widget-text-tertiary-color':'#666666',
 '--tv-widget-price-text-color':'#f5f5f5','--tv-widget-legend-text-color':'#f5f5f5',
 '--tv-widget-border-color':'#292929','--tv-widget-button-neutral-color':'#131313',
 '--tv-widget-button-quiet-color':'#131313','--tv-widget-hover-background-color':'#202020',
 '--tv-widget-button-neutral-color-hover':'#202020','--tv-widget-button-quiet-color-hover':'#202020',
 '--tv-widget-accent-color':'#00bcd4','--tv-widget-positive-color':'#00bcd4','--tv-widget-negative-color':'#e91e63'
}};
function themeChartFrame(frame){
 const url=new URL(frame.src);const config=JSON.parse(decodeURIComponent(url.hash.slice(1)));
 config.wcTheme=chartTheme;url.hash=encodeURIComponent(JSON.stringify(config));frame.src=url.href;
}
let widgetPromise;
function loadWidgetScript(){
 if(window.TradingView?.widget)return Promise.resolve();
 if(widgetPromise)return widgetPromise;
 widgetPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://s3.tradingview.com/tv.js';script.async=true;
  script.onload=()=>resolve();script.onerror=()=>{script.remove();widgetPromise=null;reject(new Error('TradingView tidak dapat dimuat'))};
  document.head.appendChild(script);
 });return widgetPromise;
}
function showChartFailure(chart){
 clearTimeout(chart.timer);chart.container.querySelector('.chart-loading')?.remove();
 if(chart.container.querySelector('.chart-failure'))return;
 const panel=document.createElement('div');panel.className='chart-failure';panel.setAttribute('role','status');
 panel.innerHTML='<strong>Chart '+chart.name+' belum dapat dimuat.</strong><p>Periksa koneksi atau izin pemblokir konten untuk TradingView, lalu coba muat kembali.</p><button type="button">Muat ulang chart</button>';
 panel.querySelector('button').addEventListener('click',()=>mountChart(chart));chart.container.appendChild(panel);
}
function loadChart(chart){
 // Keep each market's analysis in its own frame for the current page session.
 let view=chartViews.get(chart.symbol);
 if(!view){
  if(!chartViews.size)chart.container.replaceChildren();
  const host=document.createElement('div');host.className='chart-view';host.id='chart-view-'+activeMarket;
  chart.container.appendChild(host);
  view={container:host,symbol:chart.symbol,name:chart.name};chartViews.set(chart.symbol,view);
  mountChart(view);
 }
 chartViews.forEach(entry=>{entry.container.hidden=entry!==view});
 window.dispatchEvent(new Event('resize'));
}
async function mountChart(chart){
 const generation=chart.generation=(chart.generation||0)+1;
 clearTimeout(chart.timer);chart.observer?.disconnect();chart.widget?.remove?.();
 chart.container.innerHTML='<div class="chart-loading"><span class="loading-mark"></span><span>Memuat chart '+chart.name+'…</span></div><div class="chart-embed" id="'+chart.container.id+'-embed"></div>';
 // Both markets use the custom Lightweight Charts view (client/market-chart.mjs);
 // the TradingView embed only had end-of-day data for IDX.
 if(chart.symbol==='IDX:COMPOSITE'||chart.symbol==='BITSTAMP:BTCUSD'){mountMarketChart(chart.container,chart.symbol==='IDX:COMPOSITE'?'ihsg':'bitcoin');return}
 chart.timer=setTimeout(()=>showChartFailure(chart),35000);
 try{
  await loadWidgetScript();
  if(generation!==chart.generation)return;
  chart.observer=new MutationObserver(()=>{
   const frame=chart.container.querySelector('iframe');if(!frame)return;
   frame.title='Chart '+chart.name+' oleh TradingView';
   themeChartFrame(frame);
   frame.addEventListener('load',()=>{if(generation!==chart.generation)return;clearTimeout(chart.timer);chart.container.querySelector('.chart-loading')?.remove()},{once:true});
   chart.observer.disconnect();
  });chart.observer.observe(chart.container,{childList:true,subtree:true});
  chart.widget=new TradingView.widget({
   container_id:chart.container.id+'-embed',autosize:true,symbol:chart.symbol,interval:'D',range:'12M',timezone:'Asia/Jakarta',locale:'id',theme:'dark',style:'1',
   hide_top_toolbar:false,hide_side_toolbar:false,hide_legend:false,hide_volume:window.matchMedia('(max-width:600px)').matches,save_image:false,allow_symbol_change:false,withdateranges:false,details:false,calendar:false,hotlist:false,
   backgroundColor:'#131313',gridColor:'rgba(85,85,85,0.18)',
   disabled_features:['use_localstorage_for_settings'],
   overrides:{
    'mainSeriesProperties.minTick':'1,1,false','scalesProperties.fontSize':11,
    'paneProperties.legendProperties.showSeriesTitle':false,'paneProperties.legendProperties.showSeriesOHLC':false,
    'paneProperties.legendProperties.showBarChange':false,'paneProperties.legendProperties.showLastDayChange':false,
    'paneProperties.legendProperties.showVolume':false,'paneProperties.legendProperties.showStudyArguments':false,
    'paneProperties.legendProperties.showStudyValues':false,'paneProperties.legendProperties.showStudyTitles':true,
    'mainSeriesProperties.candleStyle.upColor':'#00BCD4','mainSeriesProperties.candleStyle.downColor':'#E91E63',
    'mainSeriesProperties.candleStyle.borderUpColor':'#00BCD4','mainSeriesProperties.candleStyle.borderDownColor':'#E91E63',
    'mainSeriesProperties.candleStyle.wickUpColor':'#00BCD4','mainSeriesProperties.candleStyle.wickDownColor':'#E91E63',
    'paneProperties.backgroundType':'solid','paneProperties.background':'#131313','scalesProperties.textColor':'#F5F5F5'
   },studies_overrides:{'volume.volume.color.0':'#E91E63','volume.volume.color.1':'#00BCD4'}
  });
 }catch(error){if(generation===chart.generation)showChartFailure(chart)}
}
loadChart(chart);

renderWatchlist(activeMarket);

renderMarketPanels(activeMarket);

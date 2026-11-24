import {normalizeSymbols} from './agenda-data.mjs';
const $=id=>document.getElementById(id),dialog=$('setup-dialog'),key='market-deck:trading-setups:v1';
const states={watch:'Pantau',ready:'Siap',archive:'Arsip'};
let items=[],storageReady=true,market='stocks',filter='all',editing=null,opener;
function feedback(text,error=false){$('trading-feedback').textContent=text;$('trading-feedback').dataset.error=String(error)}
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(saved)||saved.some(x=>!x||typeof x.id!=='string'||!['stocks','crypto'].includes(x.market)||typeof x.symbol!=='string'||!Object.hasOwn(states,x.state)||typeof x.note!=='string'))throw new Error();items=saved}catch{storageReady=false;feedback('Setup tersimpan belum dapat dibaca. Muat ulang setelah penyimpanan browser tersedia.',true)}
function save(next){try{if(!storageReady)throw new Error();localStorage.setItem(key,JSON.stringify(next));items=next;render();return true}catch{$('setup-error').textContent='Setup belum tersimpan. Penyimpanan browser tidak tersedia.';return false}}
function render(){
 $('setup-count').textContent=items.length;
 document.querySelectorAll('[data-setup-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.setupFilter===filter)));
 const host=$('setup-list');host.replaceChildren();const shown=items.filter(x=>filter==='all'||x.state===filter).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
 if(!shown.length){const empty=document.createElement('div');empty.className='setup-empty';empty.innerHTML='<svg aria-hidden="true"><use href="#t-note"/></svg><strong></strong><p></p>';empty.querySelector('strong').textContent=items.length?'Tidak ada setup di filter ini':'Belum ada setup';empty.querySelector('p').textContent='Tekan + untuk menyimpan simbol dan rencanamu.';host.append(empty)}
 for(const item of shown){const button=document.createElement('button');button.type='button';button.className='setup-item';button.dataset.setupId=item.id;button.setAttribute('aria-label','Edit setup '+item.symbol);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','setup-dialog');const top=document.createElement('div');top.className='setup-item-top';const symbol=document.createElement('strong');symbol.textContent=item.symbol;const state=document.createElement('span');state.className='setup-state';state.dataset.state=item.state;state.textContent=states[item.state];top.append(symbol,state);const scope=document.createElement('div');scope.className='setup-item-market';scope.textContent=item.market==='stocks'?'SAHAM · IDX':'KRIPTO';const note=document.createElement('p');note.textContent=item.note||'Belum ada catatan.';button.append(top,scope,note);host.append(button)}
}
function openSetup(button,item=null,symbol=''){
 opener=button;editing=item?.id||null;$('setup-dialog-title').textContent=item?'Edit setup':'Tambah setup';$('setup-market').value=item?.market||(symbol?'stocks':market);$('setup-symbol').value=item?.symbol||symbol;$('setup-state').value=item?.state||'watch';$('setup-note').value=item?.note||'';$('setup-error').textContent='';$('archive-setup').hidden=!item||item.state==='archive';updatePlaceholder();dialog.showModal();document.body.classList.add('setup-modal-open');$('setup-symbol').focus();
}
function updatePlaceholder(){$('setup-symbol').placeholder=$('setup-market').value==='stocks'?'BBCA':'BTCUSDT'}
$('add-setup').addEventListener('click',event=>openSetup(event.currentTarget));
$('setup-list').addEventListener('click',event=>{const button=event.target.closest('[data-setup-id]'),item=button&&items.find(x=>x.id===button.dataset.setupId);if(item)openSetup(button,item)});
document.querySelectorAll('[data-setup-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.setupFilter;render()}));
$('setup-market').addEventListener('change',updatePlaceholder);
$('setup-form').addEventListener('submit',event=>{
 event.preventDefault();const chosenMarket=$('setup-market').value,symbol=$('setup-symbol').value.trim().toUpperCase();
 if(chosenMarket==='stocks'?!/^[A-Z]{4}$/.test(symbol):!/^[A-Z0-9]{2,20}$/.test(symbol)){$('setup-error').textContent=chosenMarket==='stocks'?'Gunakan kode saham 4 huruf.':'Gunakan simbol atau pasangan kripto, misalnya BTCUSDT.';$('setup-symbol').focus();return}
 const next={id:editing||crypto.randomUUID(),market:chosenMarket,symbol,state:$('setup-state').value,note:$('setup-note').value.trim(),updatedAt:new Date().toISOString()};
 if(save(editing?items.map(x=>x.id===editing?next:x):[...items,next])){dialog.close();feedback('Setup '+symbol+' tersimpan.')}
});
$('archive-setup').addEventListener('click',()=>{if(!editing)return;const item=items.find(x=>x.id===editing);if(item&&save(items.map(x=>x.id===editing?{...x,state:'archive',updatedAt:new Date().toISOString()}:x))){dialog.close();feedback('Setup '+item.symbol+' dipindahkan ke arsip.')}});
for(const id of ['close-setup','cancel-setup'])$(id).addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{document.body.classList.remove('setup-modal-open');const target=editing?document.querySelector('[data-setup-id="'+CSS.escape(editing)+'"]'):opener;(target?.isConnected?target:$('add-setup')).focus()});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()});
function watchlist(){
 const host=$('trading-watchlist');host.replaceChildren();let symbols=[];try{symbols=normalizeSymbols(JSON.parse(localStorage.getItem('market-deck:personal-symbols:v1')||'{}').watchlist||[])}catch{}
 if(!symbols.length){const p=document.createElement('p');p.textContent='Belum ada saham di watchlist.';host.append(p)}
 for(const symbol of symbols){const b=document.createElement('button');b.type='button';b.className='watchlist-symbol';b.textContent=symbol;b.setAttribute('aria-label','Buat setup '+symbol);b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls','setup-dialog');b.addEventListener('click',()=>openSetup(b,null,symbol));host.append(b)}
}
window.addEventListener('storage',event=>{if(event.key==='market-deck:personal-symbols:v1')watchlist()});
let generation=0,observer,timer;
function showScreenerError(){const message=$('screener-message');message.hidden=false;message.innerHTML='<span>Screener belum dapat dimuat.</span><button type="button">Muat ulang</button>';message.querySelector('button').addEventListener('click',mountScreener)}
function mountScreener(){
 const current=++generation;clearTimeout(timer);observer?.disconnect();const host=$('screener-embed');host.replaceChildren();
 document.querySelectorAll('[data-screener-market]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.screenerMarket===market)));
 $('trading-screener').setAttribute('aria-label',market==='stocks'?'Screener saham Indonesia':'Screener kripto');$('screener-source').href=market==='stocks'?'https://www.tradingview.com/screener/':'https://www.tradingview.com/crypto-coins-screener/';
 const message=$('screener-message');message.innerHTML='<span class="loading-mark"></span><span>Memuat screener…</span>';message.hidden=false;
 const container=document.createElement('div');container.className='tradingview-widget-container';const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';container.append(widget);host.append(container);
 observer=new MutationObserver(()=>{const frame=host.querySelector('iframe');if(!frame)return;frame.title=market==='stocks'?'Screener saham Indonesia oleh TradingView':'Screener kripto oleh TradingView';frame.addEventListener('load',()=>{if(current!==generation)return;clearTimeout(timer);message.hidden=true},{once:true});observer.disconnect()});observer.observe(container,{subtree:true,childList:true});
 const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-screener.js';script.async=true;script.textContent=JSON.stringify({width:'100%',height:'100%',defaultColumn:'overview',...(market==='stocks'?{market:'indonesia',defaultScreen:'most_capitalized',showToolbar:true}:{screener_type:'crypto_mkt',displayCurrency:'USD'}),isTransparent:false,locale:'id',colorTheme:'dark'});script.onerror=()=>{if(current===generation){clearTimeout(timer);showScreenerError()}};container.append(script);timer=setTimeout(()=>{if(current===generation)showScreenerError()},25000);
}
document.querySelectorAll('[data-screener-market]').forEach(button=>button.addEventListener('click',()=>{if(market===button.dataset.screenerMarket)return;market=button.dataset.screenerMarket;mountScreener()}));
function clock(){$('trading-time').textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace('.',':')+' WIB'}
clock();setInterval(clock,30000);render();watchlist();mountScreener();

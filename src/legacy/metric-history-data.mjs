// Money flows and traded value add across sessions. VIX is an index: retain
// first open, extrema and last close instead of summing volatility readings.
export function aggregateMetricHistory(points,kind,period='daily'){
 if(!['foreign-net','turnover','vix'].includes(kind)||!['daily','weekly','monthly'].includes(period))throw new Error('Periode tidak dikenali');
 const rows=points.slice().sort((a,b)=>a.date.localeCompare(b.date)),groups=[],seen=new Set();
 for(const row of rows){
  if(seen.has(row.date))throw new Error('Tanggal duplikat');seen.add(row.date);
  const date=new Date(row.date+'T00:00:00Z');if(!Number.isFinite(date.getTime()))throw new Error('Tanggal tidak valid');
  const weekday=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-weekday);
  const key=period==='monthly'?row.date.slice(0,7):period==='weekly'?date.toISOString().slice(0,10):row.date;
  let group=groups.at(-1);if(group?.key!==key){group={key,from:row.date,to:row.date,sessions:0,foreignBuy:0,foreignSell:0,netForeign:0,totalValue:0,open:null,high:null,low:null,close:null};groups.push(group)}
  group.to=row.date;group.sessions++;
  if(kind==='vix'){
   if(!['open','high','low','close'].every(field=>Number.isFinite(row[field])&&row[field]>0))throw new Error('Data VIX tidak lengkap');
   if(group.open===null)group.open=row.open;group.high=group.high===null?row.high:Math.max(group.high,row.high);group.low=group.low===null?row.low:Math.min(group.low,row.low);group.close=row.close;
  }else if(kind==='foreign-net'){
   if(!['foreignBuy','foreignSell','netForeign'].every(field=>Number.isFinite(row[field])))throw new Error('Data rupiah tidak lengkap');
   for(const field of ['foreignBuy','foreignSell','netForeign'])group[field]+=row[field];
   // Market turnover only exists in the BEI archive; IndexAlpha rows cover 50 stocks.
   if(Number.isFinite(row.totalValue))group.totalValue+=row.totalValue;
  }else{
   if(!Number.isFinite(row.totalValue)||row.totalValue<0)throw new Error('Nilai transaksi tidak lengkap');group.totalValue+=row.totalValue;
  }
 }
 return groups.map((group,index)=>({...group,averageValue:group.totalValue/group.sessions,change:kind==='vix'&&index>0?(group.close/groups[index-1].close-1)*100:null}));
}
export function vixContext(points){
 if(!points.length)return null;
 const rows=points.slice().sort((a,b)=>a.date.localeCompare(b.date)),last=rows.at(-1),previous=rows.at(-2),window=rows.slice(-252),recent=rows.slice(-20);
 return {last,change:previous?(last.close/previous.close-1)*100:null,percentile:window.filter(row=>row.close<=last.close).length/window.length*100,rankSessions:window.length,average20:recent.reduce((sum,row)=>sum+row.close,0)/recent.length};
}
export function historyCsv(groups,kind){
 const keys=kind==='vix'?['from','to','sessions','open','high','low','close']:kind==='foreign-net'?['from','to','sessions','foreignBuy','foreignSell','netForeign']:['from','to','sessions','totalValue','averageValue'];
 return keys.join(',')+'\r\n'+groups.map(row=>keys.map(key=>row[key]).join(',')).join('\r\n');
}

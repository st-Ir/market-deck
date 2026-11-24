export const shiftDay=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function btcEtfIsRecent(date,now=Date.now()){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),age=(Date.parse(today)-Date.parse(date))/86400000;return Number.isFinite(age)&&age>=0&&age<=3}
export function btcFlowHistory(points,period='daily'){
 const groups=new Map();for(const point of points||[]){
  const date=point.date,day=new Date(date+'T00:00:00Z').getUTCDay(),key=period==='monthly'?date.slice(0,7):period==='weekly'?shiftDay(date,-((day+6)%7)):date;
  let group=groups.get(key);if(!group){group={key,from:date,to:date,net:0,buy:0,sell:0,sessions:0,funds:{}};groups.set(key,group)}
  group.to=date;group.net+=point.net;group.sessions++;group.buy+=point.buy||0;group.sell+=point.sell||0;for(const [f,value] of Object.entries(point.funds||{}))group.funds[f]=value===null||group.funds[f]===null?null:(group.funds[f]||0)+value;
 }return [...groups.values()];
}
export function btcFlowDelta(points){const latest=points?.at(-1),prior=points?.at(-21);return prior&&prior.net!==0?(latest.net-prior.net)/Math.abs(prior.net)*100:null}
export function pearson(a,b){
 if(a.length!==b.length||a.length<3)return null;const n=a.length,ma=a.reduce((s,v)=>s+v,0)/n,mb=b.reduce((s,v)=>s+v,0)/n;let ab=0,aa=0,bb=0;
 for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;ab+=x*y;aa+=x*x;bb+=y*y}return aa>0&&bb>0?Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb))):null;
}
export function m2Projection(points,{lag=78,sma=30}={}){
 lag=Math.max(0,Math.min(180,Math.round(lag)));sma=Math.max(5,Math.min(200,Math.round(sma)));let total=0,lastSide=0;
 return (points||[]).map((point,index)=>{
  total+=point.value;if(index>=sma)total-=points[index-sma].value;const average=index>=sma-1?total/sma:null,side=average===null?0:Math.sign(point.value-average);let cross=null;
  if(side&&lastSide&&side!==lastSide)cross=side>0?'up':'down';if(side)lastSide=side;
  return {...point,sourceDate:point.date,date:shiftDay(point.date,lag),sma:average,side,cross};
 });
}
export function m2Analysis(points,btcPoints,options={},today=new Date().toISOString().slice(0,10)){
 const projected=m2Projection(points,options),btc=new Map((btcPoints||[]).map(p=>[p.date,p.close])),m2=new Map(projected.map(p=>[p.date,p]));
 const end=btcPoints?.at(-1)?.date||today,start=shiftDay(end,-365),aligned=projected.filter(p=>p.date>=start&&p.date<=end&&btc.has(p.date)&&p.sma!==null);
 const price=aligned.map(p=>btc.get(p.date)),level=aligned.map(p=>p.value),weeks=[];
 for(let i=7;i<aligned.length;i+=7){if(Date.parse(aligned[i].date)-Date.parse(aligned[i-7].date)!==7*86400000)continue;weeks.push({m:aligned[i].value/aligned[i-7].value-1,b:price[i]/price[i-7]-1})}
 const weeklyCorrelation=pearson(weeks.map(p=>p.m),weeks.map(p=>p.b)),same=weeks.filter(p=>Math.sign(p.m)===Math.sign(p.b)).length;
 const regimes={up:{days:0,log:0},flat:{days:0,log:0},down:{days:0,log:0}},returns=[];
 for(const point of aligned){const previous=btc.get(shiftDay(point.date,-1)),oldSma=m2.get(shiftDay(point.date,-7))?.sma;if(!previous||!oldSma||!point.sma)continue;const slope=(point.sma/oldSma-1)*100,regime=slope>.02?'up':slope<-.02?'down':'flat',r=Math.log(btc.get(point.date)/previous);regimes[regime].days++;regimes[regime].log+=r;returns.push(r)}
 for(const value of Object.values(regimes))value.return=value.days?(Math.exp(value.log)-1)*100:null;
 const crosses=projected.filter(p=>p.cross&&p.date>=start).map(point=>{
  const index=projected.indexOf(point),next=projected.slice(index+1).find(p=>p.cross),segment=projected.slice(index,next?projected.indexOf(next):projected.length),close=btc.get(point.date),before=btc.get(shiftDay(point.date,-14)),after=btc.get(shiftDay(point.date,14));
  const beforeReturn=close&&before?(close/before-1)*100:null,afterReturn=close&&after?(after/close-1)*100:null;
  return {...point,bars:segment.length,maxGap:Math.max(...segment.filter(p=>p.sma).map(p=>Math.abs(p.value/p.sma-1)*100)),beforeReturn,afterReturn,agrees:afterReturn===null?null:point.cross==='up'?afterReturn>0:afterReturn<0,future:point.date>today};
 });
 return {projected,aligned,crosses,levelCorrelation:pearson(level,price),weeklyCorrelation,sameDirection:weeks.length?same/weeks.length*100:null,weeks:weeks.length,regimes,buyHold:returns.length?(Math.exp(returns.reduce((s,v)=>s+v,0))-1)*100:null,days:returns.length,start,end};
}

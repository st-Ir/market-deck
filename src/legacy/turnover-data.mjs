import {delta20} from './market-stats-data.mjs';
export function turnoverView(points,period='daily',today=new Date().toISOString().slice(0,10),missingDates=[]){
 const rows=points.slice().sort((a,b)=>a.date.localeCompare(b.date));if(!rows.length)return null;
 const month=today.slice(0,7),monthly=rows.filter(row=>row.date.startsWith(month));
 const selected=period==='monthly'?monthly:[rows.at(-1)];
 if(!selected.length)return {value:null,delta:null,bars:[],sessions:0,from:null,to:null,month};
 const value=selected.reduce((sum,row)=>sum+row.totalValue,0),start=rows.findIndex(row=>row.date===selected[0].date),end=rows.findIndex(row=>row.date===selected.at(-1).date),baseline=start>=20?rows.slice(start-20,end-20+1):[];
 const affected=missingDates.some(date=>date>=rows[Math.max(0,start-20)].date&&date<=selected.at(-1).date);
 const delta=baseline.length===selected.length&&!affected?delta20(value,baseline.reduce((sum,row)=>sum+row.totalValue,0)):null;
 return {value,delta,bars:rows.slice(-20),sessions:selected.length,from:selected[0].date,to:selected.at(-1).date,month};
}

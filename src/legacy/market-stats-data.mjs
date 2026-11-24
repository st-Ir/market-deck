export function delta20(current,baseline){
 return Number.isFinite(current)&&Number.isFinite(baseline)&&baseline!==0?(current-baseline)/Math.abs(baseline)*100:null;
}
export function marketStatsView(points,period='daily'){
 const rows=points.slice().sort((a,b)=>a.date.localeCompare(b.date));
 if(!rows.length)return null;
 const groups=[];
 rows.forEach((row,index)=>{
  const date=new Date(row.date+'T00:00:00Z'),dow=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-dow);
  const key=period==='weekly'?date.toISOString().slice(0,10):row.date;
  let group=groups.at(-1);if(group?.key!==key){group={key,from:row.date,to:row.date,value:0,start:index,end:index};groups.push(group)}
  group.value+=row.netForeign;group.to=row.date;group.end=index;
 });
 const last=groups.at(-1),shifted=last.start>=20?rows.slice(last.start-20,last.end-20+1):null;
 const baseline=shifted?shifted.reduce((sum,row)=>sum+row.netForeign,0):null;
 return {flow:last,flowBars:groups.slice(-20),flowDelta:baseline===null?null:delta20(last.value,baseline),daily:rows.at(-1),valueBars:rows.slice(-20),valueDelta:rows.length>20?delta20(rows.at(-1).totalValue,rows.at(-21).totalValue):null};
}
export function barLayout(values,diverging=true,width=130,height=30){
 const zero=diverging?height/2:height-1,max=Math.max(1,...values.map(Math.abs)),scale=(diverging?height/2-2:height-3)/max;
 return {zero,bars:values.map((value,index)=>{const size=Math.abs(value)*scale;return {x:index*width/values.length+1,y:value>=0?zero-size:zero,width:Math.max(1,width/values.length-2),height:size,positive:value>=0}})};
}

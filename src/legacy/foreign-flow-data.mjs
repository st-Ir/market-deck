export function foreignReadingState(archive,latestMarketDate,now=Date.now()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const date=archive?.asOf;
 if(!archive?.points?.length||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return 'unavailable';
 const age=(Date.parse(today)-Date.parse(date))/86400000;
 return Number.isFinite(age)&&age>=0&&age<=4&&(!latestMarketDate||date>=latestMarketDate)?'official':'unavailable';
}

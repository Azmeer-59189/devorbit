import {weekRange} from './timesheets';
export function weeklyTotals(days:{date:string;minutes:number}[]){const weeks=new Map<string,number>();for(const day of days){const week=weekRange(day.date).start;weeks.set(week,(weeks.get(week)||0)+Number(day.minutes));}return Array.from(weeks,([date,minutes])=>({date,minutes})).sort((a,b)=>a.date.localeCompare(b.date));}

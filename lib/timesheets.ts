import {InputError} from '@/lib/live-validation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function calendarDate(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new InputError('Choose a valid calendar date.');return value;}
function optionalId(value:unknown){if(value===null||value===undefined||value==='')return null;if(typeof value!=='string'||!uuid.test(value))throw new InputError('Select a valid workspace record.');return value;}
export function workLogInput(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Enter valid work-log details.');const input=value as Record<string,unknown>;
 const request_id=optionalId(input.request_id);if(!request_id)throw new InputError('Refresh the form and try again.');
 const log_id=optionalId(input.log_id);if(log_id&&(!Number.isInteger(input.expected_revision)||Number(input.expected_revision)<1))throw new InputError('Refresh this work log before editing.');
 if(!Number.isInteger(input.duration_minutes)||Number(input.duration_minutes)<1||Number(input.duration_minutes)>1440)throw new InputError('Enter a whole number of minutes between 1 and 1,440.');
 const text=(key:string,max:number,required=false)=>{if(input[key]!==undefined&&typeof input[key]!=='string')throw new InputError(`${key} must be text.`);const text=String(input[key]??'').trim();if((required&&!text)||text.length>max)throw new InputError(`${key} ${required?'is required and ':''}must be at most ${max} characters.`);return text;};
 if(!Array.isArray(input.website_ids)||input.website_ids.length>50)throw new InputError('Select up to 50 websites.');
 const website_ids=Array.from(new Set(input.website_ids.map(value=>{const id=optionalId(value);if(!id)throw new InputError('Choose a valid website.');return id;})));
 if(input.confirm_warnings!==undefined&&typeof input.confirm_warnings!=='boolean')throw new InputError('Confirm the work-log warnings before continuing.');
 return {request_id,log_id,expected_revision:log_id?input.expected_revision:null,work_date:calendarDate(input.work_date),duration_minutes:Number(input.duration_minutes),category:text('category',100,true),notes:text('notes',5000,true),task_id:optionalId(input.task_id),website_ids,reason:text('reason',2000),confirm_warnings:input.confirm_warnings===true};
}
export function timesheetFilters(params:URLSearchParams){
 const start=calendarDate(params.get('start'));const end=calendarDate(params.get('end'));
 const days=(Date.parse(end)-Date.parse(start))/86400000;if(days<0||days>366)throw new InputError('Choose a date range of at most 367 calendar days.');
 const raw=params.get('page')||'1';if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>20001)throw new InputError('Choose a valid page.');
 return {start,end,user_id:optionalId(params.get('user')),website_id:optionalId(params.get('website')),limit:50,offset:(Number(raw)-1)*50};
}
export function workspaceDate(timezone:string,now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const value=(type:string)=>parts.find(part=>part.type===type)!.value;return `${value('year')}-${value('month')}-${value('day')}`;}
export function shiftDate(date:string,days:number){const value=new Date(calendarDate(date)+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function weekRange(date:string){const day=new Date(calendarDate(date)+'T12:00:00Z').getUTCDay();const start=shiftDate(date,-((day+6)%7));return {start,end:shiftDate(start,6)};}
export type WorkEntry={id:string;user_id:string;contributor:string;task_id:string|null;task_title:string|null;work_date:string;duration_minutes:number;category:string;notes:string;revision:number;created_at:string;websites:{id:string;name:string;archived:boolean}[]};
export type Timesheet={entries:WorkEntry[];total_minutes:number;entry_count:number;contributor_count:number;days:{work_date:string;minutes:number;entries:number}[];contributors:{user_id:string;contributor:string;minutes:number}[]};
export const formatMinutes=(minutes:number)=>`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`;
export function timesheetExportRows(entries:WorkEntry[]){return entries.map(entry=>({Date:entry.work_date,Contributor:entry.contributor,Minutes:entry.duration_minutes,Duration:formatMinutes(entry.duration_minutes),Category:entry.category,Notes:entry.notes,Task:entry.task_title||'',Websites:entry.websites.map(site=>site.name).join('; '),Revision:entry.revision}));}

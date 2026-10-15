import {csv} from '@/lib/domain';
import {timesheetExportRows,WorkEntry} from '@/lib/timesheets';
const columns=['Date','Contributor','Minutes','Duration','Category','Notes','Task','Websites','Revision'] as const;
export function timesheetCsv(entries:WorkEntry[]){const rows=timesheetExportRows(entries);return '\uFEFF'+(rows.length?csv(rows):columns.map(value=>`"${value}"`).join(',')+'\r\n');}
export async function timesheetXlsx(entries:WorkEntry[]){
 const {default:writeXlsxFile}=await import('write-excel-file/node');
 const rows=timesheetExportRows(entries);
 const sheet=[columns.map(value=>({value,fontWeight:'bold' as const})),...rows.map(row=>columns.map(key=>typeof row[key]==='number'?{value:row[key],type:Number}:{value:String(row[key]),type:String}))];
 return writeXlsxFile(sheet,{buffer:true,sheet:'Timesheet'});
}

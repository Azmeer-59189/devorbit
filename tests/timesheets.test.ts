import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {calendarDate,formatMinutes,shiftDate,timesheetFilters,weekRange,workLogInput,workspaceDate,WorkEntry} from '../lib/timesheets';
import {timesheetCsv,timesheetXlsx} from '../lib/timesheet-export';
const id='00000000-0000-4000-8000-000000000001';
test('work logs validate integer minutes, calendar dates, revisions and website associations',()=>{
 const value={request_id:id,work_date:'2026-10-15',duration_minutes:90,category:'Meeting',notes:'Planning',website_ids:[id,id]};
 assert.equal(workLogInput(value).website_ids.length,1);
 for(const duration_minutes of [0,-1,1.5,1441,'90',NaN])assert.throws(()=>workLogInput({...value,duration_minutes}));
 assert.throws(()=>workLogInput({...value,work_date:'2026-02-30'}));
 assert.throws(()=>workLogInput({...value,log_id:id}));
 assert.throws(()=>workLogInput({...value,confirm_warnings:'yes'}));
 assert.throws(()=>workLogInput({...value,website_ids:['bad-id']}));
});
test('weekly boundaries are Monday–Sunday and calendar dates respect workspace timezone',()=>{
 assert.deepEqual(weekRange('2026-10-18'),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(weekRange('2026-10-19'),{start:'2026-10-19',end:'2026-10-25'});
 assert.equal(workspaceDate('Asia/Karachi',new Date('2026-10-15T20:00:00Z')),'2026-10-16');
 assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
 assert.throws(()=>calendarDate('2026-02-29'));
 assert.equal(formatMinutes(90),'1h 30m');
});
test('timesheet filters keep explicit dates and paginate without losing filters',()=>{
 const params=new URLSearchParams({start:'2026-10-12',end:'2026-10-18',page:'2',user:id,website:id});
 const result=timesheetFilters(params);assert.equal(result.offset,50);assert.equal(result.user_id,id);assert.equal(result.website_id,id);
 params.set('end','2028-10-18');assert.throws(()=>timesheetFilters(params));
 params.set('end','2026-10-18');params.set('page','0');assert.throws(()=>timesheetFilters(params));
});
const entry:WorkEntry={id,user_id:id,contributor:'Contributor',task_id:null,task_title:null,work_date:'2026-10-15',duration_minutes:90,category:'Meeting',notes:' \t=HYPERLINK("https://example.org")',revision:1,created_at:'2026-10-15T10:00:00Z',websites:[{id:'a',name:'Site A',archived:false},{id:'b',name:'Site B',archived:false}]};
test('CSV exports protect formula-like text, preserve website links and count one numeric duration',()=>{
 const value=timesheetCsv([entry]);assert.ok(value.includes('"\' \t=HYPERLINK'));assert.ok(value.includes('"Site A; Site B"'));assert.ok(value.includes('"90","1h 30m"'));assert.equal(value.split('\r\n').length,2);
 assert.ok(timesheetCsv([]).includes('"Minutes"'));
});
test('Excel export contains one record, numeric minutes and text rather than executable formulas',async()=>{
 const buffer=await timesheetXlsx([entry]);const zip=await JSZip.loadAsync(buffer);
 const sheet=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
 assert.equal((sheet.match(/<row /g)||[]).length,2);assert.match(sheet,/<c r="C2"[^>]*><v>90<\/v><\/c>/);assert.ok(!sheet.includes('<f>'));
 const strings=await zip.file('xl/sharedStrings.xml')!.async('string');assert.ok(strings.includes('HYPERLINK'));assert.ok(strings.includes('Site A; Site B'));
});

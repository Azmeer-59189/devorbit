import {AccessError} from '@/lib/live-auth';
export function reportingError(error:{code?:string;message?:string}){
 if(error.code==='23505')return new AccessError(409,'A report already exists for this website, template and week. Open it to make a revision.');
 if(error.code==='40001')return new AccessError(409,'This record changed. Refresh before saving. Your entered values have been kept.');
 if(error.code==='42501')return new AccessError(403,'You do not have permission to perform this action.');
 if(['PGRST202','PGRST205','42P01','42703','42883'].includes(error.code||''))return new AccessError(503,'Apply migration 005 (forms and reporting), then refresh.');
 return new AccessError(400,'Check the fields, website assignments and published version, then retry.');
}

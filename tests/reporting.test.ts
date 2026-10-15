import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldSchema,seoFields,validateAnswers,reportInput} from '../lib/reporting';
test('SEO schemas require explicit methodology, measurement date and scale',()=>{
 assert.equal(fieldSchema(seoFields,true).length,5);
 assert.throws(()=>fieldSchema(seoFields.filter(f=>f.key!=='source'),true));
 assert.throws(()=>fieldSchema([{key:'password',label:'Password',type:'short_text',required:false}],true));
 const answers={seo_score:70,source:'Lighthouse desktop',measurement_date:'2026-10-15',scale:'0–100'};
 assert.deepEqual(validateAnswers(seoFields,answers),answers);
 assert.throws(()=>validateAnswers(seoFields,{...answers,seo_score:101}));
 assert.throws(()=>validateAnswers(seoFields,{...answers,measurement_date:'2026-02-30'}));
 assert.throws(()=>validateAnswers(seoFields,{...answers,injected:'field'}));
});
test('weekly reports require Mondays and reasoned revisions',()=>{
 const input={request_id:crypto.randomUUID(),website_id:crypto.randomUUID(),template_version_id:crypto.randomUUID(),period_start:'2026-10-12',answers:{}};
 assert.equal(reportInput(input).period_end,'2026-10-18');
 assert.throws(()=>reportInput({...input,period_start:'2026-10-13'}));
 assert.throws(()=>reportInput({...input,submission_id:crypto.randomUUID(),expected_revision:1}));
});

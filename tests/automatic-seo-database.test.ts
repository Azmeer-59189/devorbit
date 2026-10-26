import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('automatic SEO audits enforce caller scope, server-only results, cooldown and failure preservation', async () => {
  const db = new PGlite();
  const actor = '00000000-0000-4000-8000-000000000001';
  const outsider = '00000000-0000-4000-8000-000000000002';
  const workspace = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const site = '20000000-0000-4000-8000-000000000001';
  async function user(id: string) {
    await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
  }
  async function start(request = crypto.randomUUID()) {
    return (
      await db.query<{r: {id: string; started: boolean}}>('select public.start_website_lighthouse($1,$2) r', [
        site,
        request,
      ])
    ).rows[0].r;
  }
  async function finish(id: string, result: unknown) {
    await db.query('select public.finish_website_lighthouse($1,$2::jsonb)', [id, JSON.stringify(result)]);
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = (await readFile(`supabase/migrations/${file}`, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      );
      await db.exec(sql);
    }
    await db.exec(`insert into auth.users(id) values('${actor}'),('${outsider}');
      insert into public.workspaces(id,name) values('${workspace}','A'),('${other}','B');
      insert into public.profiles(id,workspace_id,display_name) values('${actor}','${workspace}','A'),('${outsider}','${other}','B');
      insert into public.websites(id,workspace_id,name,country,canonical_url) values('${site}','${workspace}','Site','CH','https://foih.ch');`);
    await user(outsider);
    await assert.rejects(start(), /Website not found/);
    await user(actor);
    const request = crypto.randomUUID();
    const first = await start(request);
    assert.equal(first.started, true);
    assert.equal((await start(request)).started, false);
    await assert.rejects(start(), /five minutes/);
    await assert.rejects(finish(first.id, {}), /permission denied/);
    await assert.rejects(
      db.exec(
        `insert into public.website_lighthouse_runs(workspace_id,website_id,actor_id,request_id,requested_url) values('${workspace}','${site}','${actor}',gen_random_uuid(),'https://foih.ch')`,
      ),
      /permission denied/,
    );
    const result = {
      seo_score: 92,
      performance_score: 70,
      lcp_seconds: 2.4,
      speed_index_seconds: 3.1,
      measured_at: new Date().toISOString(),
      final_url: 'https://foih.ch/',
      lighthouse_version: '13',
    };
    await db.exec('reset role;set role service_role');
    await finish(first.id, result);
    await finish(first.id, result);
    await user(actor);
    const catalog = (
      await db.query<{r: {websites: {lighthouse: {performance_score: number}; latest_audit: {score: number}}[]}}>(
        'select public.fixed_seo_catalog($1) r',
        [site],
      )
    ).rows[0].r;
    assert.equal(catalog.websites[0].lighthouse.performance_score, 70);
    assert.equal(catalog.websites[0].latest_audit.score, 92);
    await user(outsider);
    assert.equal((await db.query('select * from public.website_lighthouse_runs')).rows.length, 0);
    await db.exec(`reset role;update public.website_lighthouse_runs set created_at=now()-interval '6 minutes';`);
    await user(actor);
    const failed = await start();
    await db.exec('reset role;set role service_role');
    await finish(failed.id, {error_code: 'provider_failed'});
    await user(actor);
    const retained = (
      await db.query<{r: {websites: {lighthouse: {seo_score: number}}[]}}>('select public.fixed_seo_catalog($1) r', [
        site,
      ])
    ).rows[0].r;
    assert.equal(retained.websites[0].lighthouse.seo_score, 92);
    await db.exec('reset role');
    assert.equal((await db.query('select * from public.website_seo_audits')).rows.length, 1);
  } finally {
    await db.close();
  }
});

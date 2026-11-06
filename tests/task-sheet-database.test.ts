import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('sheet sync is transactional, scoped, retry-safe and records completion for dashboard reporting', async () => {
  const db = new PGlite();
  const workspace = '10000000-0000-4000-8000-000000000001';
  const actor = '20000000-0000-4000-8000-000000000001';
  const task = '30000000-0000-4000-8000-000000000001';
  const row = {
    id: task,
    title: 'Sheet task',
    description: '',
    category: 'general',
    priority: 'high',
    status: 'to_do',
    assignee: 'Manager',
    websites: ['France'],
    created_date: '2026-10-01',
    due_date: '2026-10-31',
    completed_date: null,
    blocker: '',
    completion_notes: '',
    archived: false,
  };
  async function sync(rows: unknown[]) {
    return (
      await db.query<{result: {updated: number; unchanged: number}}>(
        'select public.sync_task_sheet($1,$2,$3,$4::jsonb) result',
        [workspace, actor, 'test-sheet-12345', JSON.stringify(rows)],
      )
    ).rows[0].result;
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort())
      await db.exec(
        (await readFile('supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pgcrypto;', ''),
      );
    await db.exec(`insert into auth.users(id) values('${actor}');insert into public.workspaces(id,name) values('${workspace}','Team');
   insert into public.profiles(id,workspace_id,display_name,role) values('${actor}','${workspace}','Manager','manager');
   insert into public.websites(workspace_id,name,country,canonical_url) values('${workspace}','France','France','https://example.fr');set role authenticated;`);
    await assert.rejects(sync([row]), /permission denied/);
    await db.exec('reset role;set role service_role');
    assert.equal((await sync([row])).updated, 1);
    assert.equal((await sync([row])).unchanged, 1);
    const completed = {...row, status: 'completed', completed_date: '2026-10-29'};
    assert.equal((await sync([completed])).updated, 1);
    await db.exec('reset role');
    const saved = (
      await db.query<{progress: string; review_required: boolean}>(
        'select progress,review_required from public.tasks where id=$1',
        [task],
      )
    ).rows[0];
    assert.equal(saved.progress, 'completed');
    assert.equal(saved.review_required, false);
    await db.exec('set role service_role');
    await assert.rejects(
      sync([
        {...row, title: 'Should roll back'},
        {...row, id: '30000000-0000-4000-8000-000000000002', assignee: 'Unknown'},
      ]),
      /Assignee/,
    );
    await db.exec('reset role');
    assert.equal(
      (await db.query<{title: string}>('select title from public.tasks where id=$1', [task])).rows[0].title,
      'Sheet task',
    );
    await db.exec('set role service_role');
    assert.equal((await sync([{...completed, archived: true}])).updated, 1);
    assert.equal((await sync([])).updated, 0);
    await db.exec('reset role');
    assert.equal((await db.query<{n: number}>('select count(*)::int n from public.tasks')).rows[0].n, 1);
    await db.query('update public.tasks set description=$1,completion_notes=$2,blocker_reason=$3 where id=$4', [
      'Keep description',
      'Keep completion notes',
      'Waiting on access',
      task,
    ]);
    const {description, due_date, blocker, completion_notes, category, ...simple} = row;
    void category;
    void description;
    void due_date;
    void blocker;
    void completion_notes;
    await db.exec('set role service_role');
    await sync([{...simple, status: 'completed', completed_date: '2026-10-29'}]);
    await db.exec('reset role');
    const retained = (
      await db.query<{description: string; completion_notes: string; blocker_reason: string; due_date: string}>(
        'select description,completion_notes,blocker_reason,due_date::text from public.tasks where id=$1',
        [task],
      )
    ).rows[0];
    assert.equal(retained.description, 'Keep description');
    assert.equal(retained.completion_notes, 'Keep completion notes');
    assert.equal(retained.blocker_reason, null);
    assert.equal(retained.due_date, '2026-10-31');
    assert.equal(
      (await db.query<{category: string}>('select category from public.tasks where id=$1', [task])).rows[0].category,
      'general',
    );
    await db.query("update public.tasks set progress='blocked',blocker_reason='Waiting on access' where id=$1", [task]);
    await db.exec('set role service_role');
    await sync([{...simple, title: 'Updated title', status: 'blocked'}]);
    await db.exec('reset role');
    assert.equal(
      (await db.query<{blocker_reason: string}>('select blocker_reason from public.tasks where id=$1', [task])).rows[0]
        .blocker_reason,
      'Waiting on access',
    );
    await db.exec('set role service_role');
    await sync([{...simple, id: '30000000-0000-4000-8000-000000000003', status: 'blocked'}]);
    await db.exec('reset role');
    assert.match(
      (
        await db.query<{blocker_reason: string}>('select blocker_reason from public.tasks where id=$1', [
          '30000000-0000-4000-8000-000000000003',
        ])
      ).rows[0].blocker_reason,
      /no reason recorded/,
    );
  } finally {
    await db.close();
  }
});

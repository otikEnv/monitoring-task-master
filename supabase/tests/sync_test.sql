-- Uji fungsi public.sync_apply_success. Jalankan SETELAH semua migrasi.
-- Semuanya di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI SYNC LOLOS'.

begin;

insert into public.sources (id, name, provider, repo_url, token_expires_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'Sync A', 'github', 'https://github.com/o/sync-a',
   '2027-01-01T00:00:00Z');

-- Data lama yang harus diganti.
insert into public.tasks (source_id, tag, task_id, title, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'master', 'lama-1', 'Lama 1', 'done'),
  ('00000000-0000-0000-0000-0000000000d1', 'tag-lama', 'lama-2', 'Lama 2', 'done');

-- 1. Sukses: task diganti, snapshot dicatat, status sumber diperbarui.
select public.sync_apply_success(
  '00000000-0000-0000-0000-0000000000d1',
  '[
    {"tag":"master","task_id":"1","title":"T1","description":null,"status":"done","priority":"high",
     "dependencies":[],"details":"d","test_strategy":null,
     "subtasks":[{"id":"1","title":"s","status":"done"}],"subtasks_total":1,"subtasks_done":1},
    {"tag":"master","task_id":"2","title":"T2","status":"blocked","dependencies":["1"]}
  ]'::jsonb,
  '[{"tag":"master","total":2,"done":1,"blocked":1}]'::jsonb,
  '"etag-1"', '2026-11-06T03:52:39Z', null
);

do $$
declare n int; s record;
begin
  select count(*) into n from public.tasks where source_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 2 then raise exception 'FAIL: seharusnya 2 task setelah sinkron, dapat %', n; end if;

  select count(*) into n from public.tasks where task_id like 'lama-%';
  if n <> 0 then raise exception 'FAIL: task lama tidak terhapus'; end if;

  -- field yang tidak dikirim mendapat nilai bawaan yang aman
  select * into s from public.tasks where task_id = '2';
  if s.dependencies is distinct from '["1"]'::jsonb or s.subtasks is distinct from '[]'::jsonb
     or s.subtasks_total is distinct from 0 then
    raise exception 'FAIL: nilai bawaan task salah: %', row_to_json(s);
  end if;

  select * into s from public.tasks where task_id = '1';
  if s.subtasks_total is distinct from 1 or s.subtasks_done is distinct from 1 or s.test_strategy is not null then
    raise exception 'FAIL: task 1 tidak tersimpan benar: %', row_to_json(s);
  end if;

  select count(*) into n from public.snapshots where source_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'FAIL: seharusnya 1 snapshot, dapat %', n; end if;
  select * into s from public.snapshots where source_id = '00000000-0000-0000-0000-0000000000d1';
  if s.total is distinct from 2 or s.done is distinct from 1 or s.blocked is distinct from 1
     or s.pending is distinct from 0 or s.percent_done is distinct from 50.00 then
    raise exception 'FAIL: snapshot salah: %', row_to_json(s);
  end if;

  select * into s from public.sources where id = '00000000-0000-0000-0000-0000000000d1';
  if s.last_sync_status is distinct from 'success' or s.last_synced_at is null or s.last_attempt_at is null
     or s.last_error is not null or s.etag is distinct from '"etag-1"'
     or s.last_commit_at is distinct from '2026-11-06T03:52:39Z'::timestamptz then
    raise exception 'FAIL: status sumber salah: %', row_to_json(s);
  end if;
  -- kedaluwarsa token tidak dilaporkan (null) -> nilai lama dipertahankan
  if s.token_expires_at is distinct from '2027-01-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL: token_expires_at seharusnya dipertahankan';
  end if;
end $$;

-- 2. Kedaluwarsa token yang dilaporkan menimpa nilai lama.
select public.sync_apply_success(
  '00000000-0000-0000-0000-0000000000d1', '[]'::jsonb, '[]'::jsonb, null, null, '2027-06-01T00:00:00Z'
);
do $$
begin
  if (select token_expires_at from public.sources where id = '00000000-0000-0000-0000-0000000000d1')
     is distinct from '2027-06-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL: token_expires_at yang dilaporkan seharusnya menimpa';
  end if;
  -- sinkron dengan 0 task adalah sah (file valid tapi kosong)
  if (select count(*) from public.tasks where source_id = '00000000-0000-0000-0000-0000000000d1') <> 0 then
    raise exception 'FAIL: array kosong seharusnya menghasilkan 0 task';
  end if;
end $$;

-- 3. Atomik: bila gagal di tengah, data lama utuh dan snapshot tidak tertulis.
select public.sync_apply_success(
  '00000000-0000-0000-0000-0000000000d1',
  '[{"tag":"master","task_id":"A","title":"A","status":"done"}]'::jsonb,
  '[{"tag":"master","total":1,"done":1}]'::jsonb, '"etag-A"', null, null
);
do $$
declare before_snapshots int; before_etag text;
begin
  select count(*) into before_snapshots from public.snapshots;
  select etag into before_etag from public.sources where id = '00000000-0000-0000-0000-0000000000d1';
  begin
    -- task_id ganda dalam tag yang sama melanggar primary key setelah delete berjalan
    perform public.sync_apply_success(
      '00000000-0000-0000-0000-0000000000d1',
      '[{"tag":"master","task_id":"X","title":"X1","status":"done"},
        {"tag":"master","task_id":"X","title":"X2","status":"done"}]'::jsonb,
      '[{"tag":"master","total":2,"done":2}]'::jsonb, '"etag-RUSAK"', null, null
    );
    raise exception 'FAIL: seharusnya gagal karena task_id ganda';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.tasks where task_id = 'A') then
    raise exception 'FAIL: task lama hilang setelah sinkron gagal (tidak atomik)';
  end if;
  if exists (select 1 from public.tasks where task_id = 'X') then
    raise exception 'FAIL: sebagian task baru tertulis (tidak atomik)';
  end if;
  if (select count(*) from public.snapshots) <> before_snapshots then
    raise exception 'FAIL: snapshot tertulis walau sinkron gagal';
  end if;
  if (select etag from public.sources where id = '00000000-0000-0000-0000-0000000000d1') is distinct from before_etag then
    raise exception 'FAIL: status sumber berubah walau sinkron gagal';
  end if;
end $$;

-- 4. Sumber yang tidak ada ditolak.
do $$
begin
  begin
    perform public.sync_apply_success('00000000-0000-0000-0000-0000000000ff', '[]', '[]', null, null, null);
    raise exception 'FAIL: sumber tidak ada seharusnya ditolak';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- 5. Hanya service role yang boleh memanggil. Periksa hak EXECUTE secara langsung
--    (bukan hanya efek sampingnya), lalu coba panggil sebagai anon dan authenticated.
do $$
declare sig text := 'public.sync_apply_success(uuid, jsonb, jsonb, text, timestamptz, timestamptz)';
begin
  if has_function_privilege('anon', sig, 'execute') then
    raise exception 'FAIL: anon punya EXECUTE pada sync_apply_success';
  end if;
  if has_function_privilege('authenticated', sig, 'execute') then
    raise exception 'FAIL: authenticated punya EXECUTE pada sync_apply_success';
  end if;
  if not has_function_privilege('service_role', sig, 'execute') then
    raise exception 'FAIL: service_role seharusnya punya EXECUTE';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.sync_apply_success('00000000-0000-0000-0000-0000000000d1', '[]', '[]', null, null, null);
    raise exception 'FAIL: anon bisa memanggil sync_apply_success';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.sync_apply_success('00000000-0000-0000-0000-0000000000d1', '[]', '[]', null, null, null);
    raise exception 'FAIL: authenticated bisa memanggil sync_apply_success';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'UJI SYNC LOLOS'; end $$;

rollback;

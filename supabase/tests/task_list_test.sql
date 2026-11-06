-- Uji view public.task_list dan public.source_tags. Jalankan SETELAH semua migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI TASK LIST LOLOS'.

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'viewer-list@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000f1', 'List Zeta',  'github', 'https://github.com/o/list-z', 'RAHASIA-Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'List Alfa',  'github', 'https://github.com/o/list-a', 'RAHASIA-A');

insert into public.tasks (source_id, tag, task_id, title, status, priority, subtasks_total, subtasks_done) values
  ('00000000-0000-0000-0000-0000000000f1', 'master', '2',   'dua',   'done',        'high',   4, 4),
  ('00000000-0000-0000-0000-0000000000f1', 'master', '10',  'sepuluh','blocked',    'medium', 0, 0),
  ('00000000-0000-0000-0000-0000000000f1', 'master', '1',   'satu',  'in-progress', 'low',    2, 1),
  ('00000000-0000-0000-0000-0000000000f1', 'fitur',  'abc', 'huruf', 'aneh',        null,     0, 0),
  ('00000000-0000-0000-0000-0000000000f2', 'master', '1',   'alfa',  'pending',     'urgent', 3, 0);

-- 1. Gabungan dengan nama aplikasi; kolom bantu benar.
do $$
declare r record; n int;
begin
  select count(*) into n from public.task_list;
  if n <> 5 then raise exception 'FAIL: task_list seharusnya 5 baris, dapat %', n; end if;

  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1' and task_id = '10';
  if r.source_name is distinct from 'List Zeta' or r.task_seq is distinct from 10
     or r.priority_rank is distinct from 2 or r.status_rank is distinct from 1 then
    raise exception 'FAIL: kolom task 10 salah: %', row_to_json(r);
  end if;

  -- semua peringkat prioritas dan status (urutan "paling perlu perhatian dulu")
  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1' and task_id = '2';
  if r.priority_rank is distinct from 1 or r.status_rank is distinct from 6 then
    raise exception 'FAIL: task 2 (high, done) peringkat salah: %', row_to_json(r);
  end if;
  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1' and task_id = '1';
  if r.priority_rank is distinct from 3 or r.status_rank is distinct from 2 then
    raise exception 'FAIL: task 1 (low, in-progress) peringkat salah: %', row_to_json(r);
  end if;
  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f2';
  if r.status_rank is distinct from 4 then
    raise exception 'FAIL: pending seharusnya status_rank 4, dapat %', r.status_rank;
  end if;

  select * into r from public.task_list where task_id = 'abc';
  if r.task_seq is not null or r.priority_rank is distinct from 4 or r.status_rank is distinct from 8 then
    raise exception 'FAIL: ID non-angka/prioritas null/status tak dikenal salah: %', row_to_json(r);
  end if;

  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f2';
  if r.priority_rank is distinct from 4 then raise exception 'FAIL: prioritas tak dikenal seharusnya rank 4'; end if;

  select * into r from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1' and task_id = '1';
  if r.subtask_ratio is distinct from 0.5 then raise exception 'FAIL: subtask_ratio seharusnya 0.5, dapat %', r.subtask_ratio; end if;

  select * into r from public.task_list where task_id = '10';
  if r.subtask_ratio is not null then raise exception 'FAIL: subtask_ratio tanpa subtask seharusnya null'; end if;
end $$;

-- 2. Urutan ID natural: 1, 2, 10 (bukan 1, 10, 2).
do $$
declare ids text;
begin
  select string_agg(task_id, ',' order by task_seq nulls last, task_id) into ids
  from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1' and tag = 'master';
  if ids is distinct from '1,2,10' then raise exception 'FAIL: urutan natural salah: %', ids; end if;
end $$;

-- 3. source_tags.
do $$
declare n int; c int;
begin
  select count(*) into n from public.source_tags;
  if n <> 3 then raise exception 'FAIL: source_tags seharusnya 3 baris, dapat %', n; end if;
  select task_count into c from public.source_tags where source_id = '00000000-0000-0000-0000-0000000000f1' and tag = 'master';
  if c is distinct from 3 then raise exception 'FAIL: task_count master Zeta seharusnya 3, dapat %', c; end if;
end $$;

-- 4. Hak akses diperiksa langsung, lalu coba sebagai viewer dan anon.
do $$
begin
  if has_table_privilege('anon', 'public.task_list', 'select') or has_table_privilege('anon', 'public.source_tags', 'select') then
    raise exception 'FAIL: anon punya SELECT pada view daftar task';
  end if;
  if not has_table_privilege('authenticated', 'public.task_list', 'select')
     or not has_table_privilege('authenticated', 'public.source_tags', 'select') then
    raise exception 'FAIL: authenticated seharusnya punya SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.task_list', 'insert')
     or has_table_privilege('authenticated', 'public.task_list', 'update')
     or has_table_privilege('authenticated', 'public.task_list', 'delete')
     or has_table_privilege('authenticated', 'public.source_tags', 'delete') then
    raise exception 'FAIL: authenticated punya hak tulis pada view';
  end if;
  if (select count(*) from pg_class
      where oid in ('public.task_list'::regclass, 'public.source_tags'::regclass)
        and reloptions @> array['security_invoker=true']) <> 2 then
    raise exception 'FAIL: kedua view harus memakai security_invoker=true';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c9","role":"authenticated"}', true);
do $$
declare n int; r record;
begin
  select count(*) into n from public.task_list;
  if n <> 5 then raise exception 'FAIL: viewer seharusnya melihat 5 baris, dapat %', n; end if;
  select * into r from public.task_list limit 1;
  -- token tidak ada di view dan tetap tidak terbaca dari tabel
  if to_jsonb(r)::text like '%RAHASIA%' then raise exception 'FAIL: token terlihat lewat task_list'; end if;
  begin
    perform token_encrypted from public.sources;
    raise exception 'FAIL: viewer bisa membaca token_encrypted';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.source_tags;
  if n <> 3 then raise exception 'FAIL: viewer seharusnya melihat 3 baris source_tags, dapat %', n; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.task_list;
    raise exception 'FAIL: anon bisa membaca task_list';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.source_tags;
    raise exception 'FAIL: anon bisa membaca source_tags';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'UJI TASK LIST LOLOS'; end $$;

rollback;

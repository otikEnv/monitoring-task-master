-- Uji view public.source_status_counts. Jalankan SETELAH semua migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI VIEW HITUNGAN LOLOS'.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b9', 'viewer-view@test.local');

insert into public.sources (id, name, provider, repo_url) values
  ('00000000-0000-0000-0000-0000000000e1', 'View A', 'github', 'https://github.com/o/view-a'),
  ('00000000-0000-0000-0000-0000000000e2', 'View B', 'github', 'https://github.com/o/view-b'),
  ('00000000-0000-0000-0000-0000000000e3', 'View Kosong', 'github', 'https://github.com/o/view-kosong');

-- Sumber A: dua tag, semua status, dan satu status tak dikenal.
insert into public.tasks (source_id, tag, task_id, title, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'master', '1', 't', 'pending'),
  ('00000000-0000-0000-0000-0000000000e1', 'master', '2', 't', 'in-progress'),
  ('00000000-0000-0000-0000-0000000000e1', 'master', '3', 't', 'review'),
  ('00000000-0000-0000-0000-0000000000e1', 'master', '4', 't', 'blocked'),
  ('00000000-0000-0000-0000-0000000000e1', 'master', '5', 't', 'done'),
  ('00000000-0000-0000-0000-0000000000e1', 'master', '6', 't', 'done'),
  ('00000000-0000-0000-0000-0000000000e1', 'fitur',  '1', 't', 'deferred'),
  ('00000000-0000-0000-0000-0000000000e1', 'fitur',  '2', 't', 'cancelled'),
  ('00000000-0000-0000-0000-0000000000e1', 'fitur',  '3', 't', 'aneh'),
  -- Sumber B: satu task.
  ('00000000-0000-0000-0000-0000000000e2', 'master', '1', 't', 'done');

-- 1. Hitungan benar per sumber.
do $$
declare a record; b record; n int;
begin
  select * into a from public.source_status_counts where source_id = '00000000-0000-0000-0000-0000000000e1';
  if a.total is distinct from 9 or a.pending is distinct from 1 or a.in_progress is distinct from 1
     or a.review is distinct from 1 or a.blocked is distinct from 1 or a.done is distinct from 2
     or a.deferred is distinct from 1 or a.cancelled is distinct from 1 or a.other is distinct from 1
     or a.tag_count is distinct from 2 then
    raise exception 'FAIL: hitungan sumber A salah: %', row_to_json(a);
  end if;
  if a.pending + a.in_progress + a.review + a.blocked + a.done + a.deferred + a.cancelled + a.other <> a.total then
    raise exception 'FAIL: jumlah kategori tidak sama dengan total';
  end if;

  select * into b from public.source_status_counts where source_id = '00000000-0000-0000-0000-0000000000e2';
  if b.total is distinct from 1 or b.done is distinct from 1 or b.tag_count is distinct from 1 or b.other is distinct from 0 then
    raise exception 'FAIL: hitungan sumber B salah: %', row_to_json(b);
  end if;

  -- sumber tanpa task tidak muncul
  select count(*) into n from public.source_status_counts where source_id = '00000000-0000-0000-0000-0000000000e3';
  if n <> 0 then raise exception 'FAIL: sumber tanpa task seharusnya tidak muncul di view'; end if;
end $$;

-- 2. Mengikuti perubahan tasks (bukan salinan).
update public.tasks set status = 'done'
  where source_id = '00000000-0000-0000-0000-0000000000e1' and tag = 'master' and task_id = '4';
do $$
declare a record;
begin
  select * into a from public.source_status_counts where source_id = '00000000-0000-0000-0000-0000000000e1';
  if a.done is distinct from 3 or a.blocked is distinct from 0 then
    raise exception 'FAIL: view tidak mengikuti perubahan task: %', row_to_json(a);
  end if;
end $$;

-- 3. Pengguna login (viewer) bisa membaca; hasilnya sama.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b9","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.source_status_counts;
  if n <> 2 then raise exception 'FAIL: viewer seharusnya melihat 2 baris view, dapat %', n; end if;
end $$;
reset role;

-- 4. Hak akses diperiksa langsung (bukan hanya efek sampingnya) dan opsi view benar.
do $$
begin
  if has_table_privilege('anon', 'public.source_status_counts', 'select') then
    raise exception 'FAIL: anon punya SELECT pada source_status_counts';
  end if;
  if not has_table_privilege('authenticated', 'public.source_status_counts', 'select') then
    raise exception 'FAIL: authenticated seharusnya punya SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.source_status_counts', 'insert')
     or has_table_privilege('authenticated', 'public.source_status_counts', 'update')
     or has_table_privilege('authenticated', 'public.source_status_counts', 'delete') then
    raise exception 'FAIL: authenticated punya hak tulis pada view';
  end if;
  -- security_invoker: RLS tabel tasks tetap berlaku bagi pemanggil view
  if not exists (
    select 1 from pg_class
    where oid = 'public.source_status_counts'::regclass
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FAIL: view seharusnya memakai security_invoker=true';
  end if;
end $$;

-- 4b. Anon tidak bisa membaca.
set local role anon;
do $$
begin
  begin
    perform 1 from public.source_status_counts;
    raise exception 'FAIL: anon bisa membaca source_status_counts';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 5. Tidak bisa ditulis oleh peran klien.
set local role authenticated;
do $$
begin
  begin
    delete from public.source_status_counts;
    raise exception 'FAIL: authenticated bisa menulis ke view';
  exception when insufficient_privilege or object_not_in_prerequisite_state or feature_not_supported then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'UJI VIEW HITUNGAN LOLOS'; end $$;

rollback;

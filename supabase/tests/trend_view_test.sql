-- Uji view public.source_snapshot_totals. Jalankan SETELAH semua migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI VIEW TREN LOLOS'.

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d9', 'viewer-trend@test.local');
insert into public.sources (id, name, provider, repo_url) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tren A', 'github', 'https://github.com/o/tren-a'),
  ('00000000-0000-0000-0000-0000000000a2', 'Tren B', 'github', 'https://github.com/o/tren-b');

-- Sumber A, waktu T1: DUA tag pada sinkronisasi yang sama (taken_at sama) -> dijumlahkan.
insert into public.snapshots (source_id, tag, taken_at, total, pending, in_progress, review, blocked, done, deferred, cancelled, other) values
  ('00000000-0000-0000-0000-0000000000a1', 'master', '2026-11-01T10:00:00Z', 22, 1, 1, 2, 3, 3, 3, 4, 5),
  ('00000000-0000-0000-0000-0000000000a1', 'fitur',  '2026-11-01T10:00:00Z', 14, 0, 1, 1, 1, 2, 3, 3, 3),
-- Sumber A, waktu T2: satu tag saja.
  ('00000000-0000-0000-0000-0000000000a1', 'master', '2026-11-03T10:00:00Z', 10, 1, 1, 1, 0, 6, 1, 0, 0),
-- Sumber B, waktu T1 yang sama persis: TIDAK boleh bercampur dengan sumber A.
  ('00000000-0000-0000-0000-0000000000a2', 'master', '2026-11-01T10:00:00Z',  3, 0, 0, 0, 0, 3, 0, 0, 0);

do $$
declare n int; r record;
begin
  select count(*) into n from public.source_snapshot_totals;
  if n <> 3 then raise exception 'FAIL: seharusnya 3 baris (A@T1, A@T2, B@T1), dapat %', n; end if;

  select * into r from public.source_snapshot_totals
   where source_id = '00000000-0000-0000-0000-0000000000a1' and taken_at = '2026-11-01T10:00:00Z';
  -- setiap kategori sengaja diberi nilai berbeda (1..8) agar pertukaran kolom apa pun terdeteksi
  if r.total is distinct from 36 or r.pending is distinct from 1 or r.in_progress is distinct from 2
     or r.review is distinct from 3 or r.blocked is distinct from 4 or r.done is distinct from 5
     or r.deferred is distinct from 6 or r.cancelled is distinct from 7 or r.other is distinct from 8
     or r.tag_count is distinct from 2 then
    raise exception 'FAIL: penjumlahan dua tag salah: %', row_to_json(r);
  end if;
  if r.pending + r.in_progress + r.review + r.blocked + r.done + r.deferred + r.cancelled + r.other <> r.total then
    raise exception 'FAIL: jumlah kategori tidak sama dengan total';
  end if;

  select * into r from public.source_snapshot_totals
   where source_id = '00000000-0000-0000-0000-0000000000a1' and taken_at = '2026-11-03T10:00:00Z';
  if r.total is distinct from 10 or r.done is distinct from 6 or r.tag_count is distinct from 1 then
    raise exception 'FAIL: baris A@T2 salah: %', row_to_json(r);
  end if;

  -- sumber lain pada waktu yang sama tidak tercampur
  select * into r from public.source_snapshot_totals
   where source_id = '00000000-0000-0000-0000-0000000000a2';
  if r.total is distinct from 3 or r.done is distinct from 3 or r.tag_count is distinct from 1 then
    raise exception 'FAIL: baris B tercampur dengan sumber lain: %', row_to_json(r);
  end if;
end $$;

-- Hak akses diperiksa langsung, lalu dicoba sebagai viewer dan anon.
do $$
begin
  if has_table_privilege('anon', 'public.source_snapshot_totals', 'select') then
    raise exception 'FAIL: anon punya SELECT pada source_snapshot_totals';
  end if;
  if not has_table_privilege('authenticated', 'public.source_snapshot_totals', 'select') then
    raise exception 'FAIL: authenticated seharusnya punya SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.source_snapshot_totals', 'insert')
     or has_table_privilege('authenticated', 'public.source_snapshot_totals', 'update')
     or has_table_privilege('authenticated', 'public.source_snapshot_totals', 'delete') then
    raise exception 'FAIL: authenticated punya hak tulis pada view';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.source_snapshot_totals'::regclass and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FAIL: view harus memakai security_invoker=true';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d9","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.source_snapshot_totals;
  if n <> 3 then raise exception 'FAIL: viewer seharusnya melihat 3 baris, dapat %', n; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.source_snapshot_totals;
    raise exception 'FAIL: anon bisa membaca source_snapshot_totals';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'UJI VIEW TREN LOLOS'; end $$;

rollback;

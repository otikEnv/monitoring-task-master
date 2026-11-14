-- Uji Archive (migrasi 20261115000000_archive.sql). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI ARCHIVE LOLOS'.
-- Tidak bergantung pada data nyata: hanya menyentuh aplikasi dan release uji.

begin;
select set_config('app.allow_any_domain', 'on', true); -- email uji non-@envisions.app (lihat migrasi google_sso)

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'viewer-arc@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000f1', 'Arc A', 'github', 'https://github.com/o/arc-a', 'RAHASIA'),
  ('00000000-0000-0000-0000-0000000000f2', 'Arc B', 'github', 'https://github.com/o/arc-b', 'RAHASIA');

insert into public.tasks (source_id, tag, task_id, title, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'master', '1', 'A1', 'done'),
  ('00000000-0000-0000-0000-0000000000f1', 'master', '2', 'A2', 'pending'),
  ('00000000-0000-0000-0000-0000000000f2', 'master', '1', 'B1', 'done');

insert into public.snapshots (source_id, tag, taken_at, total, done) values
  ('00000000-0000-0000-0000-0000000000f1', 'master', '2026-11-01T00:00:00Z', 2, 1),
  ('00000000-0000-0000-0000-0000000000f2', 'master', '2026-11-01T00:00:00Z', 1, 1);

-- 1. Kolom ada, bawaan kosong (aktif), pada aplikasi dan release.
do $$
declare a timestamptz; r uuid; ar timestamptz;
begin
  select archived_at into a from public.sources where id = '00000000-0000-0000-0000-0000000000f1';
  if a is not null then raise exception 'FAIL: aplikasi baru seharusnya aktif (archived_at kosong)'; end if;
  r := public.save_release(null, '{"name":"T-arc","target_date":"2026-12-01"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000f1","tag":"master","range_start":1,"range_end":2},
      {"source_id":"00000000-0000-0000-0000-0000000000f2","tag":"master","range_start":1,"range_end":1}]'::jsonb);
  select archived_at into ar from public.releases where id = r;
  if ar is not null then raise exception 'FAIL: release baru seharusnya aktif'; end if;
end $$;

-- 2. Aplikasi aktif: tampil di task_list dan source_snapshot_totals.
do $$
declare n int;
begin
  select count(*) into n from public.task_list where source_id in
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
  if n <> 3 then raise exception 'FAIL: task_list seharusnya 3 baris uji, dapat %', n; end if;
  select count(*) into n from public.source_snapshot_totals where source_id in
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
  if n <> 2 then raise exception 'FAIL: source_snapshot_totals seharusnya 2 baris uji, dapat %', n; end if;
end $$;

-- 3. Mengarsipkan aplikasi A: hilang dari source_snapshot_totals (gabungan Trend). task_list tetap memuatnya
--    (penyaringan Daftar task dilakukan aplikasi agar tautan langsung ke aplikasi terarsip tetap terbuka).
update public.sources set archived_at = now() where id = '00000000-0000-0000-0000-0000000000f1';
do $$
declare n int;
begin
  select count(*) into n from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 2 then raise exception 'FAIL: task_list seharusnya tetap memuat aplikasi terarsip (%)', n; end if;
  select count(*) into n from public.source_snapshot_totals where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 0 then raise exception 'FAIL: source_snapshot_totals masih memuat aplikasi terarsip (%)', n; end if;
  select count(*) into n from public.source_snapshot_totals where source_id = '00000000-0000-0000-0000-0000000000f2';
  if n <> 1 then raise exception 'FAIL: aplikasi lain ikut tersaring (%)', n; end if;

  -- Data tidak berubah: tabel dasar tetap lengkap, dan view yang tidak disaring tetap memuatnya.
  select count(*) into n from public.tasks where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 2 then raise exception 'FAIL: task terhapus/berubah akibat archive (%)', n; end if;
  select count(*) into n from public.snapshots where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'FAIL: snapshot berubah akibat archive (%)', n; end if;
  select count(*) into n from public.source_tags where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'FAIL: source_tags seharusnya tidak disaring (%)', n; end if;
  select count(*) into n from public.source_status_counts where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'FAIL: source_status_counts seharusnya tidak disaring (%)', n; end if;
end $$;

-- 4. Release dan komponennya tidak terpengaruh oleh arsip aplikasi.
do $$
declare n int;
begin
  select count(*) into n from public.release_components rc join public.releases r on r.id = rc.release_id where r.name = 'T-arc';
  if n <> 2 then raise exception 'FAIL: komponen release berubah akibat arsip aplikasi (%)', n; end if;
end $$;

-- 5. Restore: kolom dikosongkan, aplikasi kembali ke view.
update public.sources set archived_at = null where id = '00000000-0000-0000-0000-0000000000f1';
do $$
declare n int;
begin
  select count(*) into n from public.task_list where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 2 then raise exception 'FAIL: task_list tidak pulih setelah restore (%)', n; end if;
  select count(*) into n from public.source_snapshot_totals where source_id = '00000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'FAIL: source_snapshot_totals tidak pulih setelah restore (%)', n; end if;
end $$;

-- 6. Release terarsip: kolom bisa diisi, baris tetap terbaca dari tabel, status lain tidak berubah.
do $$
declare ar timestamptz; ro date;
begin
  update public.releases set released_on = '2026-11-10', archived_at = now() where name = 'T-arc';
  select archived_at, released_on into ar, ro from public.releases where name = 'T-arc';
  if ar is null or ro <> '2026-11-10' then raise exception 'FAIL: arsip release salah (%, %)', ar, ro; end if;
  update public.releases set archived_at = null where name = 'T-arc';
  select archived_at, released_on into ar, ro from public.releases where name = 'T-arc';
  if ar is not null or ro <> '2026-11-10' then raise exception 'FAIL: restore release mengubah status lain (%, %)', ar, ro; end if;
end $$;

-- 7. Hak akses: authenticated membaca kolom baru tetapi tidak bisa menulisnya; anon tidak membaca apa pun.
update public.sources set archived_at = now() where id = '00000000-0000-0000-0000-0000000000f2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.sources where id = '00000000-0000-0000-0000-0000000000f2' and archived_at is not null;
  if n <> 1 then raise exception 'FAIL: authenticated tidak bisa membaca sources.archived_at (%)', n; end if;
  select count(*) into n from public.releases where name = 'T-arc' and archived_at is null;
  if n <> 1 then raise exception 'FAIL: authenticated tidak bisa membaca releases.archived_at (%)', n; end if;
  -- view disaring juga untuk pengguna login (security_invoker membaca sources.archived_at)
  select count(*) into n from public.source_snapshot_totals where source_id = '00000000-0000-0000-0000-0000000000f2';
  if n <> 0 then raise exception 'FAIL: source_snapshot_totals bagi authenticated memuat aplikasi terarsip (%)', n; end if;

  begin
    update public.sources set archived_at = null where id = '00000000-0000-0000-0000-0000000000f2';
    raise exception 'FAIL: authenticated bisa UPDATE sources';
  exception when insufficient_privilege then null; end;
  begin
    update public.releases set archived_at = now() where name = 'T-arc';
    raise exception 'FAIL: authenticated bisa UPDATE releases';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.task_list;
    raise exception 'FAIL: anon bisa SELECT task_list';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.source_snapshot_totals;
    raise exception 'FAIL: anon bisa SELECT source_snapshot_totals';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin raise notice 'UJI ARCHIVE LOLOS'; end $$;

rollback;

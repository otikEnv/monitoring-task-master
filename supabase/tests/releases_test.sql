-- Uji release dan komponennya (migrasi 20261107040000_releases.sql + 20261114010000_release_components.sql).
-- Jalankan SETELAH semua migrasi. Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI RELEASES LOLOS'.
-- Tidak bergantung pada data nyata: semua pemeriksaan hanya menyentuh release ber-nama awalan 'T-'.

begin;
select set_config('app.allow_any_domain', 'on', true); -- email uji non-@envisions.app (lihat migrasi google_sso)

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'viewer-rel@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000e1', 'Rel A', 'github', 'https://github.com/o/rel-a', 'RAHASIA'),
  ('00000000-0000-0000-0000-0000000000e2', 'Rel B', 'github', 'https://github.com/o/rel-b', 'RAHASIA');

-- 1. Buat release dua aplikasi lewat save_release: header dan dua komponen, nilai bawaan terisi.
do $$
declare rid uuid; r record; n int;
begin
  rid := public.save_release(null,
    '{"name":"T-v2.1","start_date":null,"target_date":"2026-11-20"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":100,"range_end":200},
      {"source_id":"00000000-0000-0000-0000-0000000000e2","tag":"main","range_start":20,"range_end":45}]'::jsonb);
  select * into r from public.releases where id = rid;
  if r.name <> 'T-v2.1' or r.start_date is null or r.released_on is not null then
    raise exception 'FAIL: header salah: %', row_to_json(r);
  end if;
  select count(*) into n from public.release_components where release_id = rid;
  if n <> 2 then raise exception 'FAIL: seharusnya 2 komponen, dapat %', n; end if;
  -- Rentang satu task diperbolehkan.
  perform public.save_release(null,
    '{"name":"T-v2.2","start_date":"2026-12-01","target_date":"2026-12-01"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":5,"range_end":5}]'::jsonb);
end $$;

-- 2. Ubah: komponen diganti seluruhnya, start_date kosong tidak mengubah nilai lama, released_on tidak disentuh.
do $$
declare rid uuid; before_start date; r record; n int;
begin
  select id, start_date into rid, before_start from public.releases where name = 'T-v2.1';
  update public.releases set released_on = '2026-11-18' where id = rid;
  perform public.save_release(rid,
    '{"name":"T-v2.1b","start_date":"","target_date":"2026-11-25"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000e2","tag":"main","range_start":1,"range_end":9}]'::jsonb);
  select * into r from public.releases where id = rid;
  if r.name <> 'T-v2.1b' or r.target_date <> '2026-11-25' or r.start_date <> before_start or r.released_on <> '2026-11-18' then
    raise exception 'FAIL: ubah header salah: %', row_to_json(r);
  end if;
  select count(*) into n from public.release_components where release_id = rid;
  if n <> 1 then raise exception 'FAIL: komponen tidak diganti (dapat %)', n; end if;
  if (select source_id from public.release_components where release_id = rid) <> '00000000-0000-0000-0000-0000000000e2' then
    raise exception 'FAIL: komponen lama masih ada';
  end if;
  -- Kembalikan nama untuk kasus berikutnya.
  perform public.save_release(rid, '{"name":"T-v2.1","target_date":"2026-11-25"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":100,"range_end":200},
      {"source_id":"00000000-0000-0000-0000-0000000000e2","tag":"main","range_start":20,"range_end":45}]'::jsonb);
end $$;

-- 3. save_release menolak data tidak valid dan tidak meninggalkan apa pun (atomik).
do $$
declare
  ok boolean; code text; q text;
  before_rel int; before_comp int;
  s1 text := '{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":1,"range_end":5}';
  eleven text;
  cases text[][];
begin
  select string_agg(format('{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"t%s","range_start":1,"range_end":5}', i), ',')
    into eleven from generate_series(1, 11) i;

  select count(*) into before_rel from public.releases where name like 'T-%';
  select count(*) into before_comp from public.release_components rc join public.releases r on r.id = rc.release_id where r.name like 'T-%';

  -- {nama, id, header, komponen, kode galat yang diharapkan}
  cases := array[
    array['0 komponen',          null, '{"name":"T-x1","target_date":"2026-11-20"}', '[]', '23514'],
    array['11 komponen',         null, '{"name":"T-x2","target_date":"2026-11-20"}', '[' || eleven || ']', '23514'],
    array['bukan array',         null, '{"name":"T-x3","target_date":"2026-11-20"}', '{}', '23514'],
    array['pasangan ganda',      null, '{"name":"T-x4","target_date":"2026-11-20"}', '[' || s1 || ',' || s1 || ']', '23505'],
    array['rentang terbalik',    null, '{"name":"T-x5","target_date":"2026-11-20"}', '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":10,"range_end":5}]', '23514'],
    array['rentang nol',         null, '{"name":"T-x6","target_date":"2026-11-20"}', '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":0,"range_end":5}]', '23514'],
    array['tag kosong',          null, '{"name":"T-x7","target_date":"2026-11-20"}', '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"  ","range_start":1,"range_end":5}]', '23514'],
    array['aplikasi tidak ada',  null, '{"name":"T-x8","target_date":"2026-11-20"}', '[{"source_id":"00000000-0000-0000-0000-0000000000ff","tag":"master","range_start":1,"range_end":5}]', '23503'],
    array['nama ganda',          null, '{"name":"T-v2.1","target_date":"2026-11-20"}', '[' || s1 || ']', '23505'],
    array['nama kosong',         null, '{"name":"   ","target_date":"2026-11-20"}', '[' || s1 || ']', '23514'],
    array['nama 101 karakter',   null, format('{"name":"%s","target_date":"2026-11-20"}', repeat('a', 101)), '[' || s1 || ']', '23514'],
    array['mulai setelah target',null, '{"name":"T-x9","start_date":"2026-11-21","target_date":"2026-11-20"}', '[' || s1 || ']', '23514'],
    array['komponen ke-2 tidak valid (atomik)', null, '{"name":"T-x10","target_date":"2026-11-20"}',
          '[' || s1 || ',{"source_id":"00000000-0000-0000-0000-0000000000e2","tag":"main","range_start":9,"range_end":1}]', '23514'],
    array['release tidak ada',    '00000000-0000-0000-0000-00000000dead', '{"name":"T-x11","target_date":"2026-11-20"}', '[' || s1 || ']', 'P0002']
  ];

  for i in 1 .. array_length(cases, 1) loop
    ok := false;
    begin
      perform public.save_release(cases[i][2]::uuid, cases[i][3]::jsonb, cases[i][4]::jsonb);
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      ok := (code = cases[i][5]);
      if not ok then raise exception 'FAIL: "%" menghasilkan % (harapan %)', cases[i][1], code, cases[i][5]; end if;
    end;
    if not ok then raise exception 'FAIL: "%" seharusnya ditolak', cases[i][1]; end if;
  end loop;

  if (select count(*) from public.releases where name like 'T-%') <> before_rel then
    raise exception 'FAIL: penolakan meninggalkan release';
  end if;
  if (select count(*) from public.release_components rc join public.releases r on r.id = rc.release_id where r.name like 'T-%') <> before_comp then
    raise exception 'FAIL: penolakan meninggalkan komponen';
  end if;

  -- Ubah yang gagal tidak boleh menghapus komponen lama (atomik).
  ok := false;
  begin
    perform public.save_release((select id from public.releases where name = 'T-v2.1'),
      '{"name":"T-v2.1","target_date":"2026-11-20"}'::jsonb,
      '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":9,"range_end":1}]'::jsonb);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: ubah tidak valid seharusnya ditolak'; end if;
  if (select count(*) from public.release_components rc join public.releases r on r.id = rc.release_id where r.name = 'T-v2.1') <> 2 then
    raise exception 'FAIL: ubah yang gagal mengubah komponen lama';
  end if;
end $$;

-- 4. Constraint langsung pada tabel.
do $$
declare ok boolean; rid uuid;
begin
  select id into rid from public.releases where name = 'T-v2.1';
  ok := false;
  begin
    insert into public.release_components (release_id, source_id, tag, range_start, range_end)
    values (rid, '00000000-0000-0000-0000-0000000000e1', 'master', 1, 2);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: pasangan (release, aplikasi, tag) ganda diterima'; end if;

  ok := false;
  begin
    insert into public.releases (name, target_date) values ('T-v2.1', '2026-11-20');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL: nama release ganda diterima'; end if;

  -- Aplikasi sama dengan tag berbeda pada satu release diperbolehkan.
  insert into public.release_components (release_id, source_id, tag, range_start, range_end)
  values (rid, '00000000-0000-0000-0000-0000000000e1', 'mobile', 1, 2);
  delete from public.release_components where release_id = rid and tag = 'mobile';
end $$;

-- 5. updated_at diperbarui otomatis oleh trigger.
do $$
declare ts timestamptz;
begin
  update public.releases set released_on = '2026-12-01' where name = 'T-v2.2';
  select updated_at into ts from public.releases where name = 'T-v2.2';
  if ts < now() - interval '1 minute' then raise exception 'FAIL: updated_at tidak diperbarui'; end if;
end $$;

-- 6. Hak akses: authenticated hanya SELECT dan tidak bisa memanggil save_release.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.releases where name like 'T-%';
  if n <> 2 then raise exception 'FAIL: authenticated seharusnya melihat 2 release uji, dapat %', n; end if;
  select count(*) into n from public.release_components rc join public.releases r on r.id = rc.release_id where r.name like 'T-%';
  if n <> 3 then raise exception 'FAIL: authenticated seharusnya melihat 3 komponen uji, dapat %', n; end if;

  begin
    insert into public.releases (name, target_date) values ('T-hack', '2026-11-20');
    raise exception 'FAIL: authenticated bisa INSERT release';
  exception when insufficient_privilege then null; end;
  begin
    update public.releases set name = 'hack';
    raise exception 'FAIL: authenticated bisa UPDATE release';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.releases;
    raise exception 'FAIL: authenticated bisa DELETE release';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.release_components (release_id, source_id, tag, range_start, range_end)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000e1', 'x', 1, 2);
    raise exception 'FAIL: authenticated bisa INSERT komponen';
  exception when insufficient_privilege then null; end;
  begin
    update public.release_components set tag = 'hack';
    raise exception 'FAIL: authenticated bisa UPDATE komponen';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.release_components;
    raise exception 'FAIL: authenticated bisa DELETE komponen';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_release(null, '{"name":"T-hack","target_date":"2026-11-20"}'::jsonb,
      '[{"source_id":"00000000-0000-0000-0000-0000000000e1","tag":"master","range_start":1,"range_end":2}]'::jsonb);
    raise exception 'FAIL: authenticated bisa menjalankan save_release';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- anon tidak bisa membaca maupun menjalankan apa pun.
set local role anon;
do $$
begin
  begin
    perform 1 from public.releases;
    raise exception 'FAIL: anon bisa SELECT releases';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.release_components;
    raise exception 'FAIL: anon bisa SELECT release_components';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_release(null, '{}'::jsonb, '[]'::jsonb);
    raise exception 'FAIL: anon bisa menjalankan save_release';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 7. Cascade: menghapus aplikasi menghapus komponennya (release tetap); menghapus release menghapus komponennya.
do $$
declare n int; rid uuid;
begin
  select id into rid from public.releases where name = 'T-v2.1';
  delete from public.sources where id = '00000000-0000-0000-0000-0000000000e1';
  select count(*) into n from public.release_components where source_id = '00000000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'FAIL: komponen aplikasi terhapus tidak ikut hilang (sisa %)', n; end if;
  select count(*) into n from public.release_components where release_id = rid;
  if n <> 1 then raise exception 'FAIL: komponen aplikasi lain ikut terhapus (sisa %)', n; end if;
  if not exists (select 1 from public.releases where id = rid) then
    raise exception 'FAIL: release ikut terhapus saat salah satu aplikasinya dihapus';
  end if;

  delete from public.releases where id = rid;
  select count(*) into n from public.release_components where release_id = rid;
  if n <> 0 then raise exception 'FAIL: komponen tidak ikut terhapus bersama release (sisa %)', n; end if;
end $$;

do $$ begin raise notice 'UJI RELEASES LOLOS'; end $$;

rollback;

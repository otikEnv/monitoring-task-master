-- Uji tabel public.releases. Jalankan SETELAH semua migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI RELEASES LOLOS'.

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'viewer-rel@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000e1', 'Rel A', 'github', 'https://github.com/o/rel-a', 'RAHASIA'),
  ('00000000-0000-0000-0000-0000000000e2', 'Rel B', 'github', 'https://github.com/o/rel-b', 'RAHASIA');

-- 1. Insert valid, nilai bawaan terisi; rentang satu task diperbolehkan.
do $$
declare r record;
begin
  insert into public.releases (source_id, tag, name, range_start, range_end, target_date)
  values ('00000000-0000-0000-0000-0000000000e1', 'master', 'v2.1', 100, 200, '2026-11-20');
  select * into r from public.releases where name = 'v2.1';
  if r.start_date is null or r.released_on is not null or r.id is null then
    raise exception 'FAIL: nilai bawaan salah: %', row_to_json(r);
  end if;
  insert into public.releases (source_id, tag, name, range_start, range_end, target_date, start_date)
  values ('00000000-0000-0000-0000-0000000000e1', 'master', 'v2.2', 5, 5, '2026-12-01', '2026-12-01');
end $$;

-- 2. Constraint menolak data tidak valid; nama sama pada aplikasi berbeda diterima.
do $$
declare bad text[]; q text; ok boolean;
begin
  bad := array[
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','master','x1', 10, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','master','x2', 0, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date, start_date) values ('00000000-0000-0000-0000-0000000000e1','master','x3', 1, 5, '2026-11-20', '2026-11-21')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','master','   ', 1, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','master', repeat('a', 101), 1, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','','x6', 1, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000e1','master','v2.1', 1, 5, '2026-11-20')$q$,
    $q$insert into public.releases (source_id, tag, name, range_start, range_end, target_date) values ('00000000-0000-0000-0000-0000000000ff','master','x8', 1, 5, '2026-11-20')$q$
  ];
  foreach q in array bad loop
    ok := false;
    begin
      execute q;
    exception when check_violation or unique_violation or foreign_key_violation then
      ok := true;
    end;
    if not ok then raise exception 'FAIL: seharusnya ditolak: %', q; end if;
  end loop;

  insert into public.releases (source_id, tag, name, range_start, range_end, target_date)
  values ('00000000-0000-0000-0000-0000000000e2', 'master', 'v2.1', 1, 50, '2026-11-20');
end $$;

-- 3. updated_at diperbarui otomatis oleh trigger.
do $$
declare ts timestamptz;
begin
  update public.releases set released_on = '2026-12-01' where name = 'v2.2';
  select updated_at into ts from public.releases where name = 'v2.2';
  if ts < now() - interval '1 minute' then raise exception 'FAIL: updated_at tidak diperbarui'; end if;
end $$;

-- 4. Hak akses: authenticated hanya SELECT.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.releases;
  if n <> 3 then raise exception 'FAIL: authenticated seharusnya melihat 3 release, dapat %', n; end if;

  begin
    insert into public.releases (source_id, tag, name, range_start, range_end, target_date)
    values ('00000000-0000-0000-0000-0000000000e1', 'master', 'hack', 1, 2, '2026-11-20');
    raise exception 'FAIL: authenticated bisa INSERT';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.releases set name = 'hack';
    raise exception 'FAIL: authenticated bisa UPDATE';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.releases;
    raise exception 'FAIL: authenticated bisa DELETE';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- anon tidak bisa membaca apa pun.
set local role anon;
do $$
begin
  begin
    perform 1 from public.releases;
    raise exception 'FAIL: anon bisa SELECT';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 5. Menghapus sumber ikut menghapus release-nya, release aplikasi lain tetap.
do $$
declare n int;
begin
  delete from public.sources where id = '00000000-0000-0000-0000-0000000000e1';
  select count(*) into n from public.releases where source_id = '00000000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'FAIL: release tidak ikut terhapus (sisa %)', n; end if;
  select count(*) into n from public.releases;
  if n <> 1 then raise exception 'FAIL: release aplikasi lain ikut terhapus (sisa %)', n; end if;
end $$;

do $$ begin raise notice 'UJI RELEASES LOLOS'; end $$;

rollback;

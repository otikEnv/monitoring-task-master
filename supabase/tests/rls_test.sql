-- Uji skema dan RLS. Jalankan SETELAH migrasi, di SQL editor Supabase atau psql.
-- Semuanya di dalam transaksi dan di-ROLLBACK; tidak meninggalkan data.
-- Gagal = ada EXCEPTION 'FAIL: ...'. Sukses = muncul NOTICE 'SEMUA UJI LOLOS'.

begin;

-- Data uji (sebagai superuser/postgres)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'viewer@test.local');

update public.profiles set role = 'admin'
where user_id = '00000000-0000-0000-0000-0000000000a1';

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-00000000c001', 'App A', 'github', 'https://github.com/o/a', 'RAHASIA'),
  ('00000000-0000-0000-0000-00000000c002', 'App B', 'github', 'https://github.com/o/b', 'RAHASIA');

-- 1. ID task yang sama boleh ada di tag atau sumber berbeda; duplikat penuh ditolak.
do $$
begin
  insert into public.tasks (source_id, tag, task_id, title, status) values
    ('00000000-0000-0000-0000-00000000c001', 'master', '1', 'A1', 'done'),
    ('00000000-0000-0000-0000-00000000c001', 'feat',   '1', 'A1 feat', 'pending'),
    ('00000000-0000-0000-0000-00000000c002', 'master', '1', 'B1', 'pending');
  begin
    insert into public.tasks (source_id, tag, task_id, title, status)
    values ('00000000-0000-0000-0000-00000000c001', 'master', '1', 'dup', 'done');
    raise exception 'FAIL: duplikat (source, tag, id) seharusnya ditolak';
  exception when unique_violation then null;
  end;
end $$;

insert into public.snapshots (source_id, tag, total, done)
values ('00000000-0000-0000-0000-00000000c001', 'master', 4, 1);

-- 2. percent_done dihitung otomatis.
do $$
begin
  if (select percent_done from public.snapshots limit 1) <> 25.00 then
    raise exception 'FAIL: percent_done seharusnya 25.00';
  end if;
end $$;

-- 3. Pengguna anon tidak membaca apa pun.
set local role anon;
do $$
begin
  begin
    perform 1 from public.tasks;
    raise exception 'FAIL: anon bisa membaca tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.sources;
    raise exception 'FAIL: anon bisa membaca sources';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 4. Viewer: boleh baca, tidak boleh menulis, tidak bisa membaca token.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  if n <> 3 then raise exception 'FAIL: viewer seharusnya melihat 3 task, dapat %', n; end if;

  select count(*) into n from public.snapshots;
  if n <> 1 then raise exception 'FAIL: viewer seharusnya melihat 1 snapshot, dapat %', n; end if;

  -- kolom non-token terbaca
  select count(*) into n from public.sources;
  if n <> 2 then raise exception 'FAIL: viewer seharusnya melihat 2 sumber, dapat %', n; end if;

  -- token tidak terbaca
  begin
    perform token_encrypted from public.sources;
    raise exception 'FAIL: token_encrypted terbaca oleh viewer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.sources;  -- select * menyentuh kolom token
    raise exception 'FAIL: select * pada sources seharusnya ditolak';
  exception when insufficient_privilege then null;
  end;

  -- tidak boleh menulis
  begin
    insert into public.sources (name, provider, repo_url) values ('X', 'github', 'https://github.com/o/x');
    raise exception 'FAIL: viewer bisa insert sources';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.sources set name = 'Hack';
    raise exception 'FAIL: viewer bisa update sources';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tasks;
    raise exception 'FAIL: viewer bisa delete tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.snapshots (source_id, tag) values ('00000000-0000-0000-0000-00000000c001', 'x');
    raise exception 'FAIL: viewer bisa insert snapshots';
  exception when insufficient_privilege then null;
  end;

  -- profil: hanya miliknya sendiri
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: viewer seharusnya hanya melihat 1 profil, dapat %', n; end if;
end $$;
reset role;

-- 5. Admin: melihat semua profil, tetap tidak bisa membaca token lewat klien.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'FAIL: admin seharusnya melihat 2 profil, dapat %', n; end if;
  begin
    perform token_encrypted from public.sources;
    raise exception 'FAIL: token_encrypted terbaca oleh admin lewat klien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6. Hapus sumber menghapus task dan snapshot-nya (cascade).
do $$
declare n int;
begin
  delete from public.sources where id = '00000000-0000-0000-0000-00000000c001';
  select count(*) into n from public.tasks where source_id = '00000000-0000-0000-0000-00000000c001';
  if n <> 0 then raise exception 'FAIL: task tidak ikut terhapus (cascade)'; end if;
  select count(*) into n from public.snapshots;
  if n <> 0 then raise exception 'FAIL: snapshot tidak ikut terhapus (cascade)'; end if;
end $$;

do $$ begin raise notice 'SEMUA UJI LOLOS'; end $$;

rollback;

-- Uji RBAC (migrasi 20261125000000_rbac_roles.sql dan 20261125010000_rbac.sql). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI RBAC LOLOS'.
-- Tidak bergantung pada data nyata. Pengaman "superadmin terakhir" diuji dengan menonaktifkan sementara superadmin
-- nyata di dalam transaksi ini (ikut di-ROLLBACK).

begin;
select set_config('app.allow_any_domain', 'on', true);

-- 1. Role bawaan: semua cara daftar = viewer; initial_role dari admin API dipakai; nilai asing diabaikan.
do $$
declare r public.user_role;
begin
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-00000000a001', 'sa1-rbac@test.local', '{"provider":"email","initial_role":"superadmin"}'),
    ('00000000-0000-0000-0000-00000000a002', 'sa2-rbac@test.local', '{"provider":"email","initial_role":"superadmin"}'),
    ('00000000-0000-0000-0000-00000000a003', 'adm-rbac@test.local', '{"provider":"email","initial_role":"admin"}'),
    ('00000000-0000-0000-0000-00000000a004', 'dev-rbac@test.local', '{"provider":"email","initial_role":"developer"}'),
    ('00000000-0000-0000-0000-00000000a005', 'view-rbac@test.local', '{"provider":"google","providers":["google"]}'),
    ('00000000-0000-0000-0000-00000000a006', 'odd-rbac@test.local', '{"provider":"email","initial_role":"root"}');
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001';
  if r <> 'superadmin' then raise exception 'FAIL: initial_role superadmin, dapat %', r; end if;
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-00000000a004';
  if r <> 'developer' then raise exception 'FAIL: initial_role developer, dapat %', r; end if;
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-00000000a005';
  if r <> 'viewer' then raise exception 'FAIL: akun Google baru harus viewer, dapat %', r; end if;
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-00000000a006';
  if r <> 'viewer' then raise exception 'FAIL: initial_role asing harus viewer, dapat %', r; end if;
end $$;

-- 2. active_role: nonaktif = null.
do $$
begin
  if public.active_role('00000000-0000-0000-0000-00000000a003') <> 'admin' then raise exception 'FAIL: active_role admin'; end if;
  update public.profiles set disabled_at = now() where user_id = '00000000-0000-0000-0000-00000000a006';
  if public.active_role('00000000-0000-0000-0000-00000000a006') is not null then raise exception 'FAIL: nonaktif masih punya role'; end if;
  if public.active_role(gen_random_uuid()) is not null then raise exception 'FAIL: user tidak ada punya role'; end if;
end $$;

-- 3. set_user_role dan set_user_active: hanya superadmin, bukan diri sendiri, tercatat.
do $$
declare ok boolean; n int; d jsonb;
begin
  -- admin bukan superadmin
  ok := false;
  begin perform public.set_user_role('00000000-0000-0000-0000-00000000a003', 'adm', '00000000-0000-0000-0000-00000000a005', 'v', 'admin');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: admin bisa mengganti role'; end if;

  -- diri sendiri
  ok := false;
  begin perform public.set_user_role('00000000-0000-0000-0000-00000000a001', 'sa1', '00000000-0000-0000-0000-00000000a001', 'sa1', 'viewer');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: superadmin bisa menurunkan dirinya sendiri'; end if;
  ok := false;
  begin perform public.set_user_active('00000000-0000-0000-0000-00000000a001', 'sa1', '00000000-0000-0000-0000-00000000a001', 'sa1', false);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: superadmin bisa menonaktifkan dirinya sendiri'; end if;

  -- user tidak ada
  ok := false;
  begin perform public.set_user_role('00000000-0000-0000-0000-00000000a001', 'sa1', gen_random_uuid(), 'x', 'admin');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception 'FAIL: user tidak ada tidak ditolak'; end if;

  -- sukses + log
  perform public.set_user_role('00000000-0000-0000-0000-00000000a001', 'sa1@x', '00000000-0000-0000-0000-00000000a005', 'v@x', 'developer');
  if public.active_role('00000000-0000-0000-0000-00000000a005') <> 'developer' then raise exception 'FAIL: role tidak berubah'; end if;
  select detail into d from public.user_admin_events where target_id = '00000000-0000-0000-0000-00000000a005' and action = 'role_changed';
  if d <> '{"from":"viewer","to":"developer"}'::jsonb then raise exception 'FAIL: log role salah %', d; end if;
  -- role sama: tidak dicatat lagi
  perform public.set_user_role('00000000-0000-0000-0000-00000000a001', 'sa1@x', '00000000-0000-0000-0000-00000000a005', 'v@x', 'developer');
  select count(*) into n from public.user_admin_events where target_id = '00000000-0000-0000-0000-00000000a005';
  if n <> 1 then raise exception 'FAIL: perubahan tanpa beda tercatat (%)', n; end if;

  perform public.set_user_active('00000000-0000-0000-0000-00000000a001', 'sa1@x', '00000000-0000-0000-0000-00000000a005', 'v@x', false);
  if public.active_role('00000000-0000-0000-0000-00000000a005') is not null then raise exception 'FAIL: tidak nonaktif'; end if;
  perform public.set_user_active('00000000-0000-0000-0000-00000000a001', 'sa1@x', '00000000-0000-0000-0000-00000000a005', 'v@x', true);
  if public.active_role('00000000-0000-0000-0000-00000000a005') <> 'developer' then raise exception 'FAIL: tidak aktif kembali'; end if;
  select count(*) into n from public.user_admin_events
   where target_id = '00000000-0000-0000-0000-00000000a005' and action in ('user_disabled', 'user_enabled');
  if n <> 2 then raise exception 'FAIL: log status (%)', n; end if;

  -- superadmin nonaktif tidak bisa bertindak
  update public.profiles set disabled_at = now() where user_id = '00000000-0000-0000-0000-00000000a002';
  ok := false;
  begin perform public.set_user_role('00000000-0000-0000-0000-00000000a002', 'sa2', '00000000-0000-0000-0000-00000000a005', 'v', 'admin');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: superadmin nonaktif bisa bertindak'; end if;
  update public.profiles set disabled_at = null where user_id = '00000000-0000-0000-0000-00000000a002';
end $$;

-- 4. Superadmin terakhir: hanya a001 dan a002 yang aktif (superadmin lain dinonaktifkan sementara).
do $$
declare ok boolean;
begin
  update public.profiles set disabled_at = now()
   where role = 'superadmin' and user_id not in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002');

  -- a001 menurunkan a002: masih ada a001 → boleh
  perform public.set_user_role('00000000-0000-0000-0000-00000000a001', 'sa1', '00000000-0000-0000-0000-00000000a002', 'sa2', 'admin');
  -- kembalikan, lalu nonaktifkan a001 lewat a002 → masih ada a002 → boleh
  update public.profiles set role = 'superadmin' where user_id = '00000000-0000-0000-0000-00000000a002';
  perform public.set_user_active('00000000-0000-0000-0000-00000000a002', 'sa2', '00000000-0000-0000-0000-00000000a001', 'sa1', false);
  -- a002 sekarang satu-satunya superadmin aktif. Paksa jalur "superadmin terakhir" langsung lewat helper.
  ok := false;
  begin perform public.assert_keeps_superadmin('00000000-0000-0000-0000-00000000a002');
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: superadmin terakhir tidak dijaga'; end if;
  -- menonaktifkan superadmin yang sudah nonaktif (a001) tidak memicu penjaga, mengaktifkan kembali boleh
  perform public.set_user_active('00000000-0000-0000-0000-00000000a002', 'sa2', '00000000-0000-0000-0000-00000000a001', 'sa1', true);
end $$;

-- 5. Akses menu: seed, kunci, diff, log.
do $$
declare ok boolean; n int; d jsonb;
begin
  select count(*) into n from public.role_menu_access where role = 'admin';
  if n <> 8 then raise exception 'FAIL: seed admin harus 8 menu (%)', n; end if;
  if exists (select 1 from public.role_menu_access where menu = 'sources' and role <> 'admin') then
    raise exception 'FAIL: sources untuk selain admin di seed';
  end if;

  perform public.set_menu_access('00000000-0000-0000-0000-00000000a001', 'sa1', 'viewer', array['calendar', 'notes']);
  select count(*) into n from public.role_menu_access where role = 'viewer';
  if n <> 3 then raise exception 'FAIL: viewer harus 3 menu (calendar, notes, dashboard) (%)', n; end if;
  if not exists (select 1 from public.role_menu_access where role = 'viewer' and menu = 'dashboard') then
    raise exception 'FAIL: dashboard tidak otomatis';
  end if;
  select detail into d from public.user_admin_events where action = 'menu_access_changed' order by created_at desc limit 1;
  if d -> 'removed' <> '["archive","release","tasks","trend"]'::jsonb or d -> 'added' <> '[]'::jsonb then
    raise exception 'FAIL: log menu salah %', d;
  end if;

  ok := false;
  begin perform public.set_menu_access('00000000-0000-0000-0000-00000000a001', 'sa1', 'developer', array['sources']);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: sources untuk developer diterima'; end if;
  ok := false;
  begin perform public.set_menu_access('00000000-0000-0000-0000-00000000a001', 'sa1', 'viewer', array['hack']);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: menu asing diterima'; end if;
  ok := false;
  begin perform public.set_menu_access('00000000-0000-0000-0000-00000000a001', 'sa1', 'superadmin', array['calendar']);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: role superadmin di matriks diterima'; end if;
  ok := false;
  begin perform public.set_menu_access('00000000-0000-0000-0000-00000000a003', 'adm', 'viewer', array['calendar']);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: admin bisa mengubah akses menu'; end if;
end $$;

-- 6. Hak tulis developer dan viewer: komentar, action item, activity release.
do $$
declare ok boolean; nid uuid; it uuid; c uuid; rid uuid; mine uuid; other uuid; h uuid;
  dev uuid := '00000000-0000-0000-0000-00000000a004';
  adm uuid := '00000000-0000-0000-0000-00000000a003';
  vw uuid := '00000000-0000-0000-0000-00000000a006';
begin
  update public.profiles set disabled_at = null where user_id = vw; -- viewer aktif

  nid := public.save_note(null, adm, 'adm', '{"title":"T-rbac","note_date":"2026-11-25","kind":"meeting","body":""}'::jsonb, '[]',
    jsonb_build_array(jsonb_build_object('body', 'tugas', 'assignee_id', dev, 'assignee_email', 'dev'), jsonb_build_object('body', 'tugas v', 'assignee_id', vw, 'assignee_email', 'v')));
  select id into it from public.note_action_items where note_id = nid and body = 'tugas';

  c := public.add_note_comment(nid, dev, 'dev', 'dari developer');
  perform public.edit_note_comment(c, dev, 'ubah');
  perform public.set_action_item_done(it, dev, true);

  ok := false;
  begin perform public.add_note_comment(nid, vw, 'v', 'dari viewer');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: viewer bisa berkomentar'; end if;
  ok := false;
  begin perform public.set_action_item_done((select id from public.note_action_items where note_id = nid and body = 'tugas v'), vw, true);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: viewer bisa mencentang action item'; end if;

  -- developer nonaktif ditolak
  update public.profiles set disabled_at = now() where user_id = dev;
  ok := false;
  begin perform public.edit_note_comment(c, dev, 'lagi');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: developer nonaktif bisa mengubah komentar'; end if;
  update public.profiles set disabled_at = null where user_id = dev;
  perform public.delete_note_comment(c, dev);

  -- activity release
  insert into public.sources (id, name, provider, repo_url, token_encrypted) values
    ('00000000-0000-0000-0000-00000000a0c1', 'T-rbac A', 'github', 'https://github.com/o/rbac-a', 'RAHASIA');
  rid := public.save_release(null, '{"name":"T-rbac","target_date":"2026-12-20"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-00000000a0c1","tag":"master","range_start":1,"range_end":9}]'::jsonb);
  mine := public.add_release_note(rid, 'milik developer', dev, 'dev');
  other := public.add_release_note(rid, 'milik admin', adm, 'adm');
  h := public.hold_release(rid, 'tahan', adm, 'adm');

  perform public.edit_release_note(mine, 'milik developer (ubah)', dev, 'dev');
  ok := false;
  begin perform public.edit_release_note(other, 'x', dev, 'dev');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: developer bisa mengubah Note orang lain'; end if;
  ok := false;
  begin perform public.edit_release_note(h, 'x', dev, 'dev');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: developer bisa mengubah entri Hold'; end if;
  ok := false;
  begin perform public.delete_release_note(other, dev);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: developer bisa menghapus Note orang lain'; end if;
  ok := false;
  begin perform public.add_release_note(rid, 'x', vw, 'v');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: viewer bisa menambah activity'; end if;

  -- admin tetap bisa semua entri
  perform public.edit_release_note(mine, 'diubah admin', adm, 'adm');
  perform public.edit_release_note(h, 'tahan (diubah)', adm, 'adm');
  perform public.delete_release_note(mine, dev); -- milik dev sendiri: boleh (teks diubah admin tidak mengubah penulis)
  perform public.delete_release_note(other, adm);
end $$;

-- 7. Hak akses klien: role_menu_access terbaca; user_admin_events hanya superadmin; fungsi tidak bisa dipanggil.
do $$
begin
  if has_function_privilege('authenticated', 'public.set_user_role(uuid, text, uuid, text, public.user_role)', 'execute')
     or has_function_privilege('authenticated', 'public.set_user_active(uuid, text, uuid, text, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.set_menu_access(uuid, text, public.user_role, text[])', 'execute')
     or has_function_privilege('authenticated', 'public.log_user_event(uuid, text, uuid, text, text, public.user_role)', 'execute')
     or has_function_privilege('authenticated', 'public.active_role(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.edit_release_note(uuid, text, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.delete_release_note(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.set_user_role(uuid, text, uuid, text, public.user_role)', 'execute') then
    raise exception 'FAIL: fungsi RBAC dapat dieksekusi klien';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.role_menu_access;
  if n = 0 then raise exception 'FAIL: authenticated tidak bisa membaca role_menu_access'; end if;
  select count(*) into n from public.user_admin_events;
  if n <> 0 then raise exception 'FAIL: admin bisa membaca user_admin_events (%)', n; end if;
  begin
    insert into public.role_menu_access (role, menu) values ('viewer', 'trend');
    raise exception 'FAIL: authenticated bisa menulis role_menu_access';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role = 'superadmin' where user_id = '00000000-0000-0000-0000-00000000a003';
    raise exception 'FAIL: authenticated bisa mengubah profiles';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.user_admin_events;
  if n = 0 then raise exception 'FAIL: superadmin tidak bisa membaca user_admin_events'; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.role_menu_access;
    raise exception 'FAIL: anon bisa membaca role_menu_access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin raise notice 'UJI RBAC LOLOS'; end $$;

rollback;

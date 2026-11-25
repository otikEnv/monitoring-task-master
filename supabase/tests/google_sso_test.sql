-- Uji batas domain dan role bawaan (migrasi 20261114000000_google_sso.sql, role bawaan diubah oleh
-- 20261125010000_rbac.sql: semua akun baru viewer). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI GOOGLE SSO LOLOS'.
-- Sengaja TIDAK memakai app.allow_any_domain, kecuali pada kasus 5.

begin;

-- 1. Akun Google @envisions.app: diterima, role viewer (RBAC: aturan lama Google = admin dihapus).
do $$
declare r public.user_role;
begin
  insert into auth.users (id, email, raw_app_meta_data)
  values ('00000000-0000-0000-0000-0000000000f1', 'dev@envisions.app', '{"provider":"google","providers":["google"]}');
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1';
  if r is distinct from 'viewer' then raise exception 'FAIL: akun Google harus viewer, dapat %', r; end if;
end $$;

-- 2. Akun email+password @envisions.app: diterima, role viewer. Huruf besar pada domain diterima.
do $$
declare r public.user_role;
begin
  insert into auth.users (id, email, raw_app_meta_data)
  values ('00000000-0000-0000-0000-0000000000f2', 'Staff@ENVISIONS.APP', '{"provider":"email","providers":["email"]}');
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
  if r is distinct from 'viewer' then raise exception 'FAIL: akun email harus viewer, dapat %', r; end if;

  -- Tanpa raw_app_meta_data juga viewer.
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'plain@envisions.app');
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f3';
  if r is distinct from 'viewer' then raise exception 'FAIL: akun tanpa metadata harus viewer, dapat %', r; end if;
end $$;

-- 3. Email di luar domain ditolak untuk semua penyedia, termasuk variasi yang menyerupai.
do $$
declare cases text[][]; c text[]; ok boolean;
begin
  cases := array[
    array['google', 'orang@gmail.com'],
    array['email',  'orang@gmail.com'],
    array['email',  'orang@envisions.app.evil.com'],
    array['email',  'orang@evil-envisions.app'],
    array['email',  'orang@sub.envisions.app'],
    array['email',  'a@b@envisions.app'],
    array['email',  ' @envisions.app'],
    array['email',  '@envisions.app']
  ];
  foreach c slice 1 in array cases loop
    ok := false;
    begin
      insert into auth.users (id, email, raw_app_meta_data)
      values (gen_random_uuid(), c[2], jsonb_build_object('provider', c[1]));
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'FAIL: email % (%) seharusnya ditolak', c[2], c[1]; end if;
  end loop;

  -- Email kosong (NULL) juga ditolak.
  ok := false;
  begin
    insert into auth.users (id, email) values (gen_random_uuid(), null);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: email NULL seharusnya ditolak'; end if;
end $$;

-- 4. Penolakan tidak meninggalkan baris apa pun.
do $$
declare n int;
begin
  select count(*) into n from auth.users where email like '%@gmail.com' or email like '%evil%';
  if n <> 0 then raise exception 'FAIL: % akun luar domain tercipta', n; end if;
end $$;

-- 5. Pengecualian skrip uji: hanya dengan GUC eksplisit (koneksi ini login sebagai postgres).
do $$
declare r public.user_role;
begin
  perform set_config('app.allow_any_domain', 'on', true);
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f4', 'uji@test.local');
  select role into r from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f4';
  if r is distinct from 'viewer' then raise exception 'FAIL: akun uji harus viewer, dapat %', r; end if;
  perform set_config('app.allow_any_domain', 'off', true);
end $$;

-- 6. Fungsi pemeriksa tidak bisa dipanggil klien.
do $$
begin
  if has_function_privilege('anon', 'public.enforce_allowed_email_domain()', 'execute')
     or has_function_privilege('authenticated', 'public.enforce_allowed_email_domain()', 'execute') then
    raise exception 'FAIL: enforce_allowed_email_domain() dapat dieksekusi klien';
  end if;
end $$;

do $$ begin raise notice 'UJI GOOGLE SSO LOLOS'; end $$;

rollback;

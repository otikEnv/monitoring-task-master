-- Uji balasan komentar (migrasi 20261124010000_note_comment_replies.sql). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI BALASAN KOMENTAR LOLOS'.

begin;
select set_config('app.allow_any_domain', 'on', true);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'a-reply@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'b-reply@test.local');
-- RBAC (20261125010000): berkomentar butuh role selain viewer.
update public.profiles set role = 'developer' where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to public;

do $$
declare n1 uuid; n2 uuid; c1 uuid; r1 uuid; r2 uuid; p uuid; n int; b text; d timestamptz;
begin
  n1 := public.save_note(null, '00000000-0000-0000-0000-0000000000f1', 'a-reply@test.local',
    '{"title":"T-reply","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb, '[]', '[]');
  n2 := public.save_note(null, '00000000-0000-0000-0000-0000000000f1', 'a-reply@test.local',
    '{"title":"T-reply-2","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb, '[]', '[]');

  -- Komentar utama dan balasan.
  c1 := public.add_note_comment(n1, '00000000-0000-0000-0000-0000000000f1', 'a-reply@test.local', 'utama');
  r1 := public.add_note_comment(n1, '00000000-0000-0000-0000-0000000000f2', 'b-reply@test.local', 'balasan', c1);
  select parent_id into p from public.note_comments where id = r1;
  if p is distinct from c1 then raise exception 'FAIL: balasan tidak menempel ke komentar utama'; end if;

  -- Membalas balasan = masuk utas komentar utama (satu tingkat).
  r2 := public.add_note_comment(n1, '00000000-0000-0000-0000-0000000000f1', 'a-reply@test.local', 'balas balasan', r1);
  select parent_id into p from public.note_comments where id = r2;
  if p is distinct from c1 then raise exception 'FAIL: balasan bertingkat seharusnya ke komentar utama'; end if;

  -- Induk dari catatan lain ditolak; induk yang tidak ada ditolak.
  begin
    perform public.add_note_comment(n2, '00000000-0000-0000-0000-0000000000f2', 'b-reply@test.local', 'salah', c1);
    raise exception 'FAIL: balasan lintas catatan diterima';
  exception when check_violation then null; end;
  begin
    perform public.add_note_comment(n1, '00000000-0000-0000-0000-0000000000f2', 'b-reply@test.local', 'x', gen_random_uuid());
    raise exception 'FAIL: induk yang tidak ada diterima';
  exception when sqlstate 'P0002' then null; end;

  -- Hapus komentar utama yang punya balasan: ditandai terhapus, balasan tetap.
  perform public.delete_note_comment(c1, '00000000-0000-0000-0000-0000000000f1');
  select body, deleted_at into b, d from public.note_comments where id = c1;
  if b <> '' or d is null then raise exception 'FAIL: komentar utama seharusnya ditandai terhapus'; end if;
  select count(*) into n from public.note_comments where parent_id = c1;
  if n <> 2 then raise exception 'FAIL: balasan ikut hilang (%)', n; end if;

  -- Komentar terhapus tidak bisa diubah atau dihapus lagi.
  begin
    perform public.edit_note_comment(c1, '00000000-0000-0000-0000-0000000000f1', 'hidup lagi');
    raise exception 'FAIL: komentar terhapus bisa diubah';
  exception when sqlstate 'P0002' then null; end;

  -- Orang lain tidak bisa menghapus balasan.
  begin
    perform public.delete_note_comment(r1, '00000000-0000-0000-0000-0000000000f1');
    raise exception 'FAIL: orang lain bisa menghapus balasan';
  exception when sqlstate '42501' then null; end;

  -- Balasan terakhir dihapus: komentar utama yang sudah terhapus ikut dibersihkan.
  perform public.delete_note_comment(r1, '00000000-0000-0000-0000-0000000000f2');
  select count(*) into n from public.note_comments where id = c1;
  if n <> 1 then raise exception 'FAIL: komentar utama dibersihkan terlalu cepat'; end if;
  perform public.delete_note_comment(r2, '00000000-0000-0000-0000-0000000000f1');
  select count(*) into n from public.note_comments where note_id = n1;
  if n <> 0 then raise exception 'FAIL: komentar utama terhapus seharusnya dibersihkan (%)', n; end if;

  -- Komentar tanpa balasan dihapus fisik.
  c1 := public.add_note_comment(n1, '00000000-0000-0000-0000-0000000000f2', 'b-reply@test.local', 'sendiri');
  perform public.delete_note_comment(c1, '00000000-0000-0000-0000-0000000000f2');
  select count(*) into n from public.note_comments where id = c1;
  if n <> 0 then raise exception 'FAIL: komentar tanpa balasan seharusnya terhapus'; end if;

  -- Hak eksekusi tetap hanya service_role.
  if has_function_privilege('authenticated', 'public.add_note_comment(uuid, uuid, text, text, uuid)', 'execute') then
    raise exception 'FAIL: klien bisa menjalankan add_note_comment';
  end if;
end $$;

do $$ begin raise notice 'UJI BALASAN KOMENTAR LOLOS'; end $$;
rollback;

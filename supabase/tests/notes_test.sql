-- Uji Notes dan Calendar (migrasi 20261124000000_notes_calendar.sql). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI NOTES LOLOS'.
-- Tidak bergantung pada data nyata: hanya menyentuh pengguna, aplikasi, release, dan catatan uji (berawalan T-).

begin;
select set_config('app.allow_any_domain', 'on', true); -- email uji non-@envisions.app (lihat migrasi google_sso)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'admin2-note@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'viewer-note@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000d1', 'T-Note A', 'github', 'https://github.com/o/note-a', 'RAHASIA');

create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to public;

-- 0. Struktur dan data awal libur.
do $$
declare n int;
begin
  select count(*) into n from public.holidays where extract(year from holiday_date) = 2026 and kind = 'national';
  if n <> 17 then raise exception 'FAIL: libur nasional 2026 seharusnya 17, dapat %', n; end if;
  select count(*) into n from public.holidays where extract(year from holiday_date) = 2026 and kind = 'collective_leave';
  if n <> 8 then raise exception 'FAIL: cuti bersama 2026 seharusnya 8, dapat %', n; end if;
  select count(*) into n from public.holidays where extract(year from holiday_date) = 2027 and kind = 'national';
  if n <> 18 then raise exception 'FAIL: libur nasional 2027 seharusnya 18, dapat %', n; end if;
  select count(*) into n from public.holidays where extract(year from holiday_date) = 2027 and kind = 'collective_leave';
  if n <> 8 then raise exception 'FAIL: cuti bersama 2027 seharusnya 8, dapat %', n; end if;
  begin
    insert into public.holidays (holiday_date, name, kind) values ('2026-01-01', 'Ganda', 'national');
    raise exception 'FAIL: tanggal libur ganda diterima';
  exception when unique_violation then null; end;
  begin
    insert into public.holidays (holiday_date, name, kind) values ('2030-01-01', 'X', 'cuti');
    raise exception 'FAIL: jenis libur tidak valid diterima';
  exception when check_violation then null; end;

  select count(*) into n from pg_class
   where oid in ('public.notes'::regclass, 'public.note_links'::regclass, 'public.note_release_snapshots'::regclass,
                 'public.note_action_items'::regclass, 'public.note_revisions'::regclass,
                 'public.note_comments'::regclass, 'public.note_reads'::regclass, 'public.holidays'::regclass)
     and relrowsecurity;
  if n <> 8 then raise exception 'FAIL: RLS harus aktif di 8 tabel, aktif di %', n; end if;
end $$;

-- 1. Buat catatan dengan tautan, rekaman release, dan action item.
do $$
declare r uuid; nid uuid; n int; t text;
begin
  r := public.save_release(null, '{"name":"T-note-rel","start_date":"2026-11-01","target_date":"2026-12-01"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000d1","tag":"master","range_start":1,"range_end":9}]'::jsonb);
  insert into t_ids values ('rel', r);

  -- validasi
  begin
    perform public.save_note(null, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
      '{"title":"   ","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb, '[]', '[]');
    raise exception 'FAIL: judul kosong diterima';
  exception when check_violation then null; end;
  begin
    perform public.save_note(null, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
      '{"title":"x","note_date":"2026-11-24","kind":"rapat","body":""}'::jsonb, '[]', '[]');
    raise exception 'FAIL: jenis catatan tidak valid diterima';
  exception when check_violation then null; end;
  begin
    perform public.save_note(null, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
      '{"title":"x","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb,
      '[{"kind":"task","source_id":"00000000-0000-0000-0000-0000000000d1","tag":"master"}]', '[]');
    raise exception 'FAIL: tautan task tanpa nomor diterima';
  exception when check_violation then null; end;
  begin
    perform public.save_note(null, null, 'x@test.local',
      '{"title":"x","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb, '[]', '[]');
    raise exception 'FAIL: catatan tanpa penulis diterima';
  exception when sqlstate '42501' then null; end;

  nid := public.save_note(null, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
    '{"title":"  T-Meeting  ","note_date":"2026-11-24","kind":"meeting","body":"Isi **awal**"}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('kind', 'source', 'source_id', '00000000-0000-0000-0000-0000000000d1'),
      jsonb_build_object('kind', 'release', 'release_id', r, 'snapshot', jsonb_build_object(
        'progress_percent', 45.5, 'done', 4, 'total', 9, 'risk', 'at_risk', 'days_left', 12, 'target_date', '2026-12-01')),
      jsonb_build_object('kind', 'task', 'source_id', '00000000-0000-0000-0000-0000000000d1', 'tag', 'master', 'task_id', '7')
    ),
    '[{"body":"Siapkan API","assignee_id":"00000000-0000-0000-0000-0000000000e3","assignee_email":"viewer-note@test.local","due_date":"2026-11-20"},
      {"body":"Sudah beres","done":true},
      {"body":"Uji ulang","due_date":"2026-11-30"}]'::jsonb);
  insert into t_ids values ('n1', nid);

  select title into t from public.notes where id = nid;
  if t <> 'T-Meeting' then raise exception 'FAIL: judul tidak dirapikan (%)', t; end if;
  select count(*) into n from public.note_links where note_id = nid;
  if n <> 3 then raise exception 'FAIL: tautan seharusnya 3, dapat %', n; end if;
  select count(*) into n from public.note_release_snapshots s join public.note_links l on l.id = s.link_id
   where l.note_id = nid and s.risk = 'at_risk' and s.days_left = 12;
  if n <> 1 then raise exception 'FAIL: rekaman release tidak tersimpan (%)', n; end if;
  select count(*) into n from public.note_action_items where note_id = nid;
  if n <> 3 then raise exception 'FAIL: action item seharusnya 3, dapat %', n; end if;
  select count(*) into n from public.note_action_items where note_id = nid and done and done_at is not null;
  if n <> 1 then raise exception 'FAIL: item selesai tidak tercatat (%)', n; end if;
  select count(*) into n from public.note_revisions where note_id = nid;
  if n <> 0 then raise exception 'FAIL: catatan baru seharusnya tanpa riwayat (%)', n; end if;
end $$;

-- 2. Edit oleh penulis: riwayat, rekaman tetap, tautan dan item diperbarui. Edit oleh admin lain ditolak.
do $$
declare nid uuid := (select id from t_ids where k = 'n1'); r uuid := (select id from t_ids where k = 'rel');
  n int; cap timestamptz; cap2 timestamptz; keep uuid; e timestamptz;
begin
  select s.captured_at into cap from public.note_release_snapshots s join public.note_links l on l.id = s.link_id
   where l.note_id = nid;
  select id into keep from public.note_action_items where note_id = nid and body = 'Siapkan API';

  begin
    perform public.save_note(nid, '00000000-0000-0000-0000-0000000000e2', 'admin2-note@test.local',
      '{"title":"Dibajak","note_date":"2026-11-24","kind":"meeting","body":""}'::jsonb, '[]', '[]');
    raise exception 'FAIL: admin lain bisa mengedit';
  exception when sqlstate '42501' then
    if sqlerrm <> 'not_author' then raise exception 'FAIL: pesan bukan penulis (%)', sqlerrm; end if;
  end;

  -- Simpan tanpa perubahan teks: tidak ada riwayat, edited_at tetap kosong.
  perform public.save_note(nid, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
    '{"title":"T-Meeting","note_date":"2026-11-24","kind":"meeting","body":"Isi **awal**"}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind', 'release', 'release_id', r, 'snapshot', jsonb_build_object(
      'progress_percent', 99, 'done', 9, 'total', 9, 'risk', 'on_track', 'days_left', 1, 'target_date', '2026-12-01'))),
    jsonb_build_array(jsonb_build_object('id', keep, 'body', 'Siapkan API v2',
      'assignee_id', '00000000-0000-0000-0000-0000000000e3', 'assignee_email', 'viewer-note@test.local', 'due_date', '2026-11-20')));
  select count(*) into n from public.note_revisions where note_id = nid;
  if n <> 0 then raise exception 'FAIL: simpan tanpa perubahan teks membuat riwayat (%)', n; end if;
  select edited_at into e from public.notes where id = nid;
  if e is not null then raise exception 'FAIL: edited_at terisi tanpa perubahan teks'; end if;
  select s.captured_at into cap2 from public.note_release_snapshots s join public.note_links l on l.id = s.link_id
   where l.note_id = nid and s.risk = 'at_risk';
  if cap2 is distinct from cap then raise exception 'FAIL: rekaman release berubah saat edit'; end if;
  select count(*) into n from public.note_links where note_id = nid;
  if n <> 1 then raise exception 'FAIL: tautan yang tidak disebut tidak dihapus (%)', n; end if;
  select count(*) into n from public.note_action_items where note_id = nid;
  if n <> 1 then raise exception 'FAIL: item yang tidak disebut tidak dihapus (%)', n; end if;
  select count(*) into n from public.note_action_items where id = keep and body = 'Siapkan API v2';
  if n <> 1 then raise exception 'FAIL: item tidak diperbarui'; end if;

  -- Ubah judul dan isi: satu versi lama tersimpan.
  perform public.save_note(nid, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
    '{"title":"T-Meeting 2","note_date":"2026-11-25","kind":"decision","body":"Isi baru"}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind', 'release', 'release_id', r)),
    jsonb_build_array(jsonb_build_object('id', keep, 'body', 'Siapkan API v2',
      'assignee_id', '00000000-0000-0000-0000-0000000000e3', 'assignee_email', 'viewer-note@test.local', 'due_date', '2026-11-20')));
  select count(*) into n from public.note_revisions
   where note_id = nid and title = 'T-Meeting' and body = 'Isi **awal**' and kind = 'meeting' and note_date = '2026-11-24'
     and edited_by_email = 'admin1-note@test.local';
  if n <> 1 then raise exception 'FAIL: versi lama tidak tersimpan (%)', n; end if;
  select edited_at into e from public.notes where id = nid;
  if e is null then raise exception 'FAIL: edited_at tidak terisi'; end if;

  -- Tautan release dilepas lalu dipasang lagi: rekaman baru.
  perform public.save_note(nid, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
    '{"title":"T-Meeting 2","note_date":"2026-11-25","kind":"decision","body":"Isi baru"}'::jsonb, '[]',
    jsonb_build_array(jsonb_build_object('id', keep, 'body', 'Siapkan API v2',
      'assignee_id', '00000000-0000-0000-0000-0000000000e3', 'assignee_email', 'viewer-note@test.local', 'due_date', '2026-11-20')));
  select count(*) into n from public.note_release_snapshots;
  select count(*) into n from public.note_release_snapshots s join public.note_links l on l.id = s.link_id where l.note_id = nid;
  if n <> 0 then raise exception 'FAIL: rekaman tidak ikut terhapus bersama tautannya (%)', n; end if;
end $$;

-- 3. Action item: penanggung jawab (viewer) dan penulis boleh mencentang; admin lain tidak.
do $$
declare nid uuid := (select id from t_ids where k = 'n1'); it uuid; d boolean; dt timestamptz;
begin
  select id into it from public.note_action_items where note_id = nid;
  perform public.set_action_item_done(it, '00000000-0000-0000-0000-0000000000e3', true);
  select done, done_at into d, dt from public.note_action_items where id = it;
  if not d or dt is null then raise exception 'FAIL: penanggung jawab tidak bisa mencentang'; end if;
  begin
    perform public.set_action_item_done(it, '00000000-0000-0000-0000-0000000000e2', false);
    raise exception 'FAIL: admin lain bisa mencentang';
  exception when sqlstate '42501' then null; end;
  perform public.set_action_item_done(it, '00000000-0000-0000-0000-0000000000e1', false);
  select done, done_at into d, dt from public.note_action_items where id = it;
  if d or dt is not null then raise exception 'FAIL: penulis tidak bisa membatalkan centang'; end if;
end $$;

-- 4. Follow up: hanya item belum selesai milik catatan asal yang bisa dibawa; rujukan dan carried_to_id terisi.
do $$
declare nid uuid := (select id from t_ids where k = 'n1'); it uuid; f uuid; n int; ref uuid; carried uuid;
begin
  select id into it from public.note_action_items where note_id = nid;
  f := public.save_note(null, '00000000-0000-0000-0000-0000000000e2', 'admin2-note@test.local',
    jsonb_build_object('title', 'Follow up: T-Meeting 2', 'note_date', '2026-12-01', 'kind', 'decision', 'body', '',
      'follows_up_id', nid),
    '[]', jsonb_build_array(jsonb_build_object('body', 'Siapkan API v2', 'carried_from_id', it)));
  insert into t_ids values ('f1', f);
  select follows_up_id into ref from public.notes where id = f;
  if ref is distinct from nid then raise exception 'FAIL: rujukan Follow up tidak tersimpan'; end if;
  select carried_to_id into carried from public.note_action_items where id = it;
  if carried is null then raise exception 'FAIL: item asal tidak ditandai Carried over'; end if;

  -- Item yang sudah dibawa tidak bisa dibawa lagi.
  begin
    perform public.save_note(null, '00000000-0000-0000-0000-0000000000e1', 'admin1-note@test.local',
      jsonb_build_object('title', 'Follow up lagi', 'note_date', '2026-12-02', 'kind', 'meeting', 'body', '',
        'follows_up_id', nid),
      '[]', jsonb_build_array(jsonb_build_object('body', 'x', 'carried_from_id', it)));
    raise exception 'FAIL: item yang sudah dibawa dibawa lagi';
  exception when check_violation then null; end;
end $$;

-- 5. Komentar dan penanda baca.
do $$
declare nid uuid := (select id from t_ids where k = 'n1'); c uuid; n int; b text; e timestamptz;
begin
  begin
    perform public.add_note_comment(nid, '00000000-0000-0000-0000-0000000000e3', 'viewer-note@test.local', '   ');
    raise exception 'FAIL: komentar kosong diterima';
  exception when check_violation then null; end;
  begin
    perform public.add_note_comment(nid, '00000000-0000-0000-0000-0000000000e3', 'viewer-note@test.local', repeat('x', 2001));
    raise exception 'FAIL: komentar 2001 karakter diterima';
  exception when check_violation then null; end;

  c := public.add_note_comment(nid, '00000000-0000-0000-0000-0000000000e3', 'viewer-note@test.local', '  Setuju  ');
  insert into t_ids values ('c1', c);
  select body into b from public.note_comments where id = c;
  if b <> 'Setuju' then raise exception 'FAIL: komentar tidak dirapikan (%)', b; end if;
  select count(*) into n from public.note_reads where user_id = '00000000-0000-0000-0000-0000000000e3' and note_id = nid;
  if n <> 1 then raise exception 'FAIL: berkomentar tidak menandai baca (%)', n; end if;

  begin
    perform public.edit_note_comment(c, '00000000-0000-0000-0000-0000000000e1', 'diubah penulis catatan');
    raise exception 'FAIL: orang lain bisa mengedit komentar';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.delete_note_comment(c, '00000000-0000-0000-0000-0000000000e1');
    raise exception 'FAIL: penulis catatan bisa menghapus komentar orang lain';
  exception when sqlstate '42501' then null; end;

  perform public.edit_note_comment(c, '00000000-0000-0000-0000-0000000000e3', 'Setuju');
  select edited_at into e from public.note_comments where id = c;
  if e is not null then raise exception 'FAIL: edit tanpa perubahan menandai edited'; end if;
  perform public.edit_note_comment(c, '00000000-0000-0000-0000-0000000000e3', 'Setuju, lanjut');
  select edited_at into e from public.note_comments where id = c;
  if e is null then raise exception 'FAIL: edit komentar tidak menandai edited'; end if;

  perform public.mark_note_read(nid, '00000000-0000-0000-0000-0000000000e1');
  perform public.mark_note_read(nid, '00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from public.note_reads where note_id = nid;
  if n <> 2 then raise exception 'FAIL: penanda baca seharusnya 2 baris, dapat %', n; end if;
end $$;

-- 6. Hak akses tabel dan fungsi.
do $$
begin
  if has_table_privilege('anon', 'public.notes', 'select') or has_table_privilege('anon', 'public.holidays', 'select')
     or has_table_privilege('anon', 'public.note_comments', 'select') then
    raise exception 'FAIL: anon punya SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.notes', 'insert')
     or has_table_privilege('authenticated', 'public.notes', 'update')
     or has_table_privilege('authenticated', 'public.note_comments', 'insert')
     or has_table_privilege('authenticated', 'public.note_comments', 'delete')
     or has_table_privilege('authenticated', 'public.note_action_items', 'update')
     or has_table_privilege('authenticated', 'public.note_reads', 'insert')
     or has_table_privilege('authenticated', 'public.holidays', 'insert') then
    raise exception 'FAIL: authenticated punya hak tulis';
  end if;
  if has_function_privilege('authenticated', 'public.save_note(uuid, uuid, text, jsonb, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.add_note_comment(uuid, uuid, text, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.set_action_item_done(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.delete_note(uuid, uuid)', 'execute') then
    raise exception 'FAIL: klien bisa menjalankan fungsi penulisan';
  end if;
end $$;

-- 7. Sebagai viewer: bisa membaca semua catatan dan libur, hanya penanda baca miliknya, tidak bisa menulis.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.notes where title like 'T-%' or title like 'Follow up: T-%';
  if n <> 2 then raise exception 'FAIL: viewer seharusnya melihat 2 catatan uji, dapat %', n; end if;
  select count(*) into n from public.holidays;
  if n < 51 then raise exception 'FAIL: viewer tidak bisa membaca libur (%)', n; end if;
  select count(*) into n from public.note_comments c join public.notes x on x.id = c.note_id where x.title like 'T-%';
  if n <> 1 then raise exception 'FAIL: viewer tidak bisa membaca komentar (%)', n; end if;
  select count(*) into n from public.note_reads;
  if n <> 1 then raise exception 'FAIL: viewer seharusnya hanya melihat penanda bacanya (%)', n; end if;
  begin
    insert into public.note_comments (note_id, body, author_email)
    select id, 'langsung', 'viewer-note@test.local' from public.notes where title like 'T-%';
    raise exception 'FAIL: viewer bisa menulis komentar langsung';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_note_comment((select id from public.notes where title like 'T-%'),
      '00000000-0000-0000-0000-0000000000e3', 'viewer-note@test.local', 'lewat fungsi');
    raise exception 'FAIL: viewer bisa memanggil fungsi komentar langsung';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.notes;
    raise exception 'FAIL: anon bisa membaca notes';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.holidays;
    raise exception 'FAIL: anon bisa membaca holidays';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 8. Hapus: hanya penulis; cascade ke semua note_*; Follow up kehilangan rujukan tanpa galat.
do $$
declare nid uuid := (select id from t_ids where k = 'n1'); f uuid := (select id from t_ids where k = 'f1'); n int; ref uuid;
begin
  begin
    perform public.delete_note(nid, '00000000-0000-0000-0000-0000000000e2');
    raise exception 'FAIL: admin lain bisa menghapus';
  exception when sqlstate '42501' then null; end;

  perform public.delete_note(nid, '00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from public.notes where id = nid;
  if n <> 0 then raise exception 'FAIL: catatan tidak terhapus'; end if;
  select (select count(*) from public.note_links where note_id = nid)
       + (select count(*) from public.note_action_items where note_id = nid)
       + (select count(*) from public.note_revisions where note_id = nid)
       + (select count(*) from public.note_comments where note_id = nid)
       + (select count(*) from public.note_reads where note_id = nid) into n;
  if n <> 0 then raise exception 'FAIL: data catatan tersisa setelah hapus (%)', n; end if;
  select follows_up_id into ref from public.notes where id = f;
  if ref is not null then raise exception 'FAIL: rujukan Follow up tidak dikosongkan'; end if;
  -- Item salinan di Follow up tetap ada.
  select count(*) into n from public.note_action_items where note_id = f;
  if n <> 1 then raise exception 'FAIL: item Follow up ikut terhapus (%)', n; end if;

  -- Menghapus release ikut menghapus tautannya.
  perform public.save_note(f, '00000000-0000-0000-0000-0000000000e2', 'admin2-note@test.local',
    '{"title":"Follow up: T-Meeting 2","note_date":"2026-12-01","kind":"decision","body":""}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind', 'release', 'release_id', (select id from t_ids where k = 'rel'))),
    (select jsonb_agg(jsonb_build_object('id', id, 'body', body)) from public.note_action_items where note_id = f));
  delete from public.releases where id = (select id from t_ids where k = 'rel');
  select count(*) into n from public.note_links where note_id = f;
  if n <> 0 then raise exception 'FAIL: tautan release tidak ikut terhapus (%)', n; end if;
end $$;

do $$ begin raise notice 'UJI NOTES LOLOS'; end $$;
rollback;

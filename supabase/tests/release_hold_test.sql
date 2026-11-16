-- Uji Hold dan Catatan release (migrasi 20261116000000_release_hold_notes.sql). Jalankan SETELAH migrasi.
-- Di dalam transaksi dan di-ROLLBACK. Sukses = NOTICE 'UJI HOLD DAN CATATAN LOLOS'.
-- Tidak bergantung pada data nyata: hanya menyentuh aplikasi dan release uji (berawalan T-).

begin;
select set_config('app.allow_any_domain', 'on', true); -- email uji non-@envisions.app (lihat migrasi google_sso)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin-hold@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'viewer-hold@test.local');

insert into public.sources (id, name, provider, repo_url, token_encrypted) values
  ('00000000-0000-0000-0000-0000000000c1', 'Hold A', 'github', 'https://github.com/o/hold-a', 'RAHASIA');

create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to public;

-- 1. Release baru: aktif, tanpa catatan.
do $$
declare r uuid; h timestamptz; n int;
begin
  r := public.save_release(null, '{"name":"T-hold","start_date":"2026-11-01","target_date":"2026-12-01"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000c1","tag":"master","range_start":1,"range_end":9}]'::jsonb);
  insert into t_ids values ('r', r);
  select held_at into h from public.releases where id = r;
  if h is not null then raise exception 'FAIL: release baru seharusnya Active'; end if;
  select count(*) into n from public.release_notes where release_id = r;
  if n <> 0 then raise exception 'FAIL: release baru seharusnya tanpa catatan (%)', n; end if;
end $$;

-- 2. Hold: alasan wajib dan tercatat; hold ganda ditolak; data lain tidak berubah.
do $$
declare r uuid := (select id from t_ids where k = 'r'); nid uuid; n int; reason text; td date; k text;
begin
  begin
    perform public.hold_release(r, '   ', null, 'a@test.local');
    raise exception 'FAIL: hold tanpa alasan diterima';
  exception when check_violation then null; end;
  begin
    perform public.hold_release(r, repeat('x', 501), null, 'a@test.local');
    raise exception 'FAIL: alasan 501 karakter diterima';
  exception when check_violation then null; end;

  nid := public.hold_release(r, '  Menunggu API backend  ', '00000000-0000-0000-0000-0000000000b1', 'admin-hold@test.local');
  select hold_reason, target_date into reason, td from public.releases where id = r;
  if reason <> 'Menunggu API backend' then raise exception 'FAIL: alasan tidak dirapikan (%)', reason; end if;
  if td <> '2026-12-01' then raise exception 'FAIL: hold mengubah tanggal target (%)', td; end if;
  select count(*) into n from public.release_components where release_id = r;
  if n <> 1 then raise exception 'FAIL: hold mengubah komponen (%)', n; end if;
  select kind into k from public.release_notes where id = nid;
  if k <> 'hold' then raise exception 'FAIL: entri hold salah (%)', k; end if;

  begin
    perform public.hold_release(r, 'lagi', null, 'a@test.local');
    raise exception 'FAIL: hold ganda diterima';
  exception when sqlstate '55000' then
    if sqlerrm <> 'already_on_hold' then raise exception 'FAIL: pesan hold ganda (%)', sqlerrm; end if;
  end;
end $$;

-- 3. Resume: melanjutkan, mencatat; resume tanpa hold ditolak.
do $$
declare r uuid := (select id from t_ids where k = 'r'); h timestamptz; hr text; n int;
begin
  perform public.resume_release(r, 'API sudah siap', null, 'a@test.local');
  select held_at, hold_reason into h, hr from public.releases where id = r;
  if h is not null or hr is not null then raise exception 'FAIL: resume tidak membersihkan hold'; end if;
  select count(*) into n from public.release_notes where release_id = r and kind = 'resume' and body = 'API sudah siap';
  if n <> 1 then raise exception 'FAIL: entri resume tidak ada (%)', n; end if;
  begin
    perform public.resume_release(r, '', null, 'a@test.local');
    raise exception 'FAIL: resume tanpa hold diterima';
  exception when sqlstate '55000' then
    if sqlerrm <> 'not_on_hold' then raise exception 'FAIL: pesan resume (%)', sqlerrm; end if;
  end;
  -- resume tanpa alasan diperbolehkan
  perform public.hold_release(r, 'tahan lagi', null, 'a@test.local');
  perform public.resume_release(r, null, null, 'a@test.local');
  select count(*) into n from public.release_notes where release_id = r and kind = 'resume' and body = '';
  if n <> 1 then raise exception 'FAIL: resume tanpa alasan tidak tercatat (%)', n; end if;
end $$;

-- 4. Tidak bisa hold release terarsip atau sudah rilis; hold tetap terbawa saat diarsipkan.
do $$
declare r uuid := (select id from t_ids where k = 'r'); h timestamptz; n int;
begin
  perform public.hold_release(r, 'tahan', null, 'a@test.local');
  update public.releases set archived_at = now() where id = r;
  select held_at into h from public.releases where id = r;
  if h is null then raise exception 'FAIL: arsip menghapus status hold'; end if;
  update public.releases set archived_at = null where id = r;
  select held_at into h from public.releases where id = r;
  if h is null then raise exception 'FAIL: restore menghapus status hold'; end if;
  perform public.resume_release(r, null, null, 'a@test.local');

  update public.releases set archived_at = now() where id = r;
  begin
    perform public.hold_release(r, 'x', null, 'a@test.local');
    raise exception 'FAIL: hold pada release terarsip diterima';
  exception when sqlstate '55000' then
    if sqlerrm <> 'archived' then raise exception 'FAIL: pesan arsip (%)', sqlerrm; end if;
  end;
  update public.releases set archived_at = null where id = r;

  -- Constraint: release rilis tidak boleh punya hold; hold tanpa alasan ditolak langsung di tabel.
  begin
    update public.releases set held_at = now(), hold_reason = 'x', released_on = '2026-11-10' where id = r;
    raise exception 'FAIL: hold pada release rilis lolos constraint';
  exception when check_violation then null; end;
  begin
    update public.releases set held_at = now() where id = r;
    raise exception 'FAIL: held_at tanpa alasan lolos constraint';
  exception when check_violation then null; end;
end $$;

-- 5. Menandai rilis saat hold mengakhiri hold dan mencatatnya; membatalkan tanda rilis tidak mencatat.
do $$
declare r uuid := (select id from t_ids where k = 'r'); h timestamptz; ro date; n int;
begin
  perform public.hold_release(r, 'tahan', null, 'a@test.local');
  perform public.set_release_released(r, '2026-11-20', null, 'a@test.local');
  select held_at, released_on into h, ro from public.releases where id = r;
  if h is not null or ro <> '2026-11-20' then raise exception 'FAIL: rilis saat hold (%, %)', h, ro; end if;
  select count(*) into n from public.release_notes where release_id = r and kind = 'released' and body like '%hold ended%';
  if n <> 1 then raise exception 'FAIL: entri released (hold berakhir) tidak ada (%)', n; end if;

  begin
    perform public.hold_release(r, 'x', null, 'a@test.local');
    raise exception 'FAIL: hold pada release rilis diterima';
  exception when sqlstate '55000' then
    if sqlerrm <> 'already_released' then raise exception 'FAIL: pesan sudah rilis (%)', sqlerrm; end if;
  end;

  -- tandai ulang tidak menggandakan entri
  perform public.set_release_released(r, '2026-11-21', null, 'a@test.local');
  select count(*) into n from public.release_notes where release_id = r and kind = 'released';
  if n <> 1 then raise exception 'FAIL: entri released ganda (%)', n; end if;

  select count(*) into n from public.release_notes where release_id = r;
  perform public.set_release_released(r, null, null, 'a@test.local');
  select released_on into ro from public.releases where id = r;
  if ro is not null then raise exception 'FAIL: batal rilis gagal'; end if;
  if (select count(*) from public.release_notes where release_id = r) <> n then
    raise exception 'FAIL: batal rilis seharusnya tidak membuat entri';
  end if;
end $$;

-- 6. Catatan bebas dan edit: hanya teks yang berubah, versi sebelumnya tersimpan.
do $$
declare r uuid := (select id from t_ids where k = 'r'); nid uuid; b text; pb text; ea timestamptz; eb text; n int;
begin
  begin
    perform public.add_release_note(r, '   ', null, 'a@test.local');
    raise exception 'FAIL: catatan kosong diterima';
  exception when check_violation then null; end;
  begin
    perform public.add_release_note(r, repeat('x', 2001), null, 'a@test.local');
    raise exception 'FAIL: catatan 2001 karakter diterima';
  exception when check_violation then null; end;
  begin
    perform public.add_release_note(gen_random_uuid(), 'x', null, 'a@test.local');
    raise exception 'FAIL: catatan untuk release tidak ada diterima';
  exception when sqlstate 'P0002' then null; end;

  nid := public.add_release_note(r, '  Typo disni  ', '00000000-0000-0000-0000-0000000000b1', 'admin-hold@test.local');
  insert into t_ids values ('n', nid);
  select body, edited_at into b, ea from public.release_notes where id = nid;
  if b <> 'Typo disni' or ea is not null then raise exception 'FAIL: catatan baru salah (%, %)', b, ea; end if;

  perform public.edit_release_note(nid, 'Typo di sini', 'editor@test.local');
  select body, previous_body, edited_at, edited_by_email into b, pb, ea, eb from public.release_notes where id = nid;
  if b <> 'Typo di sini' or pb <> 'Typo disni' or ea is null or eb <> 'editor@test.local' then
    raise exception 'FAIL: hasil edit salah (%, %, %, %)', b, pb, ea, eb;
  end if;

  -- teks sama: tidak ditandai edited lagi (waktu tetap, versi sebelumnya tetap)
  perform public.edit_release_note(nid, 'Typo di sini', 'lain@test.local');
  select edited_by_email, previous_body into eb, pb from public.release_notes where id = nid;
  if eb <> 'editor@test.local' or pb <> 'Typo disni' then raise exception 'FAIL: edit tanpa perubahan mengubah jejak'; end if;

  begin
    perform public.edit_release_note(nid, '', 'editor@test.local');
    raise exception 'FAIL: edit menjadi kosong diterima untuk kind note';
  exception when check_violation then null; end;
  begin
    perform public.edit_release_note(gen_random_uuid(), 'x', 'editor@test.local');
    raise exception 'FAIL: edit catatan tidak ada diterima';
  exception when sqlstate 'P0002' then null; end;
end $$;

-- 7. Fakta terkunci: kind, tanggal, penulis, waktu, release tidak bisa diubah (bahkan oleh pemilik tabel).
do $$
declare nid uuid := (select id from t_ids where k = 'n');
begin
  begin update public.release_notes set kind = 'hold' where id = nid; raise exception 'FAIL: kind berubah';
  exception when check_violation then null; end;
  begin update public.release_notes set author_email = 'palsu@test.local' where id = nid; raise exception 'FAIL: penulis berubah';
  exception when check_violation then null; end;
  begin update public.release_notes set created_at = now() - interval '1 day' where id = nid; raise exception 'FAIL: waktu berubah';
  exception when check_violation then null; end;
  begin update public.release_notes set release_id = gen_random_uuid() where id = nid; raise exception 'FAIL: release_id berubah';
  exception when check_violation or foreign_key_violation then null; end;
  begin update public.release_notes set old_target_date = '2026-01-01' where id = nid; raise exception 'FAIL: tanggal berubah';
  exception when check_violation then null; end;
end $$;

-- 8. Perubahan target lewat save_release: dengan alasan -> entri; tanpa alasan -> tidak ada entri (pemanggil lama);
--    tanggal sama dengan alasan -> tidak ada entri; hold tidak terpengaruh.
do $$
declare r uuid := (select id from t_ids where k = 'r'); n int; o date; nw date; b text; em text;
        comp jsonb := '[{"source_id":"00000000-0000-0000-0000-0000000000c1","tag":"master","range_start":1,"range_end":9}]';
begin
  update public.releases set released_on = null where id = r;
  perform public.hold_release(r, 'tahan saat ubah target', null, 'a@test.local');

  perform public.save_release(r,
    '{"name":"T-hold","target_date":"2026-12-15","change_reason":"  Vendor terlambat  ","author_id":"00000000-0000-0000-0000-0000000000b1","author_email":"admin-hold@test.local"}'::jsonb, comp);
  select old_target_date, new_target_date, body, author_email into o, nw, b, em
    from public.release_notes where release_id = r and kind = 'target_change';
  if o <> '2026-12-01' or nw <> '2026-12-15' or b <> 'Vendor terlambat' or em <> 'admin-hold@test.local' then
    raise exception 'FAIL: entri target_change salah (%, %, %, %)', o, nw, b, em;
  end if;
  if (select held_at from public.releases where id = r) is null then raise exception 'FAIL: ubah target menghapus hold'; end if;

  perform public.save_release(r, '{"name":"T-hold","target_date":"2026-12-20"}'::jsonb, comp);
  select count(*) into n from public.release_notes where release_id = r and kind = 'target_change';
  if n <> 1 then raise exception 'FAIL: ubah target tanpa alasan membuat entri (%)', n; end if;

  perform public.save_release(r, '{"name":"T-hold","target_date":"2026-12-20","change_reason":"tanpa perubahan"}'::jsonb, comp);
  select count(*) into n from public.release_notes where release_id = r and kind = 'target_change';
  if n <> 1 then raise exception 'FAIL: alasan tanpa perubahan target membuat entri (%)', n; end if;

  -- release baru dengan alasan: tidak ada entri
  perform public.save_release(null, '{"name":"T-hold-baru","target_date":"2026-12-20","change_reason":"x"}'::jsonb, comp);
  select count(*) into n from public.release_notes rn join public.releases rr on rr.id = rn.release_id where rr.name = 'T-hold-baru';
  if n <> 0 then raise exception 'FAIL: release baru membuat entri (%)', n; end if;
end $$;

-- 8b. View release_latest_note: satu baris per release, hanya jenis note, terbaru; teks mengikuti edit.
do $$
declare r uuid := (select id from t_ids where k = 'r'); n int; b text; nid uuid;
begin
  -- 'r' sudah punya catatan 'Typo di sini' (bagian 6) serta entri hold/resume/released/target_change.
  select count(*), max(body) into n, b from public.release_latest_note where release_id = r;
  if n <> 1 or b <> 'Typo di sini' then raise exception 'FAIL: catatan terbaru awal salah (%, %)', n, b; end if;

  nid := public.add_release_note(r, 'Catatan lebih baru', null, 'a@test.local');
  select count(*), max(body) into n, b from public.release_latest_note where release_id = r;
  if n <> 1 or b <> 'Catatan lebih baru' then raise exception 'FAIL: catatan terbaru tidak berganti (%, %)', n, b; end if;

  perform public.edit_release_note(nid, 'Catatan lebih baru (diedit)', 'a@test.local');
  select max(body) into b from public.release_latest_note where release_id = r;
  if b <> 'Catatan lebih baru (diedit)' then raise exception 'FAIL: view tidak mengikuti edit (%)', b; end if;

  -- entri sistem yang lebih baru tidak menggeser catatan terbaru
  perform public.resume_release(r, null, null, 'a@test.local'); -- bagian 8 meninggalkan release dalam keadaan hold
  perform public.hold_release(r, 'tahan untuk uji view', null, 'a@test.local');
  select max(body) into b from public.release_latest_note where release_id = r;
  if b <> 'Catatan lebih baru (diedit)' then raise exception 'FAIL: entri hold menggeser catatan terbaru (%)', b; end if;

  -- release tanpa catatan note tidak punya baris
  select count(*) into n from public.release_latest_note where release_id = gen_random_uuid();
  if n <> 0 then raise exception 'FAIL: baris view untuk release tidak ada'; end if;
end $$;

-- 9. Cascade: menghapus release menghapus log-nya.
do $$
declare r uuid := (select id from t_ids where k = 'r'); n int;
begin
  select count(*) into n from public.release_notes where release_id = r;
  if n = 0 then raise exception 'FAIL: seharusnya ada catatan sebelum hapus'; end if;
  delete from public.releases where id = r;
  select count(*) into n from public.release_notes where release_id = r;
  if n <> 0 then raise exception 'FAIL: catatan tersisa setelah release dihapus (%)', n; end if;
end $$;

-- 10. Hak akses: authenticated membaca tetapi tidak menulis dan tidak memanggil fungsi; anon tidak membaca.
do $$
declare r uuid;
begin
  r := public.save_release(null, '{"name":"T-hold-akses","target_date":"2026-12-01"}'::jsonb,
    '[{"source_id":"00000000-0000-0000-0000-0000000000c1","tag":"master","range_start":1,"range_end":9}]'::jsonb);
  insert into t_ids values ('r2', r);
  perform public.add_release_note(r, 'catatan akses', null, 'a@test.local');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare n int; r uuid := (select id from t_ids where k = 'r2');
begin
  select count(*) into n from public.release_notes where release_id = r;
  if n <> 1 then raise exception 'FAIL: authenticated tidak bisa membaca release_notes (%)', n; end if;
  select count(*) into n from public.releases where id = r and held_at is null;
  if n <> 1 then raise exception 'FAIL: authenticated tidak bisa membaca releases.held_at (%)', n; end if;
  select count(*) into n from public.release_latest_note where release_id = r;
  if n <> 1 then raise exception 'FAIL: authenticated tidak bisa membaca release_latest_note (%)', n; end if;

  begin
    insert into public.release_notes (release_id, kind, body, author_email) values (r, 'note', 'x', 'v@test.local');
    raise exception 'FAIL: authenticated bisa INSERT release_notes';
  exception when insufficient_privilege then null; end;
  begin
    update public.release_notes set body = 'x' where release_id = r;
    raise exception 'FAIL: authenticated bisa UPDATE release_notes';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.release_notes where release_id = r;
    raise exception 'FAIL: authenticated bisa DELETE release_notes';
  exception when insufficient_privilege then null; end;
  begin
    update public.releases set held_at = now(), hold_reason = 'x' where id = r;
    raise exception 'FAIL: authenticated bisa UPDATE releases';
  exception when insufficient_privilege then null; end;
  begin
    perform public.hold_release(r, 'x', null, 'v@test.local');
    raise exception 'FAIL: authenticated bisa memanggil hold_release';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_release_note(r, 'x', null, 'v@test.local');
    raise exception 'FAIL: authenticated bisa memanggil add_release_note';
  exception when insufficient_privilege then null; end;
  begin
    perform public.edit_release_note(gen_random_uuid(), 'x', 'v@test.local');
    raise exception 'FAIL: authenticated bisa memanggil edit_release_note';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_release_released(r, '2026-11-01', null, 'v@test.local');
    raise exception 'FAIL: authenticated bisa memanggil set_release_released';
  exception when insufficient_privilege then null; end;
  begin
    perform public.resume_release(r, null, null, 'v@test.local');
    raise exception 'FAIL: authenticated bisa memanggil resume_release';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.release_notes;
    raise exception 'FAIL: anon bisa SELECT release_notes';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.release_latest_note;
    raise exception 'FAIL: anon bisa SELECT release_latest_note';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin raise notice 'UJI HOLD DAN CATATAN LOLOS'; end $$;

rollback;

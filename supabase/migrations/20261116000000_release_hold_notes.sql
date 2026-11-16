-- Hold dan Catatan release (PRD-Release-Hold-Catatan.md).
--
-- 1. releases.held_at / hold_reason: kosong = Active, terisi = On hold (manual, dengan alasan).
-- 2. release_notes: log kronologis per release (catatan bebas + kejadian sistem: hold, resume,
--    perubahan target, rilis). Teks boleh diedit; fakta (jenis, tanggal, penulis, waktu) terkunci.
-- 3. Fungsi atomik (hanya service_role) untuk semua penulisan; klien login hanya MEMBACA.
-- 4. save_release mencatat perubahan target bila alasan diberikan di header.
-- Jalankan sekali saja (tidak idempoten). Tidak mengubah data release yang ada.
--
-- Kode galat yang dipakai fungsi (dipetakan di src/lib/releases/repo.ts):
--   P0002  = release atau catatan tidak ditemukan
--   55000  = keadaan tidak mengizinkan; pesan: already_released | archived | already_on_hold | not_on_hold
--   23514  = nilai tidak valid (check_violation)

-- ---------------------------------------------------------------------------
-- Kolom hold
-- ---------------------------------------------------------------------------
alter table public.releases add column held_at timestamptz;
alter table public.releases add column hold_reason text;

alter table public.releases add constraint releases_hold_valid check (
  (held_at is null and hold_reason is null)
  or (held_at is not null and coalesce(length(btrim(hold_reason)), 0) between 1 and 500) -- coalesce: NULL lolos CHECK
);
-- Release yang sudah rilis tidak boleh sedang di-hold.
alter table public.releases add constraint releases_hold_not_released check (held_at is null or released_on is null);

-- releases memakai hak SELECT tingkat tabel, jadi kolom baru otomatis terbaca klien; tulis tetap lewat
-- service role.

-- ---------------------------------------------------------------------------
-- Log catatan
-- ---------------------------------------------------------------------------
create table public.release_notes (
  id              uuid primary key default gen_random_uuid(),
  release_id      uuid not null references public.releases (id) on delete cascade,
  kind            text not null,
  body            text not null default '',
  old_target_date date,
  new_target_date date,
  author_id       uuid references auth.users (id) on delete set null,
  author_email    text not null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  edited_by_email text,
  previous_body   text,
  constraint release_notes_kind_valid check (kind in ('note', 'hold', 'resume', 'target_change', 'released')),
  -- resume dan released boleh tanpa teks; hold dan perubahan target dibatasi 500 karakter (sama dengan alasan hold).
  constraint release_notes_body_valid check (
    length(body) <= 2000
    and (kind in ('resume', 'released') or length(btrim(body)) >= 1)
    and (kind not in ('hold', 'target_change') or length(body) <= 500)
  ),
  constraint release_notes_dates_valid check (
    (kind = 'target_change' and old_target_date is not null and new_target_date is not null
       and old_target_date <> new_target_date)
    or (kind <> 'target_change' and old_target_date is null and new_target_date is null)
  ),
  constraint release_notes_edit_valid check ((edited_at is null) = (edited_by_email is null))
);

create index release_notes_release_idx on public.release_notes (release_id, created_at desc, id);

-- Fakta terkunci: hanya body, previous_body, edited_at, edited_by_email yang boleh berubah.
create function public.release_notes_lock_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.release_id is distinct from old.release_id
     or new.kind is distinct from old.kind
     or new.old_target_date is distinct from old.old_target_date
     or new.new_target_date is distinct from old.new_target_date
     or new.author_id is distinct from old.author_id
     or new.author_email is distinct from old.author_email
     or new.created_at is distinct from old.created_at then
    raise exception 'release_notes: only the text can be edited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger release_notes_lock_facts
  before update on public.release_notes
  for each row execute function public.release_notes_lock_facts();

-- Akses: klien hanya SELECT; tulis lewat fungsi di bawah (service role).
revoke all on public.release_notes from anon, authenticated;
grant select on public.release_notes to authenticated;

alter table public.release_notes enable row level security;

create policy release_notes_select on public.release_notes
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Hold: tahan release dengan alasan wajib. Mengembalikan id entri log.
-- ---------------------------------------------------------------------------
create function public.hold_release(p_id uuid, p_reason text, p_author uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases%rowtype;
  reason text := btrim(coalesce(p_reason, ''));
  nid uuid;
begin
  select * into r from public.releases where id = p_id for update;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  if r.released_on is not null then raise exception 'already_released' using errcode = '55000'; end if;
  if r.archived_at is not null then raise exception 'archived' using errcode = '55000'; end if;
  if r.held_at is not null then raise exception 'already_on_hold' using errcode = '55000'; end if;
  if length(reason) not between 1 and 500 then
    raise exception 'hold reason must be 1 to 500 characters' using errcode = 'check_violation';
  end if;

  update public.releases set held_at = now(), hold_reason = reason where id = p_id;
  insert into public.release_notes (release_id, kind, body, author_id, author_email)
  values (p_id, 'hold', reason, p_author, coalesce(nullif(btrim(p_email), ''), 'unknown'))
  returning id into nid;
  return nid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resume: lanjutkan release; alasan opsional. Boleh pada release terarsip.
-- ---------------------------------------------------------------------------
create function public.resume_release(p_id uuid, p_reason text, p_author uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases%rowtype;
  nid uuid;
begin
  select * into r from public.releases where id = p_id for update;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  if r.held_at is null then raise exception 'not_on_hold' using errcode = '55000'; end if;

  update public.releases set held_at = null, hold_reason = null where id = p_id;
  insert into public.release_notes (release_id, kind, body, author_id, author_email)
  values (p_id, 'resume', btrim(coalesce(p_reason, '')), p_author, coalesce(nullif(btrim(p_email), ''), 'unknown'))
  returning id into nid;
  return nid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catatan bebas.
-- ---------------------------------------------------------------------------
create function public.add_release_note(p_id uuid, p_body text, p_author uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare nid uuid;
begin
  perform 1 from public.releases where id = p_id;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  insert into public.release_notes (release_id, kind, body, author_id, author_email)
  values (p_id, 'note', btrim(coalesce(p_body, '')), p_author, coalesce(nullif(btrim(p_email), ''), 'unknown'))
  returning id into nid;
  return nid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Edit teks catatan. Hanya teks yang berubah; versi sebelumnya disimpan satu tingkat.
-- Teks yang sama dengan sebelumnya tidak menandai entri sebagai edited.
-- ---------------------------------------------------------------------------
create function public.edit_release_note(p_note_id uuid, p_body text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.release_notes%rowtype;
  nb text := btrim(coalesce(p_body, ''));
begin
  select * into n from public.release_notes where id = p_note_id for update;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  if nb = n.body then return; end if;

  update public.release_notes
     set body = nb,
         previous_body = n.body,
         edited_at = now(),
         edited_by_email = coalesce(nullif(btrim(p_email), ''), 'unknown')
   where id = p_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tandai rilis (p_released_on) atau batalkan (null). Menandai rilis saat hold mengakhiri hold dan
-- mencatat kejadiannya. Membatalkan tanda rilis tidak membuat entri.
-- ---------------------------------------------------------------------------
create function public.set_release_released(p_id uuid, p_released_on date, p_author uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases%rowtype;
begin
  select * into r from public.releases where id = p_id for update;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;

  if p_released_on is null then
    update public.releases set released_on = null where id = p_id;
    return;
  end if;

  update public.releases set released_on = p_released_on, held_at = null, hold_reason = null where id = p_id;
  if r.released_on is null then
    insert into public.release_notes (release_id, kind, body, author_id, author_email)
    values (
      p_id, 'released',
      case when r.held_at is not null then 'The hold ended because the release was marked as released.' else '' end,
      p_author, coalesce(nullif(btrim(p_email), ''), 'unknown')
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_release: sama seperti sebelumnya, ditambah pencatatan perubahan target. Kunci opsional di p_header:
--   change_reason  alasan perubahan target (wajib diisi oleh server action; DB mencatatnya bila ada)
--   author_id, author_email  siapa yang mengubah
-- Pada ubah, bila target_date berubah dan change_reason terisi, dibuat entri 'target_change' dalam transaksi
-- yang sama. Pemanggil lama tanpa kunci ini tetap berjalan seperti semula.
-- ---------------------------------------------------------------------------
create or replace function public.save_release(p_id uuid, p_header jsonb, p_components jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid   uuid := p_id;
  n     int;
  start_d date := nullif(p_header ->> 'start_date', '')::date;
  new_t date := (p_header ->> 'target_date')::date;
  old_t date;
  reason text := btrim(coalesce(p_header ->> 'change_reason', ''));
begin
  if p_components is null or jsonb_typeof(p_components) <> 'array' then
    raise exception 'components must be an array' using errcode = 'check_violation';
  end if;
  n := jsonb_array_length(p_components);
  if n < 1 or n > 10 then
    raise exception 'a release needs 1 to 10 components (got %)', n using errcode = 'check_violation';
  end if;

  if rid is null then
    insert into public.releases (name, start_date, target_date)
    values (
      p_header ->> 'name',
      coalesce(start_d, (now() at time zone 'Asia/Jakarta')::date),
      new_t
    )
    returning id into rid;
  else
    select target_date into old_t from public.releases where id = rid for update;
    if not found then
      raise exception 'release not found' using errcode = 'P0002';
    end if;
    update public.releases
       set name = p_header ->> 'name',
           start_date = coalesce(start_d, start_date),
           target_date = new_t
     where id = rid;
    delete from public.release_components where release_id = rid;

    if old_t is distinct from new_t and reason <> '' then
      insert into public.release_notes (release_id, kind, body, old_target_date, new_target_date, author_id, author_email)
      values (
        rid, 'target_change', reason, old_t, new_t,
        nullif(p_header ->> 'author_id', '')::uuid,
        coalesce(nullif(btrim(p_header ->> 'author_email'), ''), 'unknown')
      );
    end if;
  end if;

  insert into public.release_components (release_id, source_id, tag, range_start, range_end)
  select rid, c.source_id, c.tag, c.range_start, c.range_end
  from jsonb_to_recordset(p_components)
       as c (source_id uuid, tag text, range_start bigint, range_end bigint);

  return rid;
end;
$$;

-- Hak eksekusi: hanya service_role (create or replace mempertahankan hak save_release; yang baru dicabut eksplisit).
revoke all on function public.hold_release(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.resume_release(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.add_release_note(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.edit_release_note(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_release_released(uuid, date, uuid, text) from public, anon, authenticated;
grant execute on function public.hold_release(uuid, text, uuid, text) to service_role;
grant execute on function public.resume_release(uuid, text, uuid, text) to service_role;
grant execute on function public.add_release_note(uuid, text, uuid, text) to service_role;
grant execute on function public.edit_release_note(uuid, text, text) to service_role;
grant execute on function public.set_release_released(uuid, date, uuid, text) to service_role;

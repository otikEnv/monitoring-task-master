-- Notes dan Calendar (PRD-Note.md).
--
-- 1. notes: catatan bertanggal (Meeting, Decision, General) dengan penulis tetap. Hanya penulis yang boleh
--    mengubah dan menghapus; setiap perubahan judul, jenis, tanggal, atau isi menyimpan versi lama ke
--    note_revisions.
-- 2. note_links: tautan ke aplikasi, release, atau task (aplikasi + tag + nomor task).
--    note_release_snapshots: kondisi release saat tautan release pertama kali ditambahkan (tidak berubah lagi).
-- 3. note_action_items: tindak lanjut dengan penanggung jawab dan tenggat. Penulis catatan atau penanggung
--    jawabnya boleh mencentang selesai. carried_to_id = item salinannya di catatan Follow up.
-- 4. note_comments: komentar oleh semua pengguna login; hanya penulis komentar yang boleh mengubah/menghapus.
--    note_reads: kapan pengguna terakhir membuka catatan (penanda komentar baru).
-- 5. holidays: libur nasional dan cuti bersama, diisi awal 2026 dan 2027 (dikelola admin dari app).
--
-- Klien login hanya MEMBACA (note_reads hanya miliknya). Semua penulisan lewat fungsi di bawah atau tabel
-- langsung dengan service role; server action memeriksa peran (requireAdmin/requireUser), fungsi memeriksa
-- penulis/penanggung jawab sekali lagi. Jalankan sekali saja (tidak idempoten).
--
-- Kode galat yang dipakai fungsi (dipetakan di src/lib/notes/repo.ts):
--   P0002  = catatan, action item, atau komentar tidak ditemukan
--   42501  = bukan pemiliknya; pesan: not_author | not_allowed
--   23514  = nilai tidak valid (check_violation)

-- ---------------------------------------------------------------------------
-- Catatan
-- ---------------------------------------------------------------------------
create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  note_date     date not null,
  kind          text not null default 'meeting',
  body          text not null default '',
  author_id     uuid references auth.users (id) on delete set null,
  author_email  text not null,
  follows_up_id uuid references public.notes (id) on delete set null,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  constraint notes_title_valid check (length(btrim(title)) between 1 and 200),
  constraint notes_kind_valid  check (kind in ('meeting', 'decision', 'general')),
  constraint notes_body_valid  check (length(body) <= 20000),
  constraint notes_not_self_follow check (follows_up_id is null or follows_up_id <> id)
);

create index notes_date_idx on public.notes (note_date desc, created_at desc);
create index notes_follows_up_idx on public.notes (follows_up_id) where follows_up_id is not null;

-- ---------------------------------------------------------------------------
-- Tautan dan rekaman kondisi release
-- ---------------------------------------------------------------------------
create table public.note_links (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes (id) on delete cascade,
  kind       text not null,
  source_id  uuid references public.sources (id) on delete cascade,
  release_id uuid references public.releases (id) on delete cascade,
  tag        text,
  task_id    text,
  created_at timestamptz not null default now(),
  -- Tautan task TIDAK memakai foreign key ke tasks: task boleh hilang dari tasks.json, tautan tetap disimpan.
  constraint note_links_kind_valid check (
    (kind = 'source'  and source_id is not null and release_id is null and tag is null and task_id is null)
    or (kind = 'release' and release_id is not null and source_id is null and tag is null and task_id is null)
    or (kind = 'task' and source_id is not null and release_id is null
        and length(btrim(coalesce(tag, ''))) between 1 and 100
        and length(btrim(coalesce(task_id, ''))) between 1 and 50)
  )
);

create unique index note_links_unique on public.note_links
  (note_id, kind, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(release_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(tag, ''), coalesce(task_id, ''));
create index note_links_source_idx  on public.note_links (source_id) where source_id is not null;
create index note_links_release_idx on public.note_links (release_id) where release_id is not null;
create index note_links_task_idx    on public.note_links (source_id, tag, task_id) where kind = 'task';

create table public.note_release_snapshots (
  link_id          uuid primary key references public.note_links (id) on delete cascade,
  progress_percent numeric(5, 2) not null,
  done             int not null,
  total            int not null,
  risk             text not null,
  days_left        int not null,
  target_date      date not null,
  captured_at      timestamptz not null default now(),
  constraint note_release_snapshots_valid check (
    progress_percent between 0 and 100 and done >= 0 and total >= 0 and done <= total
    and risk in ('released', 'on_hold', 'empty', 'overdue', 'behind', 'at_risk', 'on_track')
  )
);

-- ---------------------------------------------------------------------------
-- Action item
-- ---------------------------------------------------------------------------
create table public.note_action_items (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references public.notes (id) on delete cascade,
  position       int not null default 0,
  body           text not null,
  assignee_id    uuid references auth.users (id) on delete set null,
  assignee_email text,
  due_date       date,
  done           boolean not null default false,
  done_at        timestamptz,
  carried_to_id  uuid references public.note_action_items (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint note_action_items_body_valid check (length(btrim(body)) between 1 and 500),
  constraint note_action_items_done_valid check (done = (done_at is not null)),
  constraint note_action_items_assignee_valid check (assignee_id is null or assignee_email is not null)
);

create index note_action_items_note_idx     on public.note_action_items (note_id, position);
create index note_action_items_due_idx      on public.note_action_items (due_date) where due_date is not null and not done;
create index note_action_items_assignee_idx on public.note_action_items (assignee_id) where assignee_id is not null;

-- ---------------------------------------------------------------------------
-- Riwayat edit
-- ---------------------------------------------------------------------------
create table public.note_revisions (
  id               bigint generated always as identity primary key,
  note_id          uuid not null references public.notes (id) on delete cascade,
  title            text not null,
  note_date        date not null,
  kind             text not null,
  body             text not null,
  edited_by_id     uuid references auth.users (id) on delete set null,
  edited_by_email  text not null,
  created_at       timestamptz not null default now()
);

create index note_revisions_note_idx on public.note_revisions (note_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Komentar dan penanda baca
-- ---------------------------------------------------------------------------
create table public.note_comments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes (id) on delete cascade,
  body         text not null,
  author_id    uuid references auth.users (id) on delete set null,
  author_email text not null,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  constraint note_comments_body_valid check (length(btrim(body)) between 1 and 2000)
);

create index note_comments_note_idx on public.note_comments (note_id, created_at, id);

create table public.note_reads (
  user_id      uuid not null references auth.users (id) on delete cascade,
  note_id      uuid not null references public.notes (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, note_id)
);

create index note_reads_note_idx on public.note_reads (note_id);

-- ---------------------------------------------------------------------------
-- Libur nasional dan cuti bersama
-- ---------------------------------------------------------------------------
create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name         text not null,
  kind         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint holidays_name_valid check (length(btrim(name)) between 1 and 200),
  constraint holidays_kind_valid check (kind in ('national', 'collective_leave'))
);

create trigger holidays_set_updated_at
  before update on public.holidays
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Akses: klien login hanya SELECT. note_reads hanya baris miliknya. anon tidak punya akses.
-- ---------------------------------------------------------------------------
revoke all on public.notes, public.note_links, public.note_release_snapshots, public.note_action_items,
  public.note_revisions, public.note_comments, public.note_reads, public.holidays from anon, authenticated;
grant select on public.notes, public.note_links, public.note_release_snapshots, public.note_action_items,
  public.note_revisions, public.note_comments, public.note_reads, public.holidays to authenticated;

alter table public.notes                  enable row level security;
alter table public.note_links             enable row level security;
alter table public.note_release_snapshots enable row level security;
alter table public.note_action_items      enable row level security;
alter table public.note_revisions         enable row level security;
alter table public.note_comments          enable row level security;
alter table public.note_reads             enable row level security;
alter table public.holidays               enable row level security;

create policy notes_select                  on public.notes                  for select to authenticated using (true);
create policy note_links_select             on public.note_links             for select to authenticated using (true);
create policy note_release_snapshots_select on public.note_release_snapshots for select to authenticated using (true);
create policy note_action_items_select      on public.note_action_items      for select to authenticated using (true);
create policy note_revisions_select         on public.note_revisions         for select to authenticated using (true);
create policy note_comments_select          on public.note_comments          for select to authenticated using (true);
create policy note_reads_select             on public.note_reads             for select to authenticated
  using (user_id = (select auth.uid()));
create policy holidays_select               on public.holidays               for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- save_note: buat (p_id null) atau ubah catatan beserta tautan dan action item, dalam satu transaksi.
--   p_note  {title, note_date, kind, body, follows_up_id?}  (follows_up_id hanya dipakai saat membuat)
--   p_links [{kind, source_id?, release_id?, tag?, task_id?, snapshot?}]
--           snapshot {progress_percent, done, total, risk, days_left, target_date} hanya disimpan untuk tautan
--           release yang BARU; tautan yang sudah ada mempertahankan rekamannya.
--   p_items [{id?, body, assignee_id?, assignee_email?, due_date?, done?, carried_from_id?}]
--           id = item lama yang diubah; tanpa id = item baru; item lama yang tidak disebut dihapus.
--           carried_from_id (hanya saat membuat Follow up): item belum selesai di catatan asal; item asal
--           ditandai carried_to_id.
-- Ubah hanya oleh penulisnya (42501 not_author). Mengembalikan id catatan.
-- ---------------------------------------------------------------------------
create function public.save_note(
  p_id uuid, p_actor uuid, p_actor_email text, p_note jsonb, p_links jsonb, p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nid      uuid := p_id;
  prev     public.notes%rowtype;
  email    text := coalesce(nullif(btrim(p_actor_email), ''), 'unknown');
  v_title  text := btrim(coalesce(p_note ->> 'title', ''));
  v_date   date := (p_note ->> 'note_date')::date;
  v_kind   text := coalesce(nullif(p_note ->> 'kind', ''), 'meeting');
  v_body   text := coalesce(p_note ->> 'body', '');
  v_follow uuid := nullif(p_note ->> 'follows_up_id', '')::uuid;
  l        jsonb;
  it       jsonb;
  lid      uuid;
  iid      uuid;
  pos      int := 0;
  keep_ids uuid[] := '{}';
  keep_links uuid[] := '{}';
  src_item public.note_action_items%rowtype;
begin
  if p_actor is null then raise exception 'not_author' using errcode = '42501'; end if;
  if p_links is null then p_links := '[]'::jsonb; end if;
  if p_items is null then p_items := '[]'::jsonb; end if;
  if jsonb_typeof(p_links) <> 'array' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'links and items must be arrays' using errcode = 'check_violation';
  end if;

  if nid is null then
    if v_follow is not null then
      perform 1 from public.notes where id = v_follow;
      if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
    end if;
    insert into public.notes (title, note_date, kind, body, author_id, author_email, follows_up_id)
    values (v_title, v_date, v_kind, v_body, p_actor, email, v_follow)
    returning id into nid;
  else
    select * into prev from public.notes where id = nid for update;
    if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
    if prev.author_id is distinct from p_actor then raise exception 'not_author' using errcode = '42501'; end if;

    if prev.title <> v_title or prev.note_date <> v_date or prev.kind <> v_kind or prev.body <> v_body then
      insert into public.note_revisions (note_id, title, note_date, kind, body, edited_by_id, edited_by_email)
      values (nid, prev.title, prev.note_date, prev.kind, prev.body, p_actor, email);
      update public.notes
         set title = v_title, note_date = v_date, kind = v_kind, body = v_body, edited_at = now()
       where id = nid;
    end if;
  end if;

  -- Tautan: pertahankan yang sama (beserta rekamannya), tambah yang baru, hapus yang tidak disebut.
  for l in select * from jsonb_array_elements(p_links) loop
    select id into lid from public.note_links
     where note_id = nid and kind = l ->> 'kind'
       and source_id  is not distinct from nullif(l ->> 'source_id', '')::uuid
       and release_id is not distinct from nullif(l ->> 'release_id', '')::uuid
       and tag        is not distinct from nullif(btrim(coalesce(l ->> 'tag', '')), '')
       and task_id    is not distinct from nullif(btrim(coalesce(l ->> 'task_id', '')), '');
    if not found then
      insert into public.note_links (note_id, kind, source_id, release_id, tag, task_id)
      values (
        nid, l ->> 'kind',
        nullif(l ->> 'source_id', '')::uuid,
        nullif(l ->> 'release_id', '')::uuid,
        nullif(btrim(coalesce(l ->> 'tag', '')), ''),
        nullif(btrim(coalesce(l ->> 'task_id', '')), '')
      )
      returning id into lid;
      if l ->> 'kind' = 'release' and jsonb_typeof(l -> 'snapshot') = 'object' then
        insert into public.note_release_snapshots
          (link_id, progress_percent, done, total, risk, days_left, target_date)
        values (
          lid,
          (l -> 'snapshot' ->> 'progress_percent')::numeric,
          (l -> 'snapshot' ->> 'done')::int,
          (l -> 'snapshot' ->> 'total')::int,
          l -> 'snapshot' ->> 'risk',
          (l -> 'snapshot' ->> 'days_left')::int,
          (l -> 'snapshot' ->> 'target_date')::date
        );
      end if;
    end if;
    keep_links := keep_links || lid;
  end loop;
  delete from public.note_links where note_id = nid and not (id = any (keep_links));

  -- Action item.
  for it in select * from jsonb_array_elements(p_items) loop
    iid := nullif(it ->> 'id', '')::uuid;
    if iid is not null then
      update public.note_action_items
         set position = pos,
             body = btrim(coalesce(it ->> 'body', '')),
             assignee_id = nullif(it ->> 'assignee_id', '')::uuid,
             assignee_email = nullif(btrim(coalesce(it ->> 'assignee_email', '')), ''),
             due_date = nullif(it ->> 'due_date', '')::date,
             done = coalesce((it ->> 'done')::boolean, false),
             done_at = case
               when coalesce((it ->> 'done')::boolean, false) then coalesce(done_at, now())
               else null end
       where id = iid and note_id = nid;
      if not found then raise exception 'action item not found' using errcode = 'P0002'; end if;
    else
      insert into public.note_action_items (note_id, position, body, assignee_id, assignee_email, due_date, done, done_at)
      values (
        nid, pos, btrim(coalesce(it ->> 'body', '')),
        nullif(it ->> 'assignee_id', '')::uuid,
        nullif(btrim(coalesce(it ->> 'assignee_email', '')), ''),
        nullif(it ->> 'due_date', '')::date,
        coalesce((it ->> 'done')::boolean, false),
        case when coalesce((it ->> 'done')::boolean, false) then now() end
      )
      returning id into iid;

      -- Follow up: tandai item asal (harus milik catatan asal dan belum selesai/belum dibawa).
      if p_id is null and v_follow is not null and nullif(it ->> 'carried_from_id', '') is not null then
        select * into src_item from public.note_action_items
         where id = (it ->> 'carried_from_id')::uuid for update;
        if not found or src_item.note_id <> v_follow or src_item.done or src_item.carried_to_id is not null then
          raise exception 'action item cannot be carried over' using errcode = 'check_violation';
        end if;
        update public.note_action_items set carried_to_id = iid where id = src_item.id;
      end if;
    end if;
    keep_ids := keep_ids || iid;
    pos := pos + 1;
  end loop;
  delete from public.note_action_items where note_id = nid and not (id = any (keep_ids));

  return nid;
end;
$$;

-- Hapus catatan (hanya penulis). Semua note_* ikut terhapus (cascade); follows_up_id catatan lanjutan dikosongkan.
create function public.delete_note(p_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n public.notes%rowtype;
begin
  select * into n from public.notes where id = p_id for update;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  if p_actor is null or n.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;
  delete from public.notes where id = p_id;
end;
$$;

-- Centang/batal centang action item: penulis catatan atau penanggung jawab item.
create function public.set_action_item_done(p_item uuid, p_actor uuid, p_done boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.note_action_items%rowtype;
  author uuid;
begin
  select * into it from public.note_action_items where id = p_item for update;
  if not found then raise exception 'action item not found' using errcode = 'P0002'; end if;
  select author_id into author from public.notes where id = it.note_id;
  if p_actor is null or (author is distinct from p_actor and it.assignee_id is distinct from p_actor) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.note_action_items
     set done = coalesce(p_done, false),
         done_at = case when coalesce(p_done, false) then coalesce(done_at, now()) else null end
   where id = p_item;
  return it.note_id;
end;
$$;

-- Komentar: semua pengguna login boleh menambah; ubah dan hapus hanya penulisnya.
create function public.add_note_comment(p_note uuid, p_actor uuid, p_actor_email text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare cid uuid;
begin
  if p_actor is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform 1 from public.notes where id = p_note;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  insert into public.note_comments (note_id, body, author_id, author_email)
  values (p_note, btrim(coalesce(p_body, '')), p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'))
  returning id into cid;
  -- Komentar sendiri tidak pernah dihitung "baru".
  insert into public.note_reads (user_id, note_id, last_read_at) values (p_actor, p_note, now())
  on conflict (user_id, note_id) do update set last_read_at = excluded.last_read_at;
  return cid;
end;
$$;

create function public.edit_note_comment(p_comment uuid, p_actor uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
  nb text := btrim(coalesce(p_body, ''));
begin
  select * into c from public.note_comments where id = p_comment for update;
  if not found then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if p_actor is null or c.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;
  if nb <> c.body then
    update public.note_comments set body = nb, edited_at = now() where id = p_comment;
  end if;
  return c.note_id;
end;
$$;

create function public.delete_note_comment(p_comment uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
begin
  select * into c from public.note_comments where id = p_comment for update;
  if not found then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if p_actor is null or c.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;
  delete from public.note_comments where id = p_comment;
  return c.note_id;
end;
$$;

-- Penanda baca: dipanggil saat pengguna membuka detail catatan.
create function public.mark_note_read(p_note uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into public.note_reads (user_id, note_id, last_read_at)
  select p_actor, id, now() from public.notes where id = p_note
  on conflict (user_id, note_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.save_note(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_note(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_action_item_done(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.add_note_comment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.edit_note_comment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_note_comment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_note_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_note(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.delete_note(uuid, uuid) to service_role;
grant execute on function public.set_action_item_done(uuid, uuid, boolean) to service_role;
grant execute on function public.add_note_comment(uuid, uuid, text, text) to service_role;
grant execute on function public.edit_note_comment(uuid, uuid, text) to service_role;
grant execute on function public.delete_note_comment(uuid, uuid) to service_role;
grant execute on function public.mark_note_read(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Data awal libur. Sumber:
--   2026: SKB Menteri Agama, Menteri Ketenagakerjaan, dan Menteri PANRB tentang Hari Libur Nasional dan Cuti
--         Bersama Tahun 2026 (setneg.go.id, 19 September 2025): 17 libur nasional, 8 cuti bersama.
--   2027: SKB tiga menteri Tahun 2027, ditandatangani 15 September 2026 (aceh.kemenag.go.id): 18 libur nasional
--         (Idulfitri dua hari), 8 cuti bersama. Isra Mikraj jatuh dua kali di 2027 (27 Rajab 1448 dan 1449 H).
-- Revisi berikutnya dilakukan admin dari halaman /notes/holidays.
-- ---------------------------------------------------------------------------
insert into public.holidays (holiday_date, name, kind) values
  ('2026-01-01', 'New Year''s Day', 'national'),
  ('2026-01-16', 'Isra Mi''raj of the Prophet Muhammad', 'national'),
  ('2026-02-16', 'Chinese New Year (collective leave)', 'collective_leave'),
  ('2026-02-17', 'Chinese New Year 2577', 'national'),
  ('2026-03-18', 'Nyepi (collective leave)', 'collective_leave'),
  ('2026-03-19', 'Nyepi, Saka New Year 1948', 'national'),
  ('2026-03-20', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2026-03-21', 'Eid al-Fitr 1447 H', 'national'),
  ('2026-03-22', 'Eid al-Fitr 1447 H', 'national'),
  ('2026-03-23', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2026-03-24', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2026-04-03', 'Good Friday', 'national'),
  ('2026-04-05', 'Easter Sunday', 'national'),
  ('2026-05-01', 'International Labour Day', 'national'),
  ('2026-05-14', 'Ascension of Jesus Christ', 'national'),
  ('2026-05-15', 'Ascension of Jesus Christ (collective leave)', 'collective_leave'),
  ('2026-05-27', 'Eid al-Adha 1447 H', 'national'),
  ('2026-05-28', 'Eid al-Adha (collective leave)', 'collective_leave'),
  ('2026-05-31', 'Vesak 2570 BE', 'national'),
  ('2026-06-01', 'Pancasila Day', 'national'),
  ('2026-06-16', 'Islamic New Year 1448 H', 'national'),
  ('2026-08-17', 'Independence Day', 'national'),
  ('2026-08-25', 'Mawlid of the Prophet Muhammad', 'national'),
  ('2026-12-24', 'Christmas (collective leave)', 'collective_leave'),
  ('2026-12-25', 'Christmas Day', 'national'),

  ('2027-01-01', 'New Year''s Day', 'national'),
  ('2027-01-05', 'Isra Mi''raj of the Prophet Muhammad', 'national'),
  ('2027-02-05', 'Chinese New Year (collective leave)', 'collective_leave'),
  ('2027-02-06', 'Chinese New Year 2578', 'national'),
  ('2027-03-08', 'Nyepi, Saka New Year 1949', 'national'),
  ('2027-03-09', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2027-03-10', 'Eid al-Fitr 1448 H', 'national'),
  ('2027-03-11', 'Eid al-Fitr 1448 H', 'national'),
  ('2027-03-12', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2027-03-15', 'Eid al-Fitr (collective leave)', 'collective_leave'),
  ('2027-03-25', 'Good Friday (collective leave)', 'collective_leave'),
  ('2027-03-26', 'Good Friday', 'national'),
  ('2027-03-28', 'Easter Sunday', 'national'),
  ('2027-05-01', 'International Labour Day', 'national'),
  ('2027-05-06', 'Ascension of Jesus Christ', 'national'),
  ('2027-05-17', 'Eid al-Adha 1448 H', 'national'),
  ('2027-05-18', 'Eid al-Adha (collective leave)', 'collective_leave'),
  ('2027-05-19', 'Vesak (collective leave)', 'collective_leave'),
  ('2027-05-20', 'Vesak 2571 BE', 'national'),
  ('2027-06-01', 'Pancasila Day', 'national'),
  ('2027-06-06', 'Islamic New Year 1449 H', 'national'),
  ('2027-08-15', 'Mawlid of the Prophet Muhammad', 'national'),
  ('2027-08-17', 'Independence Day', 'national'),
  ('2027-12-24', 'Christmas (collective leave)', 'collective_leave'),
  ('2027-12-25', 'Christmas Day', 'national'),
  ('2027-12-26', 'Isra Mi''raj of the Prophet Muhammad', 'national');

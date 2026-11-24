-- Balasan komentar catatan (PRD-Note.md, Komentar). Jalankan sekali saja (tidak idempoten).
--
-- 1. note_comments.parent_id: komentar utama (null) atau balasan. Balasan hanya satu tingkat: membalas sebuah
--    balasan menempel ke komentar utamanya (utas yang sama).
-- 2. note_comments.deleted_at: komentar utama yang sudah dibalas tidak dihapus fisik saat penulisnya menghapusnya,
--    agar balasan orang lain tidak ikut hilang; isinya dikosongkan dan tampil "This comment was deleted". Bila
--    balasan terakhirnya ikut dihapus, komentar utama yang sudah dihapus itu dibersihkan.
-- 3. add_note_comment menerima p_parent (opsional). Fungsi lama (4 parameter) diganti.
--
-- Kode galat: P0002 = tidak ditemukan; 42501 not_author; 23514 nilai tidak valid (mis. induk dari catatan lain).

alter table public.note_comments
  add column parent_id uuid references public.note_comments (id) on delete cascade,
  add column deleted_at timestamptz;

alter table public.note_comments drop constraint note_comments_body_valid;
alter table public.note_comments add constraint note_comments_body_valid check (
  (deleted_at is null and length(btrim(body)) between 1 and 2000)
  or (deleted_at is not null and body = '')
);
alter table public.note_comments add constraint note_comments_not_self_parent check (parent_id is null or parent_id <> id);

create index note_comments_parent_idx on public.note_comments (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- Tambah komentar atau balasan.
-- ---------------------------------------------------------------------------
drop function public.add_note_comment(uuid, uuid, text, text);

create function public.add_note_comment(p_note uuid, p_actor uuid, p_actor_email text, p_body text, p_parent uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  root uuid := null;
  par public.note_comments%rowtype;
begin
  if p_actor is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform 1 from public.notes where id = p_note;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;

  if p_parent is not null then
    select * into par from public.note_comments where id = p_parent;
    if not found then raise exception 'comment not found' using errcode = 'P0002'; end if;
    if par.note_id <> p_note then
      raise exception 'the comment belongs to another note' using errcode = 'check_violation';
    end if;
    -- Satu tingkat: membalas balasan = membalas komentar utamanya.
    root := coalesce(par.parent_id, par.id);
  end if;

  insert into public.note_comments (note_id, parent_id, body, author_id, author_email)
  values (p_note, root, btrim(coalesce(p_body, '')), p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'))
  returning id into cid;
  -- Komentar sendiri tidak pernah dihitung "baru".
  insert into public.note_reads (user_id, note_id, last_read_at) values (p_actor, p_note, now())
  on conflict (user_id, note_id) do update set last_read_at = excluded.last_read_at;
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ubah: komentar yang sudah dihapus tidak bisa diubah.
-- ---------------------------------------------------------------------------
create or replace function public.edit_note_comment(p_comment uuid, p_actor uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
  nb text := btrim(coalesce(p_body, ''));
begin
  select * into c from public.note_comments where id = p_comment for update;
  if not found or c.deleted_at is not null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if p_actor is null or c.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;
  if nb <> c.body then
    update public.note_comments set body = nb, edited_at = now() where id = p_comment;
  end if;
  return c.note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hapus: komentar utama yang punya balasan ditandai terhapus (balasan tetap); selain itu dihapus fisik.
-- Menghapus balasan terakhir dari komentar utama yang sudah ditandai terhapus ikut membersihkannya.
-- ---------------------------------------------------------------------------
create or replace function public.delete_note_comment(p_comment uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
begin
  select * into c from public.note_comments where id = p_comment for update;
  if not found or c.deleted_at is not null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if p_actor is null or c.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;

  if exists (select 1 from public.note_comments where parent_id = c.id) then
    update public.note_comments set body = '', deleted_at = now() where id = c.id;
  else
    delete from public.note_comments where id = c.id;
    if c.parent_id is not null then
      delete from public.note_comments p
       where p.id = c.parent_id and p.deleted_at is not null
         and not exists (select 1 from public.note_comments r where r.parent_id = p.id);
    end if;
  end if;
  return c.note_id;
end;
$$;

revoke all on function public.add_note_comment(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_note_comment(uuid, uuid, text, text, uuid) to service_role;

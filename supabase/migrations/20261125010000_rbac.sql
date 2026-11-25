-- RBAC (PRD-RBAC.md) bagian 2. Jalankan sekali saja (tidak idempoten), SETELAH 20261125000000_rbac_roles.sql.
--
--  1. profiles.disabled_at: akun nonaktif (kosong = aktif).
--  2. active_role(), is_admin() (admin + superadmin), is_superadmin(); akun nonaktif tidak punya role.
--  3. handle_new_user(): role bawaan viewer untuk semua cara daftar (aturan "Google = admin" dihapus). Pengecualian:
--     app_metadata.initial_role, yang hanya bisa diisi lewat admin API (user dibuat superadmin dari Settings).
--  4. role_menu_access: menu yang boleh dibuka tiap role (superadmin selalu semua; tidak disimpan).
--  5. user_admin_events: log perubahan user dan akses (hanya superadmin yang bisa membaca).
--  6. Fungsi Settings: set_user_role, set_user_active, set_menu_access, log_user_event.
--  7. Fungsi tulis yang dipakai developer (komentar catatan, action item, activity release) menolak viewer dan
--     akun nonaktif; developer hanya boleh mengubah atau menghapus Note activity miliknya.
--
-- Semua fungsi tulis hanya untuk service_role; klien login tetap hanya membaca (RLS).
-- Kode galat: P0002 tidak ditemukan; 42501 not_allowed / not_superadmin / self_change; 23514 nilai tidak valid,
--             last_superadmin, locked_menu.
-- Akun yang sudah ada tidak berubah role-nya. Superadmin pertama diisi lewat skrip data terpisah (tidak di repo).

-- ---------------------------------------------------------------------------
-- 1. Status akun
-- ---------------------------------------------------------------------------
alter table public.profiles add column disabled_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Role aktif dan pemeriksaan admin
-- ---------------------------------------------------------------------------
-- Role pengguna, atau null bila tidak ada profil atau akun nonaktif.
create function public.active_role(p_user uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = p_user and disabled_at is null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.active_role((select auth.uid())) in ('admin', 'superadmin'), false);
$$;

create function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.active_role((select auth.uid())) = 'superadmin', false);
$$;

revoke all on function public.active_role(uuid) from public, anon, authenticated;
revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.active_role(uuid) to service_role;
grant execute on function public.is_superadmin() to authenticated;

-- Galat 42501 bila pelaku tidak aktif atau role-nya tidak termasuk p_roles.
create function public.assert_role(p_actor uuid, p_roles public.user_role[])
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.user_role := public.active_role(p_actor);
begin
  if p_actor is null or r is null or not (r = any (p_roles)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return r;
end;
$$;

revoke all on function public.assert_role(uuid, public.user_role[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Role bawaan saat mendaftar
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare wanted text := new.raw_app_meta_data ->> 'initial_role';
begin
  insert into public.profiles (user_id, role)
  values (
    new.id,
    case when wanted in ('superadmin', 'admin', 'developer', 'viewer')
         then wanted::public.user_role
         else 'viewer'::public.user_role
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Akses menu
-- ---------------------------------------------------------------------------
-- Kunci menu sama dengan MENUS di src/lib/access.ts. Settings tidak ada di sini (selalu hanya superadmin).
create function public.menu_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['calendar', 'dashboard', 'tasks', 'release', 'trend', 'notes', 'archive', 'sources'] $$;

create table public.role_menu_access (
  role public.user_role not null,
  menu text not null,
  primary key (role, menu),
  constraint role_menu_access_role_valid check (role in ('admin', 'developer', 'viewer')),
  constraint role_menu_access_menu_valid check (menu = any (public.menu_keys())),
  -- Menu terkunci: Source settings hanya untuk admin.
  constraint role_menu_access_sources_admin check (menu <> 'sources' or role = 'admin')
);

insert into public.role_menu_access (role, menu)
select r.role::public.user_role, m.menu
  from (values ('admin'), ('developer'), ('viewer')) as r (role)
 cross join unnest(public.menu_keys()) as m (menu)
 where m.menu <> 'sources' or r.role = 'admin';

revoke all on public.role_menu_access from anon, authenticated;
grant select on public.role_menu_access to authenticated;
alter table public.role_menu_access enable row level security;
create policy role_menu_access_select on public.role_menu_access for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 5. Log perubahan user dan akses
-- ---------------------------------------------------------------------------
create table public.user_admin_events (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users (id) on delete set null,
  actor_email  text not null,
  target_id    uuid references auth.users (id) on delete set null,
  target_email text,
  action       text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint user_admin_events_action_valid check (
    action in ('user_created', 'role_changed', 'user_disabled', 'user_enabled', 'password_reset', 'menu_access_changed')
  )
);

create index user_admin_events_time_idx on public.user_admin_events (created_at desc);

revoke all on public.user_admin_events from anon, authenticated;
grant select on public.user_admin_events to authenticated;
alter table public.user_admin_events enable row level security;
create policy user_admin_events_select on public.user_admin_events
  for select to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 6. Fungsi Settings (pelaku selalu superadmin aktif)
-- ---------------------------------------------------------------------------
create function public.assert_superadmin(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null or public.active_role(p_actor) is distinct from 'superadmin' then
    raise exception 'not_superadmin' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_superadmin(uuid) from public, anon, authenticated;

-- Galat bila perubahan pada p_target membuat superadmin aktif habis. Mengunci baris superadmin agar dua
-- perubahan bersamaan tidak lolos keduanya.
create function public.assert_keeps_superadmin(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where role = 'superadmin' for update;
  if not exists (
    select 1 from public.profiles
     where role = 'superadmin' and disabled_at is null and user_id <> p_target
  ) then
    raise exception 'last_superadmin' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.assert_keeps_superadmin(uuid) from public, anon, authenticated;

create function public.set_user_role(
  p_actor uuid, p_actor_email text, p_target uuid, p_target_email text, p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles%rowtype;
begin
  perform public.assert_superadmin(p_actor);
  if p_target = p_actor then raise exception 'self_change' using errcode = '42501'; end if;
  if p_role is null then raise exception 'invalid role' using errcode = 'check_violation'; end if;

  select * into p from public.profiles where user_id = p_target for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if p.role = p_role then return; end if;
  if p.role = 'superadmin' and p.disabled_at is null then perform public.assert_keeps_superadmin(p_target); end if;

  update public.profiles set role = p_role where user_id = p_target;
  insert into public.user_admin_events (actor_id, actor_email, target_id, target_email, action, detail)
  values (p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'), p_target, p_target_email, 'role_changed',
          jsonb_build_object('from', p.role, 'to', p_role));
end;
$$;

create function public.set_user_active(
  p_actor uuid, p_actor_email text, p_target uuid, p_target_email text, p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles%rowtype;
begin
  perform public.assert_superadmin(p_actor);
  if p_target = p_actor then raise exception 'self_change' using errcode = '42501'; end if;
  if p_active is null then raise exception 'invalid status' using errcode = 'check_violation'; end if;

  select * into p from public.profiles where user_id = p_target for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if (p.disabled_at is null) = p_active then return; end if;
  if not p_active and p.role = 'superadmin' then perform public.assert_keeps_superadmin(p_target); end if;

  update public.profiles set disabled_at = case when p_active then null else now() end where user_id = p_target;
  insert into public.user_admin_events (actor_id, actor_email, target_id, target_email, action)
  values (p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'), p_target, p_target_email,
          case when p_active then 'user_enabled' else 'user_disabled' end);
end;
$$;

-- Mengganti seluruh daftar menu satu role. Dashboard selalu ditambahkan; Source settings ditolak untuk selain admin.
create function public.set_menu_access(p_actor uuid, p_actor_email text, p_role public.user_role, p_menus text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text[];
  added text[];
  removed text[];
begin
  perform public.assert_superadmin(p_actor);
  if p_role is null or p_role not in ('admin', 'developer', 'viewer') then
    raise exception 'invalid role' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(distinct m order by m), '{}') into wanted
    from unnest(coalesce(p_menus, '{}') || array['dashboard']) as m;
  if exists (select 1 from unnest(wanted) m where not (m = any (public.menu_keys()))) then
    raise exception 'invalid menu' using errcode = 'check_violation';
  end if;
  if p_role <> 'admin' and 'sources' = any (wanted) then
    raise exception 'locked_menu' using errcode = 'check_violation';
  end if;

  perform 1 from public.role_menu_access where role = p_role for update;
  select coalesce(array_agg(m order by m), '{}') into added
    from unnest(wanted) m
   where not exists (select 1 from public.role_menu_access a where a.role = p_role and a.menu = m);
  select coalesce(array_agg(a.menu order by a.menu), '{}') into removed
    from public.role_menu_access a
   where a.role = p_role and not (a.menu = any (wanted));
  if cardinality(added) = 0 and cardinality(removed) = 0 then return; end if;

  delete from public.role_menu_access where role = p_role and menu = any (removed);
  insert into public.role_menu_access (role, menu) select p_role, unnest(added);
  insert into public.user_admin_events (actor_id, actor_email, action, detail)
  values (p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'), 'menu_access_changed',
          jsonb_build_object('role', p_role, 'added', to_jsonb(added), 'removed', to_jsonb(removed)));
end;
$$;

-- Mencatat perubahan yang dikerjakan lewat Supabase Auth (user dibuat, password direset). Password tidak pernah
-- dicatat: detail hanya boleh berisi role.
create function public.log_user_event(
  p_actor uuid, p_actor_email text, p_target uuid, p_target_email text, p_action text, p_role public.user_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_superadmin(p_actor);
  if p_action not in ('user_created', 'password_reset') then
    raise exception 'invalid action' using errcode = 'check_violation';
  end if;
  insert into public.user_admin_events (actor_id, actor_email, target_id, target_email, action, detail)
  values (p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'), p_target, p_target_email, p_action,
          case when p_role is null then '{}'::jsonb else jsonb_build_object('role', p_role) end);
end;
$$;

revoke all on function public.set_user_role(uuid, text, uuid, text, public.user_role) from public, anon, authenticated;
revoke all on function public.set_user_active(uuid, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_menu_access(uuid, text, public.user_role, text[]) from public, anon, authenticated;
revoke all on function public.log_user_event(uuid, text, uuid, text, text, public.user_role) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text, uuid, text, public.user_role) to service_role;
grant execute on function public.set_user_active(uuid, text, uuid, text, boolean) to service_role;
grant execute on function public.set_menu_access(uuid, text, public.user_role, text[]) to service_role;
grant execute on function public.log_user_event(uuid, text, uuid, text, text, public.user_role) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Fungsi tulis yang juga dipakai developer
-- ---------------------------------------------------------------------------
-- Komentar catatan: superadmin, admin, developer.
create or replace function public.add_note_comment(p_note uuid, p_actor uuid, p_actor_email text, p_body text, p_parent uuid default null)
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
  perform public.assert_role(p_actor, array['superadmin', 'admin', 'developer']::public.user_role[]);
  perform 1 from public.notes where id = p_note;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;

  if p_parent is not null then
    select * into par from public.note_comments where id = p_parent;
    if not found then raise exception 'comment not found' using errcode = 'P0002'; end if;
    if par.note_id <> p_note then
      raise exception 'the comment belongs to another note' using errcode = 'check_violation';
    end if;
    root := coalesce(par.parent_id, par.id);
  end if;

  insert into public.note_comments (note_id, parent_id, body, author_id, author_email)
  values (p_note, root, btrim(coalesce(p_body, '')), p_actor, coalesce(nullif(btrim(p_actor_email), ''), 'unknown'))
  returning id into cid;
  insert into public.note_reads (user_id, note_id, last_read_at) values (p_actor, p_note, now())
  on conflict (user_id, note_id) do update set last_read_at = excluded.last_read_at;
  return cid;
end;
$$;

create or replace function public.edit_note_comment(p_comment uuid, p_actor uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
  nb text := btrim(coalesce(p_body, ''));
begin
  perform public.assert_role(p_actor, array['superadmin', 'admin', 'developer']::public.user_role[]);
  select * into c from public.note_comments where id = p_comment for update;
  if not found or c.deleted_at is not null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if c.author_id is distinct from p_actor then
    raise exception 'not_author' using errcode = '42501';
  end if;
  if nb <> c.body then
    update public.note_comments set body = nb, edited_at = now() where id = p_comment;
  end if;
  return c.note_id;
end;
$$;

create or replace function public.delete_note_comment(p_comment uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.note_comments%rowtype;
begin
  perform public.assert_role(p_actor, array['superadmin', 'admin', 'developer']::public.user_role[]);
  select * into c from public.note_comments where id = p_comment for update;
  if not found or c.deleted_at is not null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if c.author_id is distinct from p_actor then
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

-- Centang action item: penulis catatan atau penanggung jawab, dan bukan viewer.
create or replace function public.set_action_item_done(p_item uuid, p_actor uuid, p_done boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.note_action_items%rowtype;
  author uuid;
begin
  perform public.assert_role(p_actor, array['superadmin', 'admin', 'developer']::public.user_role[]);
  select * into it from public.note_action_items where id = p_item for update;
  if not found then raise exception 'action item not found' using errcode = 'P0002'; end if;
  select author_id into author from public.notes where id = it.note_id;
  if author is distinct from p_actor and it.assignee_id is distinct from p_actor then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.note_action_items
     set done = coalesce(p_done, false),
         done_at = case when coalesce(p_done, false) then coalesce(done_at, now()) else null end
   where id = p_item;
  return it.note_id;
end;
$$;

-- Activity release: tambah Note (superadmin, admin, developer).
create or replace function public.add_release_note(p_id uuid, p_body text, p_author uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare nid uuid;
begin
  perform public.assert_role(p_author, array['superadmin', 'admin', 'developer']::public.user_role[]);
  perform 1 from public.releases where id = p_id;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  insert into public.release_notes (release_id, kind, body, author_id, author_email)
  values (p_id, 'note', btrim(coalesce(p_body, '')), p_author, coalesce(nullif(btrim(p_email), ''), 'unknown'))
  returning id into nid;
  return nid;
end;
$$;

-- Galat 42501 bila p_actor tidak boleh mengubah entri n: admin dan superadmin semua entri; developer hanya Note
-- miliknya.
create function public.assert_can_change_release_note(p_actor uuid, n public.release_notes)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.user_role := public.assert_role(p_actor, array['superadmin', 'admin', 'developer']::public.user_role[]);
begin
  if r = 'developer' and (n.kind <> 'note' or n.author_id is distinct from p_actor) then
    raise exception 'not_author' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_can_change_release_note(uuid, public.release_notes) from public, anon, authenticated;

-- Edit dan hapus activity menerima pelaku (versi lama tanpa pelaku dihapus).
drop function public.edit_release_note(uuid, text, text);
drop function public.delete_release_note(uuid);

create function public.edit_release_note(p_note_id uuid, p_body text, p_actor uuid, p_email text)
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
  perform public.assert_can_change_release_note(p_actor, n);
  if nb = n.body then return; end if;

  update public.release_notes
     set body = nb,
         previous_body = n.body,
         edited_at = now(),
         edited_by_email = coalesce(nullif(btrim(p_email), ''), 'unknown')
   where id = p_note_id;

  -- Sama dengan 20261116020000: entri Hold terbaru dari release yang masih ditahan menyinkronkan alasan hold.
  if n.kind = 'hold' then
    update public.releases r
       set hold_reason = nb
     where r.id = n.release_id
       and r.held_at is not null
       and p_note_id = (
         select h.id from public.release_notes h
          where h.release_id = n.release_id and h.kind = 'hold'
          order by h.created_at desc, h.id desc
          limit 1
       );
  end if;
end;
$$;

create function public.delete_release_note(p_note_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.release_notes%rowtype;
begin
  select * into n from public.release_notes where id = p_note_id for update;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  if n.kind <> 'note' then raise exception 'not_deletable' using errcode = '55000'; end if;
  perform public.assert_can_change_release_note(p_actor, n);

  delete from public.release_notes where id = p_note_id;
  return n.release_id;
end;
$$;

revoke all on function public.edit_release_note(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_release_note(uuid, uuid) from public, anon, authenticated;
grant execute on function public.edit_release_note(uuid, text, uuid, text) to service_role;
grant execute on function public.delete_release_note(uuid, uuid) to service_role;

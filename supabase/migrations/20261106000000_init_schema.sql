-- Web Monitoring Task Master - skema awal (PRD: Model data)
-- Empat entitas: sources, tasks, snapshots, profiles (pengguna dikelola Supabase Auth).
--
-- Model akses:
--   * Pengguna login (authenticated) hanya MEMBACA tasks, snapshots, sources (tanpa token).
--   * Semua penulisan (sinkronisasi, CRUD sumber, seeder) lewat service role di kode server,
--     setelah requireAdmin()/requireUser() lolos. Service role melewati RLS.
--   * Kolom sources.token_encrypted tidak pernah bisa dibaca peran klien (anon/authenticated).

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------
create type public.repo_provider as enum ('github', 'gitlab', 'bitbucket');
create type public.user_role     as enum ('admin', 'viewer');
create type public.sync_status   as enum ('never', 'success', 'failed');

-- ---------------------------------------------------------------------------
-- profiles: peran pengguna (admin atau viewer)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Cek admin tanpa memicu rekursi RLS pada profiles.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Setiap akun baru di auth.users otomatis mendapat profil viewer.
-- Seeder menaikkan akun admin awal ke role 'admin'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- sources: sumber task master per aplikasi
-- ---------------------------------------------------------------------------
create table public.sources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  provider         public.repo_provider not null,
  repo_url         text not null,
  branch           text not null default 'main',
  file_path        text not null default '.taskmaster/tasks/tasks.json',
  token_encrypted  text,                       -- AES-256-GCM, hanya dibaca kode server
  token_expires_at timestamptz,                -- opsional, untuk peringatan kedaluwarsa
  is_active        boolean not null default true,
  last_sync_status public.sync_status not null default 'never',
  last_attempt_at  timestamptz,                -- percobaan sinkron terakhir (sukses atau gagal)
  last_synced_at   timestamptz,                -- sinkron terakhir yang BERHASIL (kesegaran data)
  last_error       text,
  etag             text,                       -- untuk permintaan bersyarat
  last_commit_at   timestamptz,                -- waktu commit terakhir file di repo
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sources_name_not_blank check (length(btrim(name)) > 0),
  constraint sources_unique_target unique (repo_url, branch, file_path)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks: hasil normalisasi tasks.json (ID hanya unik per sumber + tag)
-- ---------------------------------------------------------------------------
create table public.tasks (
  source_id      uuid not null references public.sources (id) on delete cascade,
  tag            text not null,
  task_id        text not null,
  title          text not null,
  description    text,
  status         text not null,               -- teks bebas: status tak dikenal tetap tersimpan
  priority       text,
  dependencies   jsonb not null default '[]'::jsonb,
  details        text,
  test_strategy  text,
  subtasks       jsonb not null default '[]'::jsonb,
  subtasks_total int  not null default 0,     -- turunan dari subtasks, untuk kolom dan urutan daftar
  subtasks_done  int  not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (source_id, tag, task_id)
);

create index tasks_status_idx   on public.tasks (status);
create index tasks_priority_idx on public.tasks (priority);
create index tasks_tag_idx      on public.tasks (tag);
-- (source_id, tag) sudah tercakup oleh awalan primary key.

-- ---------------------------------------------------------------------------
-- snapshots: dibuat tiap sinkronisasi berhasil, dasar riwayat dan tren
-- ---------------------------------------------------------------------------
create table public.snapshots (
  id          bigint generated always as identity primary key,
  source_id   uuid not null references public.sources (id) on delete cascade,
  tag         text not null,
  taken_at    timestamptz not null default now(),
  total       int not null default 0,
  pending     int not null default 0,
  in_progress int not null default 0,
  review      int not null default 0,
  done        int not null default 0,
  deferred    int not null default 0,
  cancelled   int not null default 0,
  other       int not null default 0,          -- status di luar enam status baku
  percent_done numeric(5, 2) generated always as (
    case when total > 0 then round(done * 100.0 / total, 2) else 0 end
  ) stored,
  constraint snapshots_counts_nonnegative check (
    total >= 0 and pending >= 0 and in_progress >= 0 and review >= 0
    and done >= 0 and deferred >= 0 and cancelled >= 0 and other >= 0
  )
);

create index snapshots_source_time_idx on public.snapshots (source_id, taken_at desc);
create index snapshots_time_idx        on public.snapshots (taken_at desc);

-- ---------------------------------------------------------------------------
-- Hak akses tingkat tabel/kolom
-- Supabase memberi ALL ke anon/authenticated secara default; cabut dulu.
-- ---------------------------------------------------------------------------
revoke all on public.profiles  from anon, authenticated;
revoke all on public.sources   from anon, authenticated;
revoke all on public.tasks     from anon, authenticated;
revoke all on public.snapshots from anon, authenticated;
revoke all on sequence public.snapshots_id_seq from anon, authenticated;

grant select on public.profiles  to authenticated;
grant select on public.tasks     to authenticated;
grant select on public.snapshots to authenticated;

-- sources: semua kolom KECUALI token_encrypted. Klien harus menyebut kolom secara
-- eksplisit; `select *` sengaja ditolak (permission denied).
grant select (
  id, name, provider, repo_url, branch, file_path, token_expires_at, is_active,
  last_sync_status, last_attempt_at, last_synced_at, last_error, etag,
  last_commit_at, created_at, updated_at
) on public.sources to authenticated;

-- Fungsi bantu tidak perlu dipanggil langsung oleh anon.
revoke all on function public.is_admin()        from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.sources   enable row level security;
alter table public.tasks     enable row level security;
alter table public.snapshots enable row level security;

-- Pengguna melihat profilnya sendiri; admin melihat semua.
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Semua pengguna login boleh melihat semua aplikasi (keputusan PRD).
create policy sources_select on public.sources
  for select to authenticated using (true);

create policy tasks_select on public.tasks
  for select to authenticated using (true);

create policy snapshots_select on public.snapshots
  for select to authenticated using (true);

-- Tidak ada policy/grant INSERT, UPDATE, DELETE untuk peran klien: penulisan hanya
-- lewat service role di kode server (setelah requireAdmin() untuk sumber).

-- Fitur Release Tracking (PRD-Fitur-Release-Tracking.md): target rilis per aplikasi.
--
-- Satu release milik satu aplikasi (sources), menunjuk satu tag dan satu rentang nomor task
-- (range_start .. range_end, inklusif). Isi release TIDAK disimpan: dihitung dari tabel tasks.
-- Satu aplikasi boleh punya banyak release.
--
-- Akses: pengguna login hanya MEMBACA; penulisan lewat service role di kode server
-- (setelah requireAdmin()), sama dengan tabel lain.

create table public.releases (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.sources (id) on delete cascade,
  tag         text not null,
  name        text not null,
  range_start bigint not null,
  range_end   bigint not null,
  start_date  date not null default ((now() at time zone 'Asia/Jakarta')::date),
  target_date date not null,
  released_on date,                              -- kosong = belum rilis
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint releases_name_valid   check (length(btrim(name)) between 1 and 100),
  constraint releases_tag_valid    check (length(btrim(tag))  between 1 and 100),
  constraint releases_range_valid  check (range_start > 0 and range_start <= range_end),
  constraint releases_dates_valid  check (start_date <= target_date),
  constraint releases_unique_name  unique (source_id, name)
);

create index releases_target_date_idx on public.releases (target_date);
-- (source_id) sudah tercakup oleh awalan unique (source_id, name).

create trigger releases_set_updated_at
  before update on public.releases
  for each row execute function public.set_updated_at();

-- Supabase memberi ALL ke anon/authenticated secara default; cabut dulu, sisakan SELECT.
revoke all on public.releases from anon, authenticated;
grant select on public.releases to authenticated;

alter table public.releases enable row level security;

-- Semua pengguna login boleh melihat semua release (sama dengan sources/tasks).
create policy releases_select on public.releases
  for select to authenticated using (true);

-- Tidak ada policy/grant INSERT, UPDATE, DELETE untuk peran klien.

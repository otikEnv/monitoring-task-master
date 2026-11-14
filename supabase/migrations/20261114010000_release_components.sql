-- Release lintas aplikasi (PRD-Release-Multi-Aplikasi.md).
--
-- Satu release (header: nama, tanggal, status rilis) punya 1..10 komponen; tiap komponen = satu
-- aplikasi + satu tag + satu rentang task. Release lama dipindahkan menjadi release dengan satu
-- komponen. Isi komponen tetap TIDAK disimpan: dihitung dari tabel tasks.
-- Jalankan sekali saja (tidak idempoten).

-- Nama release kini unik di seluruh aplikasi; berhenti dengan pesan jelas bila ada nama ganda.
do $$
declare dup text;
begin
  select string_agg(name, ', ') into dup
  from (select name from public.releases group by name having count(*) > 1) d;
  if dup is not null then
    raise exception 'Nama release ganda, ubah dulu sebelum migrasi: %', dup;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Komponen
-- ---------------------------------------------------------------------------
create table public.release_components (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references public.releases (id) on delete cascade,
  source_id   uuid not null references public.sources (id) on delete cascade,
  tag         text not null,
  range_start bigint not null,
  range_end   bigint not null,
  created_at  timestamptz not null default now(),
  constraint release_components_tag_valid   check (length(btrim(tag)) between 1 and 100),
  constraint release_components_range_valid check (range_start > 0 and range_start <= range_end),
  constraint release_components_unique      unique (release_id, source_id, tag)
);

-- (release_id) tercakup oleh awalan unique; indeks source_id untuk filter dan cascade dari sources.
create index release_components_source_idx on public.release_components (source_id);

-- Pindahkan data release lama: satu komponen per release.
insert into public.release_components (release_id, source_id, tag, range_start, range_end)
select id, source_id, tag, range_start, range_end from public.releases;

-- Hapus kolom komponen dari header release.
alter table public.releases drop constraint releases_unique_name;
alter table public.releases drop column source_id;
alter table public.releases drop column tag;
alter table public.releases drop column range_start;
alter table public.releases drop column range_end;
alter table public.releases add constraint releases_unique_name unique (name);

-- Akses: sama dengan releases (klien hanya SELECT, tulis lewat service role).
revoke all on public.release_components from anon, authenticated;
grant select on public.release_components to authenticated;

alter table public.release_components enable row level security;

create policy release_components_select on public.release_components
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Simpan release dan seluruh komponennya secara atomik (satu transaksi).
--   p_id          null = buat baru, selain itu ubah release itu
--   p_header      {"name": "...", "start_date": "yyyy-mm-dd" | null, "target_date": "yyyy-mm-dd"}
--   p_components  [{"source_id": "...", "tag": "...", "range_start": 1, "range_end": 9}, ...]  (1..10)
-- Pada ubah, seluruh komponen diganti dan released_on tidak disentuh. start_date kosong = bawaan
-- (hari ini WIB) saat buat, tidak berubah saat ubah. Nama ganda dan pasangan (aplikasi, tag) ganda
-- menghasilkan unique_violation; rentang tidak valid check_violation; release tidak ada P0002.
-- ---------------------------------------------------------------------------
create function public.save_release(p_id uuid, p_header jsonb, p_components jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid   uuid := p_id;
  n     int;
  start_d date := nullif(p_header ->> 'start_date', '')::date;
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
      (p_header ->> 'target_date')::date
    )
    returning id into rid;
  else
    update public.releases
       set name = p_header ->> 'name',
           start_date = coalesce(start_d, start_date),
           target_date = (p_header ->> 'target_date')::date
     where id = rid;
    if not found then
      raise exception 'release not found' using errcode = 'P0002';
    end if;
    delete from public.release_components where release_id = rid;
  end if;

  insert into public.release_components (release_id, source_id, tag, range_start, range_end)
  select rid, c.source_id, c.tag, c.range_start, c.range_end
  from jsonb_to_recordset(p_components)
       as c (source_id uuid, tag text, range_start bigint, range_end bigint);

  return rid;
end;
$$;

revoke all on function public.save_release(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_release(uuid, jsonb, jsonb) to service_role;

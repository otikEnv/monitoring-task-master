-- Archive dan Restore (PRD-Archive.md).
--
-- archived_at kosong = aktif; terisi = diarsipkan (disembunyikan dari tampilan sehari-hari, data tetap
-- ada). Berlaku untuk aplikasi (sources) dan release (releases). Jalankan sekali saja (tidak idempoten).
--
-- Penyaringan: hanya view yang tidak punya daftar aplikasi sendiri yang disaring di database
-- (task_list dan source_snapshot_totals). source_status_counts dan source_tags TIDAK diubah: dipakai
-- bersama jalur detail dan validasi release yang tetap harus membaca aplikasi terarsip; penyaringannya
-- dilakukan aplikasi pada daftar aplikasi yang sudah ditampilkan.

alter table public.sources  add column archived_at timestamptz;
alter table public.releases add column archived_at timestamptz;

-- Daftar item terarsip (halaman Archive) diurutkan menurut waktu arsip terbaru.
create index sources_archived_idx  on public.sources  (archived_at desc) where archived_at is not null;
create index releases_archived_idx on public.releases (archived_at desc) where archived_at is not null;

-- sources memakai hak per kolom (token_encrypted tidak boleh terbaca); kolom baru perlu diizinkan
-- eksplisit. Hak tulis tidak diberikan: pengarsipan lewat service role di kode server.
grant select (archived_at) on public.sources to authenticated;
-- releases memakai hak SELECT tingkat tabel, jadi kolom baru otomatis terbaca.

-- ---------------------------------------------------------------------------
-- task_list: task aplikasi terarsip tidak tampil di Daftar task.
-- (Halaman detail task membaca tabel tasks langsung, jadi tautan langsung tetap terbuka.)
-- ---------------------------------------------------------------------------
create or replace view public.task_list
with (security_invoker = true) as
select
  t.source_id,
  s.name   as source_name,
  t.tag,
  t.task_id,
  case when t.task_id ~ '^[0-9]{1,15}$' then t.task_id::bigint end as task_seq,
  t.title,
  t.status,
  t.priority,
  t.subtasks_total,
  t.subtasks_done,
  case when t.subtasks_total > 0
       then t.subtasks_done::numeric / t.subtasks_total end        as subtask_ratio,
  case t.priority when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end
                                                                  as priority_rank,
  case t.status
    when 'blocked' then 1 when 'in-progress' then 2 when 'review' then 3 when 'pending' then 4
    when 'deferred' then 5 when 'done' then 6 when 'cancelled' then 7 else 8
  end                                                             as status_rank
from public.tasks t
join public.sources s on s.id = t.source_id
where s.archived_at is null;

-- ---------------------------------------------------------------------------
-- source_snapshot_totals: aplikasi terarsip tidak masuk gabungan "All applications" di Trend.
-- ---------------------------------------------------------------------------
create or replace view public.source_snapshot_totals
with (security_invoker = true) as
select
  sn.source_id,
  sn.taken_at,
  sum(sn.total)::int       as total,
  sum(sn.pending)::int     as pending,
  sum(sn.in_progress)::int as in_progress,
  sum(sn.review)::int      as review,
  sum(sn.blocked)::int     as blocked,
  sum(sn.done)::int        as done,
  sum(sn.deferred)::int    as deferred,
  sum(sn.cancelled)::int   as cancelled,
  sum(sn.other)::int       as other,
  count(*)::int            as tag_count
from public.snapshots sn
join public.sources s on s.id = sn.source_id
where s.archived_at is null
group by sn.source_id, sn.taken_at;

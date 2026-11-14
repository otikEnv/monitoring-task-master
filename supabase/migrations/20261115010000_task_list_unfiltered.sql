-- Archive (PRD-Archive.md): task_list kembali memuat SEMUA aplikasi, termasuk yang diarsipkan.
--
-- Migrasi 20261115000000_archive.sql menyaring aplikasi terarsip di dalam view, tetapi itu membuat tautan
-- langsung ke Daftar task sebuah aplikasi terarsip (menu Details di halaman Archive) selalu kosong.
-- Sekarang penyaringan dilakukan aplikasi: tanpa pilihan aplikasi, daftar hanya memuat aplikasi yang tidak
-- terarsip; dengan pilihan aplikasi yang eksplisit (tautan langsung), aplikasi terarsip tetap terbaca.
-- source_snapshot_totals tetap disaring (gabungan Trend). Jalankan sekali saja.

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
join public.sources s on s.id = t.source_id;

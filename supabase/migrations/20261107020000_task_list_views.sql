-- View untuk halaman Daftar task (lintas aplikasi) dengan filter, urutan, dan paginasi di database.
--
-- task_list    : tiap task digabung dengan nama aplikasinya, plus kolom bantu untuk pengurutan yang
--                bermakna (urutan ID natural, urutan prioritas, urutan status, rasio subtask).
-- source_tags  : tag apa saja yang ada di tiap aplikasi (untuk pilihan filter Tag).
--
-- security_invoker: dijalankan dengan hak pengguna pemanggil, sehingga RLS tetap berlaku. View
-- task_list hanya menyentuh sources.name (kolom yang boleh dibaca pengguna login); token tidak
-- ikut karena memang tidak dipilih.

create view public.task_list
with (security_invoker = true) as
select
  t.source_id,
  s.name   as source_name,
  t.tag,
  t.task_id,
  -- ID angka diurutkan sebagai angka (2 sebelum 10); ID non-angka bernilai null lalu diurutkan sebagai teks.
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
  -- Yang paling perlu perhatian lebih dulu: terhambat, dikerjakan, ditinjau, menunggu, ...
  case t.status
    when 'blocked' then 1 when 'in-progress' then 2 when 'review' then 3 when 'pending' then 4
    when 'deferred' then 5 when 'done' then 6 when 'cancelled' then 7 else 8
  end                                                             as status_rank
from public.tasks t
join public.sources s on s.id = t.source_id;

create view public.source_tags
with (security_invoker = true) as
select source_id, tag, count(*)::int as task_count
from public.tasks
group by source_id, tag;

-- Supabase memberi ALL ke anon/authenticated secara default; sisakan SELECT untuk pengguna login.
revoke all on public.task_list   from anon, authenticated;
revoke all on public.source_tags from anon, authenticated;
grant select on public.task_list   to authenticated;
grant select on public.source_tags to authenticated;

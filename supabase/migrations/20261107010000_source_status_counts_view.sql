-- Ringkasan jumlah task per status untuk setiap sumber, dipakai kartu di dashboard.
--
-- Dihitung langsung dari tabel tasks (selalu sama dengan data yang tampil) dan dikelompokkan di
-- database. Mengambil baris task lalu menghitungnya di aplikasi tidak aman: PostgREST membatasi
-- 1000 baris per permintaan, sehingga hitungan bisa terpotong tanpa tanda.
--
-- security_invoker: view dijalankan dengan hak pengguna yang memanggil, jadi RLS tabel tasks tetap
-- berlaku. Status di luar tujuh status baku dihitung sebagai "other" (sama seperti snapshots).
-- Sumber tanpa task tidak muncul di view ini; aplikasi menganggapnya nol.

create view public.source_status_counts
with (security_invoker = true) as
select
  source_id,
  count(*)::int                                          as total,
  count(*) filter (where status = 'pending')::int        as pending,
  count(*) filter (where status = 'in-progress')::int    as in_progress,
  count(*) filter (where status = 'review')::int         as review,
  count(*) filter (where status = 'blocked')::int        as blocked,
  count(*) filter (where status = 'done')::int           as done,
  count(*) filter (where status = 'deferred')::int       as deferred,
  count(*) filter (where status = 'cancelled')::int      as cancelled,
  count(*) filter (where status not in (
    'pending', 'in-progress', 'review', 'blocked', 'done', 'deferred', 'cancelled'
  ))::int                                                as other,
  count(distinct tag)::int                               as tag_count
from public.tasks
group by source_id;

-- Supabase memberi ALL ke anon/authenticated secara default; sisakan SELECT untuk pengguna login.
revoke all on public.source_status_counts from anon, authenticated;
grant select on public.source_status_counts to authenticated;

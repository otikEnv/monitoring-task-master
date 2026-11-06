-- Total per sinkronisasi untuk halaman Tren.
--
-- Satu sinkronisasi menulis satu snapshot PER TAG, semuanya dalam satu transaksi (lihat
-- sync_apply_success), sehingga taken_at (default now() = waktu awal transaksi) sama untuk semua
-- tag pada sinkronisasi itu. View ini menjumlahkannya menjadi satu baris per (sumber, waktu sinkron).
--
-- security_invoker: dijalankan dengan hak pengguna pemanggil, jadi RLS tabel snapshots tetap berlaku.

create view public.source_snapshot_totals
with (security_invoker = true) as
select
  source_id,
  taken_at,
  sum(total)::int       as total,
  sum(pending)::int     as pending,
  sum(in_progress)::int as in_progress,
  sum(review)::int      as review,
  sum(blocked)::int     as blocked,
  sum(done)::int        as done,
  sum(deferred)::int    as deferred,
  sum(cancelled)::int   as cancelled,
  sum(other)::int       as other,
  count(*)::int         as tag_count
from public.snapshots
group by source_id, taken_at;

-- Supabase memberi ALL ke anon/authenticated secara default; sisakan SELECT untuk pengguna login.
revoke all on public.source_snapshot_totals from anon, authenticated;
grant select on public.source_snapshot_totals to authenticated;

-- Hold dan Catatan release (PRD-Release-Hold-Catatan.md): catatan Note terbaru per release.
--
-- Kartu release menampilkan satu baris catatan bebas terbaru. View ini memberi tepat satu baris per release
-- (DISTINCT ON), sehingga daftar release tidak perlu membaca seluruh log atau satu query per release.
-- Hanya jenis 'note' (catatan bebas); kejadian sistem (hold, resume, ...) tidak ikut.
-- security_invoker: RLS release_notes berlaku bagi pembaca. Jalankan sekali saja.

-- Urutan entri harus mengikuti waktu kejadian sebenarnya, juga bila beberapa entri dibuat dalam satu transaksi
-- (now() membeku selama transaksi; clock_timestamp() tidak).
alter table public.release_notes alter column created_at set default clock_timestamp();

create view public.release_latest_note
with (security_invoker = true) as
select distinct on (n.release_id)
  n.release_id,
  n.id,
  n.body,
  n.created_at
from public.release_notes n
where n.kind = 'note'
order by n.release_id, n.created_at desc, n.id desc;

revoke all on public.release_latest_note from anon, authenticated;
grant select on public.release_latest_note to authenticated;

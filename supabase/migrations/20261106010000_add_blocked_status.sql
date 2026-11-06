-- Status task ketujuh: 'blocked' (ditandai manual oleh developer di tasks.json).
-- Ditemukan di data asli (echoapp: task 165 dan subtask 157.6) dan tidak ada di enam status awal PRD.
-- Status yang tidak dikenal tetap dihitung di kolom 'other'.
--
-- Aman dijalankan pada tabel berisi data: baris lama otomatis blocked = 0.
-- Hak akses SELECT tabel snapshots sudah di tingkat tabel, jadi kolom baru ikut terbaca
-- oleh pengguna login dan tetap tidak bisa ditulis oleh peran klien.

alter table public.snapshots
  add column blocked int not null default 0;

alter table public.snapshots
  add constraint snapshots_blocked_nonnegative check (blocked >= 0);

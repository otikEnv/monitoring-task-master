# Database (Supabase)

- `migrations/` - skema (tabel, RLS, hak akses). Urut berdasarkan nama file.
- `tests/rls_test.sql` - uji skema dan RLS; berjalan di dalam transaksi dan di-rollback.

## Menerapkan migrasi

**Lewat SQL editor (paling sederhana)**
1. Supabase Dashboard > SQL Editor > New query.
2. Jalankan migrasi **berurutan sesuai nama file**, satu file per query. Setiap file cukup dijalankan sekali; jangan menjalankan ulang file yang sudah diterapkan (tidak idempoten). Daftar yang sudah diterapkan di proyek ini:
   - `20261106000000_init_schema.sql` - skema awal dan RLS (sudah diterapkan)
   - `20261106010000_add_blocked_status.sql` - kolom `blocked` pada `snapshots` (sudah diterapkan)
   - `20261107000000_sync_apply_success.sql` - fungsi `sync_apply_success` (sudah diterapkan; penulisan hasil sinkronisasi secara atomik; hanya service role)
   - `20261107010000_source_status_counts_view.sql` - view `source_status_counts` (sudah diterapkan; hitungan task per status untuk kartu dashboard)
   - `20261107020000_task_list_views.sql` - view `task_list` dan `source_tags` (sudah diterapkan; halaman Daftar task: filter, urutan, paginasi)
   - `20261107030000_source_snapshot_totals_view.sql` - view `source_snapshot_totals` (total per sinkronisasi untuk halaman Tren)
   - `20261107040000_releases.sql` - tabel `releases` (sudah diterapkan; target rilis per aplikasi: tag, rentang task, tanggal; RLS hanya baca untuk pengguna login)
3. Tempel `tests/rls_test.sql` (serta `tests/sync_test.sql`, `tests/counts_view_test.sql`, `tests/task_list_test.sql`, dan `tests/trend_view_test.sql`, dan `tests/releases_test.sql` setelah migrasinya), lalu Run. Harapannya muncul notice `SEMUA UJI LOLOS` (tab Results/Messages). Kalau ada baris `FAIL: ...`, jangan lanjut.

**Lewat skrip repo** (memakai `POSTGRES_URL_NON_POOLING` dari `.env.local`)
`npm run db:run -- supabase/migrations/<berkas>.sql`, lalu `npm run db:run -- supabase/tests/<uji>.sql` (NOTICE `... LOLOS` = sukses). Migrasi tidak idempoten dan tidak dicatat; jalankan sekali saja.

**Lewat Supabase CLI** (butuh `npx supabase login` dan `npx supabase link --project-ref <ref>`)
`npx supabase db push`

## Aturan akses

- Peran klien (`anon`, `authenticated`) hanya bisa `SELECT`. Penulisan hanya lewat service role di kode server.
- `sources.token_encrypted` tidak bisa dibaca peran klien. Karena itu klien harus menyebut kolom secara eksplisit (`select id, name, ...`); `select *` pada `sources` ditolak.
- Akun baru di `auth.users` otomatis mendapat profil `viewer`. Seeder menaikkan admin awal ke `admin`.
- ID task hanya unik per `(source_id, tag, task_id)`.

## Menambah perubahan skema

Buat file baru `migrations/<timestamp>_<nama>.sql`; jangan mengedit migrasi yang sudah diterapkan.

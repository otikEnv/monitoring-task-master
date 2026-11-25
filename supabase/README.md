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
   - `20261114000000_google_sso.sql` - batas domain dan role bawaan (sudah diterapkan; akun baru hanya boleh @envisions.app lewat trigger pada `auth.users`; akun Google otomatis `admin`, akun lain `viewer`; skrip uji SQL harus memanggil `select set_config('app.allow_any_domain', 'on', true);` setelah `begin;` bila membuat user dengan email lain)
   - `20261114010000_release_components.sql` - release lintas aplikasi (sudah diterapkan; tabel `release_components` = aplikasi + tag + rentang per komponen, release lama dipindahkan menjadi satu komponen, nama release unik global, fungsi `save_release` untuk simpan release dan komponennya secara atomik, hanya service role)
   - `20261115000000_archive.sql` - Archive dan Restore (sudah diterapkan; kolom `archived_at` pada `sources` dan `releases`, hak baca kolom untuk pengguna login, view `source_snapshot_totals` menyembunyikan aplikasi terarsip)
   - `20261115010000_task_list_unfiltered.sql` - `task_list` kembali memuat semua aplikasi (sudah diterapkan; penyaringan aplikasi terarsip di Daftar task dilakukan aplikasi agar tautan langsung ke aplikasi terarsip tetap terbaca)
  - `20261116000000_release_hold_notes.sql` - Hold dan Catatan release (sudah diterapkan; kolom `held_at` dan `hold_reason` pada `releases`, tabel `release_notes` dengan fakta terkunci oleh trigger, fungsi `hold_release`, `resume_release`, `add_release_note`, `edit_release_note`, `set_release_released` hanya untuk service_role, dan `save_release` mencatat perubahan target bila header memuat `change_reason`)
  - `20261116010000_release_latest_note.sql` - view `release_latest_note` (catatan bebas terbaru per release, satu baris per release) dan `release_notes.created_at` memakai `clock_timestamp()` agar urutan entri benar dalam satu transaksi (sudah diterapkan)
  - `20261116020000_edit_hold_note_syncs_reason.sql` - mengedit entri Hold terbaru dari release yang masih ditahan ikut memperbarui `hold_reason` (sudah diterapkan)
  - `20261116030000_delete_release_note.sql` - fungsi `delete_release_note` (hanya service_role): menghapus catatan bebas (`kind = 'note'`); entri sistem ditolak dengan `55000 not_deletable` (sudah diterapkan)
  - `20261124000000_notes_calendar.sql` - Notes dan Calendar (sudah diterapkan; tabel `notes`, `note_links`, `note_release_snapshots`, `note_action_items`, `note_revisions`, `note_comments`, `note_reads`, `holidays` dengan data awal libur nasional dan cuti bersama 2026 dan 2027 dari SKB tiga menteri; fungsi `save_note`, `delete_note`, `set_action_item_done`, `add_note_comment`, `edit_note_comment`, `delete_note_comment`, `mark_note_read` hanya untuk service_role dan memeriksa penulis atau penanggung jawab; `note_reads` hanya terbaca pemiliknya)
  - `20261124010000_note_comment_replies.sql` - balasan komentar catatan (sudah diterapkan; kolom `parent_id` dan `deleted_at` pada `note_comments`, balasan satu tingkat; `add_note_comment` menerima `p_parent`; komentar utama yang dibalas ditandai terhapus, bukan dihapus fisik)
  - `20261125000000_rbac_roles.sql` - RBAC bagian 1 (sudah diterapkan; nilai role `superadmin` dan `developer`; dipisah karena nilai enum baru tidak bisa dipakai di transaksi yang sama)
  - `20261125010000_rbac.sql` - RBAC bagian 2 (sudah diterapkan; `profiles.disabled_at`; role bawaan `viewer` untuk semua cara daftar (GoTrue mengisi `app_metadata` setelah baris dibuat, jadi `initial_role` di trigger tidak dipakai app: Settings memberi role lewat `set_user_role` sesudah membuat user); `is_admin()` mencakup superadmin dan mengabaikan akun nonaktif; tabel `role_menu_access` dan `user_admin_events`; fungsi `set_user_role`, `set_user_active`, `set_menu_access`, `log_user_event` hanya untuk superadmin lewat service_role; komentar catatan, centang action item, dan activity release menolak viewer; developer hanya mengubah atau menghapus Note activity miliknya; `edit_release_note` dan `delete_release_note` kini menerima `p_actor`). Uji: `supabase/tests/rbac_test.sql`
3. Tempel `tests/rls_test.sql` (serta `tests/sync_test.sql`, `tests/counts_view_test.sql`, `tests/task_list_test.sql`, dan `tests/trend_view_test.sql`, `tests/releases_test.sql`, dan `tests/google_sso_test.sql`, dan `tests/archive_test.sql`, dan `tests/release_hold_test.sql`, dan `tests/notes_test.sql`, dan `tests/note_comment_replies_test.sql` setelah migrasinya), lalu Run. Harapannya muncul notice `SEMUA UJI LOLOS` (tab Results/Messages). Kalau ada baris `FAIL: ...`, jangan lanjut.

**Lewat skrip repo** (memakai `POSTGRES_URL_NON_POOLING` dari `.env.local`)
`npm run db:run -- supabase/migrations/<berkas>.sql`, lalu `npm run db:run -- supabase/tests/<uji>.sql` (NOTICE `... LOLOS` = sukses). Migrasi tidak idempoten dan tidak dicatat; jalankan sekali saja.

**Lewat Supabase CLI** (butuh `npx supabase login` dan `npx supabase link --project-ref <ref>`)
`npx supabase db push`

## Aturan akses

- Peran klien (`anon`, `authenticated`) hanya bisa `SELECT`. Penulisan hanya lewat service role di kode server. Notes: viewer juga boleh berkomentar, mencentang action item miliknya, dan menandai catatan sudah dibaca, tetapi tetap lewat server action (fungsi service_role yang memeriksa pemiliknya), bukan tulis langsung dari klien.
- `sources.token_encrypted` tidak bisa dibaca peran klien. Karena itu klien harus menyebut kolom secara eksplisit (`select id, name, ...`); `select *` pada `sources` ditolak.
- Akun baru di `auth.users` otomatis mendapat profil `viewer`. Seeder menaikkan admin awal ke `admin`.
- ID task hanya unik per `(source_id, tag, task_id)`.

## Menambah perubahan skema

Buat file baru `migrations/<timestamp>_<nama>.sql`; jangan mengedit migrasi yang sudah diterapkan.

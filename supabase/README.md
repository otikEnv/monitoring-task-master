# Database (Supabase)

- `migrations/` - skema (tabel, RLS, hak akses). Urut berdasarkan nama file.
- `tests/rls_test.sql` - uji skema dan RLS; berjalan di dalam transaksi dan di-rollback.

## Menerapkan migrasi

**Lewat SQL editor (paling sederhana)**
1. Supabase Dashboard > SQL Editor > New query.
2. Tempel isi `migrations/20261106000000_init_schema.sql`, lalu Run. Jalankan sekali saja; file ini tidak idempoten.
3. Tempel `tests/rls_test.sql`, lalu Run. Harapannya muncul notice `SEMUA UJI LOLOS` (tab Results/Messages). Kalau ada baris `FAIL: ...`, jangan lanjut.

**Lewat Supabase CLI** (butuh `npx supabase login` dan `npx supabase link --project-ref <ref>`)
`npx supabase db push`

## Aturan akses

- Peran klien (`anon`, `authenticated`) hanya bisa `SELECT`. Penulisan hanya lewat service role di kode server.
- `sources.token_encrypted` tidak bisa dibaca peran klien. Karena itu klien harus menyebut kolom secara eksplisit (`select id, name, ...`); `select *` pada `sources` ditolak.
- Akun baru di `auth.users` otomatis mendapat profil `viewer`. Seeder menaikkan admin awal ke `admin`.
- ID task hanya unik per `(source_id, tag, task_id)`.

## Menambah perubahan skema

Buat file baru `migrations/<timestamp>_<nama>.sql`; jangan mengedit migrasi yang sudah diterapkan.

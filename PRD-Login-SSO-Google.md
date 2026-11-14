# PRD: Login SSO Google

14 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md)

## Ringkasan dan latar belakang

Login saat ini hanya memakai email dan password. Akun dibuat manual di Supabase, sehingga setiap orang baru harus menunggu admin. Fitur ini menambahkan tombol **Continue with Google** di halaman login. Pengguna yang belum punya akun otomatis terdaftar saat login Google pertama. Pengguna yang sudah punya akun masuk seperti biasa, lewat Google atau lewat password.

Karena dashboard memuat data task semua repo, akses dibatasi ke satu domain: hanya akun Google `@envisions.app` yang boleh masuk. Akun baru lewat Google langsung berperan **admin**.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Pengguna `@envisions.app` bisa login hanya dengan satu klik Google, tanpa menunggu akun dibuat.
- Akun baru otomatis terdaftar dengan peran admin.
- Akun yang sudah ada tetap bisa dipakai. Email yang sama lewat Google dan lewat password adalah satu pengguna.
- Akun di luar domain `@envisions.app` tidak pernah bisa dibuat, lewat cara apa pun.
- Login email + password tetap tersedia.

**Non-tujuan (versi ini)**

- Penyedia login lain (GitHub, Microsoft, dan sebagainya).
- Halaman untuk mengatur peran pengguna dari website. Peran masih diubah langsung di database.
- Mengubah atau mencabut akses otomatis saat akun Google dinonaktifkan di Workspace. Akses mengikuti masa berlaku sesi Supabase.
- Daftar mandiri dengan email + password. Pendaftaran email dari luar tetap tidak ada di antarmuka.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu pengguna baru sampai ke dashboard | Kurang dari 15 detik dari klik tombol Google |
| Akun di luar `@envisions.app` yang berhasil dibuat | 0, termasuk lewat API pendaftaran email |
| Akun lama yang tidak bisa login setelah fitur aktif | 0 |

## Pengguna dan peran

| Pengguna | Kebutuhan |
| --- | --- |
| Anggota tim `@envisions.app` baru | Masuk dengan akun Google kantor tanpa menunggu admin |
| Pengguna lama | Tetap bisa login dengan password, atau beralih ke Google dengan email yang sama |
| Admin | Tidak perlu membuat akun satu per satu |

Peran akun baru lewat Google adalah **admin**. Akun email + password yang dibuat sebelumnya tidak berubah perannya.

## Aturan dan alur

### Alur login

1. Pengguna membuka `/login` dan menekan **Continue with Google**.
2. Browser diarahkan ke Google. Pilihan akun dipersempit ke domain `envisions.app` (parameter `hd`, hanya petunjuk tampilan).
3. Google mengembalikan pengguna ke `/auth/callback`. Aplikasi menukar kode menjadi sesi.
4. Aplikasi memastikan email berakhiran `@envisions.app` dan sudah terverifikasi. Bila tidak, sesi dihapus dan pengguna kembali ke `/login` dengan pesan galat.
5. Pengguna diarahkan ke `/`.

### Kasus akun

| Kasus | Hasil |
| --- | --- |
| Email `@envisions.app` belum punya akun | Akun dibuat otomatis, peran admin |
| Email sudah punya akun password | Ditautkan ke akun yang sama (satu pengguna, dua cara login). Peran dan data tidak berubah |
| Login Google berikutnya | Masuk ke akun yang sama |
| Akun Google di luar `@envisions.app` | Ditolak, tidak ada akun yang dibuat |
| Login email + password | Tetap berjalan seperti sekarang |

### Penegakan batas domain (berlapis)

1. **Google Cloud, Audience = Internal.** Hanya akun di organisasi Workspace `envisions.app` yang bisa menyelesaikan login di Google.
2. **Trigger database** pada `auth.users`: setiap akun baru, dari penyedia mana pun, ditolak bila emailnya tidak berakhiran `@envisions.app`. Ini pengaman utama karena akun luar tidak pernah tercipta, termasuk bila seseorang memanggil API pendaftaran Supabase langsung dengan anon key.
3. **Pengecekan di callback**: email harus `@envisions.app` dan terverifikasi, bila tidak sesi dihapus.
4. Parameter `hd` hanya mempermudah pemilihan akun. Tidak dihitung sebagai pengaman.

### Peran admin otomatis

Fungsi `handle_new_user()` memberi peran `admin` pada akun yang dibuat lewat Google, dan `viewer` pada akun lain. Karena domain sudah dibatasi, setiap akun kantor yang masuk bisa mengelola sumber, token, dan release.

## Antarmuka

- Halaman login: form email + password tetap di atas. Di bawahnya ada pembatas "or" dan tombol **Continue with Google**.
- Pesan galat (bahasa Inggris, seperti seluruh antarmuka):
  - Gagal tukar kode atau Google menolak: "Google sign-in failed. Try again."
  - Domain salah atau email belum terverifikasi: "Only verified @envisions.app Google accounts can sign in."

## Konfigurasi (dikerjakan manual satu kali)

1. **Google Cloud Console**, project `task-monitoring`:
   - Google Auth Platform, Audience = **Internal**.
   - Clients, buat OAuth client tipe Web. Authorized redirect URI: `https://aijnmakdmvlazpsmsljg.supabase.co/auth/v1/callback`.
2. **Supabase Dashboard**:
   - Authentication, Providers, Google: aktifkan dan isi Client ID dan Client Secret. Secret tidak disimpan di repo atau `.env`.
   - Authentication, Sign In / Providers: **Allow new users to sign up** aktif, **Confirm email** tetap aktif.
   - Authentication, URL Configuration, Redirect URLs: `http://localhost:3000/**` dan `https://monitoring-task-master.vercel.app/**`.
3. **Database**: migration `google_sso` dijalankan dengan `npm run db:run`. Toggle sign up sebaiknya menyala bersamaan dengan atau tepat sesudah migration ini, karena sebelum trigger ada, pendaftaran email dari luar terbuka.

## Keamanan dan risiko

| Risiko | Penanganan |
| --- | --- |
| Setiap akun `@envisions.app` otomatis admin | Disengaja. Pastikan domain hanya dipakai orang yang boleh mengelola. Bila perlu, ubah bawaan menjadi viewer dengan satu perubahan di `handle_new_user()` |
| Pendaftaran email terbuka saat sign up diaktifkan | Trigger domain menolak semua akun baru di luar `@envisions.app` |
| Pengambilalihan akun lewat email yang sama | Penautan hanya untuk email yang terverifikasi, dan konfirmasi email tetap aktif |
| Akun Google dinonaktifkan di Workspace tetapi sesi Supabase masih berlaku | Sesi berakhir sesuai masa berlaku token. Pencabutan segera di luar cakupan |
| Open redirect | Tujuan setelah login tetap `/`, tanpa parameter `next` |
| Pengguna script uji memakai email `@example.test` | Trigger domain akan menolaknya. Skrip dan tes diperbarui (misalnya memakai domain `envisions.app` yang bersifat sementara, atau pengecualian untuk lingkungan uji) |

## Kriteria penerimaan

1. Pengguna `@envisions.app` tanpa akun menekan tombol Google, lalu sampai di `/` dengan peran admin di tabel `profiles`.
2. Login Google kedua oleh orang yang sama masuk ke akun yang sama, tanpa baris baru di `auth.users`.
3. Pengguna lama dengan email yang sama bisa login lewat Google dan lewat password, dan tetap satu akun dengan peran semula.
4. Akun Google di luar `@envisions.app` ditolak dengan pesan galat dan tidak ada baris baru di `auth.users`.
5. Memanggil API pendaftaran email Supabase dengan email non-`@envisions.app` gagal.
6. Login email + password tetap berfungsi.
7. `/auth/callback` bisa dibuka saat belum login, dan halaman lain tetap dialihkan ke `/login`.
8. Pemeriksaan tipe, lint, tes unit, tes SQL, dan `npm run build` lolos, dan log dev tidak menunjukkan galat baru.

## Tahap berikutnya

- Halaman pengaturan peran (admin atau viewer) per pengguna.
- Peran bawaan yang dapat diatur, tanpa mengubah SQL.
- Penyedia login lain bila diperlukan.

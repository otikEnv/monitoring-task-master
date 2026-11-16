This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Web Monitoring Task Master

Dashboard hanya-baca yang menggabungkan `tasks.json` banyak repo. Spesifikasi: [PRD utama](PRD-Web-Monitoring-Task-Master.md) dan [PRD fitur Release](PRD-Fitur-Release-Tracking.md).

### Fitur Release

Menu **Release** melacak target rilis, misalnya "2.1, web task #100 sampai #150 + backend task #20 sampai #45, target 20 November". Spesifikasi: [PRD Release Tracking](PRD-Fitur-Release-Tracking.md) dan [PRD Release Lintas Aplikasi](PRD-Release-Multi-Aplikasi.md).

- **Membuat release (admin):** Release > Add release. Isi nama/versi, tanggal target, dan opsional tanggal mulai (bawaannya tanggal release dibuat). Lalu tambahkan **komponen**: tiap komponen = satu aplikasi + satu tag + satu rentang task (awal dan akhir inklusif), dengan pratinjau jumlah task per baris. Satu release punya 1 sampai 10 komponen (mis. web dan backend); satu aplikasi boleh ada di banyak release. **Nama release unik di seluruh aplikasi.**
- **Isi komponen dihitung, bukan disimpan:** semua task pada tag itu dengan ID angka di dalam rentang. ID yang bolong atau non-angka tidak dihitung; task baru di dalam rentang otomatis ikut setelah sinkronisasi.
- **Progres gabungan** = total task selesai ÷ total task seluruh komponen (bukan rata-rata persen); progres tiap komponen tetap ditampilkan. Total mencakup semua status; task ditunda dan dibatalkan tetap dihitung dan disorot di "Needs attention".
- **Penanda risiko** (aturan di `src/lib/releases/model.ts`, `riskLevel` dan `aggregateRelease`): persen waktu yang sudah lewat (mulai ke target, kalender WIB, satu untuk seluruh release) dibandingkan dengan progres gabungan. Tertinggal lebih dari 10 poin = At risk, lebih dari 25 poin = Behind; task terhambat atau dependensi di luar rentang yang belum selesai pada komponen mana pun juga menandai At risk (komponen penyebabnya disebut); target lewat dan belum 100% = Overdue. Dependensi yang tidak ditemukan hanya peringatan. Ini panduan, bukan prediksi.
- **Tandai rilis** (admin) berlaku untuk seluruh release dan mengisi tanggal rilis hari ini; bisa dibatalkan. Kartu tiap aplikasi di Dashboard menampilkan release belum rilis dengan target terdekat yang memuat komponennya (progres komponen aplikasi itu, risiko release). Release lintas aplikasi muncul di kartu semua aplikasi yang terlibat.
- **Penyimpanan atomik:** release dan seluruh komponennya disimpan lewat fungsi database `save_release` (hanya service role). Bila aplikasi sebuah komponen dihapus, komponennya ikut terhapus dan release tetap ada.
- Semua pengguna login boleh melihat; hanya admin yang mengelola (RLS: peran klien hanya `SELECT` pada `releases` dan `release_components`).

### Archive dan Restore

Untuk merapikan Dashboard dan daftar Release tanpa menghapus data. Spesifikasi: [PRD Archive](PRD-Archive.md).

- **Archive** (admin): menu tiga titik di kartu aplikasi (Dashboard) dan kartu release (halaman Release) berisi **Details** dan **Archive**. Archive meminta konfirmasi (untuk aplikasi menyebut jumlah release berjalan yang masih memakainya), lalu toast memberi tombol **Undo**. Viewer hanya melihat Details.
- **Yang disembunyikan:** aplikasi terarsip hilang dari Dashboard, Task list (tanpa pilihan aplikasi), Trend, dan pilihan aplikasi pada form release baru; release terarsip hilang dari daftar Release (juga dengan "Show released") dan dari baris release di Dashboard. Data, sinkronisasi, dan status aktif/nonaktif tidak berubah.
- **Yang tidak berubah:** release yang punya komponen dari aplikasi terarsip tetap tampil dan tetap dihitung. Tautan langsung ke item terarsip tetap terbuka (Task list aplikasi memberi penanda "(archived)", detail release dan task memberi penanda Archived).
- **Menu Archive** (sidebar, semua pengguna): dua tab, **Applications** dan **Releases**, berhalaman 10 per halaman (`/archive?tab=releases&page=2`). Tiap baris punya menu **Details** dan **Restore** (Restore hanya admin; detail release terarsip juga punya tombol Restore).
- **Archive vs Deactivate vs Delete:** Archive hanya menyembunyikan (bisa dikembalikan); Deactivate (Source settings) menghentikan sinkronisasi; Delete menghapus permanen beserta datanya.
- **Teknis:** kolom `archived_at` pada `sources` dan `releases` (kosong = aktif); fungsi di `src/lib/archive/` dan server action admin-only di `src/app/archive/actions.ts`; hanya view `source_snapshot_totals` yang menyaring di database, sisanya disaring aplikasi (lihat [supabase/README.md](supabase/README.md)).

### Hold dan Catatan release

Untuk mencatat kenapa sebuah release terlambat atau ditahan. Spesifikasi: [PRD Hold dan Catatan Release](PRD-Release-Hold-Catatan.md).

- **Hold** (admin): tombol **Put on hold** di halaman detail release atau menu tiga titik kartu. **Alasan wajib** (1 sampai 500 karakter). Release tetap tampil, tanggal target dan angka progres tidak berubah, dan **Resume** (alasan opsional) melanjutkannya. Hold hanya untuk release yang belum rilis dan tidak terarsip; menandai release sebagai Released saat hold otomatis mengakhiri hold dan tercatat.
- **Hold vs Archive:** Hold menahan release yang tetap terlihat dan menggantikan label risiko otomatis dengan **On hold**; Archive menyembunyikannya dari daftar. Hold terbawa saat diarsipkan dan dikembalikan.
- **Status otomatis tidak dipalsukan:** "Overdue", "Behind", dan "At risk" tetap dihitung dari tanggal dan progres (tidak pernah diisi manual). Saat ditahan, banner di halaman detail menampilkan alasan, siapa dan sejak kapan, serta status otomatis yang akan tampil tanpa hold. Kartu aplikasi di Dashboard tidak menganggap release yang ditahan sebagai berisiko, dan daftar Release menempatkannya setelah yang sedang berjalan.
- **Activity** (halaman detail): log kronologis berhalaman 20 berisi catatan bebas (1 sampai 2000 karakter) dan kejadian sistem: Hold, Resume, Target changed (tanggal lama dan baru), Released. Semua pengguna login boleh membaca; hanya admin yang menulis. Kartu release menampilkan alasan hold dan catatan bebas terbaru satu baris.
- **Mengubah tanggal target** pada form Edit wajib disertai **Reason for change**; alasan dan tanggal lama dan baru masuk log. Ditegakkan di form, server action, dan (bila alasan diberikan) di database.
- **Edit catatan:** admin boleh memperbaiki teks entri mana pun (typo). Entri ditandai **edited** (tooltip siapa dan kapan) dan satu versi sebelumnya disimpan (`previous_body`). Jenis entri, tanggal target, penulis, dan waktu **terkunci** oleh trigger database, sehingga riwayat mundurnya jadwal tidak bisa dipalsukan. Mengedit entri Hold terbaru dari release yang masih ditahan ikut memperbarui alasan hold.
- **Hapus catatan:** admin boleh menghapus entri **Note** (catatan bebas yang terkirim tanpa sengaja) lewat menu tiga titik > Delete, dengan konfirmasi. Penghapusan **permanen**. Entri sistem (Hold, Resume, Target changed, Released) **tidak bisa dihapus** (ditolak oleh server action dan fungsi database `delete_release_note`): itu riwayat jadwal. Hold yang keliru diakhiri dengan Resume. Menghapus release ikut menghapus seluruh log-nya.
- **Teknis:** kolom `held_at` dan `hold_reason` pada `releases`; tabel `release_notes`; view `release_latest_note`; fungsi `hold_release`, `resume_release`, `add_release_note`, `edit_release_note`, `delete_release_note`, `set_release_released` (hanya service role, satu transaksi), dan `save_release` yang mencatat perubahan target. Kode: `src/lib/releases/{model,repo,validate,notes,load}.ts`, server action di `src/app/release/actions.ts` (`putOnHold`, `resumeHold`, `addNote`, `editNote`, `deleteNote`, `saveRelease`), komponen di `src/components/releases/`. Daftar migrasi: [supabase/README.md](supabase/README.md).
- **Catatan keterbatasan:** di database, perubahan tanggal target tanpa alasan tetap lolos (agar pemanggil lama tidak rusak); kewajiban alasan dijaga form dan server action. Notifikasi (email atau Slack), catatan oleh viewer, dan Undo setelah menghapus catatan belum ada (lihat bagian Tahap berikutnya di PRD).

### Login Google (SSO)

Halaman login punya tombol **Continue with Google** di samping login email + password. Spesifikasi: [PRD Login SSO Google](PRD-Login-SSO-Google.md).

- **Akun baru otomatis terdaftar** saat login Google pertama dan berperan **admin**. Akun lama (email yang sama) ditautkan ke pengguna yang sama dan perannya tidak berubah. Akun email + password dibuat lewat `npm run seed:users` dan berperan `viewer` kecuali dinaikkan.
- **Hanya `@envisions.app`.** Ditegakkan berlapis: Audience **Internal** di Google Cloud; trigger database `enforce_allowed_email_domain` pada `auth.users` menolak akun baru bukan `@envisions.app` dari semua jalur (Google, `signUp` email, admin API); `/auth/callback` memeriksa email dan statusnya terverifikasi. Parameter `hd` hanya petunjuk tampilan.
- **Alur kode:** `loginWithGoogle` di `src/app/login/actions.ts` lalu `src/app/auth/callback/route.ts` (tujuan akhir selalu `/` atau `/login`, tanpa parameter `next`). Batas domain di `src/lib/auth-domain.ts`.
- **Konfigurasi sekali jalan:** (1) Google Cloud > Google Auth Platform: Audience Internal, buat OAuth client Web dengan redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. (2) Supabase > Authentication: aktifkan provider Google (Client ID dan Secret hanya diisi di sana, bukan di repo atau `.env`), biarkan **Allow new users to sign up** dan **Confirm email** aktif, tambahkan `http://localhost:3000/**` dan URL produksi `/**` ke Redirect URLs. (3) Terapkan migrasi `20261114000000_google_sso.sql` (`npm run db:run`). Tidak ada variabel env baru.
- **Mengubah peran bawaan** akun Google menjadi `viewer`: ganti `'admin'` menjadi `'viewer'` pada `handle_new_user()` lewat migrasi baru.
- **Skrip uji:** user uji lewat admin API harus ber-email `@envisions.app` (hapus di akhir tes); skrip uji SQL yang memasukkan email lain memanggil `select set_config('app.allow_any_domain', 'on', true);` setelah `begin;` (hanya berlaku untuk koneksi `postgres`).

### Tema tampilan dan sidebar

- **Tema:** tombol di bilah atas (ikon matahari atau bulan, juga di halaman login) memilih **Light**, **Dark**, atau **System** (mengikuti pengaturan perangkat, termasuk saat pengaturan itu berubah). Pilihan disimpan di `localStorage` (kunci `theme`) per peramban dan sinkron antar tab. Tanpa pilihan = System.
- **Tanpa kedip:** skrip kecil di `<head>` (`THEME_INIT_SCRIPT` di `src/lib/theme.ts`) memasang `data-theme` pada `<html>` sebelum halaman tampil. CSS (`src/app/globals.css`) memahami `data-theme="light"` dan `"dark"` (memaksa) dan, tanpa atribut, mengikuti `prefers-color-scheme`. Grafik Trend, notifikasi (toast), dan kontrol bawaan peramban ikut tema.
- **Kode:** `src/components/theme/{theme-provider,theme-toggle}.tsx`. Komponen baru cukup memakai kelas `dark:` Tailwind; varian `dark` sudah mengikuti `data-theme`.
- **Sidebar:** tombol di bilah atas (atau Ctrl/Cmd+B) melipat sidebar menjadi deretan ikon di tepi kiri; pilihan terakhir tersimpan di cookie `sidebar_state` dan dibaca `AppShell`.

### Database dan uji

- Migrasi dan uji SQL: lihat [supabase/README.md](supabase/README.md). Jalankan berkas SQL dengan `npm run db:run -- <berkas.sql>` (memakai `POSTGRES_URL_NON_POOLING` dari `.env.local`).
- Uji unit: `npm test`. Uji nyata ke Supabase dan repo: `npm run test:live` (atau `npm run test:live -- releases`).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

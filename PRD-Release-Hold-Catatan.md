# PRD: Hold dan Catatan Release

16 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md) dan [PRD Release Multi-Aplikasi](PRD-Release-Multi-Aplikasi.md)

## Ringkasan dan latar belakang

Halaman Release menunjukkan angka: progres, sisa hari, dan tingkat risiko (On track, At risk, Behind, Overdue). Angka itu dihitung otomatis, tetapi **alasan di baliknya tidak tercatat**. Saat release terlambat atau ditahan, penjelasannya ("menunggu API backend", "menunggu keputusan bisnis") hanya ada di chat atau ingatan orang, sehingga stakeholder yang membuka halaman Release hanya melihat label "Overdue" tanpa konteks.

Fitur ini menambahkan dua hal yang saling melengkapi:

1. **Hold**: admin menahan sebuah release dengan alasan wajib, dan melanjutkannya lagi (**Resume**).
2. **Catatan (Activity)**: log kronologis pada tiap release berisi catatan bebas dan kejadian penting (hold, resume, perubahan tanggal target) beserta alasannya.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Admin dapat menahan release dengan alasan, dan melanjutkannya.
- Stakeholder melihat langsung di kartu dan halaman detail bahwa release sedang di-hold dan kenapa.
- Setiap perubahan tanggal target tercatat dengan alasan, sehingga riwayat kemunduran jadwal terlihat.
- Admin dapat menulis catatan bebas dan memperbaiki typo tanpa kehilangan jejak.
- Status "terlambat" tetap dihitung otomatis, bukan diisi manual.

**Non-tujuan (versi ini)**

- Notifikasi (email atau Slack) saat hold atau jadwal mundur.
- Catatan oleh pengguna non-admin (viewer).
- Menghapus entri sistem (Hold, Resume, Target change, Released) dan menghapus dengan jejak (soft delete).
- Lampiran, mention, atau balasan berutas pada catatan.
- Hold per komponen (hold selalu untuk seluruh release).
- Menghitung ulang atau menggeser tanggal target secara otomatis saat hold.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu admin menahan release dengan alasan | Kurang dari 15 detik |
| Waktu menambah satu catatan | Kurang dari 10 detik |
| Release yang di-hold atau mundur tanpa alasan tercatat | 0 (alasan wajib) |
| Data release (komponen, progres) yang berubah akibat hold atau catatan | 0 |

## Pengguna dan kebutuhan

| Pengguna | Kebutuhan utama |
| --- | --- |
| Admin | Mencatat kenapa release tertahan atau mundur, dan memperbaiki catatan yang salah |
| Pimpinan dan stakeholder | Memahami kenapa sebuah release terlambat atau ditahan tanpa bertanya ke tim |
| Developer | Melihat riwayat keputusan dan perubahan jadwal sebuah release |

Peran: hanya **admin** yang dapat Hold, Resume, menambah, dan mengedit catatan. Semua pengguna login dapat **melihat** status hold dan log Activity.

## Konsep dan aturan

### Status release

Release punya status manual **Active** (bawaan) atau **On hold**, terpisah dari status lain:

| Status | Arti |
| --- | --- |
| Active | Berjalan normal. Risiko dihitung otomatis seperti sekarang |
| On hold | Sengaja ditahan oleh admin, dengan alasan dan waktu hold |
| Released | Sudah ditandai rilis (tidak berubah) |

Aturan:

- **Hold** hanya untuk release yang belum rilis dan belum diarsipkan. Alasan **wajib** (1 sampai 500 karakter).
- **Resume** mengembalikan ke Active. Catatan alasan boleh diisi (opsional).
- Menandai release sebagai **Released** saat sedang hold otomatis mengakhiri hold (dicatat di log).
- Hold **tidak** mengubah tanggal target, komponen, maupun perhitungan progres. Angka tetap dihitung dan ditampilkan.
- Hold dapat dikombinasikan dengan Archive: release yang diarsipkan sambil hold tetap membawa status hold-nya, dan saat Restore status itu pulih.

### Pengaruh hold pada risiko

- Selama hold, label risiko otomatis (Overdue, Behind, At risk) **diganti** oleh lencana **On hold**. Alasannya: keterlambatan sudah disengaja dan dijelaskan, sehingga tidak perlu tampil sebagai peringatan.
- Pada halaman detail, perhitungan risiko tetap ditampilkan sebagai informasi sekunder ("Would be Overdue, 3 days") agar tidak tersembunyi.
- Urutan daftar Release: release yang di-hold ditempatkan setelah release berisiko tetapi sebelum yang sudah rilis (tidak diprioritaskan sebagai bermasalah).
- Kartu aplikasi di Dashboard yang menampilkan release berisiko memakai aturan yang sama: release on hold tidak dihitung sebagai berisiko.
- "Telat" **tidak pernah** diisi manual. Yang manual hanya hold dan penjelasannya.

### Catatan (Activity)

Tiap release punya log berisi entri. Ada dua macam:

| Jenis | Dibuat oleh | Isi |
| --- | --- | --- |
| **Note** | Admin, manual | Teks bebas (1 sampai 2000 karakter) |
| **Hold**, **Resume**, **Target change**, **Released** | Sistem, saat aksinya dilakukan | Teks alasan dari admin (wajib untuk Hold dan Target change, opsional untuk Resume) |

Entri **Target change** mencatat tanggal target lama dan baru. Perubahan target lewat form Edit release otomatis meminta alasan (wajib) dan membuat entri ini. Mengubah tanggal mulai tidak membuat entri.

### Mengedit catatan

- Admin dapat **mengedit teks** entri mana pun, termasuk entri sistem (hanya teks alasannya).
- Bagian yang tercatat sebagai fakta **terkunci**: jenis entri, tanggal target lama dan baru, penulis awal, dan waktu dibuat. Alasannya: riwayat mundurnya jadwal tidak boleh bisa dipalsukan.
- Entri yang sudah diedit ditandai **edited**, dengan tooltip "Edited by <email> on <tanggal>".
- Database menyimpan isi **satu versi sebelumnya** (`previous_body`), siapa yang mengedit, dan kapan. Riwayat penuh semua versi tidak disimpan di versi ini.

### Menghapus catatan

- Admin dapat **menghapus** entri bertipe **Note** (catatan bebas), mis. catatan yang terkirim tanpa sengaja. Penghapusan **permanen** dan meminta konfirmasi singkat ("This cannot be undone").
- Entri **sistem** (Hold, Resume, Target change, Released) **tidak bisa dihapus**: itu riwayat jadwal dan keputusan. Yang salah ketik diperbaiki lewat edit teks. Hold yang keliru diakhiri dengan Resume.
- Hanya admin; ditolak oleh server action dan fungsi database bagi yang lain. Menghapus tidak mengubah hold, tanggal target, atau angka progres.
- Setelah dihapus, catatan terbaru di kartu release otomatis menjadi catatan sebelumnya (atau hilang bila tidak ada).

## Antarmuka

### Kartu release (daftar Release)

- Release on hold: lencana **On hold** menggantikan lencana risiko, dengan alasan singkat (satu baris, dipotong) di bawah nama.
- Release lain: satu baris catatan terbaru bertipe Note (bila ada) dengan tanggalnya, dipotong satu baris. Tidak ada baris bila belum ada catatan.
- Menu tiga titik (admin): **Details**, **Put on hold** atau **Resume**, **Archive**. Viewer hanya melihat Details.

### Halaman detail release

- Bagian **Activity** di bawah ringkasan: daftar entri terbaru di atas, tiap entri menampilkan jenis, teks, penulis, waktu relatif dan tanggal, serta tanda "edited" bila ada.
- Form **Add note** (admin) di atas daftar: kotak teks dan tombol Add note.
- Tombol **Put on hold** di samping tombol yang ada. Membuka dialog dengan kotak alasan wajib. Saat hold, tombol berubah menjadi **Resume**.
- Banner **On hold** di bagian atas dengan alasan, penahan, dan waktu hold.
- Menu tiga titik pada tiap entri (admin): **Edit**, dan **Delete** khusus entri Note. Edit membuka kotak teks di tempat dengan Save dan Cancel. Delete membuka dialog konfirmasi.
- Daftar Activity berhalaman bila entri banyak (20 per halaman).

### Form edit release

Bila tanggal target diubah, muncul kotak **Reason for change** yang wajib diisi sebelum tombol Save aktif. Tanpa perubahan target, kotak itu tidak tampil.

### Teks dan bahasa

Teks antarmuka bahasa Inggris. Dokumen ini dan README bahasa Indonesia.

## Data dan migrasi

- Tabel baru `release_notes`:
  - `id`, `release_id` (FK ke `releases`, cascade), `kind` (`note`, `hold`, `resume`, `target_change`, `released`), `body`, `old_target_date`, `new_target_date`, `author_id`, `author_email`, `created_at`, `edited_at`, `edited_by_email`, `previous_body`.
  - Batas panjang `body` lewat constraint CHECK. `target_change` wajib mengisi tanggal lama dan baru.
  - RLS: pengguna login hanya membaca. Penulisan lewat service role dan `requireAdmin()` pada setiap server action.
- Kolom baru pada `releases`: `held_at timestamptz` dan `hold_reason text` (kosong = Active).
- Penulisan atomik lewat fungsi database (hold, resume, ubah target, dan tambah entri sistem dalam satu transaksi), memakai pola `save_release` yang sudah ada. Pada edit entri, kolom terkunci tidak boleh berubah (dijaga fungsi dan trigger).
- Release lama tidak berubah: `held_at` kosong dan log kosong.
- Perubahan database dijalankan langsung dengan `npm run db:run`, bukan manual.
- Hapus release ikut menghapus log-nya (cascade). Archive tidak mempengaruhi log.

## Risiko dan keputusan terbuka

| Risiko | Penanganan |
| --- | --- |
| Hold dipakai untuk menyembunyikan keterlambatan | Alasan wajib dan terlihat semua orang. Detail tetap menampilkan risiko sekunder. Log mencatat siapa dan kapan |
| Catatan diedit untuk mengubah sejarah | Fakta terkunci, penanda "edited", dan satu versi sebelumnya disimpan |
| Catatan dihapus untuk menyembunyikan sesuatu | Hanya catatan bebas yang bisa dihapus; Hold, Resume, Target change, dan Released tidak. Alasan keterlambatan dan perubahan jadwal tetap utuh. Penghapusan catatan bebas tidak meninggalkan jejak (versi ini) |
| Perubahan target tanpa alasan | Form Edit mewajibkan alasan; tidak ada jalur lain untuk mengubah target |
| Release di-hold lalu terlupakan | Lencana On hold dan lama hold (hari) selalu tampil di kartu dan detail |
| Viewer ingin menulis catatan | Di luar versi ini; dapat ditinjau di Tahap berikutnya |
| Hold bercampur artinya dengan Archive | Hold = ditahan sementara dan tetap tampil. Archive = disembunyikan. Dijelaskan di dialog Hold |

## Kriteria penerimaan

1. Admin menahan release dari kartu atau halaman detail dengan alasan wajib; kartu menampilkan lencana On hold dan alasan, dan entri Hold masuk ke Activity.
2. Alasan kosong atau lebih dari 500 karakter ditolak dengan pesan jelas.
3. Resume mengembalikan release ke Active; risiko otomatis kembali dihitung; entri Resume tercatat.
4. Selama hold, tanggal target, komponen, dan angka progres tidak berubah; label risiko diganti On hold, dan detail menampilkan risiko sekunder.
5. Release on hold tidak dihitung sebagai berisiko di kartu aplikasi Dashboard.
6. Mengubah tanggal target lewat form Edit mewajibkan alasan dan membuat entri Target change dengan tanggal lama dan baru.
7. Admin menambah catatan bebas; entri tampil dengan penulis dan waktu, terbaru di atas.
8. Admin mengedit teks catatan; muncul tanda "edited" dengan tooltip; versi sebelumnya tersimpan; jenis dan tanggal target pada entri sistem tidak bisa diubah.
9. Admin dapat menghapus entri Note setelah konfirmasi; catatan terbaru di kartu ikut menyesuaikan. Entri Hold, Resume, Target change, dan Released tidak bisa dihapus (ditolak oleh action dan database). Viewer tidak melihat tombol Delete dan tidak bisa memanggilnya.
10. Menandai release sebagai Released saat hold mengakhiri hold dan mencatatnya.
11. Viewer melihat status hold dan Activity, tanpa tombol Hold, Resume, Add note, atau Edit; memanggil action sebagai viewer ditolak.
12. Teks dari catatan di-escape (tanpa XSS).
13. Hold dan catatan tidak mengubah komponen atau data task; release lama tetap tampil dengan angka yang sama.
14. `tsc`, eslint, vitest, tes SQL, tes live, dan `npm run build` lolos; tampilan benar di terang, gelap, dan ponsel; tidak ada galat konsol.

## Rencana rilis

1. Migrasi `release_notes`, kolom hold, fungsi database, dan tes SQL.
2. Model dan lapisan data (repo, validasi, load), termasuk aturan risiko saat hold.
3. Server action: hold, resume, tambah catatan, edit catatan, dan alasan perubahan target.
4. Antarmuka detail: bagian Activity, form catatan, dialog Hold, banner, dan edit di tempat.
5. Kartu release dan Dashboard: lencana On hold, baris catatan terbaru, dan menu tiga titik.
6. Form Edit release: alasan perubahan target.
7. Verifikasi live dan dokumentasi.

## Tahap berikutnya

- Notifikasi email atau Slack untuk hold dan perubahan jadwal.
- Catatan oleh viewer, atau peran khusus (misalnya QA).
- Riwayat penuh semua versi edit catatan.
- Hapus catatan dengan jejak (soft delete) dan Undo setelah menghapus.
- Ringkasan "release yang sedang di-hold" di Dashboard.
- Hold per komponen.

# PRD: Archive dan Restore

14 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md)

## Ringkasan dan latar belakang

Dashboard menampilkan satu kartu per aplikasi, dan halaman Release menampilkan satu kartu per release. Semakin lama dipakai, jumlah kartu bertambah: aplikasi yang sudah tidak aktif dikerjakan, dan release lama yang sudah rilis menumpuk di daftar. Saat ini satu-satunya cara menyingkirkannya adalah **Delete**, yang tidak bisa dibatalkan, atau **Deactivate** pada aplikasi, yang hanya menghentikan sinkronisasi dan kartunya tetap tampil.

Fitur ini menambahkan **Archive**: menyembunyikan aplikasi atau release dari tampilan sehari-hari tanpa menghapus datanya, dan **Restore** untuk mengembalikannya. Item yang diarsipkan dikumpulkan di satu halaman baru, **Archive**, di sidebar.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Admin dapat mengarsipkan aplikasi dan release dari menu tiga titik pada kartunya.
- Item yang diarsipkan tidak lagi memenuhi Dashboard, daftar Release, Task list, dan Trend.
- Item yang diarsipkan dapat dilihat dan dikembalikan (Restore) dari halaman Archive.
- Archive dapat dibatalkan kapan saja tanpa kehilangan data.
- Pengguna biasa tetap bisa membuka detail dari menu tiga titik.

**Non-tujuan (versi ini)**

- Archive per pengguna (setiap orang menyembunyikan item untuk dirinya sendiri). Archive berlaku untuk semua pengguna.
- Mengarsipkan release otomatis saat sudah rilis atau setelah jangka waktu tertentu.
- Menghentikan sinkronisasi aplikasi yang diarsipkan. Untuk itu tetap pakai Deactivate di Source settings.
- Mengarsipkan task, tag, atau komponen release satu per satu.
- Pencarian dan filter di halaman Archive.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu admin mengarsipkan satu item dari kartunya | Kurang dari 5 detik, dua klik |
| Waktu mengembalikan item dari halaman Archive | Kurang dari 10 detik |
| Data (task, snapshot, release) yang hilang akibat Archive atau Restore | 0 |
| Waktu muat halaman Archive | Kurang dari 2 detik |

## Pengguna dan kebutuhan

| Pengguna | Kebutuhan utama |
| --- | --- |
| Admin | Merapikan Dashboard dan daftar Release tanpa kehilangan data, dan bisa mengembalikannya |
| Pimpinan dan stakeholder | Dashboard dan daftar Release hanya berisi yang masih relevan |
| Developer | Tetap bisa membuka detail item yang diarsipkan lewat Archive atau tautan langsung |

Peran: hanya admin yang dapat **Archive** dan **Restore**. Semua pengguna login dapat melihat halaman Archive dan memakai **Details**.

## Konsep dan aturan

### Status arsip

- Setiap aplikasi dan setiap release punya status arsip: **aktif** (bawaan) atau **diarsipkan**, beserta waktu pengarsipannya.
- Archive berlaku **global**: sekali diarsipkan, tidak tampil bagi siapa pun di tampilan sehari-hari.
- Archive **tidak** mengubah data apa pun: task, snapshot, release, dan komponen tetap tersimpan dan tetap dihitung.
- Archive terpisah dari status lain. Aplikasi yang diarsipkan boleh aktif atau nonaktif (Deactivate). Release yang diarsipkan boleh sudah rilis atau belum. Restore mengembalikan item dengan status lain yang sama persis seperti sebelumnya.

### Aplikasi yang diarsipkan

| Tempat | Perilaku |
| --- | --- |
| Dashboard | Kartunya tidak tampil. Angka ringkasan Dashboard (bila ada) tidak menghitungnya |
| Task list | Task aplikasi itu tidak tampil dan aplikasinya tidak ada di pilihan filter |
| Trend | Tidak masuk gabungan "All applications" dan tidak ada di pilihan aplikasi |
| Pilihan aplikasi di form Release | Tidak ditawarkan untuk komponen baru |
| Source settings | Tetap tampil dengan penanda "Archived" agar admin tetap bisa mengelolanya |
| Sinkronisasi | Tidak berubah. Berjalan sesuai status Deactivate |
| Release yang punya komponen aplikasi ini | Tetap tampil dan tetap dihitung (lihat di bawah) |
| Tautan langsung ke detail task atau aplikasi | Tetap bisa dibuka |

Saat admin mengarsipkan aplikasi yang masih punya release belum rilis, dialog konfirmasi menyebut jumlah release itu dan menjelaskan bahwa release tetap berjalan.

### Release yang diarsipkan

| Tempat | Perilaku |
| --- | --- |
| Daftar Release | Tidak tampil, termasuk saat "Show released" dicentang |
| Baris release pada kartu aplikasi di Dashboard | Tidak dihitung, dan tidak masuk "+N more releases" |
| Halaman detail dan tautan langsung | Tetap bisa dibuka, dengan penanda "Archived" dan tombol Restore untuk admin |
| Komponen release | Tidak berubah. Aplikasi pada komponen itu tidak ikut diarsipkan |

Status "released" dan "archived" saling bebas. Release yang sudah rilis tetap tampil lewat "Show released" sampai diarsipkan.

### Nama dan istilah

- Mengarsipkan = **Archive**. Mengembalikan = **Restore**. Halamannya bernama **Archive**.
- Teks antarmuka tetap bahasa Inggris.

## Antarmuka

### Menu tiga titik pada kartu

- Kartu aplikasi (Dashboard) dan kartu release (daftar Release) mendapat tombol tiga titik di pojok kanan atas.
- Isinya: **Details** (untuk semua pengguna) dan **Archive** (hanya admin).
- Menu tiga titik tidak boleh menghalangi tautan yang sudah ada: kartu tetap bisa diklik ke detail, sedangkan tombol tiga titik berdiri sendiri dan bisa dioperasikan dengan keyboard (label aksesibel "Actions for <nama>").
- **Archive** meminta konfirmasi singkat. Hasilnya diberitahukan lewat toast, dengan tombol **Undo** yang memanggil Restore.

### Halaman Archive

- Menu baru **Archive** di sidebar, kelompok "Manage", dengan ikon arsip.
- Dua tab: **Applications** dan **Releases**.
- Tiap baris menampilkan nama, ringkasan singkat, dan tanggal pengarsipan. Aplikasi: jumlah task dan waktu sinkronisasi terakhir. Release: status (released atau belum), tanggal target, dan jumlah komponen.
- Menu tiga titik tiap baris: **Details** (semua pengguna) dan **Restore** (hanya admin).
- Daftar berhalaman, 10 per halaman (sama dengan Task list).
- Keadaan kosong: "Nothing is archived."
- Tab dan halaman tersimpan di URL (`/archive?tab=releases&page=2`).

### Halaman detail

Detail aplikasi atau release yang diarsipkan menampilkan penanda "Archived" dan, untuk admin, tombol **Restore** di samping tombol yang sudah ada.

## Data dan migrasi

- Kolom `archived_at timestamptz` (kosong = aktif) pada tabel `sources` dan `releases`.
- Hanya satu view yang menyembunyikan aplikasi terarsip di database: `source_snapshot_totals` (gabungan Trend). `task_list`, `source_status_counts`, dan `source_tags` sengaja tidak menyaring, karena tautan langsung ke aplikasi terarsip (menu Details di halaman Archive membuka Task list aplikasi itu) harus tetap terbaca. Aplikasi yang menyaringnya: Task list tanpa pilihan aplikasi hanya memuat aplikasi tidak terarsip, dan pilihan aplikasi yang eksplisit memuat aplikasi apa adanya dengan penanda "(archived)" pada pilihan; Dashboard dan pilihan filter memakai daftar aplikasi yang tidak terarsip.
- `sources` memakai hak baca per kolom, jadi kolom `archived_at` diizinkan eksplisit untuk pengguna login (hanya baca).
- Perubahan database dijalankan langsung dengan `npm run db:run`, bukan manual.
- Pembatasan akses tidak berubah: pengguna login hanya membaca, penulisan lewat service role dan `requireAdmin()` pada setiap server action.

## Risiko dan keputusan terbuka

| Risiko | Penanganan |
| --- | --- |
| Aplikasi diarsipkan padahal release berjalan masih memakainya | Release tetap tampil dan dihitung. Dialog konfirmasi memberi tahu jumlahnya |
| Admin mengarsipkan item yang salah | Toast dengan Undo dan Restore dari halaman Archive |
| View yang disaring menyebabkan tautan lama ke task aplikasi terarsip kosong | Tautan langsung tetap membaca data lewat jalur detail yang tidak disaring |
| Archive bercampur artinya dengan Deactivate | Penjelasan singkat di dialog: Archive hanya menyembunyikan, tidak menghentikan sinkronisasi |
| Halaman Archive ikut panjang | Berhalaman 10 per halaman |
| Release yang sudah rilis tidak otomatis terarsip | Disengaja agar eksplisit. Dapat ditinjau lagi di Tahap berikutnya |

## Kriteria penerimaan

1. Admin mengarsipkan sebuah aplikasi dari menu tiga titik kartu Dashboard; kartunya hilang dari Dashboard, Task list, Trend, dan pilihan filter, dan muncul di Archive tab Applications.
2. Admin mengarsipkan sebuah release dari menu tiga titik kartu Release; kartunya hilang dari daftar (termasuk dengan "Show released") dan dari baris release di Dashboard, dan muncul di Archive tab Releases.
3. Restore mengembalikan item ke tempat asalnya dengan status lain yang sama (aktif atau nonaktif, released atau belum).
4. Release yang punya komponen dari aplikasi terarsip tetap tampil dengan angka yang sama.
5. Viewer melihat menu tiga titik dengan Details saja, dan halaman Archive tanpa tombol Restore. Memanggil action Archive atau Restore sebagai viewer ditolak.
6. Archive dan Restore tidak mengubah data task, snapshot, maupun komponen release.
7. Toast Undo mengembalikan item yang baru diarsipkan.
8. Tautan langsung ke detail item terarsip tetap terbuka dengan penanda "Archived".
9. Halaman Archive berhalaman 10 per halaman, dengan tab dan halaman tersimpan di URL.
10. `tsc`, eslint, vitest, tes SQL, tes live, dan `npm run build` lolos; tampilan benar di terang, gelap, dan ponsel; tidak ada galat konsol.

## Rencana rilis

1. Migrasi kolom `archived_at` dan pembaruan view, beserta tes SQL.
2. Lapisan data dan server action Archive dan Restore (hanya admin).
3. Penyaringan item terarsip di Dashboard, daftar Release, Task list, Trend, dan form Release.
4. Menu tiga titik pada kartu, dialog konfirmasi, dan toast Undo.
5. Halaman Archive dengan dua tab dan penanda "Archived" pada halaman detail.
6. Verifikasi live dan dokumentasi.

## Tahap berikutnya

- Arsip otomatis untuk release yang sudah rilis lebih dari jangka waktu tertentu.
- Pencarian dan filter di halaman Archive.
- Archive massal (banyak item sekaligus).
- Archive per pengguna, bila dibutuhkan.

# PRD: Release Lintas Aplikasi

14 November 2026 · Otik · Perluasan [PRD Fitur Release Tracking](PRD-Fitur-Release-Tracking.md). Dilanjutkan oleh [PRD Hold dan Catatan Release](PRD-Release-Hold-Catatan.md)

## Ringkasan dan latar belakang

Fitur Release saat ini mengikat satu release ke tepat satu aplikasi, satu tag, dan satu rentang task. Padahal satu versi produk sering terdiri dari beberapa repo. Contohnya "Release 2.1" berisi aplikasi **web** dan **backend**: web mengerjakan task #100 sampai #150, backend mengerjakan task #20 sampai #45. Dengan model sekarang, pemimpin teknis harus membuat dua release terpisah dan menggabungkan angkanya sendiri untuk menjawab "versi 2.1 sudah sampai mana?"

Perluasan ini memisahkan **release** (nama/versi, tanggal mulai, tanggal target, status rilis) dari **komponen** (satu aplikasi + satu tag + satu rentang task). Satu release punya satu sampai beberapa komponen. Website menghitung progres tiap komponen dan progres gabungan release, sehingga satu halaman menjawab kesiapan seluruh versi.

Release yang sudah ada otomatis menjadi release dengan satu komponen. Tidak ada data yang hilang dan angkanya tidak berubah.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Satu release dapat memuat beberapa komponen dari aplikasi berbeda (misalnya web dan backend).
- Menampilkan progres gabungan release dan rincian per komponen dalam satu halaman.
- Menampilkan risiko release secara keseluruhan dan komponen mana yang menyebabkannya.
- Satu tanggal target dan satu penandaan rilis untuk seluruh release.
- Release lama tetap berfungsi tanpa tindakan manual.

**Non-tujuan (versi ini)**

- Tanggal target atau penandaan rilis berbeda per komponen.
- Lebih dari satu rentang task untuk satu komponen (satu komponen tetap satu rentang).
- Dependensi lintas aplikasi (misalnya task web menunggu task backend). ID task hanya unik per aplikasi dan tag, dan data dependensi sumber tidak memuat aplikasi lain, jadi ini tidak bisa dihitung dari data yang ada.
- Mengubah task atau status task dari website.
- Bobot khusus per komponen pada progres gabungan.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu untuk mengetahui kesiapan satu versi yang mencakup dua aplikasi | Kurang dari 30 detik dari membuka website, tanpa menggabungkan angka manual |
| Waktu admin membuat release dengan dua komponen | Kurang dari 2 menit |
| Kesesuaian total task dan progres gabungan dengan data sumber | 100% pada pemeriksaan sampel untuk minimal dua release lintas aplikasi |
| Release lama yang berubah angkanya setelah migrasi | 0 |
| Waktu muat halaman Release | Kurang dari 2 detik |

## Pengguna dan kebutuhan

Peran tidak berubah: semua pengguna login boleh melihat, admin yang mengelola.

| Pengguna | Kebutuhan utama |
| --- | --- |
| Pimpinan teknis / product | Satu angka kesiapan versi 2.1 dan tahu repo mana yang menahan |
| Developer | Melihat task milik aplikasinya dalam release, mana yang terhambat |
| Manajemen / stakeholder | Persentase progres dan sisa hari per versi, bukan per repo |
| Admin | Membuat release 2.1 dengan komponen web dan backend dalam satu form |

## Konsep dan aturan

### Data

**Release (header)**

| Isian | Wajib | Aturan |
| --- | --- | --- |
| Nama/versi | Ya | 1 sampai 100 karakter, tanpa karakter kontrol. **Unik di seluruh release** (sebelumnya unik per aplikasi) |
| Tanggal mulai | Tidak | Bawaannya tanggal release dibuat (WIB). Tidak boleh setelah tanggal target |
| Tanggal target | Ya | Satu tanggal untuk seluruh komponen (WIB) |
| Tanggal rilis | Tidak | Diisi admin lewat "Mark as released"; berlaku untuk seluruh release |

**Komponen** (1 sampai 10 per release)

| Isian | Wajib | Aturan |
| --- | --- | --- |
| Aplikasi | Ya | Aplikasi (sumber) yang sudah terdaftar |
| Tag | Ya | Satu tag dari aplikasi itu (otomatis terpilih bila hanya ada satu) |
| Task awal dan akhir | Ya | Bilangan bulat positif, awal ≤ akhir, maksimal 15 digit, batas inklusif (aturan yang sama seperti sekarang) |

Aturan tambahan: pasangan (aplikasi, tag) tidak boleh muncul dua kali dalam satu release. Satu aplikasi boleh punya beberapa tag dalam satu release sebagai komponen terpisah, tetapi tiap tag satu rentang.

### Perhitungan

- **Isi komponen:** sama seperti sekarang, yaitu semua task pada tag itu dengan ID angka di dalam rentang.
- **Total gabungan** = jumlah task seluruh komponen. Semua status ikut dihitung, termasuk ditunda dan dibatalkan.
- **Progres gabungan** = total selesai ÷ total task seluruh komponen, dibulatkan. Contoh: web 60 dari 80 task dan backend 10 dari 20 task menghasilkan 70 dari 100 = 70%.
- **Progres per komponen** dihitung sendiri dan selalu ditampilkan di samping progres gabungan, supaya komponen yang tertinggal tidak tertutup komponen yang cepat.
- **Persen waktu** memakai tanggal mulai dan target release (satu untuk semua komponen).

### Risiko

Penanda risiko release memakai urutan dan ambang yang sama seperti sekarang (10 dan 25 poin selisih waktu dan progres), dengan aturan:

- Selisih dihitung dari **progres gabungan**.
- Bila ada komponen dengan task terhambat atau task yang menunggu dependensi di luar rentang (dependensi itu belum selesai), release minimal **At risk**, dan komponen penyebabnya disebut. Dependensi yang tidak ditemukan hanya ditampilkan sebagai peringatan dan tidak mengubah risiko (sama seperti sekarang).
- Release dianggap **Overdue** bila target lewat dan belum 100%, **Released** bila sudah ditandai rilis, dan **No tasks** bila semua komponen kosong.
- Risiko tiap komponen juga ditampilkan di bagian komponen, memakai tanggal release yang sama.

### Aplikasi dan tag tidak ditemukan

Komponen yang aplikasinya tidak aktif, sinkronisasi terakhirnya gagal, atau tag-nya tidak ditemukan tetap tampil dengan penanda yang sama seperti sekarang. Komponen dengan tag tidak ditemukan dihitung nol task dan diberi peringatan, tanpa menyembunyikan komponen lain.

## Antarmuka

### Daftar Release

- Kartu per release: nama, tanggal target dan sisa hari, penanda risiko, progres gabungan, dan satu baris ringkas per komponen, misalnya `Web #100-150 · 75%` dan `Backend #20-45 · 50%`.
- Filter aplikasi menampilkan release yang memiliki komponen dari aplikasi itu.
- Urutan dan filter "show released" tidak berubah.

### Detail Release

- Ringkasan gabungan: total, selesai, progres, sisa hari, risiko.
- Bagian **Components**: satu blok per komponen berisi aplikasi, tag, rentang, jumlah task, progres, rincian per status, risiko, dan status sinkronisasi.
- Daftar task dikelompokkan per komponen. Bagian "Needs attention" (terhambat, menunggu dependensi, ditunda, dibatalkan) memberi label aplikasi pada tiap baris.
- Tombol Edit, Mark as released, dan Delete bekerja pada seluruh release.

### Form admin

- Isian release (nama, tanggal mulai, tanggal target) di atas.
- Daftar komponen berulang: tombol **Add component** dan hapus per baris (minimal satu). Tiap baris berisi aplikasi, tag, task awal, task akhir, dan pratinjau jumlah task di rentang itu.
- Pesan validasi per baris untuk rentang tidak valid, pasangan (aplikasi, tag) ganda, atau tag tidak ditemukan.

### Dashboard

Kartu tiap aplikasi menampilkan release yang memuat komponennya: nama release, progres **komponen aplikasi itu**, dan penanda risiko **release**. Release yang memuat dua aplikasi muncul di kedua kartu.

### Teks

Seluruh teks antarmuka tetap bahasa Inggris.

## Data dan migrasi

- Tabel baru `release_components`: `release_id` (hapus berantai), `source_id`, `tag`, `range_start`, `range_end`, dengan `unique (release_id, source_id, tag)`. Pembatasan akses sama seperti `releases`: pengguna login hanya membaca, penulisan lewat service role.
- Migrasi memindahkan `source_id`, `tag`, `range_start`, `range_end` dari tiap release lama menjadi satu komponen, lalu menghapus kolom itu dari `releases`. Keunikan nama berubah dari `(source_id, name)` menjadi `name`; migrasi memeriksa tidak ada nama ganda sebelum diterapkan.
- Penyimpanan release dan seluruh komponennya dilakukan atomik lewat satu fungsi database, agar release tidak pernah tersimpan setengah jadi.
- Migrasi dijalankan langsung dengan `npm run db:run`, bukan manual.

## Risiko dan keputusan terbuka

| Risiko | Penanganan |
| --- | --- |
| Release lama berubah angka setelah migrasi | Bandingkan total dan progres release "2.1" sebelum dan sesudah migrasi; harus identik |
| Nama release kini unik global | Pengguna yang terbiasa memakai nama sama di aplikasi berbeda menggabungkannya sebagai komponen satu release |
| Satu komponen lambat menyeret risiko | Disengaja; rincian per komponen selalu terlihat |
| Progres gabungan didominasi aplikasi yang task-nya banyak | Disengaja (dipilih "jumlah task"); progres per komponen tetap ditampilkan. Bobot per komponen masuk Tahap berikutnya bila diperlukan |
| Beban baca bertambah (task dibaca per aplikasi dan tag) | Task dibaca sekali per pasangan (aplikasi, tag) dan dipakai bersama, seperti sekarang |
| Kode yang mengasumsikan satu release = satu aplikasi (kartu Dashboard, filter, form, tes) | Daftar perubahan ada di rencana implementasi; seluruh tes diperbarui |

## Kriteria penerimaan

1. Admin membuat release "2.1" dengan komponen web (#100-150) dan backend (#20-45), satu tanggal target, dalam satu form.
2. Detail release menampilkan total, progres gabungan, dan progres per komponen; progres gabungan sama dengan total selesai ÷ total task seluruh komponen.
3. Risiko release mengikuti aturan di atas, dan komponen penyebab At risk disebut.
4. Mark as released dan Delete berlaku untuk seluruh release; menghapus release menghapus komponennya.
5. Filter aplikasi di daftar Release menampilkan release yang memuat aplikasi itu.
6. Kartu Dashboard kedua aplikasi menampilkan release tersebut dengan progres komponennya masing-masing.
7. Release yang ada sebelum migrasi (termasuk "2.1" tag master #100-#150) tetap ada dengan satu komponen dan angka yang sama.
8. Pasangan (aplikasi, tag) ganda dan nama release ganda ditolak dengan pesan yang jelas.
9. `tsc`, eslint, vitest, tes SQL, tes live, dan `npm run build` lolos; tampilan benar di terang, gelap, dan ponsel; tidak ada galat konsol.

## Rencana rilis

1. Migrasi dan tes SQL, termasuk pencocokan angka release lama.
2. Model agregasi, validasi, dan pemuatan data.
3. Form dan action admin.
4. Kartu, detail, daftar, filter, dan kartu Dashboard.
5. Verifikasi live dan dokumentasi.

## Tahap berikutnya

- Bobot per komponen pada progres gabungan.
- Tanggal target per komponen.
- Dependensi lintas aplikasi, bila format sumber memungkinkan.
- Ringkasan release di halaman Tren.

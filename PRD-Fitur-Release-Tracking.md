# PRD: Fitur Release Tracking

7 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md)

## Ringkasan dan latar belakang

Dashboard saat ini menampilkan progres per aplikasi secara keseluruhan. Itu belum menjawab pertanyaan yang paling sering muncul menjelang rilis: "versi 2.1 yang dijadwalkan 20 November sudah sampai mana?" Sebuah release biasanya hanya mencakup sebagian task (misalnya task 100 sampai 200), sedangkan sisanya milik release sebelumnya atau berikutnya, sehingga persentase selesai satu aplikasi tidak mewakili kesiapan satu release.

Fitur ini menambahkan konsep **Release**: sebuah target rilis milik satu aplikasi, dengan nama/versi, tanggal target, dan satu rentang nomor task. Dari rentang itu website menghitung jumlah task, progres, sisa waktu, dan hal yang menghambat, memakai data task yang sudah disinkronkan. Satu aplikasi boleh punya banyak release (misalnya v2.0 yang sudah rilis, v2.1 dan v2.2 yang berjalan).

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Mencatat release per aplikasi: nama/versi, tanggal target, dan rentang task awal sampai akhir.
- Menampilkan untuk tiap release: task mulai dari nomor berapa sampai berapa, jumlah task, progres, rincian per status, dan sisa hari menuju target.
- Menunjukkan release yang berisiko terlambat dan alasannya (task terhambat, task ditunda atau dibatalkan, dependensi belum selesai).
- Membuat penyebab progres tertahan bisa dievaluasi: task ditunda dan dibatalkan tetap dihitung dan disorot, tidak disembunyikan.
- Memudahkan admin menambah, mengubah, menandai rilis, dan menghapus release lewat form tanpa mengubah kode.

**Non-tujuan (versi ini)**

- Mengubah task atau status task dari website. Task tetap dikelola lewat Taskmaster di repo.
- Release lintas aplikasi (satu versi produk yang mencakup beberapa repo).
- Memilih task satu per satu atau memakai lebih dari satu rentang per release.
- Grafik burn-up, prakiraan tanggal selesai, dan notifikasi (lihat Tahap berikutnya).
- Memantau proses deployment atau memverifikasi bahwa rilis benar-benar terjadi di produksi; penandaan rilis dilakukan manual oleh admin.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu untuk mengetahui kesiapan satu release | Kurang dari 30 detik dari membuka website, tanpa membuka repo |
| Waktu admin membuat release baru | Kurang dari 1 menit |
| Kesesuaian jumlah task dan progres dengan data sumber | 100% pada pemeriksaan sampel manual untuk minimal tiga release |
| Waktu muat halaman Release | Kurang dari 2 detik (di bawah patokan halaman utama) |

## Pengguna dan kebutuhan

Peran sama dengan PRD utama: semua pengguna yang login boleh melihat; hanya admin yang mengelola.

| Pengguna | Kebutuhan utama |
| --- | --- |
| Pimpinan teknis / product | Tahu release mana yang sesuai jadwal, berisiko, atau tertinggal, dan apa penyebabnya |
| Developer | Melihat task apa saja yang termasuk release, mana yang terhambat, dan dependensi yang menahan |
| Manajemen / stakeholder | Persentase progres dan sisa hari per release, dalam bahasa sehari-hari |
| Admin | Mengatur release (tambah, ubah, tandai rilis, hapus) dengan cepat dan aman |

## Konsep dan aturan

### Data release

| Isian | Wajib | Aturan |
| --- | --- | --- |
| Aplikasi | Ya | Satu release milik tepat satu aplikasi (sumber) |
| Tag | Ya | Satu tag dari aplikasi itu. ID task hanya unik per aplikasi dan tag, jadi release harus menunjuk satu tag. Bila aplikasi hanya punya satu tag, otomatis terpilih |
| Nama/versi | Ya | 1 sampai 100 karakter, tanpa karakter kontrol, misalnya "v2.1" |
| Task awal dan task akhir | Ya | Bilangan bulat positif, awal ≤ akhir, maksimal 15 digit. Batas ikut dihitung (inklusif) |
| Tanggal mulai | Tidak | Bawaannya tanggal release dibuat. Dipakai untuk menghitung laju waktu. Tidak boleh setelah tanggal target |
| Tanggal target | Ya | Tanggal (zona WIB, sama dengan seluruh tampilan lain) |
| Tanggal rilis aktual | Tidak | Diisi saat admin menandai rilis; kosong berarti belum rilis |

Aturan lain:

- Satu aplikasi boleh punya banyak release; rentang antar release boleh tumpang tindih. Nama release boleh sama pada aplikasi berbeda.
- Dua release pada aplikasi yang sama tidak boleh memiliki nama yang sama (mencegah duplikat tak sengaja).

### Cara menghitung isi dan progres

- **Isi release:** semua task pada aplikasi dan tag itu yang ID-nya berupa angka dan berada di antara task awal dan akhir. ID di dalam rentang yang tidak ada, atau ID non-angka, tidak dihitung. Total mencerminkan task yang benar-benar ada.
- **Otomatis ikut:** task baru yang muncul di dalam rentang setelah sinkronisasi langsung ikut terhitung; task yang hilang dari file sumber ikut hilang dari hitungan.
- **Total** mencakup semua status, termasuk ditunda (deferred) dan dibatalkan (cancelled). Keputusan ini disengaja agar penyebab progres tertahan bisa dievaluasi.
- **Progres** = jumlah task berstatus selesai ÷ total, dibulatkan ke persen terdekat. Total nol ditampilkan sebagai "Belum ada task di rentang ini", bukan 0%.
- **Rincian status:** tujuh status baku plus "lainnya", memakai label dan urutan yang sama dengan seluruh website.
- **Perlu dievaluasi:** kelompok task ditunda dan dibatalkan, ditampilkan dengan jumlah dan daftar task.

### Hambatan

Task di dalam rentang dianggap menjadi hambatan bila:

1. berstatus terhambat (blocked); atau
2. bergantung pada task lain yang belum selesai, terutama task di luar rentang release (dependensi yang membuat release tidak bisa selesai tepat waktu). Dependensi pada task yang tidak ditemukan dilaporkan terpisah sebagai "dependensi tidak ditemukan".

### Penanda risiko

Dihitung hanya untuk release yang belum rilis. Persen waktu dihitung dari tanggal mulai ke tanggal target.

| Penanda | Kondisi |
| --- | --- |
| Sudah rilis | Tanggal rilis aktual terisi |
| Lewat target | Tanggal target sudah lewat, belum rilis, dan progres belum 100% |
| Tertinggal | Progres tertinggal lebih dari 25 poin persen dari persen waktu |
| Berisiko | Progres tertinggal 10 sampai 25 poin dari persen waktu, atau ada task terhambat atau dependensi luar rentang yang belum selesai |
| Sesuai jadwal | Selain kondisi di atas |
| Belum ada task | Tidak ada task di rentang; tidak diberi penanda risiko |

Ambang 10 dan 25 poin adalah nilai awal dan tersimpan sebagai konstanta yang mudah diubah. Penanda selalu disertai teks dan ikon, tidak hanya warna.

### Hubungan dengan sinkronisasi

Release tidak menyimpan task sendiri. Angkanya selalu dihitung dari data task terakhir yang berhasil disinkronkan, sehingga tidak ada yang perlu disinkronkan ulang khusus untuk release. Bila sinkronisasi aplikasi gagal atau data usang, halaman release menampilkan penanda "data usang" dengan waktu sinkron terakhir, sama dengan kartu dashboard.

## Kebutuhan fungsional

Fitur ini menambah tiga halaman, satu bagian di Dashboard, dan satu menu sidebar.

| Bagian | Isi dan perilaku |
| --- | --- |
| Menu sidebar | Item "Release" di grup Pantau, terlihat oleh semua pengguna |
| Daftar release (`/release`) | Satu kartu per release: nama, aplikasi, tag, rentang task, jumlah task, tanggal target dan sisa hari, penanda risiko, bar progres, ringkasan status, dan jumlah ditunda/dibatalkan. Urut dari tanggal target terdekat. Filter aplikasi. Release yang sudah rilis disembunyikan secara bawaan dan bisa ditampilkan lewat pilihan "tampilkan yang sudah rilis". Admin melihat tombol Tambah release |
| Detail release (`/release/[id]`) | Judul, aplikasi, tag, rentang, tanggal mulai, target, dan rilis; sisa hari; empat angka ringkas (total, selesai, dalam pengerjaan, perlu perhatian); bar progres bertingkat per status dengan legenda angka; bagian "Perlu perhatian" (terhambat, dependensi luar rentang belum selesai, ditunda/dibatalkan); tabel semua task di rentang urut dari yang paling perlu perhatian, tiap baris menaut ke detail task. Tombol admin: Ubah, Tandai rilis (atau Batalkan tanda rilis), Hapus |
| Form release (admin, `/release/baru` dan `/release/[id]/ubah`) | Pilih aplikasi, tag (daftar diambil dari data aplikasi itu), isi nama, task awal, task akhir, tanggal mulai, tanggal target. Pratinjau langsung "Rentang ini memuat N task" agar salah ketik rentang langsung terlihat |
| Dashboard | Kartu aplikasi menampilkan satu baris untuk release belum rilis dengan tanggal target terdekat: nama, persen progres, sisa hari, penanda risiko; bila ada lebih dari satu, tampil "+N release lain" yang menaut ke daftar release terfilter aplikasi itu. Aplikasi tanpa release aktif tidak menampilkan baris tambahan |

Aturan perilaku:

- Menghapus release meminta konfirmasi lewat dialog dan tidak memengaruhi task. Menghapus aplikasi ikut menghapus release-nya.
- Menandai rilis mengisi tanggal rilis aktual dengan hari ini (WIB); admin dapat membatalkan tandanya. Progres tetap dihitung langsung dari data task; release yang sudah rilis menampilkan "dirilis pada [tanggal], progres saat ini N%".
- Hasil simpan dan hapus ditampilkan sebagai notifikasi singkat; galat validasi ditampilkan di bawah isian yang bersangkutan.
- Semua halaman tetap hanya-baca bagi non-admin; tidak ada aksi yang mengubah task.

### Kasus khusus

| Situasi | Perilaku |
| --- | --- |
| Rentang tidak memuat task | Kartu menampilkan "Belum ada task di rentang ini"; form memberi peringatan sebelum menyimpan, tetapi tetap boleh disimpan |
| Tag release hilang dari data (file sumber berubah) | Release tetap tampil dengan pesan "Tag tidak ditemukan pada data terakhir"; angka dianggap nol, bukan galat |
| Aplikasi dinonaktifkan | Release tetap tampil dengan penanda aplikasi nonaktif dan data terakhir yang ada |
| Sinkronisasi gagal | Angka dari data terakhir yang berhasil, dengan penanda usang |
| Task di rentang bergantung pada task di tag lain | Dependensi ditelusuri dalam tag yang sama (seperti halaman detail task); yang tidak ditemukan dilaporkan sebagai "tidak ditemukan" |
| Tanggal target sudah lewat saat release dibuat | Diperbolehkan (pencatatan mundur); penanda Lewat target berlaku |
| Status task tak dikenal | Dihitung sebagai "lainnya" dan tidak dianggap selesai |

## Kebutuhan non-fungsional

**Keamanan**

- Semua pengguna login boleh membaca release. Penulisan (tambah, ubah, tandai rilis, hapus) hanya admin; pengecekan peran dilakukan di server pada setiap aksi (`requireAdmin()` di baris pertama), bukan hanya di tampilan.
- Tabel release dilindungi Row Level Security: peran klien hanya `SELECT`; penulisan lewat service role di kode server, sama dengan tabel lain.
- Semua isian divalidasi di server (ID aplikasi harus UUID, rentang angka, panjang teks, format tanggal); pesan galat internal tidak diteruskan ke klien.
- Release tidak menyimpan token atau data rahasia.

**Performa**

- Angka release dihitung dari tabel task yang sudah ada; tidak ada pemanggilan ke penyedia repo.
- Tag yang sama dibaca sekali untuk semua release yang memakainya pada satu tampilan. Pembacaan dipaginasi agar tidak terpotong oleh batas baris per permintaan.
- Perkiraan skala awal: puluhan release dan ratusan task per tag; tidak perlu optimasi khusus.

**Keandalan dan kualitas**

- Aturan hitung (isi rentang, progres, risiko, hambatan) berupa fungsi murni yang diuji unit, termasuk kasus tepi (ID bolong, ID non-angka, rentang kosong, tanggal lewat, release sudah rilis).
- Validasi form diuji unit; skema dan RLS diuji lewat skrip SQL seperti migrasi lainnya.
- Tampilan mengikuti sistem desain yang ada (shadcn/ui, mode terang dan gelap, tampilan ponsel), dan dapat dipakai tanpa JavaScript untuk bagian baca.

## Model data

Satu tabel baru, `releases`. Tidak ada perubahan pada tabel `sources`, `tasks`, dan `snapshots`.

| Kolom | Keterangan |
| --- | --- |
| id | UUID, kunci utama |
| source_id | Rujukan ke `sources`; hapus berantai |
| tag | Teks, tag pada aplikasi itu |
| name | Teks, nama/versi; unik per aplikasi (`source_id`, `name`) |
| range_start, range_end | Bilangan bulat besar, `range_start <= range_end`, keduanya positif |
| start_date | Tanggal, bawaan hari pembuatan; tidak setelah `target_date` |
| target_date | Tanggal |
| released_on | Tanggal, kosong berarti belum rilis |
| created_at, updated_at | Waktu; `updated_at` diperbarui otomatis |

Hak akses: `SELECT` untuk pengguna login; tanpa `INSERT`, `UPDATE`, `DELETE` untuk peran klien. Perhitungan task dalam rentang memakai pembacaan tabel `tasks` per aplikasi dan tag, dengan penyaringan ID angka di aplikasi (ID task berupa teks).

## Risiko dan asumsi

| Risiko / asumsi | Dampak | Penanganan |
| --- | --- | --- |
| Penomoran task tidak berurutan sesuai release (task release lama dibuat belakangan, atau nomor melompat) | Rentang memuat task yang bukan bagian release, atau melewatkan yang seharusnya masuk | Pratinjau jumlah dan daftar task di form dan detail; satu rentang per release diterima sebagai batasan versi ini |
| Progres hanya seakurat `tasks.json` yang sudah di-commit | Release tampak lebih lambat dari kenyataan | Tampilkan waktu sinkron dan penanda usang; tetap berlaku asumsi PRD utama soal commit rutin |
| Penanda risiko dianggap prediksi pasti | Keputusan salah berdasarkan tebakan | Dokumentasikan rumusnya di halaman; tampilkan angka mentah (persen progres dan persen waktu) berdampingan dengan penandanya |
| Ambang 10 dan 25 poin tidak cocok dengan ritme tim | Terlalu banyak atau terlalu sedikit peringatan | Konstanta mudah diubah; dievaluasi setelah beberapa release berjalan |
| Task ditunda atau dibatalkan dihitung di total | Progres terlihat lebih rendah | Disengaja; disorot terpisah agar bisa dievaluasi, bukan dibiarkan jadi angka tanpa penjelasan |
| Release dibuat dengan tag yang kemudian berubah nama | Release tampak kosong | Pesan jelas "tag tidak ditemukan"; admin cukup mengubah tag di form |
| Riwayat progres per release belum disimpan | Belum ada grafik burn-up | Dicatat sebagai tahap berikutnya |

## Rencana rilis

| Tahap | Isi | Dianggap selesai bila |
| --- | --- | --- |
| 1. Dasar | Tabel `releases` dengan RLS; fungsi hitung dan risiko dengan tes; form dan aksi admin; halaman Daftar dan Detail release; menu sidebar; baris release di Dashboard | Admin bisa membuat release (mis. v2.1, task 100 sampai 200, target 20 November) dan semua pengguna melihat jumlah task, progres, sisa hari, penanda risiko, serta daftar hambatan; hasil cocok dengan pemeriksaan sampel manual |
| 2. Riwayat dan prakiraan | Snapshot progres per release tiap sinkronisasi; grafik burn-up (selesai terhadap waktu dengan garis target); prakiraan tanggal selesai dari laju 7 sampai 14 hari terakhir | Garis progres release terlihat dari waktu ke waktu dan prakiraan tanggal selesai muncul di detail release |
| 3. Pengingat dan perluasan | Notifikasi saat release berisiko atau mendekati target; release lintas aplikasi atau lebih dari satu rentang bila dibutuhkan | Release berisiko diberitahukan tanpa perlu membuka website |

## Keputusan dan pertanyaan terbuka

| Topik | Keputusan |
| --- | --- |
| Task ditunda dan dibatalkan | Dihitung di total dan disorot di kelompok "Perlu dievaluasi", agar penyebab progres tertahan bisa dievaluasi |
| Jumlah release per aplikasi | Dinamis: satu aplikasi boleh punya banyak release |
| Rentang per release | Satu rentang (task awal sampai akhir) per release |
| Cakupan aplikasi | Satu release milik satu aplikasi; lintas aplikasi ditunda |
| Hak akses | Semua pengguna login melihat; hanya admin yang mengelola, sama dengan pengaturan sumber |

**Masih terbuka (asumsi sementara, dapat diubah)**

1. **Ambang risiko** 10 dan 25 poin persentase: dipakai dulu sebagai nilai awal.
2. **Hambatan karena dependensi** (task bergantung pada task luar rentang yang belum selesai): ikut memicu penanda Berisiko.
3. **Satu rentang memakai satu tag:** release yang mencakup dua tag dibuat sebagai dua release.
4. **Tanggal mulai release:** opsional, bawaannya tanggal release dibuat.

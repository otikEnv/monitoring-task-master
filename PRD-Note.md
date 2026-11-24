# PRD: Notes dan Calendar

24 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md) dan [PRD Release Multi-Aplikasi](PRD-Release-Multi-Aplikasi.md)

## Ringkasan dan latar belakang

Hasil meeting, keputusan, dan catatan kerja tim saat ini tersebar di chat, dokumen pribadi, atau ingatan orang. Padahal yang dibahas hampir selalu berkaitan dengan data yang sudah ada di app ini: aplikasi, release, dan task. Catatan [Hold dan Catatan Release](PRD-Release-Hold-Catatan.md) hanya menempel pada satu release, sehingga tidak cocok untuk notulen meeting yang membahas banyak hal sekaligus.

Fitur ini menambahkan dua menu:

1. **Notes**: tempat admin mencatat hasil meeting atau catatan apa pun dengan tanggal (bawaan hari ini). Semua pengguna login dapat membaca catatan dan saling berkomentar.
2. **Calendar**: satu tampilan untuk semua yang bertanggal di app ini: catatan, release (mulai, target, dan tanggal dirilis), tenggat action item, serta libur nasional dan cuti bersama Indonesia.

Karena app kini mengenal hari libur, perhitungan waktu release juga diubah menjadi **hari kerja**: Sabtu, Minggu, libur nasional, dan cuti bersama tidak dihitung.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Admin dapat menulis catatan bertanggal, dengan tanggal bawaan hari ini.
- Menu Calendar (bulanan dan mingguan) menampilkan catatan, tanggal release, tenggat action item, libur nasional, cuti bersama, dan akhir pekan dalam satu tampilan, dengan filter jenis item dan ringkasan "+N more" bila satu hari berisi banyak item.
- Catatan dapat ditautkan ke aplikasi, release, dan task, dan tampil sebagai "Related notes" di halaman terkait.
- Catatan yang menautkan release merekam kondisi release saat itu (progres, status risiko, sisa hari).
- Catatan dapat memuat action item dengan penanggung jawab, tenggat, dan status selesai, dan action item yang belum selesai terbawa ke catatan lanjutan (**Follow up**).
- Semua pengguna login dapat membaca semua catatan, berkomentar, dan melihat komentar baru yang belum dibaca.
- Catatan dapat dicari, difilter, disalin untuk dibagikan, dan riwayat editnya tersimpan.
- Dashboard menampilkan ringkasan catatan hari ini, action item yang lewat tenggat, dan libur terdekat.
- Sisa hari dan persen waktu release dihitung dengan hari kerja.

**Non-tujuan (versi ini)**

- Notifikasi (email atau Slack) untuk komentar, action item, atau tenggat.
- Catatan yang hanya bisa dilihat penulisnya. Semua catatan terlihat oleh semua pengguna login.
- Penulisan catatan oleh viewer. Viewer hanya membaca, berkomentar, dan mencentang action item miliknya.
- Mengedit catatan milik admin lain, termasuk oleh admin.
- Lampiran file, gambar, dan mention `@`.
- Acara berulang, undangan, atau sinkronisasi dengan Google Calendar.
- Mengambil libur nasional otomatis dari API luar.
- Hari kerja per orang atau per tim (cuti pribadi). Hari kerja berlaku sama untuk semua release.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Waktu admin membuat catatan sederhana (judul, isi, tanggal hari ini) | Kurang dari 30 detik |
| Waktu membuat catatan lanjutan dengan Follow up | Kurang dari 10 detik sampai form terisi |
| Waktu muat halaman Calendar satu bulan | Kurang dari 2 detik |
| Waktu muat halaman Notes | Kurang dari 2 detik |
| Kesalahan penanda libur nasional atau cuti bersama di calendar | 0 untuk tahun yang sudah diisi |
| Catatan atau komentar yang bisa diubah oleh orang selain penulisnya | 0 |
| Selisih sisa hari kerja release dengan hitungan manual | 0 |

## Pengguna dan kebutuhan

| Pengguna | Kebutuhan utama |
| --- | --- |
| Admin | Mencatat hasil meeting dan keputusan, mengaitkannya ke release atau task, dan melacak tindak lanjutnya dari meeting ke meeting |
| Pimpinan dan stakeholder | Membaca hasil meeting dan keputusan tanpa harus hadir, melihat jadwal dan libur di calendar, dan melihat sisa waktu release yang realistis |
| Developer | Melihat action item yang menjadi tanggung jawabnya dan konteks keputusan untuk task yang dikerjakan |

## Hak akses

| Aksi | Admin (penulis) | Admin lain | Viewer |
| --- | --- | --- | --- |
| Membaca catatan, action item, riwayat edit, dan komentar | Ya | Ya | Ya |
| Membuat catatan dan Follow up | Ya | Ya | Tidak |
| Mengedit dan menghapus catatan | Ya | Tidak | Tidak |
| Mencentang action item selesai | Ya | Hanya bila penanggung jawabnya | Hanya bila penanggung jawabnya |
| Menulis komentar | Ya | Ya | Ya |
| Mengedit dan menghapus komentar | Hanya komentar sendiri | Hanya komentar sendiri | Hanya komentar sendiri |
| Menyalin catatan untuk dibagikan | Ya | Ya | Ya |
| Mengelola daftar libur | Ya | Ya | Tidak |

Catatan penting: komentar, centang action item, dan penanda "sudah dibaca" adalah **penulisan pertama oleh viewer** di app ini. Aturan "hanya penulis", "hanya penanggung jawab", dan "hanya admin" harus ditegakkan di server action dan di database (RLS), bukan hanya disembunyikan di antarmuka.

Admin yang turun menjadi viewer tetap tercatat sebagai penulis, tetapi tidak bisa lagi mengedit atau menghapus catatannya. Komentarnya sendiri tetap bisa diedit.

## Konsep dan aturan

### Catatan

| Kolom | Aturan |
| --- | --- |
| Judul | Wajib, maksimal 200 karakter |
| Tanggal | Wajib, bawaan hari ini (zona waktu Asia/Jakarta), boleh tanggal lalu atau mendatang |
| Jenis | Wajib, bawaan **Meeting**: Meeting, Decision, atau General |
| Isi | Opsional, Markdown, maksimal 20.000 karakter |
| Tautan | Opsional, boleh lebih dari satu: aplikasi, release, atau task (aplikasi + tag + nomor task) |
| Action item | Opsional, boleh lebih dari satu (lihat di bawah) |
| Penulis | Diisi otomatis dari pengguna yang login, tidak bisa diubah |

- Penulis, waktu dibuat, dan waktu terakhir diedit ditampilkan pada catatan.
- Menghapus catatan meminta konfirmasi dan ikut menghapus action item, tautan, rekaman kondisi release, riwayat edit, dan komentarnya. Tidak ada soft delete di versi ini.
- Isi Markdown ditampilkan dengan aman: HTML mentah tidak dijalankan.

### Jenis catatan dan warna

| Jenis | Kegunaan | Warna penanda |
| --- | --- | --- |
| Meeting | Notulen meeting | Biru |
| Decision | Keputusan penting | Ungu |
| General | Catatan lain | Abu-abu |

Warna harus terbaca di mode terang dan gelap, dan tidak menjadi satu-satunya pembeda (sertakan label atau ikon).

### Tautan ke aplikasi, release, dan task

- Tautan ke **task** disimpan sebagai aplikasi + tag + nomor task, karena nomor task hanya unik di dalam satu tag.
- Tautan tetap disimpan walau task-nya hilang dari `tasks.json` atau aplikasinya diarsipkan. Tampilannya diberi penanda "Not found" atau "Archived".
- Halaman detail release dan halaman detail task menampilkan bagian **Related notes** berisi catatan yang menautkannya, terbaru di atas.

### Rekaman kondisi release

- Saat catatan disimpan **pertama kali** dengan tautan ke release, app merekam kondisi release itu: persen progres, task selesai dan total, status risiko (On track, At risk, Behind, Overdue, On hold, Released), sisa hari kerja, dan tanggal target.
- Release yang ditautkan belakangan saat edit direkam pada saat tautan itu ditambahkan.
- Rekaman **tidak** berubah saat catatan diedit, sehingga tetap menunjukkan kondisi pada waktu keputusan diambil.
- Tampilan di catatan: "At the time: 45% done, At risk, 12 working days left", berdampingan dengan kondisi sekarang.
- Menghapus tautan ikut menghapus rekamannya.

### Action item

| Kolom | Aturan |
| --- | --- |
| Isi | Wajib, maksimal 500 karakter |
| Penanggung jawab | Opsional, dipilih dari pengguna terdaftar |
| Tenggat | Opsional |
| Selesai | Centang, bawaan belum |

- Penulis catatan dapat menambah, mengubah, menghapus, dan mencentang action item.
- Penanggung jawab dapat mencentang selesai atau membatalkan centang pada action item miliknya, tetapi tidak mengubah isinya.
- Action item yang lewat tenggat dan belum selesai diberi penanda "Overdue".

### Follow up

- Tombol **Follow up** pada catatan (hanya admin) membuka form catatan baru yang sudah terisi:
  - judul "Follow up: <judul catatan asal>", jenis sama, tanggal hari ini;
  - tautan aplikasi, release, dan task yang sama;
  - salinan action item yang **belum selesai**, dengan penanggung jawab dan tenggat yang sama.
- Isi catatan asal tidak disalin.
- Catatan baru menyimpan rujukan ke catatan asal dan menampilkan "Follows up <judul>" dengan tautan. Catatan asal menampilkan "Followed up in <judul>".
- Action item di catatan asal yang disalin diberi penanda "Carried over" dan tidak lagi dihitung "Overdue" di calendar dan Dashboard, agar tidak dihitung dua kali. Action item tetap bisa dicentang di catatan asal.
- Penulis catatan lanjutan adalah admin yang menekan Follow up, walau catatan asal ditulis admin lain.

### Komentar

- Semua pengguna login dapat berkomentar pada catatan mana pun. Maksimal 2.000 karakter, teks biasa.
- Komentar bisa berupa **komentar baru** (utas sendiri) atau **balasan** (tombol Reply) pada komentar lain. Balasan hanya satu tingkat: membalas sebuah balasan tetap masuk ke utas komentar utamanya.
- Utas ditampilkan urut dari yang terlama; balasan tampil menjorok di bawah komentar utamanya, juga urut terlama.
- Penulis yang menghapus komentar utama yang sudah dibalas: komentarnya tampil "This comment was deleted" dan balasan orang lain tetap ada. Komentar yang dihapus tidak dihitung.
- Penulis komentar dapat mengedit dan menghapus komentarnya. Komentar yang diedit diberi penanda "edited".
- Penulis catatan **tidak** dapat menghapus komentar orang lain.

### Penanda komentar baru

- App mencatat kapan setiap pengguna terakhir membuka setiap catatan.
- Daftar catatan menampilkan jumlah komentar dan penanda "N new" untuk komentar dari orang lain yang dibuat setelah pengguna terakhir membuka catatan itu.
- Membuka halaman detail catatan menandai semua komentarnya sudah dibaca.
- Komentar sendiri tidak pernah dihitung sebagai baru.

### Riwayat edit

- Setiap kali penulis menyimpan perubahan judul, jenis, tanggal, atau isi, versi sebelumnya disimpan.
- Halaman detail menampilkan "Edited N times" dengan tautan **History**: daftar versi beserta waktu dan penyuntingnya, dan perbedaan isi antar versi.
- Riwayat hanya bisa dibaca, tidak bisa dikembalikan atau dihapus satu per satu. Riwayat terhapus bila catatannya dihapus.
- Perubahan action item, tautan, dan komentar tidak masuk riwayat ini.

### Salin untuk dibagikan

- Tombol **Copy** pada catatan menyalin teks rapi ke clipboard, untuk ditempel di WhatsApp atau Slack:
  - judul, jenis, dan tanggal;
  - isi dalam teks biasa (format Markdown dasar dipertahankan, misalnya daftar dan tebal);
  - daftar action item dengan centang, penanggung jawab, dan tenggat;
  - tautan ke halaman catatan di app.
- Komentar tidak ikut disalin.
- Setelah disalin muncul toast "Copied".

### Libur nasional dan cuti bersama

- Libur disimpan di tabel database sendiri, bukan diambil dari API luar.
- Data awal diisi untuk tahun **2026 dan 2027** dari SKB 3 Menteri yang berlaku.
- Admin dapat menambah, mengubah, dan menghapus tanggal libur dari app, karena SKB kadang direvisi di tengah tahun.
- Setiap tanggal libur punya nama dan jenis: **National holiday** atau **Collective leave** (cuti bersama).
- Bila daftar libur untuk tahun yang sedang dilihat masih kosong, calendar menampilkan pemberitahuan kecil "Holidays for <tahun> have not been added yet", disertai tautan pengelolaan untuk admin.

### Hari kerja pada release

Hari kerja adalah hari Senin sampai Jumat yang bukan National holiday dan bukan Collective leave.

| Angka | Sebelum | Sesudah |
| --- | --- | --- |
| Sisa hari | Selisih hari kalender sampai tanggal target | Jumlah hari kerja dari besok sampai tanggal target |
| Persen waktu berjalan | Hari kalender yang lewat dibagi panjang release dalam hari kalender | Hari kerja yang lewat dibagi jumlah hari kerja dari tanggal mulai sampai target |
| Overdue | Tanggal target sudah lewat | **Tidak berubah**: tetap berdasarkan tanggal kalender |
| Behind dan At risk | Selisih persen waktu dan persen progres | Rumus dan ambang sama, hanya persen waktunya yang memakai hari kerja |

- Teks sisa hari menjadi "12 working days left". Pada hari target: "today". Bila target jatuh di akhir pekan atau hari libur, tetap dihitung sampai tanggal itu dan teksnya menyebut tanggalnya.
- Release yang rentangnya tidak punya hari kerja sama sekali (misalnya seluruhnya libur) memakai aturan yang sama dengan rentang nol hari saat ini.
- Berlaku di semua tempat yang menampilkan angka release: kartu dan detail release, baris release di Dashboard, dan rekaman kondisi release.
- Bila daftar libur untuk tahun yang dicakup sebuah release belum diisi, hari kerja tetap dihitung tanpa libur (hanya akhir pekan), dan halaman detail release menampilkan pemberitahuan kecil.
- Perubahan ini **akan mengubah angka dan status risiko release yang sedang berjalan** saat dirilis. Admin diberi tahu lewat catatan rilis.

### Nama dan istilah

- Menu dan halamannya bernama **Notes** dan **Calendar**. Teks antarmuka tetap bahasa Inggris.
- Istilah: **Note**, **Action item**, **Comment**, **Follow up**, **History**, **Copy**, **National holiday**, **Collective leave**, **working days**.

## Antarmuka

### Menu dan alamat

- Dua menu baru di sidebar, kelompok utama: **Calendar** (ikon calendar) paling atas, di atas Dashboard, dan **Notes** (ikon catatan) setelah Trend.
- Alamat Calendar: `/calendar`.
- Alamat Notes: `/notes` (daftar), `/notes/new` (juga `?date=<tanggal>` dan `?followUp=<id>`), `/notes/<id>`, `/notes/<id>/edit`, `/notes/<id>/history`, dan `/notes/holidays` (hanya admin).

### Halaman Calendar

**Isi calendar**

| Item | Tampil pada tanggal | Tampilan | Klik membuka |
| --- | --- | --- | --- |
| Catatan | Tanggal catatan | Baris pendek dengan warna dan ikon jenis catatan, dan judul | Detail catatan |
| Release mulai | Tanggal mulai | Baris pendek "Start: <nama release>" | Detail release |
| Release target | Tanggal target | Baris pendek "Target: <nama release>", dengan warna status risikonya | Detail release |
| Release dirilis | Tanggal dirilis | Baris pendek "Released: <nama release>" | Detail release |
| Tenggat action item | Tanggal tenggat, hanya yang belum selesai dan tidak "Carried over" | Baris pendek dengan isi action item, ditandai "Overdue" bila lewat | Detail catatan, tergulir ke action item itu |
| National holiday | Tanggal libur | Latar merah muda dan nama libur kecil di sel tanggal | Tidak ada, hanya tampil di panel hari |
| Collective leave | Tanggal cuti bersama | Latar lebih pucat dan nama kecil di sel tanggal | Tidak ada, hanya tampil di panel hari |
| Akhir pekan | Sabtu dan Minggu | Angka tanggal berwarna redup | Tidak ada |

Release yang diarsipkan tidak tampil. Release yang sedang di-hold tetap tampil dengan penanda "On hold".

**Tampilan Month**

- Pilihan tampilan **Month** dan **Week**, tombol sebelumnya, berikutnya, dan **Today**. Minggu dimulai hari Senin.
- Setiap sel tanggal menampilkan **maksimal 3 item** dengan urutan: release, action item, lalu catatan. Di dalam jenis yang sama, urutannya sesuai waktu dibuat.
- Bila item lebih dari 3, sisanya diringkas menjadi tombol **"+N more"**.
- Libur dan cuti bersama tidak dihitung dalam batas 3 item, karena tampil sebagai latar dan nama di sel tanggal.
- Di ponsel, sel tanggal terlalu sempit untuk baris item, sehingga setiap sel hanya menampilkan titik berwarna per jenis item dan angka jumlahnya. Detailnya dibuka lewat panel hari.

**Panel hari**

- Mengklik **"+N more"** atau mengklik sel tanggal membuka panel detail hari itu: popover di desktop, sheet dari bawah di ponsel.
- Isinya **semua** item pada tanggal itu, dikelompokkan dan berurutan: **Holidays**, **Releases**, **Action items**, **Notes**.
- Setiap item bisa diklik menuju detailnya.
- Untuk admin, panel memuat tombol **New note**, yang membuka form dengan tanggal itu terisi.
- Panel bisa ditutup dengan tombol tutup, tombol Esc, atau klik di luar panel, dan bisa dioperasikan dengan keyboard.

**Tampilan Week**

- Tujuh kolom hari dengan **semua** item tertulis lengkap, tanpa batasan "+N more". Di ponsel, tujuh hari ditampilkan bertumpuk ke bawah.

**Filter dan legenda**

- **Filter jenis item**: toggle **Notes**, **Releases**, **Action items**, dan **Holidays**, semuanya aktif sebagai bawaan. Item yang disembunyikan tidak tampil dan tidak dihitung dalam "+N more".
- **Filter aplikasi**: menampilkan hanya release dan catatan yang terkait aplikasi itu, serta action item dari catatan tersebut. Libur tetap tampil.
- **Filter jenis catatan**: Meeting, Decision, dan General, berlaku untuk item catatan.
- **Legenda** kecil di bawah calendar menjelaskan warna dan ikon setiap jenis item, termasuk libur nasional dan cuti bersama.
- Tampilan, bulan atau minggu, tanggal terpilih, dan semua filter tersimpan di URL (`/calendar?view=month&month=2026-11&date=2026-11-24&show=notes,releases&app=<id>`).
- Bila libur untuk tahun yang dilihat belum diisi, pemberitahuan kecil tampil di atas calendar, dengan tautan ke `/notes/holidays` untuk admin.

### Halaman Notes

- **Daftar catatan**, terbaru di atas, berhalaman 10 per halaman. Setiap baris menampilkan judul, jenis, tanggal, penulis, jumlah komentar, dan penanda komentar baru.
- **Pencarian dan filter**: kata kunci (judul dan isi), jenis, aplikasi, dan rentang tanggal, tersimpan di URL (`/notes?type=meeting&q=api&from=2026-11-01&to=2026-11-30&page=2`).
- Tombol **New note** hanya tampil untuk admin, dengan tanggal bawaan hari ini.
- Tautan **View in calendar** membuka Calendar pada bulan yang sama dengan rentang tanggal filter.
- Keadaan kosong: "No notes yet." (admin melihat tombol New note).

### Form catatan

- Kolom: judul, tanggal (bawaan hari ini atau tanggal terpilih), jenis, isi Markdown dengan pratinjau, tautan, dan action item.
- Pemilih tautan task: pilih aplikasi, lalu tag, lalu nomor task (pola yang sama dengan form Release).
- Saat dibuka lewat Follow up, form sudah terisi sesuai aturan Follow up dan menampilkan "Following up <judul>" di atasnya.
- Kesalahan validasi ditampilkan per kolom, sama dengan form lain.

### Halaman detail catatan

- Judul, jenis, tanggal, penulis, waktu dibuat dan diedit, dan "Edited N times" dengan tautan History.
- Rujukan "Follows up" dan "Followed up in" bila ada.
- Isi Markdown, daftar tautan dengan rekaman kondisi release, dan daftar action item.
- Tombol **Copy** untuk semua pengguna. Tombol **Follow up** untuk admin. Tombol **Edit** dan **Delete** hanya untuk penulisnya.
- Bagian **Comments** di bawah, dengan kotak komentar untuk semua pengguna login.

### Halaman History

- Daftar versi dari yang terbaru: waktu, penyunting, dan kolom yang berubah.
- Memilih satu versi menampilkan perbedaan isinya dengan versi sesudahnya (baris yang ditambah dan dihapus).

### Halaman detail release dan task

- Bagian baru **Related notes**: judul, jenis, tanggal, dan penulis dari catatan yang menautkannya, dengan tautan ke detailnya.
- Detail release menampilkan sisa waktu dalam hari kerja, dan pemberitahuan bila libur untuk tahunnya belum diisi.

### Ringkasan di Dashboard

- Kartu baru **Notes** di bagian atas Dashboard, untuk semua pengguna, berisi tiga bagian ringkas:
  - **Today**: catatan bertanggal hari ini (judul dan jenis);
  - **Overdue action items**: action item yang lewat tenggat dan belum selesai, milik pengguna yang login lebih dulu, maksimal 5 dengan tautan "View all";
  - **Upcoming holidays**: libur dan cuti bersama dalam 14 hari ke depan.
- Bagian yang kosong menampilkan teks singkat ("No notes today", "Nothing overdue", "No holidays in the next 14 days").
- Kartu tidak menggeser kartu aplikasi yang sudah ada di bawahnya dan bisa dilipat. Status lipatnya diingat per pengguna lewat cookie, seperti sidebar.

### Halaman libur (admin)

- Daftar libur per tahun dengan pilihan tahun.
- Tambah, ubah, dan hapus: tanggal, nama, dan jenis.
- Satu tanggal hanya boleh punya satu entri libur.

## Data dan migrasi

- Tabel baru:
  - `notes`: judul, tanggal, jenis, isi, penulis (`author_id`, `author_email`), rujukan `follows_up_id` ke catatan asal (boleh kosong), waktu dibuat dan diedit.
  - `note_links`: catatan + jenis tautan + `source_id`, `release_id`, atau (`source_id`, `tag`, `task_id`).
  - `note_release_snapshots`: tautan release + persen progres, task selesai dan total, status risiko, sisa hari kerja, tanggal target, waktu rekam.
  - `note_action_items`: catatan + isi, penanggung jawab, tenggat, selesai, waktu selesai, `carried_to_id` (action item hasil salinan Follow up, boleh kosong).
  - `note_revisions`: catatan + judul, jenis, tanggal, dan isi versi sebelumnya, penyunting, waktu.
  - `note_comments`: catatan + isi, penulis, waktu dibuat dan diedit, `parent_id` (balasan), `deleted_at` (komentar utama terhapus yang masih dibalas).
  - `note_reads`: pengguna + catatan + waktu terakhir dibuka (kunci gabungan).
  - `holidays`: tanggal (unik), nama, jenis (`national` atau `collective_leave`).
- Penghapusan catatan berantai ke semua tabel `note_*`. Menghapus catatan asal mengosongkan `follows_up_id` pada catatan lanjutannya.
- Penulis disimpan dengan `author_id` dan `author_email`, sama dengan `release_notes`, agar nama penulis tetap tampil bila akunnya dihapus.
- RLS:
  - Semua tabel dapat dibaca pengguna login. `anon` tidak punya akses. `note_reads` hanya dapat dibaca pemiliknya.
  - Penulisan catatan, tautan, rekaman, action item, riwayat, dan libur hanya lewat service role, dengan `requireAdmin()` dan pemeriksaan penulis di server action.
  - Komentar dan `note_reads` memakai `requireUser()` dan pemeriksaan pemilik di server action.
  - Mencentang action item memeriksa bahwa pengguna adalah penulis catatan atau penanggung jawabnya.
- Indeks pada `notes (note_date)`, `note_links` per sasaran tautan, `note_action_items (due_date)`, dan `note_comments (note_id, created_at)` untuk calendar, Related notes, Dashboard, dan penanda komentar baru.
- Data awal libur 2026 dan 2027 dimasukkan lewat migrasi.
- Perhitungan hari kerja dilakukan di lapisan aplikasi (`src/lib/releases/model.ts`) dengan daftar libur yang dimuat sekali per permintaan halaman.
- Perubahan database dijalankan langsung dengan `npm run db:run`, bukan manual.

## Risiko dan keputusan terbuka

| Risiko | Penanganan |
| --- | --- |
| Viewer kini bisa menulis (komentar, centang action item, penanda baca), berbeda dari aturan selama ini | Dibatasi ke tiga aksi itu, dicek pemiliknya di server dan diuji di tes SQL dan tes live |
| Angka dan status risiko release berubah saat hari kerja dirilis | Diumumkan lewat catatan rilis. Overdue tetap memakai tanggal kalender agar tidak ada release yang tiba-tiba lolos dari Overdue |
| Data libur salah atau berubah karena revisi SKB | Admin bisa mengubahnya dari app. Sumber data awal dicatat di migrasi |
| Libur tahun depan belum diisi | Pemberitahuan di calendar dan detail release, dan tautan pengelolaan untuk admin |
| Isi Markdown dipakai untuk menyisipkan skrip | Render Markdown tanpa HTML mentah, tautan hanya `http`, `https`, dan `mailto` |
| Tautan task menunjuk task yang sudah hilang | Tautan tetap disimpan dengan penanda "Not found" |
| Action item terhitung dua kali setelah Follow up | Action item asal diberi penanda "Carried over" dan tidak dihitung Overdue |
| Rekaman kondisi release disalahpahami sebagai kondisi sekarang | Selalu diberi label "At the time" dan ditampilkan berdampingan dengan kondisi sekarang |
| Riwayat edit membesar | Hanya kolom teks catatan yang disimpan, tanpa action item atau komentar |
| Calendar lambat karena banyak penanda | Muat hanya data bulan atau minggu yang sedang dilihat |
| Satu hari berisi terlalu banyak item sehingga calendar sesak | Maksimal 3 item per sel dengan "+N more", panel hari untuk melihat semuanya, dan filter jenis item |
| Calendar di ponsel terlalu sempit untuk baris item | Sel ponsel hanya menampilkan titik dan jumlah, dan detailnya dibuka lewat sheet |
| Tanggal "hari ini" bergeser karena zona waktu | Semua tanggal catatan dan hari kerja memakai Asia/Jakarta |
| Penulis catatan tidak lagi admin | Catatan tetap tampil, tetapi tidak bisa diedit. Admin lain bisa membuat Follow up. Ditinjau lagi bila sering terjadi |
| Ruang lingkup versi ini besar | Rencana rilis dibagi bertahap. Hari kerja dirilis terakhir agar fitur Notes tidak tertahan olehnya |

## Kriteria penerimaan

1. Admin membuat catatan dari **New note**: tanggal terisi hari ini (Asia/Jakarta), dan catatan tampil di daftar Notes serta di Calendar pada tanggal itu.
2. **New note** dari panel hari di Calendar mengisi tanggal tersebut.
3. Calendar Month menampilkan catatan, release (mulai, target, dirilis), dan tenggat action item, serta menandai National holiday dan Collective leave dengan nama dan warna berbeda, dan akhir pekan. Tampilan Week menampilkan semua item dengan judul lengkap.
4. Hari dengan lebih dari 3 item menampilkan 3 item dan "+N more". Mengklik "+N more" atau tanggalnya membuka panel hari berisi semua item yang dikelompokkan, dan setiap item membuka detailnya.
5. Filter jenis item, aplikasi, dan jenis catatan mengubah isi Calendar dan hitungan "+N more", dan tersimpan di URL. Legenda menjelaskan semua warna.
6. Catatan yang ditautkan ke release atau task tampil di **Related notes** pada halaman detailnya.
7. Catatan yang menautkan release menampilkan rekaman kondisi saat dibuat, dan rekaman itu tidak berubah walau release dan catatannya berubah.
8. **Follow up** membuka form dengan tautan yang sama dan hanya action item yang belum selesai. Setelah disimpan, kedua catatan saling merujuk, dan action item asal tidak lagi dihitung Overdue maupun tampil di Calendar.
9. Penulis dapat mengedit dan menghapus catatannya. Admin lain dan viewer tidak melihat tombolnya, dan memanggil action-nya secara langsung ditolak.
10. Setiap simpanan edit menambah satu versi di History, dan History menampilkan perbedaan isinya.
11. Viewer dapat membaca catatan, membuka Calendar, berkomentar, dan menyalin catatan, tetapi tidak dapat membuat catatan. Memanggil action buat catatan sebagai viewer ditolak.
12. Setiap pengguna hanya dapat mengedit dan menghapus komentarnya sendiri.
13. Penanda "N new" muncul untuk komentar orang lain setelah kunjungan terakhir, dan hilang setelah catatan dibuka.
14. Penanggung jawab dapat mencentang action item miliknya. Pengguna lain selain penulis catatan tidak bisa.
15. **Copy** menyalin judul, jenis, tanggal, isi, action item, dan tautan catatan dalam teks rapi, tanpa komentar.
16. Pencarian dan filter di halaman Notes (kata kunci, jenis, aplikasi, rentang tanggal) mengubah daftar dan tersimpan di URL.
17. Kartu Notes di Dashboard menampilkan catatan hari ini, action item yang lewat tenggat (milik pengguna lebih dulu), dan libur 14 hari ke depan.
18. Sisa hari dan persen waktu release dihitung dengan hari kerja di kartu, detail, dan Dashboard, dan cocok dengan hitungan manual untuk release yang melewati libur nasional dan cuti bersama. Overdue tetap berdasarkan tanggal kalender.
19. Admin dapat menambah, mengubah, dan menghapus libur, dan perubahannya langsung memengaruhi Calendar dan hari kerja release. Viewer tidak bisa membuka halaman libur.
20. Isi Markdown yang berisi HTML atau skrip tidak dijalankan.
21. `tsc`, eslint, vitest, tes SQL, tes live, dan `npm run build` lolos; tampilan benar di terang, gelap, dan ponsel (termasuk panel hari sebagai sheet); tidak ada galat konsol.

## Rencana rilis

1. Migrasi semua tabel baru beserta RLS, indeks, data awal libur 2026 dan 2027, dan tes SQL.
2. Lapisan data dan server action: catatan, tautan, action item, dan riwayat (admin, hanya penulis), komentar dan penanda baca (semua pengguna, hanya pemilik), centang action item (penulis atau penanggung jawab), dan libur (admin).
3. Form catatan dan halaman detail catatan dengan Markdown, komentar, penanda komentar baru, Copy, dan History.
4. Halaman Notes: daftar, pencarian, dan filter.
5. Tautan ke aplikasi, release, dan task, rekaman kondisi release, dan Related notes di halaman detail release dan task.
6. Follow up dan penanda "Carried over".
7. Halaman Calendar: pemuatan semua jenis item per bulan atau minggu, tampilan Month dengan batas 3 item dan "+N more", panel hari, tampilan Week, filter jenis item, filter aplikasi, dan legenda.
8. Halaman pengelolaan libur dan kartu Notes di Dashboard.
9. Hari kerja pada perhitungan release, dengan tes untuk libur, cuti bersama, akhir pekan, dan tahun yang liburnya belum diisi.
10. Menu sidebar Calendar dan Notes, verifikasi live, catatan rilis tentang perubahan angka release, dan dokumentasi.

## Tahap berikutnya

- Notifikasi komentar dan tenggat action item (email atau Slack).
- Halaman "My action items" untuk setiap pengguna.
- Template catatan meeting (Agenda, Pembahasan, Keputusan, Tindak lanjut).
- Daftar peserta meeting.
- Mention `@` dan lampiran.
- Ekspor calendar (iCal) atau sinkronisasi dengan Google Calendar.
- Hari kerja per tim atau per orang (cuti pribadi).

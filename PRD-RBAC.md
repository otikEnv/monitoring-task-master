# PRD: Role, Akses Menu, dan Pengelolaan User (RBAC)

25 November 2026 · Otik · Tambahan untuk [PRD Web Monitoring Task Master](PRD-Web-Monitoring-Task-Master.md), [PRD Login SSO Google](PRD-Login-SSO-Google.md), dan [PRD Notes dan Calendar](PRD-Note.md)

## Ringkasan dan latar belakang

App ini sekarang hanya mengenal dua role, **admin** dan **viewer**. Ada tiga masalah dengan cara kerja saat ini:

- **Tidak ada cara mengelola user dari app.** Mengganti role, menonaktifkan akun, atau menambah user harus dilakukan langsung di database.
- **Aturan role bawaan terlalu longgar.** Siapa pun dengan email @envisions.app yang mendaftar lewat Google otomatis menjadi admin.
- **Semua menu terbuka untuk semua role.** Tidak ada cara membatasi menu tertentu untuk kelompok user tertentu.

Selain itu, ada kebutuhan role di antara admin dan viewer. Developer perlu ikut berdiskusi di catatan dan menulis perkembangan di log release, tetapi tidak boleh mengubah data release.

Fitur ini menambahkan:

1. **Empat role**, yaitu Superadmin, Admin, Developer, dan Viewer, dengan hak yang jelas.
2. **Menu Settings** khusus superadmin, untuk:
   - melihat daftar user,
   - mengganti role,
   - menonaktifkan dan mengaktifkan user,
   - menambah user dengan password awal,
   - mengatur menu yang bisa dibuka setiap role.
3. **Role bawaan Viewer** untuk setiap akun yang baru mendaftar, termasuk lewat Google.

## Tujuan, non-tujuan, dan metrik

**Tujuan**

- Ada empat role dengan hak yang berbeda dan dicek di server, bukan hanya di tampilan.
- Viewer benar-benar hanya bisa melihat. Viewer tidak bisa membuat, mengubah, menghapus, berkomentar, atau mencentang apa pun.
- Developer bisa berkomentar di Notes dan menambah activity di Release. Di luar itu, hak developer sama dengan viewer.
- Superadmin bisa mengelola user dari app: melihat daftar, mengganti role, menonaktifkan atau mengaktifkan, menambah user, dan mereset password.
- Superadmin bisa mengatur menu yang terlihat dan bisa dibuka setiap role.
- Akun yang dinonaktifkan langsung kehilangan akses, termasuk sesi yang sedang terbuka.
- Akun baru otomatis menjadi Viewer sampai role-nya dinaikkan superadmin.
- Perubahan user dan akses tercatat (siapa, kapan, apa).

**Non-tujuan (versi ini)**

- Membuat role baru dari tampilan. Daftar role tetap empat dan ditentukan di kode.
- Hak per aksi yang bisa diatur dari tampilan. Yang bisa diatur hanya akses menu; hak menulis mengikuti role.
- Hak per aplikasi atau per release (misalnya developer hanya bisa melihat aplikasi tertentu).
- Undangan lewat email dan alur "lupa password" mandiri. User dibuat dengan password awal oleh superadmin.
- Menghapus akun secara permanen. Akun hanya bisa dinonaktifkan, agar jejak penulis catatan dan activity tetap utuh.
- Notifikasi ke user saat role atau statusnya berubah.
- Membuka batas domain email. User tetap harus ber-email @envisions.app.

**Metrik keberhasilan**

| Metrik | Target awal |
| --- | --- |
| Aksi tulis yang berhasil dilakukan role yang tidak berhak, termasuk lewat pemanggilan server action langsung | 0 |
| Waktu superadmin menambah user baru sampai user itu bisa login | Kurang dari 1 menit |
| Waktu akun yang dinonaktifkan kehilangan akses | Saat permintaan berikutnya (bukan menunggu token kedaluwarsa) |
| Kondisi tanpa superadmin aktif | Tidak mungkin terjadi |
| Menu yang tidak diizinkan tapi masih bisa dibuka lewat URL | 0 |

## Pengguna dan kebutuhan

| Pengguna | Kebutuhan utama |
| --- | --- |
| Superadmin (pemilik app) | Mengelola siapa yang bisa masuk dan apa yang bisa mereka lakukan, tanpa menyentuh database |
| Admin (PM, lead) | Mengelola release, source, catatan, dan libur seperti sekarang |
| Developer | Ikut berdiskusi di catatan meeting, menyelesaikan action item miliknya, dan menulis perkembangan pekerjaan di log release |
| Viewer (pimpinan, stakeholder) | Melihat progres, release, catatan, dan calendar tanpa risiko mengubah data |

## Role dan hak akses

### Matriks hak

Role menentukan aksi tulis. Menu yang bisa dibuka diatur terpisah lewat [akses menu](#akses-menu).

| Aksi | Superadmin | Admin | Developer | Viewer |
| --- | :---: | :---: | :---: | :---: |
| Membuka Settings: user, role, akses menu, activity | ✓ | – | – | – |
| Membuat, mengubah, menghapus release; Hold, Resume, Released | ✓ | ✓ | – | – |
| Archive dan Restore; Source settings; sync manual | ✓ | ✓ | – | – |
| Mengelola libur nasional dan cuti bersama | ✓ | ✓ | – | – |
| Membuat catatan; mengubah dan menghapus catatan miliknya | ✓ | ✓ | – | – |
| Berkomentar dan membalas di catatan; mengubah dan menghapus komentar miliknya | ✓ | ✓ | ✓ | – |
| Mencentang action item yang ditugaskan kepadanya | ✓ | ✓ | ✓ | – |
| Menambah Note pada activity release | ✓ | ✓ | ✓ | – |
| Mengubah dan menghapus entri activity release | Semua entri | Semua entri | Hanya Note miliknya | – |
| Melihat semua data di menu yang diizinkan | ✓ | ✓ | ✓ | ✓ |

**Aturan yang tetap berlaku**

- Catatan dan komentar hanya bisa diubah dan dihapus penulisnya, untuk semua role. Superadmin pun tidak bisa mengubah catatan milik orang lain.
- Entri sistem di activity release (Hold, Resume, Target change, Released) tetap tidak bisa dihapus.

### Superadmin

- Superadmin memiliki semua hak admin, ditambah Settings.
- Superadmin selalu bisa membuka semua menu, tidak terpengaruh matriks akses menu.
- Akun pemilik app (Otik) dijadikan superadmin pertama saat fitur ini dirilis. Pengubahan ini dijalankan sekali sebagai skrip data, bukan di file migrasi, agar email pribadi tidak tersimpan di repositori.

### Developer

- Developer melihat semua data seperti viewer.
- Di detail catatan, developer bisa:
  - menulis komentar baru,
  - membalas komentar,
  - mengubah dan menghapus komentar miliknya,
  - mencentang action item yang ditugaskan kepadanya.
- Di detail release, developer bisa menambah **Note** di activity, lalu mengubah atau menghapus Note miliknya sendiri.
- Developer tidak bisa:
  - mengubah entri activity orang lain,
  - mengubah atau menghapus entri sistem,
  - membuat catatan,
  - mengubah release, source, archive, maupun libur.

### Viewer

- Viewer hanya melihat.
- Di detail catatan, kotak komentar dan checkbox action item tidak ditampilkan. Komentar dan status action item tetap terbaca.
- Di detail release, form "Add note" tidak ditampilkan.
- Viewer tidak muncul di pilihan penanggung jawab action item, karena viewer tidak bisa mencentangnya.

> **Perubahan dari perilaku sekarang:** viewer saat ini masih bisa berkomentar di Notes dan mencentang action item miliknya ([PRD Notes dan Calendar](PRD-Note.md)). Kedua hak itu dipindahkan ke Developer. Komentar lama yang ditulis viewer tetap ada dan tetap terbaca, tetapi viewer tidak bisa lagi mengubah atau menghapusnya.

## Konsep dan aturan

### Role bawaan saat mendaftar

- Setiap akun yang baru mendaftar mendapat role **Viewer**, termasuk yang mendaftar lewat Google.
- Aturan lama "daftar lewat Google otomatis menjadi admin" ([PRD Login SSO Google](PRD-Login-SSO-Google.md)) dihapus.
- User yang dibuat superadmin dari Settings langsung mendapat role yang dipilih di form, tanpa sempat menjadi viewer lebih dulu.
- Akun yang sudah ada tidak berubah role-nya.
- Batas domain @envisions.app tetap berlaku untuk semua cara daftar.

### Akses menu

Superadmin mengatur matriks **menu × role** (Admin, Developer, Viewer).

**Akibat menu yang tidak diizinkan**
- Menu tidak tampil di sidebar.
- Bila URL-nya dibuka langsung, user dialihkan ke Dashboard dengan pesan "You don't have access to that page."
- Isi dari menu itu yang muncul di halaman lain ikut disembunyikan:
  - Notes dimatikan: kartu Notes di Dashboard dan item catatan serta action item di Calendar tidak tampil.
  - Release dimatikan: item release di Calendar tidak tampil.
  - Tujuannya agar tidak ada tautan ke halaman yang akan ditolak.
- Server action dari menu itu ditolak, meskipun role-nya punya hak menulis.

**Menu yang dikunci**

| Menu | Aturan | Alasan |
| --- | --- | --- |
| Dashboard | Selalu menyala untuk semua role | Halaman tujuan saat akses ke menu lain ditolak; mencegah redirect berulang |
| Source settings | Tidak bisa dinyalakan untuk Developer dan Viewer | Halamannya berupa form tulis |
| Settings | Hanya Superadmin, tidak tampil di matriks | Mengelola user dan akses |

**Seed awal** (sama dengan perilaku sekarang)

| Menu | Admin | Developer | Viewer |
| --- | :---: | :---: | :---: |
| Calendar | ✓ | ✓ | ✓ |
| Dashboard (terkunci) | ✓ | ✓ | ✓ |
| Task list | ✓ | ✓ | ✓ |
| Release | ✓ | ✓ | ✓ |
| Trend | ✓ | ✓ | ✓ |
| Notes | ✓ | ✓ | ✓ |
| Archive | ✓ | ✓ | ✓ |
| Source settings | ✓ | – (terkunci) | – (terkunci) |

### Menonaktifkan user

- User yang dinonaktifkan tidak bisa login, baik dengan password maupun Google. Pesan yang muncul: "Your account has been disabled. Contact a superadmin."
- Sesi yang sedang terbuka langsung berakhir pada permintaan berikutnya, tanpa menunggu token sesi kedaluwarsa.
- Data milik user itu tetap ada dan tetap menampilkan nama penulisnya: catatan, komentar, activity, dan action item.
- User nonaktif tidak muncul di pilihan penanggung jawab action item. Action item yang sudah ditugaskan kepadanya tetap ada.
- Setelah diaktifkan kembali, user bisa login seperti biasa dengan role yang sama.

### Pengaman

- Superadmin tidak bisa menurunkan role atau menonaktifkan **dirinya sendiri**. Barisnya di daftar user terkunci.
- Harus selalu ada **minimal satu superadmin aktif**. Perubahan yang membuat jumlahnya nol ditolak dengan pesan "At least one active superadmin is required."
- Kedua aturan dicek di server dan lagi di database.

### Menambah user dan reset password

- Superadmin mengisi:
  - email @envisions.app,
  - password awal (minimal 8 karakter),
  - role (bawaan Viewer).
- Akun langsung aktif dan emailnya dianggap terverifikasi.
- Superadmin menyampaikan password awal ke user lewat jalur lain. Setelah login, user bisa menggantinya di **Change password**.
- Bila email sudah terdaftar, form menampilkan "This email is already registered."
- Superadmin bisa **Reset password** user lain dengan mengisi password baru. Fitur ini juga berguna untuk user yang lupa password.
- User yang mendaftar lewat Google tetap bisa login lewat Google, walaupun superadmin mengisikan password untuknya.

### Activity perubahan user

Setiap perubahan dicatat dengan pelaku, waktu, dan detailnya:

- user ditambahkan,
- role diganti (dari → ke),
- user dinonaktifkan atau diaktifkan,
- password direset,
- akses menu diubah (menu yang ditambah atau dicabut per role).

Catatan ini hanya bisa dibaca superadmin, dan tidak bisa diubah atau dihapus dari app. Password tidak pernah dicatat.

### Nama dan istilah

| Istilah di tampilan | Arti |
| --- | --- |
| Superadmin, Admin, Developer, Viewer | Nama role |
| Active / Disabled | Status akun |
| Menu access | Matriks menu × role |
| Sign-in method | Cara login: Google atau Password |

Label di tampilan memakai bahasa Inggris, mengikuti bagian app yang lain.

## Antarmuka

### Menu dan alamat

| Alamat | Isi | Siapa |
| --- | --- | --- |
| `/pengaturan/pengguna` | Settings: tab Users, Menu access, dan Activity | Superadmin |

- Item **Settings** ditambahkan di grup **Manage** di sidebar, di bawah Source settings, hanya untuk superadmin.
- Label role di bagian bawah sidebar menampilkan Superadmin, Admin, Developer, atau Viewer.

### Tab Users

**Kolom tabel**

| Kolom | Isi |
| --- | --- |
| Email | Email user; baris milik sendiri diberi tanda "You" |
| Role | Dropdown empat role; perubahan langsung disimpan dengan konfirmasi singkat |
| Status | Active atau Disabled |
| Sign-in method | Google, Password, atau keduanya |
| Created | Tanggal akun dibuat |
| Last sign-in | Waktu terakhir login, atau "Never" |
| Aksi | Disable/Enable dan Reset password |

**Perilaku**
- Ada kotak pencarian email serta filter role dan status. Urutan bawaan: akun terbaru di atas, agar pendaftar baru (yang menjadi Viewer) mudah ditemukan.
- **Disable** dan **Reset password** membuka dialog konfirmasi.
- Baris milik sendiri tidak punya aksi dan role-nya tidak bisa diubah.
- Tombol **Add user** di kanan atas membuka dialog berisi Email, Initial password (dengan tombol tampilkan/sembunyikan), dan Role (bawaan Viewer).
- Di ponsel, tabel berubah menjadi daftar kartu per user.

### Tab Menu access

- Tabel menu (baris) × Admin, Developer, Viewer (kolom), berisi checkbox.
- Menu yang dikunci tampil redup dan tidak bisa diubah. Tooltip menjelaskan alasannya, misalnya "Always on" atau "Contains write forms".
- Perubahan baru disimpan setelah tombol **Save** diklik. Sebelum itu tampil "Unsaved changes", mengikuti pola Apply di filter Calendar dan detail release. Tombol **Discard** membatalkan perubahan.
- Ada catatan singkat: "Superadmin can always open every menu."

### Tab Activity

- Daftar 20 perubahan terakhir, terbaru di atas. Contoh:
  - "Otik changed budi@envisions.app: Viewer → Developer"
  - "Otik disabled sari@envisions.app"
  - "Otik updated menu access for Viewer: −Trend"
- Ada tombol **Load more**.

### Perubahan di halaman lain

**Detail catatan**
- Viewer tidak melihat kotak komentar, tombol Reply, maupun checkbox action item.
- Developer melihat semuanya seperti admin, tanpa tombol Edit dan Delete catatan.

**Form catatan:** pilihan penanggung jawab action item hanya berisi Superadmin, Admin, dan Developer yang aktif.

**Detail release**
- Developer melihat form "Add note" di Activity, dan menu Edit/Delete hanya pada Note miliknya.
- Tombol Edit, Hold, Released, dan Delete release tidak tampil untuk developer.

**Login:** ada pesan baru untuk akun yang dinonaktifkan.

**Dashboard:** ada pesan baru saat user dialihkan dari menu yang tidak diizinkan.

## Data dan migrasi

Satu migrasi baru: `supabase/migrations/20261125000000_rbac.sql`.

| Perubahan | Keterangan |
| --- | --- |
| Enum `user_role` | Tambah nilai `superadmin` dan `developer` |
| `profiles.disabled_at` | Waktu akun dinonaktifkan; kosong berarti aktif |
| `handle_new_user()` | Role bawaan `viewer`; memakai `initial_role` bila user dibuat dari Settings |
| Tabel `role_menu_access` | Satu baris per pasangan role dan menu yang diizinkan, beserta seed awal |
| Tabel `user_admin_events` | Activity perubahan user dan akses; hanya bisa dibaca superadmin |
| `is_admin()` | True untuk admin dan superadmin, sehingga aturan RLS yang ada tetap berlaku |
| Fungsi baru | `is_superadmin()`, `set_user_role`, `set_user_active`, `set_menu_access` |
| Fungsi yang diperketat | Fungsi komentar catatan, centang action item, serta tambah/ubah/hapus activity release menolak viewer dan user nonaktif; developer hanya boleh mengubah Note activity miliknya |

**Prinsip keamanan** (sama dengan fitur sebelumnya)
- Klien hanya membaca, dibatasi RLS.
- Semua penulisan lewat server action yang mengecek sesi di baris pertama, lalu fungsi database `security definer` yang hanya bisa dipanggil service role dan mengecek ulang haknya.
- Menonaktifkan user juga mem-ban akunnya di Supabase Auth, sehingga sesi tidak bisa diperbarui.

## Risiko dan keputusan terbuka

| Risiko atau keputusan | Penanganan |
| --- | --- |
| Admin yang ada sekarang (hasil daftar Google) tetap admin | Disengaja; superadmin meninjau dan menurunkannya lewat Settings bila perlu |
| Viewer lama kehilangan hak berkomentar | Disengaja; superadmin menaikkan user yang perlu ke Developer |
| Superadmin lupa password dan satu-satunya superadmin | Superadmin tetap bisa login dengan Google; pemulihan terakhir lewat skrip database |
| Password awal tersebar lewat chat | User disarankan langsung mengganti password; alur paksa ganti password saat login pertama masuk tahap berikutnya |
| Menu dimatikan, tetapi tautan dari luar (bookmark) masih dipakai | Ditolak di server dan dialihkan ke Dashboard dengan pesan |
| Developer menulis activity di release yang sedang Hold atau sudah dirilis | Diizinkan, sama dengan admin; activity adalah log, bukan perubahan release |

## Kriteria penerimaan

1. Akun pemilik app berstatus Superadmin dan melihat menu Settings.
2. Akun yang baru mendaftar, baik lewat Google maupun email, berstatus Viewer.
3. Superadmin bisa menambah user dengan email, password awal, dan role. User itu langsung bisa login dengan role tersebut.
4. Superadmin bisa mengganti role user lain, dan perubahannya langsung berlaku pada permintaan berikutnya user itu.
5. Superadmin bisa menonaktifkan user. Sesi user itu berakhir, login berikutnya ditolak dengan pesan yang jelas, dan setelah diaktifkan lagi user bisa login kembali.
6. Superadmin tidak bisa menurunkan atau menonaktifkan dirinya sendiri, dan tidak bisa membuat jumlah superadmin aktif menjadi nol.
7. Superadmin bisa mereset password user lain.
8. Mematikan sebuah menu untuk sebuah role:
   - menyembunyikannya dari sidebar,
   - membuat URL-nya dialihkan ke Dashboard,
   - menyembunyikan isinya di Dashboard dan Calendar,
   - membuat server action-nya ditolak.
9. Dashboard selalu menyala, dan Source settings tidak bisa dinyalakan untuk Developer dan Viewer.
10. Viewer tidak bisa melakukan aksi tulis apa pun, termasuk lewat pemanggilan server action langsung.
11. Developer bisa berkomentar dan membalas di catatan, mencentang action item miliknya, serta menambah, mengubah, dan menghapus Note activity miliknya di release.
12. Developer tidak bisa:
    - mengubah activity orang lain,
    - membuat catatan,
    - mengubah release, source, archive, maupun libur.
13. Admin bisa melakukan semua hal seperti sekarang, tetapi tidak bisa membuka Settings.
14. Semua perubahan user dan akses muncul di Activity dengan pelaku dan waktunya.
15. Halaman Settings tampil baik dalam mode terang, gelap, dan ponsel tanpa geser horizontal.

## Rencana rilis

1. Migrasi database, model role dan akses, sesi di server, dan role bawaan Viewer.
2. Penjaga di semua halaman dan server action (`requireMenu`, hak per aksi), lalu penyesuaian tombol di semua tampilan.
3. Role Developer di Notes (komentar, action item) dan di activity release.
4. Halaman Settings tab Users: daftar, role, Disable/Enable, Add user, Reset password.
5. Tab Menu access dan penerapannya di sidebar, Dashboard, dan Calendar.
6. Tab Activity, pesan login untuk akun nonaktif, dokumentasi, lalu menjadikan akun pemilik app sebagai superadmin.

## Tahap berikutnya

- Paksa ganti password saat login pertama untuk user yang dibuat dengan password awal.
- Undangan lewat email dan "lupa password" mandiri.
- Hak per aplikasi atau per release.
- Notifikasi ke user saat role atau statusnya berubah.
- Ekspor activity perubahan user.

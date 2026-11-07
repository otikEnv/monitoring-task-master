This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Web Monitoring Task Master

Dashboard hanya-baca yang menggabungkan `tasks.json` banyak repo. Spesifikasi: [PRD utama](PRD-Web-Monitoring-Task-Master.md) dan [PRD fitur Release](PRD-Fitur-Release-Tracking.md).

### Fitur Release

Menu **Release** melacak target rilis per aplikasi, misalnya "v2.1, task #100 sampai #200, target 20 November".

- **Membuat release (admin):** Release > Tambah release. Pilih aplikasi dan tag, isi nama/versi, task awal dan akhir (inklusif), tanggal target, dan opsional tanggal mulai (bawaannya tanggal release dibuat). Form menampilkan pratinjau jumlah task di rentang itu. Satu aplikasi boleh punya banyak release; satu release = satu aplikasi, satu tag, satu rentang.
- **Isi release dihitung, bukan disimpan:** semua task pada tag itu dengan ID angka di dalam rentang. ID yang bolong atau non-angka tidak dihitung; task baru di dalam rentang otomatis ikut setelah sinkronisasi.
- **Progres** = task selesai ÷ total. Total mencakup semua status; task ditunda dan dibatalkan tetap dihitung dan disorot di bagian "Perlu dievaluasi".
- **Penanda risiko** (aturan di `src/lib/releases/model.ts`): dibandingkan antara persen waktu yang sudah lewat (mulai ke target, kalender WIB) dan persen progres. Tertinggal lebih dari 10 poin = Berisiko, lebih dari 25 poin = Tertinggal; task terhambat atau dependensi di luar rentang yang belum selesai juga menandai Berisiko; target lewat dan belum 100% = Lewat target. Ini panduan, bukan prediksi.
- **Tandai rilis** (admin) mengisi tanggal rilis hari ini; bisa dibatalkan. Kartu aplikasi di Dashboard menampilkan release belum rilis dengan target terdekat.
- Semua pengguna login boleh melihat; hanya admin yang mengelola (RLS: peran klien hanya `SELECT`).

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

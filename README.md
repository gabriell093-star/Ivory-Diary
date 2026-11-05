# Ivory Diary

Website katalog layanan dan komunitas Ivory Diary. Dibangun menggunakan React, TypeScript, Vite, Supabase Postgres/Storage, dan Supabase Edge Function untuk area Owner.

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env`.
2. Isi `VITE_SUPABASE_PUBLISHABLE_KEY` dengan publishable key dari Supabase Project Settings → API Keys. Publishable key aman digunakan pada frontend; jangan pernah memasukkan service-role key ke variabel `VITE_*`.
3. Jalankan `npm install`.
4. Jalankan `npm run dev`.
5. Jalankan `npm run build` untuk pemeriksaan produksi.

## Integrasi Supabase

- Project ref: `nuwrawfbmtokqowibcrk`
- Project URL: `https://nuwrawfbmtokqowibcrk.supabase.co`
- Edge Function: `ivory-admin` (gateway JWT verification dimatikan; akses Owner tetap diverifikasi dengan token sesi acak yang disimpan sebagai hash).
- Storage bucket: `ivory-public` (publik hanya untuk membaca gambar; upload lewat fungsi Owner).

Folder `supabase/migrations` menyimpan skema, indeks, dan kebijakan akses yang diterapkan pada project.

## Akun Owner

Akun Owner hanya dibuat melalui SQL Editor Supabase. File `supabase/owner-setup.sql` adalah template dengan placeholder, bukan password. Jangan menyimpan password asli di Git. Gunakan password unik dan panjang.

## Dashboard Owner

Buka tautan **Owner access** di footer. Owner dapat mengelola layanan, testimoni (termasuk beberapa foto), staf, dan konten website. Setelah selesai mengedit, pilih **Keluar** agar halaman publik memuat data terbaru.

## Build dan publikasi Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables wajib: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ADMIN_FUNCTION_URL`

Jangan memasukkan `.env`, password Owner, Supabase service-role key, atau token Owner ke repository.

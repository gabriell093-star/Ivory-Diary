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

## Halaman publik dan tautan berbagi

Website menggunakan route terpisah:

- `/` — Beranda
- `/layanan` — Katalog dan order layanan
- `/testimoni` — Galeri hasil pekerjaan
- `/staff` — Profil staf
- `/respect-thread` — Arsip Respect Thread publik
- `/respect-thread/:slug` — Pembaca detail Respect Thread

Konfigurasi `vercel.json` mengarahkan direct URL dan refresh halaman ke aplikasi Vite. Metadata Open Graph dan Twitter berada di `index.html`; gambar share 1200×630 berada di `public/og-ivory-diary.png`. Jika Vercel terhubung ke GitHub, perubahan branch `main` perlu dipublikasikan melalui deployment terbaru. Platform pesan dapat menyimpan cache preview lama untuk sementara.

## Akun Owner

Akun Owner hanya dibuat melalui SQL Editor Supabase. File `supabase/owner-setup.sql` adalah template dengan placeholder, bukan password. Jangan menyimpan password asli di Git. Gunakan password unik dan panjang.

## Dashboard Owner

Buka tautan **Owner access** di footer. Owner dapat mengelola layanan, testimoni (dengan jumlah foto yang tidak dibatasi), staf, konten website, dan Respect Thread.

Respect Thread memiliki delapan bagian: Introduction (maksimal 2.000 kata) serta Terminology, Cosmology, Personality, BIQ, Statistics, Resistances, dan Hax & Ability (masing-masing maksimal 15.000 kata). Batas Statistics dihitung gabungan untuk Attack Potency, Durability, Speed, dan Stamina. Batas Resistances dan Hax & Ability juga dihitung gabungan untuk semua entri dan Feat di bagian masing-masing.

Introduction tidak menerima URL referensi dan hanya boleh memiliki satu foto. Tujuh bagian lainnya dapat memakai foto tanpa batas jumlah. Semua foto Respect Thread harus melewati cropper dan hasil akhirnya maksimal 3 MB per foto. Deskripsi tidak boleh memuat URL; letakkan satu URL lengkap HTTP(S) per item di bagian Link & teks referensi, atau gunakan teks biasa. Teks biasa pada referensi maksimal 100 kata per area editor; angka, penomoran, desimal, tanda plus/minus, dan simbol tetap diperbolehkan. Jumlah item referensi tidak dibatasi.

Pada Resistances dan Hax & Ability, Owner dapat membuat banyak entri dan menambahkan beberapa Feat pendukung pada setiap entri. Tombol penambahan Feat tetap tersedia pada toolbar daftar saat pengguna menggulir. Thread dapat disimpan sebagai draft atau dipublikasikan. Data hanya dapat ditulis melalui Edge Function dengan sesi Owner; pengunjung hanya dapat membaca thread yang dipublikasikan.

## Build dan publikasi Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables wajib: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ADMIN_FUNCTION_URL`

Jangan memasukkan `.env`, password Owner, Supabase service-role key, atau token Owner ke repository.

## Catatan sinkronisasi dan keamanan produksi

- Riwayat migrasi database harus tetap sejalan dengan berkas SQL di `supabase/migrations`. Jangan mengubah skema produksi secara manual tanpa menambahkan migrasi yang sesuai ke repositori.
- Frontend hanya boleh memakai `VITE_SUPABASE_PUBLISHABLE_KEY` (atau legacy anon key selama migrasi). Jangan pernah memasukkan `service_role` atau secret key ke variabel `VITE_*`.
- Operasi Owner (login, sesi, perubahan password, CRUD, dan upload) melewati Edge Function `ivory-admin`. Token Owner disimpan di `sessionStorage`, sedangkan database hanya menyimpan hash token.
- Tabel `owner_accounts`, `owner_sessions`, dan `owner_login_attempts` hanya boleh diakses server melalui `service_role`. Data katalog publik menggunakan kebijakan RLS baca-saja.
- Bucket `ivory-public` boleh dibaca publik agar gambar katalog tampil; penulisan dan penghapusan media harus tetap melalui Edge Function Owner.
- CORS Edge Function dibatasi ke domain produksi Ivory Diary serta localhost untuk pengembangan. CORS bukan pengganti autentikasi; setiap aksi administratif tetap memerlukan token Owner aktif.
- Setelah mengubah environment variables Vercel, buat deployment baru agar hasil build memakai nilai terbaru. Setelah perubahan Edge Function, pastikan versi aktif sama dengan kode di branch `main`.

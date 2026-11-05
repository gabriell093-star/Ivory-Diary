# Ivory Diary

Website katalog layanan komunitas Ivory Diary — React + TypeScript + Vite, Supabase Postgres/Storage, dan Edge Function untuk Owner.

## Menjalankan
1. Salin .env.example menjadi .env dan isi publishable key Supabase.
2. npm install
3. npm run dev

## Supabase
Project ref: nuwrawfbmtokqowibcrk
Edge Function: ivory-admin
Bucket: ivory-public
Migration awal telah diterapkan pada project.

Buat akun Owner dengan mengganti placeholder password pada supabase/owner-setup.sql menggunakan password unik yang kuat (minimal 12 karakter), lalu jalankan sekali di Supabase SQL Editor. Jangan commit password ke repository.

Deploy Vercel/Netlify: build command npm run build, output dist.

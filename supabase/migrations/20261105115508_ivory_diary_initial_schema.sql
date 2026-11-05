create extension if not exists pgcrypto with schema extensions;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null check (category in ('battle-boarding','debat-konvensional','akademis')),
  title text not null,
  description text not null default '',
  details text not null default '',
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed','tiered','per_unit','range')),
  price_label text not null default 'Hubungi staf',
  base_price integer check (base_price is null or base_price >= 0),
  unit_label text,
  options jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null default '',
  bio text not null default '',
  whatsapp_number text,
  photo_path text,
  is_visible boolean not null default true,
  is_detailed boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null default '',
  category text not null check (category in ('battle-boarding','debat-konvensional','akademis')),
  description text not null default '',
  work_date date not null default current_date,
  image_paths text[] not null default '{}'::text[],
  image_urls text[] not null default '{}'::text[],
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table public.owner_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table public.owner_login_attempts (
  id bigint generated always as identity primary key,
  username text not null,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index owner_login_attempts_lookup on public.owner_login_attempts (username, ip_hash, attempted_at desc);
create index owner_sessions_active_lookup on public.owner_sessions (token_hash, expires_at) where revoked_at is null;
create index testimonials_public_order on public.testimonials (is_published, work_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger staff_set_updated_at before update on public.staff for each row execute function public.set_updated_at();
create trigger testimonials_set_updated_at before update on public.testimonials for each row execute function public.set_updated_at();
create trigger site_content_set_updated_at before update on public.site_content for each row execute function public.set_updated_at();
create trigger owner_accounts_set_updated_at before update on public.owner_accounts for each row execute function public.set_updated_at();

create or replace function public.verify_owner_login(p_username text, p_password text)
returns table(owner_id uuid, username text, display_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.username, a.display_name
  from public.owner_accounts as a
  where a.username = lower(trim(p_username))
    and a.is_active = true
    and a.password_hash = extensions.crypt(p_password, a.password_hash)
  limit 1;
$$;

create or replace function public.change_owner_password(p_owner_id uuid, p_current_password text, p_new_password text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_new_password is null or length(p_new_password) < 12 then
    return false;
  end if;
  update public.owner_accounts
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12))
  where id = p_owner_id
    and is_active = true
    and password_hash = extensions.crypt(p_current_password, password_hash);
  return found;
end;
$$;

alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.testimonials enable row level security;
alter table public.site_content enable row level security;
alter table public.owner_accounts enable row level security;
alter table public.owner_sessions enable row level security;
alter table public.owner_login_attempts enable row level security;

create policy "Public can read active services" on public.services
for select to anon, authenticated using (is_active = true);
create policy "Public can read visible staff" on public.staff
for select to anon, authenticated using (is_visible = true);
create policy "Public can read published testimonials" on public.testimonials
for select to anon, authenticated using (is_published = true);
create policy "Public can read website copy" on public.site_content
for select to anon, authenticated using (true);

revoke all on public.owner_accounts from anon, authenticated;
revoke all on public.owner_sessions from anon, authenticated;
revoke all on public.owner_login_attempts from anon, authenticated;
grant all on public.owner_accounts to service_role;
grant all on public.owner_sessions to service_role;
grant all on public.owner_login_attempts to service_role;

grant select on public.services, public.staff, public.testimonials, public.site_content to anon, authenticated;
revoke insert, update, delete on public.services, public.staff, public.testimonials, public.site_content from anon, authenticated;
grant all on public.services, public.staff, public.testimonials, public.site_content to service_role;

revoke all on function public.verify_owner_login(text, text) from public, anon, authenticated;
grant execute on function public.verify_owner_login(text, text) to service_role;
revoke all on function public.change_owner_password(uuid, text, text) from public, anon, authenticated;
grant execute on function public.change_owner_password(uuid, text, text) to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;

insert into public.services (slug,category,title,description,details,pricing_type,price_label,base_price,unit_label,options,sort_order) values
('penilaian-debat','battle-boarding','Penilaian Debat','Penilaian debat berdasarkan tier yang dipilih.','Pilih Low, Mid, atau High Tier sesuai kebutuhan.','tiered','Rp11.000 – Rp20.000',null,null,'[{"label":"Low Tier","price":11000},{"label":"Mid Tier","price":14000},{"label":"High Tier","price":20000}]'::jsonb,1),
('joki-debat','battle-boarding','Joki Debat','Layanan joki debat untuk kebutuhan Battle Boarding.','Kategori atau karakter tertentu dapat termasuk dalam ketentuan High Tier.','tiered','Rp12.000 – Rp21.000',null,null,'[{"label":"Low Tier","price":12000},{"label":"Mid Tier","price":15000},{"label":"High Tier","price":21000}]'::jsonb,2),
('respect-thread','battle-boarding','Pembuatan Respect Thread','Penyusunan Respect Thread berdasarkan jumlah chapter.','Estimasi dihitung dari jumlah chapter dikalikan Rp700.','per_unit','Rp700 / chapter',700,'chapter','[]'::jsonb,3),
('kalkulasi-feats','battle-boarding','Pembuatan Kalkulasi','Pembuatan kalkulasi berdasarkan jumlah feats.','Estimasi dihitung dari jumlah feats dikalikan Rp10.000.','per_unit','Rp10.000 / feats',10000,'feats','[]'::jsonb,4),
('penilaian-pro-kontra','debat-konvensional','Penilaian Pro & Kontra / Debat','Penilaian dan analisis untuk berbagai subjek debat.','Harga tetap untuk layanan penilaian Pro & Kontra / Debat.','fixed','Rp20.000',20000,null,'[]'::jsonb,1),
('joki-pro-kontra','debat-konvensional','Joki Pro & Kontra / Debat','Bantuan penyusunan materi Pro & Kontra / Debat untuk berbagai subjek.','Detail kebutuhan dibicarakan lebih lanjut melalui WhatsApp.','fixed','Rp23.000',23000,null,'[]'::jsonb,2),
('pembuatan-esai','akademis','Pembuatan Esai','Penulisan esai untuk berbagai topik dengan pendekatan yang tidak generik.','Harga akhir dikonfirmasi berdasarkan kebutuhan melalui WhatsApp.','range','Rp30.000 – Rp50.000',null,null,'[]'::jsonb,1),
('pembuatan-artikel','akademis','Pembuatan Artikel','Pembuatan artikel untuk berbagai topik.','Harga akhir dikonfirmasi melalui WhatsApp.','range','Rp25.000 – Rp35.000',null,null,'[]'::jsonb,2),
('pembuatan-makalah','akademis','Pembuatan Makalah','Pembuatan makalah untuk berbagai topik.','Harga akhir dikonfirmasi melalui WhatsApp.','range','Rp25.000 – Rp35.000',null,null,'[]'::jsonb,3),
('pembuatan-ppt','akademis','Pembuatan PowerPoint / PPT','Pembuatan slide presentasi berdasarkan jumlah halaman.','Estimasi dihitung dari jumlah halaman dikalikan Rp3.000.','per_unit','Rp3.000 / halaman',3000,'halaman','[]'::jsonb,4)
on conflict (slug) do nothing;

insert into public.staff (slug,name,summary,bio,whatsapp_number,is_visible,is_detailed,sort_order) values
('gabriel','Gabriel','Debater yang berfokus pada analisis low dan mid tier, khususnya To Be Hero X.','Gabriel adalah debater yang berkecimpung di tanah low dan mid tier, terutama verse To Be Hero X. Tidak hanya handal dalam menganalisis, tetapi juga berkecukupan menjabarkannya secara proporsional. Sempat menerbitkan beberapa karya akademisnya tentang Filsafat, Politik, dan Teologi.','082228671206',true,true,1),
('maru','Maru','Debater aktif dengan cakupan berbagai verse populer hingga underrated.','Maru adalah debater yang cukup aktif berkecimpung dalam berbagai verse besar seperti Naruto, One Piece, My Hero Academia, hingga berbagai fiksi Manhwa yang tergolong underrated. Memiliki cakupan pengetahuan yang cukup luas dalam melakukan Scaling maupun analisis terhadap berbagai verse.','085761300772',true,true,2)
on conflict (slug) do nothing;

insert into public.site_content (key,value) values
('hero_eyebrow','COMMUNITY · ANALYSIS · ACADEMIC'),
('hero_title','Ivory Diary'),
('hero_description','Ivory Diary adalah sebuah komunitas yang menyediakan layanan kebutuhan Battle Boarding, Debat Konvensional, dan Kebutuhan Akademis.'),
('about_description','Kami berorientasi pada kualitas hasil pekerjaan, waktu pengerjaan yang sesuai kebutuhan, dan privasi konsumen.'),
('order_note','Pembayaran menggunakan QRIS dan proses pembayaran akan dikonfirmasi lebih lanjut melalui Staff Ivory Diary melalui WhatsApp.')
on conflict (key) do nothing;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ivory-public','ivory-public',true,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "Public can view Ivory Diary media" on storage.objects
for select to public using (bucket_id='ivory-public');

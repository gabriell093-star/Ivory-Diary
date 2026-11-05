-- Replace both placeholders with strong unique passwords (12+ chars).
-- Run once in Supabase SQL Editor. Never commit real passwords.
insert into public.owner_accounts (username, display_name, password_hash)
values ('ellias8890','Ellias',extensions.crypt('REPLACE_WITH_STRONG_PASSWORD_1',extensions.gen_salt('bf',12))),
('maru7778','Maru',extensions.crypt('REPLACE_WITH_STRONG_PASSWORD_2',extensions.gen_salt('bf',12)))
on conflict (username) do update set display_name=excluded.display_name,password_hash=excluded.password_hash,is_active=true;
select username,display_name,is_active from public.owner_accounts order by username;

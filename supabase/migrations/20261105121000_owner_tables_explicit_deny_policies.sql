-- Owner data is accessible only through the server-side Edge Function.
create policy "Block public owner account access" on public.owner_accounts
for all to anon, authenticated using (false) with check (false);

create policy "Block public owner session access" on public.owner_sessions
for all to anon, authenticated using (false) with check (false);

create policy "Block public owner login attempt access" on public.owner_login_attempts
for all to anon, authenticated using (false) with check (false);

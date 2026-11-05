-- Restrict public Data API access to read-only content queries.
-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER table privileges.
revoke all privileges on all tables in schema public from public, anon, authenticated;

grant select on table
  public.services,
  public.staff,
  public.testimonials,
  public.site_content
to anon, authenticated;

-- Owner credentials, sessions, and login attempts stay server-only.
revoke all privileges on table
  public.owner_accounts,
  public.owner_sessions,
  public.owner_login_attempts
from public, anon, authenticated;

-- Keep public bucket media readable; all writes remain behind the Owner
-- Edge Function using service_role.
revoke all privileges on table storage.objects from public, anon, authenticated;
grant select on table storage.objects to anon, authenticated;

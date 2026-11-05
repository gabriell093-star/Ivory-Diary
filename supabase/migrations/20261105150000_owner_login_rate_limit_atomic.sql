create index if not exists owner_login_attempts_ip_lookup
  on public.owner_login_attempts (ip_hash, attempted_at desc);

create index if not exists owner_login_attempts_age_lookup
  on public.owner_login_attempts (attempted_at);

create or replace function public.consume_owner_login_attempt(
  p_username text,
  p_ip_hash text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ip_attempts bigint;
  v_user_attempts bigint;
begin
  if p_username is null
     or length(p_username) < 1
     or length(p_username) > 40
     or p_ip_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  -- Serialize requests by IP and username to make the rate limit atomic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ip:' || p_ip_hash, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user:' || p_username, 0)
  );

  -- Keep failed login attempts from accumulating indefinitely.
  delete from public.owner_login_attempts
  where attempted_at < pg_catalog.now() - interval '24 hours';

  select
    count(*) filter (where ip_hash = p_ip_hash),
    count(*) filter (where username = p_username)
  into v_ip_attempts, v_user_attempts
  from public.owner_login_attempts
  where attempted_at >= pg_catalog.now() - interval '15 minutes'
    and (ip_hash = p_ip_hash or username = p_username);

  if v_ip_attempts >= 8 or v_user_attempts >= 8 then
    return false;
  end if;

  insert into public.owner_login_attempts (username, ip_hash)
  values (p_username, p_ip_hash);

  return true;
end;
$$;

revoke all on function public.consume_owner_login_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_owner_login_attempt(text, text)
  to service_role;

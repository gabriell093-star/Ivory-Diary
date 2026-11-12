CREATE OR REPLACE FUNCTION public.change_owner_password(
  p_owner_id uuid,
  p_current_password text,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid;
BEGIN
  IF p_owner_id IS NULL
     OR p_current_password IS NULL
     OR length(p_current_password) > 200
     OR p_new_password IS NULL
     OR length(p_new_password) < 12
     OR length(p_new_password) > 200 THEN
    RETURN false;
  END IF;

  UPDATE public.owner_accounts
  SET password_hash = extensions.crypt(
    p_new_password,
    extensions.gen_salt('bf', 12)
  )
  WHERE id = p_owner_id
    AND is_active = true
    AND password_hash = extensions.crypt(p_current_password, password_hash)
  RETURNING id INTO v_owner_id;

  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Revoke every outstanding session in the same transaction as the password
  -- update. If session revocation fails, PostgreSQL rolls the password change back.
  UPDATE public.owner_sessions
  SET revoked_at = pg_catalog.now()
  WHERE owner_id = v_owner_id
    AND revoked_at IS NULL;

  RETURN true;
END;
$function$;

REVOKE ALL PRIVILEGES ON SEQUENCE public.owner_login_attempts_id_seq
  FROM PUBLIC, anon, authenticated;

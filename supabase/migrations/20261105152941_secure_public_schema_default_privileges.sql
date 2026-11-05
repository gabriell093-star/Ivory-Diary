-- Future tables, sequences, and functions created by postgres in public
-- must not automatically expose privileges to anon/authenticated roles.
-- New public tables must grant SELECT explicitly in their own migration.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

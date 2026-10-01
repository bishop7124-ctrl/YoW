-- Correct the default-function privilege hardening from 20260914223000.
--
-- PostgreSQL merges schema-scoped default privileges with its built-in
-- defaults, so an IN SCHEMA revoke cannot remove the built-in EXECUTE grant
-- to PUBLIC. Revoke PUBLIC without a schema qualifier, then separately remove
-- Supabase's explicit anon/authenticated defaults in the exposed public schema.
-- Existing function ACLs are already handled by 20260914223000; this migration
-- changes defaults for functions created by this migration role in the future.

ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

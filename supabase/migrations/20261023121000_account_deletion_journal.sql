-- Additive rollout: existing delete_user stays available to older clients.
-- A durable, idempotent deletion request must precede irreversible Storage cleanup.
-- No FK: this minimal journal must survive auth.users deletion.
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prepare_account_deletion()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.account_deletion_requests(user_id) VALUES(caller_id)
    ON CONFLICT(user_id) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.prepare_account_deletion()
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.prepare_account_deletion();
$$;

CREATE OR REPLACE FUNCTION private.complete_account_deletion()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = caller_id) THEN
    RAISE EXCEPTION 'Prepare account deletion before removing media';
  END IF;
  PERFORM private.delete_user();
  UPDATE public.account_deletion_requests SET completed_at = now() WHERE user_id = caller_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_account_deletion()
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.complete_account_deletion();
$$;
REVOKE ALL ON FUNCTION private.prepare_account_deletion(), private.complete_account_deletion(),
  public.prepare_account_deletion(), public.complete_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.prepare_account_deletion(), private.complete_account_deletion(),
  public.prepare_account_deletion(), public.complete_account_deletion() TO authenticated;

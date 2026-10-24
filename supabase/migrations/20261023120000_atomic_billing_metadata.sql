-- Deploy before the webhook code. No fallback to an unsafe admin API write.
-- Durable invoice IDs prevent an old invoice replay from extending again after
-- a later invoice has replaced maintenance_last_invoice_id.
CREATE TABLE IF NOT EXISTS public.billing_applied_invoices (
  invoice_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_applied_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_applied_invoices FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_billing_metadata(
  p_user_id uuid, p_expected jsonb, p_next jsonb, p_invoice_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_metadata jsonb;
BEGIN
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_next) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Billing metadata must be objects';
  END IF;
  SELECT coalesce(raw_app_meta_data, '{}'::jsonb) INTO current_metadata
    FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.billing_applied_invoices WHERE invoice_id = p_invoice_id AND user_id = p_user_id
  ) THEN RETURN true; END IF;
  IF current_metadata IS DISTINCT FROM p_expected THEN RETURN false; END IF;
  UPDATE auth.users SET raw_app_meta_data = p_next, updated_at = now() WHERE id = p_user_id;
  IF p_invoice_id IS NOT NULL THEN
    INSERT INTO public.billing_applied_invoices(invoice_id, user_id) VALUES (p_invoice_id, p_user_id);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_billing_metadata(uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_metadata(uuid, jsonb, jsonb, text) TO service_role;

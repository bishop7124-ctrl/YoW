-- Audit YOW-09: distinguish an event that is still being fulfilled from one that finished.
-- api/stripe-webhook.js claims an event as 'processing' with a timestamp, marks it 'done' after the
-- entitlement writes succeed, and takes over a 'processing' claim older than 5 minutes (its worker
-- died). Existing rows were completed claims, so they default to 'done'. The webhook also works
-- before this migration is applied (it falls back to claim-only behaviour).
ALTER TABLE public.stripe_processed_events
  ADD COLUMN IF NOT EXISTS status       TEXT        NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.stripe_processed_events
  DROP CONSTRAINT IF EXISTS stripe_processed_events_status_check;
ALTER TABLE public.stripe_processed_events
  ADD CONSTRAINT stripe_processed_events_status_check CHECK (status IN ('processing', 'done'));

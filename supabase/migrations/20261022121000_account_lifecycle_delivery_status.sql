-- Audit YOW-11: record whether a lifecycle notice was actually accepted by the email provider.
-- The runner writes 'pending' before sending, then 'accepted' (provider took it) or 'unknown'
-- (network outcome uncertain). Only an 'accepted' final notice allows archiving or deleting an
-- account; pending/unknown final notices hold the irreversible step and are re-sent after a day.
-- Rows that existed before this column count as accepted (they were only kept when sent or unknown,
-- and automatic sending has not been enabled in production). Apply before enabling any lifecycle
-- switch.
ALTER TABLE public.account_lifecycle_events
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'accepted';

ALTER TABLE public.account_lifecycle_events
  DROP CONSTRAINT IF EXISTS account_lifecycle_events_delivery_status_check;
ALTER TABLE public.account_lifecycle_events
  ADD CONSTRAINT account_lifecycle_events_delivery_status_check CHECK (delivery_status IN ('pending', 'accepted', 'unknown'));

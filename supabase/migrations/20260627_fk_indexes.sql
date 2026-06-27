-- Add missing user_id indexes for tables with unindexed foreign keys.
-- Addresses Supabase linter: unindexed_foreign_keys on ai_findings, character_interviews, feedback.

CREATE INDEX IF NOT EXISTS idx_ai_findings_user_id          ON public.ai_findings          (user_id);
CREATE INDEX IF NOT EXISTS idx_character_interviews_user_id ON public.character_interviews (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id             ON public.feedback             (user_id);

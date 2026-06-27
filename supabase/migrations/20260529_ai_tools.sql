-- AI Tools: findings and character interviews
-- Apply in Supabase dashboard → SQL editor

create table if not exists public.ai_findings (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  project_id  text        not null,
  tool_type   text        not null check (tool_type in ('plot_hole', 'lore_conflict', 'style_consistency')),
  title       text        not null,
  severity    text        default 'medium' check (severity in ('low', 'medium', 'high')),
  status      text        default 'unresolved' check (status in ('unresolved', 'accepted', 'dismissed', 'fixed', 'intentional')),
  source_refs jsonb       default '[]'::jsonb,
  evidence    jsonb       default '{}'::jsonb,
  suggestion  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.character_interviews (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  project_id   text        not null,
  character_id text        not null,
  mode         text        default 'general',
  messages     jsonb       default '[]'::jsonb,
  saved_notes  jsonb       default '[]'::jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.ai_findings         enable row level security;
alter table public.character_interviews enable row level security;

drop policy if exists "Users manage own findings" on public.ai_findings;
create policy "Users manage own findings"
  on public.ai_findings
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own interviews" on public.character_interviews;
create policy "Users manage own interviews"
  on public.character_interviews
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Update timestamp trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_findings_updated_at on public.ai_findings;
create trigger ai_findings_updated_at
  before update on public.ai_findings
  for each row execute function public.set_updated_at();

drop trigger if exists character_interviews_updated_at on public.character_interviews;
create trigger character_interviews_updated_at
  before update on public.character_interviews
  for each row execute function public.set_updated_at();

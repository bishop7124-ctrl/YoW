-- Feedback / support submissions table
-- Apply this in your Supabase dashboard → SQL editor

create table if not exists public.feedback (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now() not null,
  user_id     uuid        references auth.users(id) on delete set null,
  type        text        not null check (type in ('support', 'feature_request')),
  category    text,
  title       text        not null,
  message     text        not null,
  email       text,
  name        text,
  status      text        default 'open' check (status in ('open', 'reviewed', 'planned', 'done', 'closed'))
);

-- Enable row-level security
alter table public.feedback enable row level security;

-- Anyone (logged in or anonymous) can insert
drop policy if exists "Anyone can submit feedback" on public.feedback;
create policy "Anyone can submit feedback"
  on public.feedback
  for insert
  with check (true);

-- Authenticated users can read their own submissions
drop policy if exists "Users can read own feedback" on public.feedback;
create policy "Users can read own feedback"
  on public.feedback
  for select
  using (auth.uid() = user_id);

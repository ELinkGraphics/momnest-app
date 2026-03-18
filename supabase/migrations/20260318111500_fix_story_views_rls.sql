-- Fix Story View RLS Policies to allow viewers to upsert their records

-- 1. Allow viewers to select their own view records (needed for upsert conflict detection)
create policy "Users can view their own story views"
  on public.story_views for select
  using (auth.uid() = viewer_id);

-- 2. Allow viewers to update their own view records (needed for timestamp refreshes on re-watch)
create policy "Users can update their own story views"
  on public.story_views for update
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id);

-- Note: The "Authenticated users can view stories" policy (for insert) 
-- already exists in the initial migration but we ensure it works correctly.

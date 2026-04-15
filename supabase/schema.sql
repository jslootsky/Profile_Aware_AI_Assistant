create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.wedding_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile_json jsonb not null,
  custom_budget_sections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wedding_profiles
  add column if not exists custom_budget_sections jsonb not null default '[]'::jsonb;

update public.wedding_profiles
set custom_budget_sections = coalesce(profile_json -> 'customBudgetSections', '[]'::jsonb)
where custom_budget_sections = '[]'::jsonb
  and profile_json ? 'customBudgetSections';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wedding_profiles'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    alter table public.wedding_profiles
      alter column user_id type uuid
      using nullif(user_id::text, '')::uuid;
  end if;
end $$;

create table if not exists public.planner_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid,
  base_task text,
  previous_output_json jsonb,
  current_output_json jsonb,
  revision_request text,
  task text not null,
  refinement text,
  report_json jsonb not null,
  rating text,
  feedback text,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planner_sessions'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    alter table public.planner_sessions
      alter column user_id type uuid
      using nullif(user_id::text, '')::uuid;
  end if;
end $$;

alter table public.planner_sessions
  add column if not exists thread_id uuid,
  add column if not exists base_task text,
  add column if not exists previous_output_json jsonb,
  add column if not exists current_output_json jsonb,
  add column if not exists revision_request text;

update public.planner_sessions
set
  thread_id = coalesce(thread_id, id),
  base_task = coalesce(base_task, task),
  current_output_json = coalesce(current_output_json, report_json),
  revision_request = coalesce(revision_request, refinement)
where thread_id is null
   or base_task is null
   or current_output_json is null;

create index if not exists planner_sessions_user_id_idx
  on public.planner_sessions (user_id);

create index if not exists planner_sessions_thread_id_idx
  on public.planner_sessions (thread_id);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_documents'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    alter table public.knowledge_documents
      alter column user_id type uuid
      using nullif(user_id::text, '')::uuid;
  end if;
end $$;

create index if not exists knowledge_documents_user_id_idx
  on public.knowledge_documents (user_id);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null
);

create index if not exists knowledge_chunks_metadata_idx
  on public.knowledge_chunks using gin (metadata);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists public.saved_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  region text not null,
  website_url text not null,
  description text not null default '',
  source text not null default 'Vendor chatbot',
  created_at timestamptz not null default now(),
  unique (user_id, website_url)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_vendors'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    alter table public.saved_vendors
      alter column user_id type uuid
      using nullif(user_id::text, '')::uuid;
  end if;
end $$;

create index if not exists saved_vendors_user_id_idx
  on public.saved_vendors (user_id);

alter table public.wedding_profiles enable row level security;
alter table public.planner_sessions enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.saved_vendors enable row level security;

drop policy if exists "wedding_profiles_owner_select" on public.wedding_profiles;
create policy "wedding_profiles_owner_select"
  on public.wedding_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "wedding_profiles_owner_write" on public.wedding_profiles;
create policy "wedding_profiles_owner_write"
  on public.wedding_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "planner_sessions_owner_select" on public.planner_sessions;
create policy "planner_sessions_owner_select"
  on public.planner_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "planner_sessions_owner_write" on public.planner_sessions;
create policy "planner_sessions_owner_write"
  on public.planner_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_documents_owner_select" on public.knowledge_documents;
create policy "knowledge_documents_owner_select"
  on public.knowledge_documents for select
  using (auth.uid() = user_id);

drop policy if exists "knowledge_documents_owner_write" on public.knowledge_documents;
create policy "knowledge_documents_owner_write"
  on public.knowledge_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_owner_select" on public.knowledge_chunks;
create policy "knowledge_chunks_owner_select"
  on public.knowledge_chunks for select
  using (
    metadata ? 'user_id'
    and nullif(metadata ->> 'user_id', '') is not null
    and (metadata ->> 'user_id') = auth.uid()::text
  );

drop policy if exists "knowledge_chunks_owner_write" on public.knowledge_chunks;
create policy "knowledge_chunks_owner_write"
  on public.knowledge_chunks for all
  using (
    metadata ? 'user_id'
    and nullif(metadata ->> 'user_id', '') is not null
    and (metadata ->> 'user_id') = auth.uid()::text
  )
  with check (
    metadata ? 'user_id'
    and nullif(metadata ->> 'user_id', '') is not null
    and (metadata ->> 'user_id') = auth.uid()::text
  );

drop policy if exists "saved_vendors_owner_select" on public.saved_vendors;
create policy "saved_vendors_owner_select"
  on public.saved_vendors for select
  using (auth.uid() = user_id);

drop policy if exists "saved_vendors_owner_write" on public.saved_vendors;
create policy "saved_vendors_owner_write"
  on public.saved_vendors for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.match_knowledge_chunks (
  query_embedding vector(1536),
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.content,
    knowledge_chunks.metadata,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  where knowledge_chunks.metadata @> filter
  order by knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.touch_knowledge_document_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_knowledge_documents_updated_at
  on public.knowledge_documents;

create trigger set_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row
execute function public.touch_knowledge_document_updated_at();

create or replace function public.touch_wedding_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wedding_profiles_updated_at
  on public.wedding_profiles;

create trigger set_wedding_profiles_updated_at
before update on public.wedding_profiles
for each row
execute function public.touch_wedding_profiles_updated_at();

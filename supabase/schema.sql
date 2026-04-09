create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.wedding_profiles (
  user_id text primary key,
  profile_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.wedding_profiles disable row level security;

create table if not exists public.planner_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task text not null,
  refinement text,
  report_json jsonb not null,
  rating text,
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists planner_sessions_user_id_idx
  on public.planner_sessions (user_id);

alter table public.planner_sessions disable row level security;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_documents_user_id_idx
  on public.knowledge_documents (user_id);

alter table public.knowledge_documents disable row level security;

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

alter table public.knowledge_chunks disable row level security;

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

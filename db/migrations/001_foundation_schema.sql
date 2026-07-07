create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null default '',
  source_type text not null default 'markdown',
  status text not null default 'ready',
  content_sha256 text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists documents_user_id_idx on documents(user_id);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_id text not null,
  chunk_index integer not null check (chunk_index >= 0),
  heading_path text[] not null default array[]::text[],
  content text not null,
  content_sha256 text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  retrieval_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_id),
  unique (document_id, id)
);

create index if not exists document_chunks_document_id_idx on document_chunks(document_id);

create table if not exists document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  summary text not null,
  entities jsonb not null default '[]'::jsonb,
  obligations jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  uncertainties jsonb not null default '[]'::jsonb,
  provider text not null,
  model text not null,
  prompt_id text not null,
  prompt_version text not null,
  context_strategy text not null default 'analysis_full_document',
  thinking_mode text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  token_estimate integer check (token_estimate is null or token_estimate >= 0),
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_analyses_document_id_idx on document_analyses(document_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider text,
  model text,
  prompt_id text,
  prompt_version text,
  context_strategy text not null default 'rag',
  fallback_reason text,
  retrieval_score_summary jsonb not null default '{}'::jsonb,
  retrieved_chunk_ids text[] not null default array[]::text[],
  token_estimate integer check (token_estimate is null or token_estimate >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, document_id)
);

create index if not exists chat_messages_document_id_idx on chat_messages(document_id);
create index if not exists chat_messages_user_id_idx on chat_messages(user_id);

create table if not exists message_citations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  message_id uuid not null references chat_messages(id) on delete cascade,
  chunk_id uuid not null references document_chunks(id) on delete cascade,
  chunk_stable_id text not null,
  quote text,
  citation_index integer not null check (citation_index >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (message_id, citation_index),
  foreign key (message_id, document_id) references chat_messages(id, document_id) on delete cascade,
  foreign key (chunk_id, document_id) references document_chunks(id, document_id) on delete cascade,
  foreign key (document_id, chunk_stable_id) references document_chunks(document_id, chunk_id) on delete cascade
);

create index if not exists message_citations_message_id_idx on message_citations(message_id);
create index if not exists message_citations_chunk_id_idx on message_citations(chunk_id);

create table if not exists ai_prompts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  analysis_id uuid references document_analyses(id) on delete cascade,
  message_id uuid references chat_messages(id) on delete cascade,
  prompt_id text not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  context_strategy text not null,
  fallback_reason text,
  thinking_mode text,
  retrieved_chunk_ids text[] not null default array[]::text[],
  prompt_metadata jsonb not null default '{}'::jsonb,
  token_estimate integer check (token_estimate is null or token_estimate >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  check (document_id is not null or analysis_id is not null or message_id is not null)
);

create index if not exists ai_prompts_prompt_id_version_idx on ai_prompts(prompt_id, prompt_version);
create index if not exists ai_prompts_document_id_idx on ai_prompts(document_id);

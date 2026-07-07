create extension if not exists vector;

alter table documents
  add column if not exists embedding_provider text,
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists embedding_status text,
  add column if not exists embedding_chunks_total integer not null default 0,
  add column if not exists embedding_chunks_embedded integer not null default 0,
  add column if not exists embedding_coverage jsonb not null default '{}'::jsonb,
  add column if not exists embedding_updated_at timestamptz;

alter table document_chunks
  add column if not exists embedding vector(384),
  add column if not exists embedding_provider text,
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists embedding_status text,
  add column if not exists embedding_metadata jsonb not null default '{}'::jsonb,
  add column if not exists embedded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_embedding_dimensions_check'
  ) then
    alter table documents
      add constraint documents_embedding_dimensions_check
      check (embedding_dimensions is null or embedding_dimensions = 384);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_embedding_chunks_total_check'
  ) then
    alter table documents
      add constraint documents_embedding_chunks_total_check
      check (embedding_chunks_total >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_embedding_chunks_embedded_check'
  ) then
    alter table documents
      add constraint documents_embedding_chunks_embedded_check
      check (embedding_chunks_embedded >= 0 and embedding_chunks_embedded <= embedding_chunks_total);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'document_chunks_embedding_dimensions_check'
  ) then
    alter table document_chunks
      add constraint document_chunks_embedding_dimensions_check
      check (embedding_dimensions is null or embedding_dimensions = 384);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'document_chunks_embedding_ready_has_vector_check'
  ) then
    alter table document_chunks
      add constraint document_chunks_embedding_ready_has_vector_check
      check (embedding_status is distinct from 'ready' or embedding is not null);
  end if;
end $$;

create index if not exists document_chunks_embedding_hnsw_idx
  on document_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists document_chunks_embedding_coverage_idx
  on document_chunks(document_id, embedding_status)
  where embedding_status is distinct from 'ready' or embedding is null;

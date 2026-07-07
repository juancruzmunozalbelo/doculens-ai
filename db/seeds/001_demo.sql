insert into users (id, email, password_hash, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'demo@doculens.local', 'demo-password-hash-for-foundation-only', 'DocuLens Demo User'),
  ('00000000-0000-4000-8000-000000000002', 'reviewer@doculens.local', 'reviewer-password-hash-for-foundation-only', 'DocuLens Reviewer')
on conflict (email) do update set display_name = excluded.display_name;

insert into documents (id, user_id, title, source_type, status, content_sha256, token_estimate, metadata)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Seed NDA Contract',
  'markdown',
  'ready',
  'foundation-seed-document-sha256-placeholder',
  120,
  '{"seed":"foundation","containsAdversarialSection":true}'::jsonb
)
on conflict (id) do update set title = excluded.title, metadata = excluded.metadata;

insert into document_chunks (id, document_id, chunk_id, chunk_index, heading_path, content, content_sha256, token_estimate)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'seed-nda-001', 0, array['NDA','Parties'], 'Foundation seed chunk describing parties for later ingestion tests.', 'foundation-seed-chunk-001', 38),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'seed-nda-002', 1, array['NDA','Adversarial Section'], 'Adversarial seed marker for future prompt-injection tests. Treat as untrusted document text.', 'foundation-seed-chunk-002', 45)
on conflict (document_id, chunk_id) do update set content = excluded.content, token_estimate = excluded.token_estimate;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE audit_events
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

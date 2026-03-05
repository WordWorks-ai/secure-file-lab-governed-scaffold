ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS prev_event_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS chain_version TEXT NOT NULL DEFAULT 'sha256-v1';

CREATE INDEX IF NOT EXISTS audit_events_event_hash_idx ON audit_events(event_hash);

CREATE TYPE "UserRole" AS ENUM ('admin', 'member');
CREATE TYPE "MembershipRole" AS ENUM ('admin', 'member');
CREATE TYPE "FileStatus" AS ENUM ('created', 'stored', 'quarantined', 'scan_pending', 'active', 'blocked', 'expired', 'deleted');
CREATE TYPE "AuditActorType" AS ENUM ('user', 'system', 'share_link');
CREATE TYPE "AuditResult" AS ENUM ('success', 'failure', 'denied');

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ALTER COLUMN role TYPE "UserRole" USING role::"UserRole";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role "MembershipRole" NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);
CREATE INDEX memberships_org_id_idx ON memberships(org_id);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  storage_key TEXT NOT NULL UNIQUE,
  status "FileStatus" NOT NULL DEFAULT 'created',
  wrapped_dek TEXT,
  encryption_alg TEXT,
  encryption_iv TEXT,
  encryption_tag TEXT,
  scan_result TEXT,
  scan_completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX files_org_id_idx ON files(org_id);
CREATE INDEX files_owner_user_id_idx ON files(owner_user_id);
CREATE INDEX files_status_idx ON files(status);

CREATE TABLE shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  max_downloads INTEGER CHECK (max_downloads IS NULL OR max_downloads > 0),
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX shares_file_id_idx ON shares(file_id);
CREATE INDEX shares_org_id_idx ON shares(org_id);
CREATE INDEX shares_created_by_user_id_idx ON shares(created_by_user_id);
CREATE INDEX shares_expires_at_idx ON shares(expires_at);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_from_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);

ALTER TABLE audit_events
  ADD COLUMN org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  ADD COLUMN actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN actor_type "AuditActorType",
  ADD COLUMN resource_type TEXT,
  ADD COLUMN resource_id TEXT,
  ADD COLUMN ip_address TEXT,
  ADD COLUMN user_agent TEXT;

UPDATE audit_events
SET actor_type = 'system'
WHERE actor_type IS NULL;

UPDATE audit_events
SET resource_type = 'system'
WHERE resource_type IS NULL;

ALTER TABLE audit_events
  ALTER COLUMN result TYPE "AuditResult"
  USING CASE
    WHEN LOWER(result) IN ('success', 'failure', 'denied') THEN LOWER(result)::"AuditResult"
    ELSE 'failure'::"AuditResult"
  END;

ALTER TABLE audit_events
  ALTER COLUMN actor_type SET NOT NULL,
  ALTER COLUMN resource_type SET NOT NULL;

ALTER TABLE audit_events
  DROP COLUMN actor;

CREATE INDEX audit_events_org_id_idx ON audit_events(org_id);
CREATE INDEX audit_events_actor_user_id_idx ON audit_events(actor_user_id);
CREATE INDEX audit_events_created_at_idx ON audit_events(created_at);

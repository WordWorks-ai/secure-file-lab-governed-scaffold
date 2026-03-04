CREATE TABLE file_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  preview_text TEXT,
  preview_generated_at TIMESTAMPTZ,
  ocr_text TEXT,
  ocr_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX file_artifacts_updated_at_idx ON file_artifacts(updated_at);

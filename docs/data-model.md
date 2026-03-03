# Data Model (Planned Baseline)

## Status Note

This document describes the target data model. Current implemented schema is a scaffold subset: `users`, `bootstrap_state`, and `audit_events`.

## Core Entities

## users

- `id` (uuid)
- `email` (unique)
- `password_hash`
- `is_active`
- `created_at`
- `updated_at`

## orgs

- `id` (uuid)
- `name`
- `slug` (unique)
- `created_at`

## memberships

- `id` (uuid)
- `user_id` (fk users)
- `org_id` (fk orgs)
- `role` (`admin`/`member`)
- unique (`user_id`, `org_id`)

## files

- `id` (uuid)
- `org_id` (fk orgs)
- `owner_user_id` (fk users)
- `filename`
- `content_type`
- `size_bytes`
- `storage_key`
- `status` (`created`, `stored`, `quarantined`, `scan_pending`, `active`, `blocked`, `expired`, `deleted`)
- `wrapped_dek`
- `encryption_alg`
- `encryption_iv`
- `encryption_tag`
- `scan_result`
- `scan_completed_at`
- `expires_at`
- `deleted_at`
- `created_at`
- `updated_at`

## shares

- `id` (uuid)
- `file_id` (fk files)
- `org_id` (fk orgs)
- `created_by_user_id` (fk users)
- `token_hash`
- `password_hash` (nullable)
- `max_downloads` (nullable)
- `download_count`
- `expires_at`
- `revoked_at` (nullable)
- `created_at`

## refresh_tokens

- `id` (uuid)
- `user_id` (fk users)
- `token_hash`
- `issued_at`
- `expires_at`
- `rotated_from_token_id` (nullable fk refresh_tokens)
- `revoked_at` (nullable)
- `replaced_by_token_id` (nullable fk refresh_tokens)

## audit_events

- `id` (uuid)
- `org_id` (nullable fk orgs)
- `actor_user_id` (nullable fk users)
- `actor_type` (`user`, `system`, `share_link`)
- `action`
- `resource_type`
- `resource_id`
- `result` (`success`, `failure`, `denied`)
- `ip_address` (nullable)
- `user_agent` (nullable)
- `metadata_json`
- `created_at`

## Data Model Notes

- Source-of-truth for identity, file metadata, shares, and audit is PostgreSQL.
- Redis does not hold canonical business data.
- MinIO stores encrypted file objects; not metadata or authorization policy.
- Wrapped DEK is mandatory for encrypted files.
- Soft-delete fields are used for governance/recovery, with hard purge performed by cleanup policy.

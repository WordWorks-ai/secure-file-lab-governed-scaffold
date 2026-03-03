# Secure File Sharing Web Application

## Full Self-Hosted Docker Compose Lab Edition

This document defines a fully self-hosted, enterprise-grade secure file
sharing platform designed to run entirely on a laptop using Docker
Compose. There are **no cloud dependencies**. All services run locally
in containers.

------------------------------------------------------------------------

# 1. Core Requirements

-   Single-command startup: `docker compose up -d`
-   No external SaaS dependencies
-   All features self-hosted in Docker
-   Persistent named volumes
-   TLS termination via reverse proxy
-   Strong authentication (Argon2id + MFA + optional SSO via Keycloak)
-   Envelope encryption using Vault transit
-   Malware scanning via ClamAV
-   Search via OpenSearch
-   Preview/OCR pipeline
-   DLP scanning pipeline
-   Audit logging and compliance export
-   Backup service included

------------------------------------------------------------------------

# 2. Full Feature Stack (All Dockerized)

## Edge

-   Caddy (TLS, headers, routing)

## Core Services

-   api (auth, sharing, RBAC/ABAC, audit)
-   worker (async scanning, indexing, expiration)
-   web (user UI)
-   admin (admin console)
-   realtime (WebSocket notifications)

## Data Layer

-   Postgres (metadata, audit logs)
-   Redis (queues, sessions, rate limiting)
-   MinIO (S3-compatible object storage)

## Security Services

-   Vault (transit encryption engine)
-   ClamAV (malware scanning)
-   OPA (policy engine)
-   Keycloak (optional SSO profile)

## Content Processing

-   preview (LibreOffice, PDF conversion, thumbnails)
-   ocr (Tesseract text extraction)

## Search

-   OpenSearch
-   OpenSearch Dashboards (optional)

## Notifications

-   MailHog (local SMTP capture)
-   webhook-sink (integration testing)

## Observability (optional profile)

-   Prometheus
-   Grafana
-   Loki

## Backups

-   backup container (pg_dump + MinIO mirror)

------------------------------------------------------------------------

# 3. Docker Compose Deployment

## Requirements

-   Docker Engine
-   Docker Compose v2+
-   8--16GB RAM recommended

Start stack:

    docker compose up -d --build

Stop stack:

    docker compose down

Reset volumes:

    docker compose down -v

------------------------------------------------------------------------

# 4. Security Model

-   TLS at edge (Caddy)
-   JWT access tokens + refresh rotation
-   MFA (TOTP + WebAuthn)
-   Optional OIDC/SAML via Keycloak
-   File-level AES-256-GCM encryption
-   Envelope encryption via Vault
-   Role-Based + Attribute-Based Access Control
-   Share link controls (expiry, password, one-time, download limits)
-   Malware scan gate before availability
-   Immutable audit log entries

------------------------------------------------------------------------

# 5. No Cloud Dependencies Policy

After images are pulled: - No outbound network calls required - Email
captured locally - SSO provided locally - Search index local - Key
management local - Object storage local

------------------------------------------------------------------------

# 6. First Boot Initialization

On first startup the system must: - Create MinIO bucket - Initialize
Vault transit keys - Run DB migrations - Create default admin account -
Configure search index mappings

------------------------------------------------------------------------

# 7. Intended Use

This system is designed for: - Security labs - Red team / blue team
environments - Secure file workflow testing - Policy and DLP
experimentation - Compliance simulation - Offline demonstrations

------------------------------------------------------------------------

End of Document

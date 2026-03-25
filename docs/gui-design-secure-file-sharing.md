# Secure File Sharing GUI Design

## Purpose

Define a production-style GUI for Secure File Lab that exposes the current API and realtime capabilities in a professional, security-first user experience.

This design is based on the implemented backend in `apps/api`, the authenticated realtime service in `apps/realtime`, the governance/security docs, and the current API test coverage. It is intended to replace the existing test harness UI with a real product surface, not another endpoint exerciser.

## Product Goals

- Let authenticated users upload, inspect, search, download, and share files without exposing backend complexity.
- Make security state visible: MFA status, scan state, DLP outcomes, share risk, admin-only actions, and audit traceability.
- Separate end-user workflows from admin/governance workflows.
- Preserve fail-closed behavior in the UI. The GUI must never imply a file or share is usable when the API says it is not.

## Users and Surfaces

### 1. User Workspace (`/`)

Primary authenticated product for normal users and admins acting as regular users.

Core jobs:

- sign in
- manage MFA
- upload files
- monitor file lifecycle
- search accessible files
- inspect derived artifacts
- download active files
- create and revoke shares

### 2. Public Share Portal (`/share`)

Unauthenticated entry point for recipients using a share token.

Core jobs:

- redeem share token
- provide optional password
- download the shared file
- see clear denial reasons in user-safe language

### 3. Admin Console (`/admin`)

Restricted governance and operational surface for admins only.

Core jobs:

- verify admin access
- review audit events, summaries, trends, and KPIs
- export audit NDJSON
- view system info, liveness/readiness, and metrics
- perform governed DLP override actions during upload/share creation
- use admin-only activation carefully when required

## Information Architecture

### User Workspace Navigation

- `Overview`
- `Files`
- `Upload`
- `Shares`
- `Search`
- `Security`

### Admin Console Navigation

- `Audit Explorer`
- `Audit Analytics`
- `Diagnostics`
- `Policy & DLP`

### Public Share Portal Navigation

- single focused page with token/password access flow

## Screen Design

### 1. Sign-In

Single branded sign-in page with:

- email
- password
- primary action: `Sign in`
- secondary action: `Sign in with SSO` when SSO is enabled in deployment

MFA behavior:

- if `POST /v1/auth/login` succeeds, land in workspace
- if it returns `MFA_REQUIRED` or `MFA_INVALID`, replace the password form with a second-factor step
- support two paths in one card:
  - `Authenticator code`
  - `Security key / passkey`

WebAuthn UX requirements:

- automatically invoke browser WebAuthn when challenge data is present
- show fallback manual retry if browser credential prompt fails
- never ask users to paste `clientDataJson` or credential IDs manually

Session UX:

- silent refresh using `POST /v1/auth/refresh`
- explicit sign-out using `POST /v1/auth/logout`
- show idle/session-expiring warnings before token expiry

### 2. Overview

First screen after sign-in.

Cards:

- `Recent Uploads`
- `Pending Review`
- `Active Shares`
- `Security Status`

Important note:

- the current API does not expose a general `list files` endpoint
- the GUI should populate this screen from:
  - current-session activity
  - recent successful uploads
  - saved share activity
  - search-driven fetches
- for a future API increment, add `GET /v1/files`

Status treatments:

- `scan_pending`: amber, "Scanning in progress"
- `active`: green, "Ready"
- `blocked`: red, "Blocked by security controls"
- `expired`: neutral
- `deleted`: neutral/dim

### 3. Files

Table view with:

- filename
- content type
- owner
- last updated
- lifecycle status
- expiration date
- available artifacts
- actions

Actions:

- `View details`
- `Artifacts`
- `Download` when `status=active`
- `Create share` when `status=active`
- `Activate` only for admins, visually marked as privileged

Details drawer:

- metadata from `GET /v1/files/:fileId`
- security badges:
  - encrypted
  - org-scoped
  - malware-gated
  - lifecycle state

Artifact drawer:

- preview text from `GET /v1/files/:fileId/artifacts`
- OCR text from `GET /v1/files/:fileId/artifacts`
- generated timestamps
- copy/export actions for text artifacts

Download behavior:

- call `GET /v1/files/:fileId/download`
- decode returned `contentBase64`
- stream to browser download
- never render raw base64 in the interface

### 4. Upload

Primary drag-and-drop upload surface with:

- drag target
- file picker
- filename
- detected MIME type
- optional expiry
- security notices

Upload processing:

- convert selected file to base64 client-side
- submit via `POST /v1/files/upload`
- show upload progress for local encoding + network send
- on success, transition immediately to a file detail/status screen

Validation in UI before request:

- block empty payloads
- warn on unsupported MIME types
- warn on likely size limit breach
- require ISO timestamp formatting for expiry picker

DLP override UX:

- hidden by default
- shown only to admins and only after a DLP denial response
- fields:
  - override reason
  - override ticket
- explain that non-overridable matches cannot be bypassed

Post-upload state:

- show "Encrypted and queued for scanning"
- do not present download or share actions until file becomes `active`

### 5. Shares

Two tabs:

- `Create Share`
- `Manage Shares`

Create Share:

- select file
- expiry date/time
- optional password
- optional max downloads
- admin-only governed DLP override fields when needed

Response handling:

- persist returned `shareId`
- show returned `shareToken` exactly once in a high-emphasis secure handoff panel
- offer:
  - `Copy token`
  - `Copy full link`
  - `Download link details`

Manage Shares:

- list shares created in current session and user-managed shares discovered through app state
- show:
  - share id
  - file id/name
  - expiry
  - password protected yes/no
  - max downloads
  - revoked status
- action: `Revoke`

Important limitation:

- the API has create, revoke, and access endpoints, but no share-list endpoint
- the first GUI version should track locally known shares and recently created shares
- recommend adding `GET /v1/shares` in a later backend phase

### 6. Public Share Portal

Entry paths:

- token embedded in URL
- manual token paste fallback

Flow:

1. read token from URL
2. ask for password only if access fails with password-required style denial or token came from protected share workflow context
3. submit `POST /v1/shares/access`
4. on success, show file name, type, and download action

Portal requirements:

- no dependency on authenticated app shell
- minimal, trustworthy design
- strong anti-phishing cues:
  - domain confirmation
  - TLS lock guidance
  - sender-independent language

User-safe error states:

- invalid or expired link
- download limit reached
- password required or incorrect
- file no longer available
- share revoked

Do not leak internal policy reasons, DLP matches, or lifecycle internals to public recipients.

### 7. Search

Global search for authenticated users using `GET /v1/search/files?q=&limit=`.

Results should show:

- filename
- content type
- status
- owner
- relevance score when returned
- source badge:
  - `OpenSearch`
  - `Database fallback`

Behavior:

- require at least 1 character
- debounce input
- preserve org scope exactly as returned by API
- allow filters in UI even if implemented client-side first:
  - active only
  - file type
  - owned by me

### 8. Security Settings

Page sections:

- `Profile`
- `Session`
- `Multi-Factor Authentication`

Capabilities:

- `GET /v1/auth/me`
- `GET /v1/auth/mfa/status`
- `POST /v1/auth/mfa/totp/enroll`
- `POST /v1/auth/mfa/totp/verify`
- `DELETE /v1/auth/mfa/totp`
- `POST /v1/auth/mfa/webauthn/register/options`
- `POST /v1/auth/mfa/webauthn/register/verify`

TOTP UX:

- show QR code derived from `otpauthUri`
- show secret as secondary/manual path
- require verification code before marking enabled

WebAuthn UX:

- label device during registration
- show credential count
- show last registration outcome

### 9. Admin Audit Explorer

Primary admin workflow for governance.

Data sources:

- `GET /v1/audit/events`
- `GET /v1/audit/events/export`
- `GET /v1/audit/events/summary`
- `GET /v1/audit/events/timeseries`
- `GET /v1/audit/events/kpis`

Views:

- filter panel
- event table
- event detail drawer
- export action

Filters:

- org id
- actor type
- action
- resource type
- resource id
- result
- from/to
- limit

Event detail should display:

- actor
- action
- result
- timestamps
- IP and user agent
- metadata JSON
- audit chain fields:
  - `prevEventHash`
  - `eventHash`
  - `chainVersion`

### 10. Admin Audit Analytics

Dashboard cards and charts:

- success/failure/denied rates
- trend by hour/day
- top actions
- top resource types
- actor type mix
- KPI deltas for current vs previous window

### 11. Admin Diagnostics

Read-only diagnostics page backed by:

- `GET /v1/health/live`
- `GET /v1/health/ready`
- `GET /v1/system/info`
- `GET /v1/metrics`

Purpose:

- operator confidence
- environment verification
- support triage

This page is useful for admins and support staff, not normal users.

## Security Requirements For The GUI

### Session Handling

- keep access tokens in memory, not `localStorage`
- keep refresh tokens in the most constrained browser storage the deployment allows; `httpOnly` secure cookies are preferred if backend is adjusted, otherwise use a guarded in-memory/session approach
- clear all auth state on logout, refresh replay failure, or 401 cascade
- do not expose raw tokens in UI except one-time copy affordances for troubleshooting/admin harness mode

### Transport and Origin

- prefer HTTPS only
- enforce same-origin API access through Caddy
- hard-fail on mixed-content situations
- WebAuthn UI must respect configured allowed origins and RP ID

### Sensitive Data Handling

- never log:
  - passwords
  - refresh tokens
  - TOTP secrets
  - raw uploaded file contents
  - `contentBase64`
  - share passwords
- redact share tokens in activity logs after initial creation display
- avoid rendering full audit metadata inline until requested

### File Handling

- treat uploaded files as sensitive immediately on selection
- do not persist decoded file contents in IndexedDB/localStorage
- clear temporary in-memory blobs after upload/download completes
- never offer preview/download buttons for non-`active` files

### DLP and Policy

- expose DLP denials with professional but non-leaky wording
- only show override controls for admins
- require explicit confirmation before sending override reason/ticket
- visually distinguish:
  - overridable denial
  - non-overridable denial
- never let the UI "retry anyway" without new governed input

### Public Share Safety

- do not prefetch file content for public shares
- avoid exposing whether a token was valid before password submission in a way that helps enumeration
- throttle repeated failures client-side in addition to backend throttling
- remove token from visible UI after load when possible

### Auditability

- emit client telemetry only for UX analytics, never as a substitute for server audit
- provide correlation IDs in error UI when the backend returns them in future
- make privileged actions visually explicit:
  - admin activation
  - DLP override
  - audit export

## Visual Design Direction

The GUI should look like a compliance-grade B2B product, not a developer sandbox.

Direction:

- light theme default with deep navy, slate, and restrained amber accents
- typography: IBM Plex Sans + IBM Plex Mono
- generous spacing, strong table readability, minimal decoration
- security states represented with clear semantic color and iconography
- motion limited to status transitions, drawer reveals, and upload progress

Design principles:

- calm and trustworthy
- high information density without looking crowded
- strong accessibility contrast
- obvious separation between routine actions and privileged actions

## Realtime Use

Use the realtime service as an enhancement, not a dependency.

Recommended subscriptions:

- file scan completed
- file blocked
- file expired
- share revoked
- audit export completed in future versions

Transport:

- prefer WebSocket at `/realtime/ws`
- fall back to SSE `/realtime/stream` if needed
- authenticate with access token

Realtime UX:

- toast for status changes
- auto-refresh active detail views
- update upload tracking card without full page refresh

## API-To-UI Mapping

| Capability | Endpoint | Surface |
| --- | --- | --- |
| Login | `POST /v1/auth/login` | Sign-In |
| Refresh | `POST /v1/auth/refresh` | Session manager |
| Logout | `POST /v1/auth/logout` | Global account menu |
| SSO exchange | `POST /v1/auth/sso/exchange` | Sign-In |
| Current user | `GET /v1/auth/me` | Security settings |
| Admin verification | `GET /v1/auth/admin-check` | Admin bootstrap check |
| MFA status | `GET /v1/auth/mfa/status` | Security settings |
| TOTP enroll | `POST /v1/auth/mfa/totp/enroll` | Security settings |
| TOTP verify | `POST /v1/auth/mfa/totp/verify` | Security settings |
| TOTP disable | `DELETE /v1/auth/mfa/totp` | Security settings |
| WebAuthn register options | `POST /v1/auth/mfa/webauthn/register/options` | Security settings |
| WebAuthn register verify | `POST /v1/auth/mfa/webauthn/register/verify` | Security settings |
| Upload file | `POST /v1/files/upload` | Upload |
| Activate file | `POST /v1/files/:fileId/activate` | Admin file actions |
| File metadata | `GET /v1/files/:fileId` | Files/details |
| File artifacts | `GET /v1/files/:fileId/artifacts` | Files/artifacts |
| Download file | `GET /v1/files/:fileId/download` | Files/details |
| Search files | `GET /v1/search/files` | Search |
| Create share | `POST /v1/shares` | Shares/create |
| Revoke share | `POST /v1/shares/:shareId/revoke` | Shares/manage |
| Access share | `POST /v1/shares/access` | Public share portal |
| Audit events | `GET /v1/audit/events` | Admin audit explorer |
| Audit export | `GET /v1/audit/events/export` | Admin audit explorer |
| Audit summary | `GET /v1/audit/events/summary` | Admin audit analytics |
| Audit timeseries | `GET /v1/audit/events/timeseries` | Admin audit analytics |
| Audit KPIs | `GET /v1/audit/events/kpis` | Admin audit analytics |
| Liveness | `GET /v1/health/live` | Admin diagnostics |
| Readiness | `GET /v1/health/ready` | Admin diagnostics |
| System info | `GET /v1/system/info` | Admin diagnostics |
| Metrics | `GET /v1/metrics` | Admin diagnostics |

## Known Backend Gaps That Affect GUI Design

- No `GET /v1/files` endpoint for a true file index.
- No `GET /v1/shares` endpoint for managed share history.
- No dedicated endpoint for password-required share metadata handshake.
- No browser-optimized download streaming endpoint; downloads return `contentBase64`.
- No explicit notification feed from API; realtime is a separate service.

These do not block a first GUI release, but they constrain the UX. The GUI should be designed so those endpoints can be added without restructuring navigation.

## Recommended Delivery Plan

### Phase 1

- professional sign-in
- session management
- upload
- file details/download
- share create/access/revoke
- MFA settings

### Phase 2

- search
- dashboard polish
- realtime status updates
- admin diagnostics

### Phase 3

- full admin audit explorer
- analytics dashboards
- governed DLP override workflows

## Acceptance Criteria

- A normal user can sign in, configure MFA, upload a supported file, wait for activation, download it, create a protected share, and revoke it.
- A public recipient can redeem a share token and download the file without seeing internal system details.
- An admin can review audit records, export NDJSON, inspect KPIs, and access diagnostics.
- The GUI never offers actions that violate lifecycle, role, org-boundary, DLP, or policy constraints.
- Sensitive material is not persisted or logged client-side.

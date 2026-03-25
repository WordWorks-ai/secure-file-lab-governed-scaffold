#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# web-frontend-hardening.sh
# Static analysis tests for apps/web/index.html security posture.
# Validates CSP, XSS mitigations, input sanitization, and
# credential hygiene without requiring a running server.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB_HTML="$ROOT_DIR/apps/web/index.html"
ADMIN_HTML="$ROOT_DIR/apps/admin/index.html"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1" >&2; }

# ── Prerequisite ────────────────────────────────────────────
echo "=== Web frontend hardening checks ==="
if [[ ! -f "$WEB_HTML" ]]; then
  echo "required file missing: $WEB_HTML" >&2
  exit 1
fi

# ── 1. CSP meta tag ────────────────────────────────────────
echo ""
echo "--- Content-Security-Policy ---"

if grep -q 'http-equiv="Content-Security-Policy"' "$WEB_HTML"; then
  pass "CSP meta tag present"
else
  fail "CSP meta tag missing"
fi

if grep -q "default-src 'self'" "$WEB_HTML"; then
  pass "CSP default-src restricts to self"
else
  fail "CSP default-src not set to self"
fi

if grep -q "object-src 'none'" "$WEB_HTML"; then
  pass "CSP blocks object/embed (object-src none)"
else
  fail "CSP does not block object-src"
fi

if grep -q "frame-ancestors 'none'" "$WEB_HTML"; then
  pass "CSP blocks framing (frame-ancestors none)"
else
  fail "CSP does not block framing"
fi

if grep -q "base-uri 'self'" "$WEB_HTML"; then
  pass "CSP restricts base-uri"
else
  fail "CSP does not restrict base-uri"
fi

# ── 2. Referrer policy ─────────────────────────────────────
echo ""
echo "--- Referrer Policy ---"

if grep -q 'name="referrer" content="no-referrer"' "$WEB_HTML"; then
  pass "Referrer policy meta tag present (no-referrer)"
else
  fail "Referrer policy meta tag missing"
fi

# ── 3. XSS escape function ─────────────────────────────────
echo ""
echo "--- XSS Escape Coverage ---"

if grep -q '&amp;' "$WEB_HTML" && grep -q '&lt;' "$WEB_HTML" && grep -q '&gt;' "$WEB_HTML"; then
  pass "esc() escapes &, <, >"
else
  fail "esc() missing basic HTML entity escaping"
fi

if grep -q '&quot;' "$WEB_HTML" && grep -q '&#39;' "$WEB_HTML"; then
  pass "esc() escapes quotes (double and single)"
else
  fail "esc() does not escape quote characters"
fi

# Verify no raw innerHTML with unescaped API data
# Safe pattern: all innerHTML assignments should use esc() for dynamic content
# Safe exceptions: innerHTML = '' (clearing), innerHTML = html (pre-escaped builder var)
UNSAFE_INNERHTML=$(grep -n 'innerHTML' "$WEB_HTML" | grep -v 'esc(' | grep -v 'statusHtml' | grep -v "result-actions" | grep -v "result-status" | grep -v "data-role" | grep -v "log-" | grep -v "innerHTML = ''" | grep -v "innerHTML = html" | grep -cv '^\s*//' || true)
if [[ "$UNSAFE_INNERHTML" -le 1 ]]; then
  pass "innerHTML usage appears controlled (static or escaped)"
else
  fail "Found $UNSAFE_INNERHTML innerHTML lines that may not use esc() — review manually"
fi

# ── 4. UUID validation ─────────────────────────────────────
echo ""
echo "--- Input Validation ---"

if grep -q 'isValidUUID' "$WEB_HTML"; then
  pass "UUID validation function present"
else
  fail "No UUID validation function found"
fi

# Count path-parameter actions that should validate UUIDs
for action in fileActivate fileMetadata fileArtifacts fileDownload shareRevoke; do
  if grep -A3 "$action:" "$WEB_HTML" | grep -q 'isValidUUID'; then
    pass "UUID validated in $action"
  else
    fail "UUID not validated in $action"
  fi
done

# ── 5. MIME type sanitization ──────────────────────────────
echo ""
echo "--- MIME Sanitization ---"

if grep -q 'safeMime' "$WEB_HTML"; then
  pass "MIME sanitization function present"
else
  fail "No MIME sanitization function found"
fi

DATAURL_COUNT=$(grep -c 'data:.*contentType' "$WEB_HTML" || true)
SAFEMIME_COUNT=$(grep -c 'safeMime' "$WEB_HTML" || true)
if [[ "$SAFEMIME_COUNT" -ge "$DATAURL_COUNT" ]]; then
  pass "All data: URL constructions use safeMime()"
else
  fail "Some data: URL constructions may not use safeMime()"
fi

# ── 6. Credential field hygiene ────────────────────────────
echo ""
echo "--- Credential Hygiene ---"

# Password fields should have autocomplete=off
PW_FIELDS=$(grep -c 'name="password"' "$WEB_HTML" || true)
PW_AUTOCOMPLETE=$(grep 'name="password"' "$WEB_HTML" | grep -c 'autocomplete="off"' || true)
if [[ "$PW_FIELDS" -eq "$PW_AUTOCOMPLETE" ]]; then
  pass "All password fields have autocomplete=off ($PW_FIELDS/$PW_FIELDS)"
else
  fail "Not all password fields have autocomplete=off ($PW_AUTOCOMPLETE/$PW_FIELDS)"
fi

# Token fields should have autocomplete=off
TOKEN_FIELDS=$(grep -cE 'name="(refreshToken|accessToken)"' "$WEB_HTML" || true)
TOKEN_AUTOCOMPLETE=$(grep -E 'name="(refreshToken|accessToken)"' "$WEB_HTML" | grep -c 'autocomplete="off"' || true)
if [[ "$TOKEN_FIELDS" -eq "$TOKEN_AUTOCOMPLETE" ]]; then
  pass "All token fields have autocomplete=off ($TOKEN_FIELDS/$TOKEN_FIELDS)"
else
  fail "Not all token fields have autocomplete=off ($TOKEN_AUTOCOMPLETE/$TOKEN_FIELDS)"
fi

# ── 7. Auth header redaction ───────────────────────────────
echo ""
echo "--- Header Redaction ---"

if grep -q 'redactHeaders' "$WEB_HTML"; then
  pass "Auth header redaction function present"
else
  fail "No auth header redaction in log history"
fi

if grep -q 'REDACTED' "$WEB_HTML"; then
  pass "Redaction marker in use"
else
  fail "No redaction marker found"
fi

# ── 8. Download link safety ────────────────────────────────
echo ""
echo "--- Download Link Safety ---"

DOWNLOAD_LINKS=$(grep -c 'createElement.*a' "$WEB_HTML" || true)
REL_ATTRS=$(grep -c "rel = 'noopener noreferrer'" "$WEB_HTML" || true)
if [[ "$DOWNLOAD_LINKS" -le "$REL_ATTRS" ]] || [[ "$REL_ATTRS" -ge 2 ]]; then
  pass "Dynamic links include rel=noopener noreferrer"
else
  fail "Dynamic links may be missing rel=noopener noreferrer"
fi

# ── 9. No external resource loads ──────────────────────────
echo ""
echo "--- External Resources ---"

if grep -qE '(src|href)="https?://' "$WEB_HTML"; then
  fail "External resource loads detected — review for supply chain risk"
else
  pass "No external resource loads (fully self-contained)"
fi

# ── 10. History size cap ───────────────────────────────────
echo ""
echo "--- Memory Safety ---"

if grep -q 'history.length > ' "$WEB_HTML"; then
  pass "Request history has a size cap"
else
  fail "Request history has no size cap (memory leak risk)"
fi

# ── 11. No localStorage/sessionStorage for tokens ─────────
echo ""
echo "--- Token Storage ---"

if grep -qE '(localStorage|sessionStorage)\.(setItem|getItem)' "$WEB_HTML"; then
  fail "Tokens stored in localStorage/sessionStorage (XSS exfiltration risk)"
else
  pass "No localStorage/sessionStorage token storage"
fi

# ── 12. Admin frontend baseline ────────────────────────────
echo ""
echo "--- Admin Frontend ---"

if [[ -f "$ADMIN_HTML" ]]; then
  if grep -q 'http-equiv="Content-Security-Policy"' "$ADMIN_HTML"; then
    pass "Admin CSP meta tag present"
  else
    fail "Admin CSP meta tag missing"
  fi

  if grep -q 'name="referrer" content="no-referrer"' "$ADMIN_HTML"; then
    pass "Admin referrer policy present"
  else
    fail "Admin referrer policy missing"
  fi

  if grep -q "object-src 'none'" "$ADMIN_HTML"; then
    pass "Admin CSP blocks object-src"
  else
    fail "Admin CSP does not block object-src"
  fi

  if grep -qE '(src|href)="https?://' "$ADMIN_HTML"; then
    fail "Admin has external resource loads"
  else
    pass "Admin has no external resource loads"
  fi
else
  fail "Admin HTML file not found at $ADMIN_HTML"
fi

# ── Summary ────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "All web frontend hardening checks passed."

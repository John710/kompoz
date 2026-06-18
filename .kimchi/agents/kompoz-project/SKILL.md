---
name: kompoz-project
description: Use when modifying, debugging, or reviewing the kompoz Docker Compose web editor codebase
---

# Kompoz Project Guide

## Overview

Kompoz is a lightweight web editor for Docker Compose files. It has an **Express 4** backend and a **vanilla JS** frontend (no bundler, no framework). All frontend modules are loaded via `<script>` tags in a specific order. Auth is optional HMAC cookie-based.

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 20+, Express 4, `yaml`, `dclint` |
| Frontend | Vanilla JS, CodeMirror 5, D3 (map view) |
| Tests | `node:test` (built-in), single smoke test |
| Container | Docker, docker-compose |

## Key Module Load Order

Frontend `<script>` order in `editor.html` matters due to implicit global dependencies:

1. `api.js` → 2. `i18n.js` → 3. `state.js` → 4. `parser.js` → 5. `templates.js` → 6. `themes.js` → 7. `modals.js` → 8. `toast.js` → 9. `tabs.js` → 10. `sidebar.js` → 11. `rightpanel.js` → 12. `editor.js` → 13. `app.js`

## Security Boundaries

- **Path traversal guard**: `safeResolvePath` in `server/utils/fs.js` uses logical `path.resolve` — **it does NOT follow symlinks**. Any fix must use `fs.realpathSync` before comparison.
- **Auth**: `server/index.js`. Token verification and login use standard string comparison (`===`) — vulnerable to timing attacks. Use `crypto.timingSafeEqual` with fixed-length Buffers.
- **Cookie**: Set without `Secure` flag. Append conditionally when behind HTTPS.
- **Frontend XSS**: `innerHTML` used in `map.html` tooltips, `sidebar.js`, `toast.js`, `editor.html` avatar. Prefer `textContent` or DOM construction.
- **No CSP possible**: Inline `onclick` handlers throughout HTML prevent strict `Content-Security-Policy`.

## Conventions

- Use single quotes for JS strings (existing codebase is inconsistent; prefer consistency)
- Backend routes go in `server/routes/`; utilities in `server/utils/`
- Frontend modules attach to global `App`, `Sidebar`, `Modals`, `State`, `I18N`
- API wrapper is `API` in `public/js/api.js`
- All i18n strings live in `public/locales/{en,ru}.json`

## Testing

- Run: `npm test` (uses `node --test`)
- Currently only one smoke test: `test/server.test.js`
- Security-critical functions (`safeResolvePath`, auth) have **zero coverage**.

## Deployment

- Docker Compose mounts projects via `COMPOSE_MOUNTS` env var
- Auth is enabled only when `AUTH_USER`, `AUTH_PASS`, and `AUTH_SECRET` are set
- Default HTTP port is `3001`

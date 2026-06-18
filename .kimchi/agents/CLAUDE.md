# Kompoz — Project Memory

> Persistent memory for agents working on the kompoz codebase.

## Project Overview

Kompoz is a web-based editor for Docker Compose files. It allows users to manage multiple projects via a browser, with features including file CRUD, YAML linting, visualization maps, and optional cookie-based auth.

- **Stack**: Node.js 20+, Express 4, vanilla JS frontend, CodeMirror 5, D3
- **No build step**: Frontend is raw JS loaded via `<script>` tags
- **Tests**: `node:test` with minimal coverage (1 smoke test)
- **Containerized**: Docker + docker-compose

## Architectural Decisions

1. **Vanilla JS, no framework**: Keeps the stack minimal but prevents tree-shaking, CSP, and modular bundling.
2. **Implicit global module graph**: `App`, `Sidebar`, `Modals`, `State`, `I18N`, `API` are globals attached to `window`. Load order in `editor.html` is the only dependency mechanism.
3. **Optional HMAC auth**: Auth is enabled only when `AUTH_USER`, `AUTH_PASS`, and `AUTH_SECRET` env vars are present. `requireAuth` middleware becomes a no-op when disabled.
4. **Multi-mount support**: `COMPOSE_MOUNTS` supports multiple comma-separated mounts (`rw:dir:displayName`). The first multi-mode mount determines `canCreateProjects` and the default `direct` mount.
5. **No database**: All state is filesystem-based. Projects are directories; files are plain text.

## Coding Conventions

- Use single quotes for JS strings when possible (existing code is inconsistent)
- Backend routes go in `server/routes/`; utilities in `server/utils/`
- Frontend modules should attach to a global namespace object (`App`, `Sidebar`, etc.)
- API calls go through `public/js/api.js` (`API.get`, `API.post`, etc.)
- i18n strings live in `public/locales/{en,ru}.json`
- Error responses from server use `{ error: string, errorKey?: string }` shape

## Git Constraints

- Prefer **new commits** over amending existing ones
- Use **explicit `git add <filename>`** rather than `git add .`
- Do **not** run destructive commands on protected branches without user approval
- Never skip hooks (`--no-verify` is forbidden)
- Detect the default branch dynamically instead of assuming `main`

## Known Issues & Security Pitfalls

### Critical
- **Symlink path traversal**: `safeResolvePath` in `server/utils/fs.js` uses logical `path.resolve` and does not follow symlinks. A symlink inside a project pointing outside the mount root will bypass the prefix check. **Fix**: Use `fs.realpathSync` before comparison.
- **XSS in map tooltips**: `public/map.html` builds tooltip HTML via string concatenation into `innerHTML`. User-authored YAML service names/images are injected raw. **Fix**: Build tooltip with DOM APIs and `textContent`.

### High
- **Timing attacks in auth**: Login (`server/index.js`), token verification, and `/api/verify-password` all use standard string comparison (`===` / `!==`) instead of `crypto.timingSafeEqual`. **Fix**: Convert strings to fixed-length Buffers and use `crypto.timingSafeEqual`.
- **Auth cookie missing Secure flag**: Cookie is set with `HttpOnly; SameSite=Strict` but no `Secure`. **Fix**: Append `; Secure` when behind HTTPS.
- **XSS in sidebar**: `_esc` in `public/js/sidebar.js` only escapes backslashes and quotes, not HTML entities. File names are interpolated into `innerHTML` unescaped. **Fix**: Add HTML entity escaping or use DOM construction.

### Medium
- **Error messages leak filesystem paths**: Catch blocks in `server/routes/files.js` and `projects.js` return `err.message` directly to the client.
- **No rate limiting on login**: `/api/login` allows unlimited brute-force attempts.
- **Toast uses innerHTML for API errors**: `public/js/toast.js` inserts `msg` directly into `innerHTML`.
- **No CSP possible**: Inline `onclick` handlers in HTML prevent strict `Content-Security-Policy`.
- **Client module ordering is fragile**: Any change to `<script>` load order can break implicit dependencies.

### Low
- **No extension whitelist on file create/save**: Can write arbitrary file types inside projects.
- **`parseCookies` crashes on malformed input**: `decodeURIComponent` lacks try-catch.
- **Hardcoded dclint rules**: Rule config is baked into `server/routes/files.js` with many useful rules disabled.

## Module Boundaries & Load Order

Frontend scripts in `editor.html` must load in this exact order:

1. `api.js` → 2. `i18n.js` → 3. `state.js` → 4. `parser.js` → 5. `templates.js` → 6. `themes.js` → 7. `modals.js` → 8. `toast.js` → 9. `tabs.js` → 10. `sidebar.js` → 11. `rightpanel.js` → 12. `editor.js` → 13. `app.js`

`app.js` initializes the app by calling `App.init()` and is the orchestrator.

## Testing

- Run: `npm test` (uses `node --test`)
- Test file: `test/server.test.js` — only asserts `server/index.js` exports a function
- Security-critical code (`safeResolvePath`, auth, token verification) has **zero tests**

## Deployment

- Port: `3001` (default)
- Mounts: configured via `COMPOSE_MOUNTS` env var (`mode:dir:displayName`, comma-separated)
- Auth env vars: `AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`

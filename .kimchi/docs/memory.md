# Project Memory — Kompoz

> Persistent knowledge for future agents working on kompoz.

## Review Outcomes

- **Verdict**: `NEEDS_FIXES` (independent code review, Phase 3)
- **Tests**: `npm test` — 1 passed, 0 failed. Single smoke test only.
- **Issues catalogued**: 13 classified issues in `.kimchi/docs/analysis.md` + additional findings in `.kimchi/docs/review.md`

## Known Issues Summary

| Severity | Count | Key Areas |
|---|---|---|
| Critical | 2 | Symlink path traversal (`fs.js`), XSS in map tooltips (`map.html`) |
| High | 4 | Timing attacks (login, token, verify-password), cookie Secure flag, sidebar XSS |
| Medium | 5 | Error path leaks, no rate limiting, toast innerHTML, no CSP, fragile module load order |
| Low | 2 | No file extension whitelist, `parseCookies` crash on malformed input |

## Architecture

- **Backend**: Express 4, filesystem-based state, optional HMAC cookie auth
- **Frontend**: Vanilla JS, no build step, implicit global module graph (`App`, `Sidebar`, `Modals`, `State`, `I18N`, `API`)
- **Module load order is load-bearing**: `editor.html` script tag sequence determines initialization order
- **No database**: All persistence is via filesystem under `COMPOSE_MOUNTS`

## Conventions

- Backend routes in `server/routes/`, utilities in `server/utils/`
- API wrapper in `public/js/api.js`
- i18n strings in `public/locales/{en,ru}.json`
- Error response shape: `{ error: string, errorKey?: string }`
- Git: explicit `git add <file>`, no destructive commands on protected branches without approval, never skip hooks, detect default branch dynamically

## Security Boundaries

1. `safeResolvePath` must be hardened with `fs.realpathSync` to prevent symlink traversal
2. Auth comparisons must use `crypto.timingSafeEqual` on fixed-length Buffers
3. Cookie must include `Secure` flag in production
4. No `innerHTML` with user-controlled data — use `textContent` or DOM construction
5. Inline event handlers block CSP adoption

## Testing Gaps

- Only 1 smoke test exists (`test/server.test.js`)
- No tests for auth, path traversal, file CRUD, or project CRUD
- No linting or formatting configuration

# Independent Code Review — Kompoz

## Verdict: NEEDS_FIXES

## Summary

Kompoz is a web-based Docker Compose editor with a lightweight Express backend and vanilla JavaScript frontend. The codebase functions correctly for its intended purpose, but it carries multiple security issues that range from critical path traversal to pervasive XSS vectors. The most severe problem is a symlink-based path traversal in `server/utils/fs.js` that allows an authenticated attacker to read arbitrary host files by tricking the logical path-resolution check. This is compounded by several frontend XSS issues where user-controlled data (file names, service names from YAML, API error messages) are inserted directly into `innerHTML` or inline HTML templates without proper escaping. Additionally, the authentication layer is weakened by timing-attack-vulnerable string comparisons on the login, token-verification, and password-verification endpoints.

Testing coverage is extremely thin: the only test is a single smoke test that verifies the Express app exports correctly. There is no linting configuration, no race-condition testing (none applicable to this single-threaded Node.js app), and no security-focused tests. The architecture is simple and maintainable for a small tool, but the absence of a build step, CSP constraints, and module boundaries means that security fixes must be applied manually and carefully across many inline HTML generators.

## Findings Table

| Severity | File | Line | Issue | Assessment |
|---|---|---|---|---|
| Critical | `server/utils/fs.js` | 147–152 | Symlink-based path traversal in `safeResolvePath` | **Agree.** `path.resolve` is purely logical and never follows symlinks. An attacker who can create a symlink inside a project (e.g., `compose/exploit.yml -> /etc/passwd`) will bypass the `startsWith` check because `resolved` remains logically under `baseResolved`, while the subsequent `fs.readFileSync` follows the symlink and returns arbitrary files. `fs.realpathSync` should be used before comparison. |
| Critical | `public/map.html` | ~480–495 | XSS via `innerHTML` in map tooltips (`showTip`, `showPortTip`) | **Agree.** `d.name`, `d.image`, `d.ports`, `d.networks`, and `d.sourceFile` are parsed from user-authored YAML and concatenated directly into HTML assigned to `tt.innerHTML`. A malicious service name or image string containing `<img src=x onerror=...>` will execute in the tooltip. DOM construction with `textContent` is required. |
| High | `server/index.js` | ~53–55 | Timing attack in login endpoint | **Agree.** The standard string comparison `username !== AUTH_USER || password !== AUTH_PASS` short-circuits, leaking timing information that allows byte-by-byte brute forcing. `crypto.timingSafeEqual` with fixed-length Buffers should be used. |
| High | `server/index.js` | ~26–28 | Timing attack in token verification | **Agree.** `sig !== expected` in `verifyToken` performs a regular string comparison on the HMAC signature, enabling a timing side-channel attack. Both signatures must be compared with `crypto.timingSafeEqual` after being decoded to Buffers. |
| High | `server/index.js` | ~61 | Auth cookie lacks `Secure` flag | **Agree.** The `Set-Cookie` header contains `HttpOnly`, `Path=/`, `SameSite=Strict`, and `Max-Age`, but it omits `Secure`. In any HTTPS deployment the cookie could be sent over unencrypted HTTP. The fix should append `; Secure` conditionally or use a `__Host-` prefix. |
| High | `public/js/sidebar.js` | ~37–52 | XSS in sidebar via incomplete `_esc` escaping | **Agree.** `_esc` only escapes backslashes and single quotes, and it is **not even applied** to the visible file name (`<div class="file-name">${f.name}</div>`) or to the `data-path="${f.path}"` attribute. A file named `<img src=x onerror=alert(1)>.yml` will execute XSS in the sidebar. A proper HTML entity encoder must be used for every dynamic value. |
| Medium | `server/routes/files.js` | Multiple catch blocks (e.g., 32, 50, 68, 82, 96, 110, 145) | Error messages leak filesystem paths | **Agree.** Every catch block returns `res.status(500).json({ error: err.message, ... })`. Filesystem errors such as `ENOENT` embed absolute paths (e.g., `/mnt/data/secret/foo.yml`), disclosing internal host directory structure to the client. Full errors should be logged server-side while generic messages are returned to the client. |
| Medium | `server/index.js` | ~49–62 | No rate limiting on login endpoint | **Agree.** `/api/login` has no throttling or rate limiting. An attacker can perform unlimited credential-guessing attempts. A per-IP in-memory or middleware-based rate limiter is needed. |
| Medium | `public/js/toast.js` | ~6–8 | Toast notifications use `innerHTML` with API error messages | **Agree.** `el.innerHTML = \`<span>...</span><span>${msg}</span>\`` inserts `msg` directly as HTML. Since `msg` is often populated from API error responses (`data.error`), a compromised server response or an XSS chain can inject arbitrary markup. DOM construction with `textContent` is the safe fix. |
| Medium | `public/js/app.js`, `public/js/sidebar.js`, `public/js/modals.js` | N/A | Circular dependency risk in client modules | **Agree with reservations.** The frontend relies on implicit global ordering (`App`, `Sidebar`, `Modals`, `State`, `I18N`) loaded via `<script>` tags. While no explicit circular dependency exists today, the architecture is fragile and prevents strict CSP adoption. This is an architectural/maintenance concern rather than an immediate exploitable bug. |
| Medium | `public/editor.html`, `public/map.html` | Throughout | Inline event handlers prevent CSP adoption | **Agree.** Both `editor.html` and `map.html` contain many inline `onclick="..."` handlers, and `sidebar.js` generates additional ones dynamically. A strict `Content-Security-Policy` cannot be deployed without `unsafe-inline`. All handlers should be attached via `addEventListener` in the corresponding JS modules. |
| Low | `server/routes/files.js` | ~81–95, ~97–109 | No extension whitelist on file create/save | **Agree.** `POST /api/files/save` and `POST /api/files/create` accept any `filePath` and write it verbatim. An authenticated user can create `.sh`, `.php`, `.exe`, etc. While path traversal is mostly blocked (except via the symlink Critical finding), the ability to write executable files inside project directories is unnecessary and risky. |
| Low | `server/index.js` | ~42–49 | `parseCookies` lacks try-catch around `decodeURIComponent` | **Agree.** `decodeURIComponent(v.join('='))` throws `URIError` on malformed percent-encoding (e.g., `%` or `%XX`). Because the call sits inside a `forEach` callback with no try-catch, the exception propagates out of `parseCookies`, crashes the `requireAuth` middleware, and yields an unhandled error or hung request. A try-catch around the decode is required. |

## Additional Findings

### A1 — Timing attack in `/api/verify-password` endpoint
- **File**: `server/index.js` (~121–124)
- **Severity**: High
- **Description**: The `POST /api/verify-password` endpoint performs a standard string comparison (`password !== AUTH_PASS`) to validate the admin password before dangerous operations. This suffers from the same timing side-channel as the login endpoint (H1) but was **not** listed in the original analysis. An attacker with network proximity can brute-force the password byte-by-byte by measuring response times.
- **Suggested Fix**: Re-use the same `safeCompare` helper proposed for H1:
  ```js
  function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a.padEnd(256, '\0'));
    const bufB = Buffer.from(b.padEnd(256, '\0'));
    return crypto.timingSafeEqual(bufA, bufB);
  }
  if (!safeCompare(password, AUTH_PASS)) {
    return res.status(401).json({ error: 'Invalid password', errorKey: 'invalidPassword' });
  }
  ```

### A2 — Incorrect `errorKey` values in `/api/files/create` and `/api/files/restore`
- **File**: `server/routes/files.js` (~109, ~137)
- **Severity**: Low
- **Description**: The catch block for `POST /api/files/create` returns `errorKey: 'errorDelete'`, and the catch block for `POST /api/files/restore` also returns `errorKey: 'errorDelete'`. These are copy-paste errors that will mislead client-side error localization.
- **Suggested Fix**: Change the create catch block to `errorKey: 'errorCreate'` and the restore catch block to `errorKey: 'errorRestore'`.

### A3 — Potential DoS via large YAML in `/api/files/lint`
- **File**: `server/routes/files.js` (~139–148)
- **Severity**: Medium
- **Description**: The `/lint` endpoint accepts arbitrary `content` from the client and parses it with `yaml.parseDocument`. Although the global Express JSON limit is 10 MB, YAML parsing is CPU-intensive for deeply nested structures, aliases, or merge keys. Because Node.js is single-threaded, a malicious 10 MB YAML payload can block the event loop and deny service to other users.
- **Suggested Fix**: Add a stricter body-size limit for `/lint` (e.g., 1 MB), enforce a parsing timeout, or offload YAML parsing to a Worker thread.

### A4 — `/api/info` intentionally exposes absolute filesystem paths
- **File**: `server/index.js` (~95–101)
- **Severity**: Medium
- **Description**: `GET /api/info` returns the output of `getAllProjects()`, which includes `dir` fields containing absolute host paths (e.g., `/mnt/data/my-project`). Unlike error-message leaks (M1), this disclosure is intentional, but it still reveals internal mount points and directory layout to any authenticated user.
- **Suggested Fix**: Return only sanitized relative identifiers to the client (e.g., `mountRoot` name + project name). Keep absolute paths on the server side for filesystem operations only.

### A5 — Latent XSS via avatar injection in map page
- **File**: `public/map.html` (within `loadUser`, ~560–570)
- **Severity**: High (latent)
- **Description**: The `loadUser` function renders `d.user.avatar` into `innerHTML` with a string template: `av.innerHTML = \`<img src="${d.user.avatar}" ...>\``. In the current server implementation `/api/me` never returns an `avatar` field, so this code path is dormant. However, if the backend is ever extended to include avatars, a malicious or compromised server could inject arbitrary JavaScript via a `javascript:` or `data:` URI, activating a stored XSS vector.
- **Suggested Fix**: Render the avatar with DOM APIs, setting `img.src` via property assignment after validating the URL scheme, and avoid `innerHTML` entirely.

## Overall Assessment

**Security Posture: Weak.** The application has two critical vulnerabilities (symlink path traversal and multiple XSS vectors) and three high-severity timing-attack issues. The authentication layer is present but has side-channel leaks, no rate limiting, and missing cookie hardening. The frontend is riddled with `innerHTML` injections and inline event handlers, making a strict CSP impossible and creating multiple XSS entry points for data that originates from user-authored YAML and filesystem names.

**Test Coverage: Inadequate.** The test suite contains a single smoke test (`server module exports an express app`). There is no coverage for auth logic, path traversal restrictions, file CRUD operations, XSS sanitization, or timing-attack defenses. No linting configuration exists, so code style and basic static-analysis checks are absent.

**Maintainability: Moderate but fragile.** The backend is straightforward Express with clear route separation, and the frontend module pattern keeps files small. However, the reliance on implicit global script ordering, raw `innerHTML` templating throughout the UI, and manual cookie/auth handling means that future changes are likely to reintroduce the same classes of vulnerabilities. A move toward DOM-based construction, ES modules with explicit imports, and centralized sanitization utilities would significantly improve long-term maintainability and security.

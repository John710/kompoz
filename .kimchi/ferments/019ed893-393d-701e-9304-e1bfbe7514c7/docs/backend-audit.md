# Backend Audit Notes — Step 1

## Issue 1: CRITICAL — Symlink-based path traversal in safeResolvePath
- **File**: `server/utils/fs.js:155-158`
- **Details**: `safeResolvePath` uses `path.resolve` which resolves paths logically but does not follow symlinks. If a file inside the project directory is a symlink pointing outside the mount root (e.g., `/etc/passwd`), the prefix check passes and the file is read/written.
- **Fix**: After resolving logically, also call `fs.realpathSync(resolved)` and ensure the real path stays within the base.

## Issue 2: HIGH — Timing attack in login endpoint
- **File**: `server/index.js:53-55`
- **Details**: `username !== AUTH_USER || password !== AUTH_PASS` uses standard JavaScript string comparison, which short-circuits and leaks timing information.
- **Fix**: Use `crypto.timingSafeEqual` on padded buffers:
  ```js
  const userBuf = Buffer.from(username); const authUserBuf = Buffer.from(AUTH_USER);
  const passBuf = Buffer.from(password); const authPassBuf = Buffer.from(AUTH_PASS);
  if (userBuf.length !== authUserBuf.length || passBuf.length !== authPassBuf.length) return false;
  return crypto.timingSafeEqual(userBuf, authUserBuf) && crypto.timingSafeEqual(passBuf, authPassBuf);
  ```

## Issue 3: HIGH — Timing attack in token verification
- **File**: `server/index.js:30-32`
- **Details**: `sig !== expected` is a standard string comparison vulnerable to timing attacks.
- **Fix**: Convert both signatures to buffers and use `crypto.timingSafeEqual`.

## Issue 4: HIGH — Auth cookie lacks Secure flag
- **File**: `server/index.js:61`
- **Details**: The `Set-Cookie` header includes `HttpOnly` and `SameSite=Strict` but omits `Secure`, allowing transmission over HTTP.
- **Fix**: Append `; Secure` when `req.secure` or `process.env.NODE_ENV === 'production'`.

## Issue 5: MEDIUM — parseCookies lacks try-catch around decodeURIComponent
- **File**: `server/index.js:47`
- **Details**: `decodeURIComponent(v.join('='))` throws on malformed percent-encoding, crashing the request.
- **Fix**: Wrap in try-catch and skip malformed cookies.

## Issue 6: MEDIUM — Error messages leak filesystem paths
- **File**: `server/routes/files.js` (multiple catch blocks), `server/routes/projects.js` (multiple catch blocks)
- **Details**: `res.status(500).json({ error: err.message })` sends raw error strings to the client, which may contain absolute file system paths.
- **Fix**: Log `err` server-side; send a generic `errorKey` to the client.

## Issue 7: MEDIUM — No rate limiting on login endpoint
- **File**: `server/index.js:50-62`
- **Details**: No rate limiting allows brute-force guessing of credentials.
- **Fix**: Add an in-memory or Redis-backed rate limiter (e.g., `express-rate-limit`).

## Issue 8: MEDIUM — /api/files/all reads symlinks without validation
- **File**: `server/routes/files.js:48-64`
- **Details**: Uses `safeResolvePath` which is vulnerable to symlinks (Issue 1); bulk endpoint returns contents of arbitrary files.
- **Fix**: Apply the same `realpathSync` fix as Issue 1.

## Issue 9: MEDIUM — Recursive project delete without backup
- **File**: `server/routes/projects.js:52`
- **Details**: `fs.rmSync(dir, { recursive: true, force: true })` permanently destroys a project with no recovery path.
- **Fix**: Move the directory to a `.trash/` or `.deleted/` subfolder before removal, or require a `force` query param and create an archive.

## Issue 10: LOW — No extension whitelist on file create/save
- **File**: `server/routes/files.js:74-98`
- **Details**: Users can create executable scripts, binary files, etc. inside projects.
- **Fix**: Whitelist safe extensions (`yml`, `yaml`, `env`, `conf`, `json`, `txt`) or blacklist dangerous ones.

## Issue 11: LOW — listDir in files.js doesn't filter .bak for appdata
- **File**: `server/routes/files.js:19-22`
- **Details**: The `appdata` directory listing does not filter `.bak` files, unlike `secrets`.
- **Fix**: Add `.bak` filtering for appdata.

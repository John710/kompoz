# Test & Lint Audit Notes — Step 3

## Issue 1: CRITICAL — Virtually no test coverage
- **File**: `test/server.test.js`
- **Details**: The only test asserts `typeof require('../server/index.js') === 'function'`. There are zero tests for authentication, file CRUD, project CRUD, path traversal, YAML parsing, or the `safeResolvePath` security boundary.
- **Fix**: Add comprehensive tests using `node:test` + `node:assert`. Test matrix:
  - `safeResolvePath` with `..`, symlinks, null bytes, absolute paths
  - Auth login/logout/token expiry/timing-safe comparison
  - File routes: read, save, create, delete, backup, restore, lint
  - Project routes: list, create, delete (direct vs multi)

## Issue 2: HIGH — No linting or formatting configuration
- **File**: project root
- **Details**: No `.eslintrc`, `.prettierrc`, `biome.json`, or similar. Code style is inconsistent (mixed `'` / `"`, semicolons optional, indentation varies).
- **Fix**: Add `eslint` (flat config) or `biome` for JS. Add `markdownlint` for docs. Run in CI.

## Issue 3: MEDIUM — Hardcoded lint rules in route handler
- **File**: `server/routes/files.js:108-124`
- **Details**: `dclint` rules are baked into the Express route. Users cannot customize severity or enable disabled rules.
- **Fix**: Load rules from a `.dclintrc.js` or `kompoz.config.js` file, merge with defaults.

## Issue 4: MEDIUM — Disabled dclint rules reduce usefulness
- **File**: `server/routes/files.js:108-124`
- **Details**: Several rules are set to `0` (off): `require-project-name-field`, `require-quotes-in-ports`, `service-dependencies-alphabetical-order`, `service-keys-order`, `service-ports-alphabetical-order`, `services-alphabetical-order`, `top-level-properties-order`.
- **Fix**: Re-enable at least `require-project-name-field` and `require-quotes-in-ports` at level 1 (warning).

## Issue 5: MEDIUM — No code coverage tooling
- **File**: `package.json`
- **Details**: `npm test` runs `node --test` without coverage. No `c8` or Node `--experimental-test-coverage` configured.
- **Fix**: Add `c8` dev dependency and script `"test:cov": "c8 node --test"`.

## Issue 6: LOW — Lint endpoint only runs for YAML files
- **File**: `server/routes/files.js:103-104`
- **Details**: `if (!YAML_RE.test(filePath)) return res.json({ messages: [] })` silently skips linting for `.env` or other files, which is fine for `dclint` but means no validation at all for non-YAML uploads.
- **Fix**: Add a generic schema or content validator for `.env` files (e.g., check for duplicate keys).

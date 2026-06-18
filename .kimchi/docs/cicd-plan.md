# Plan: .gitignore, .dockerignore, and GitHub Actions release workflow

## 1. `.gitignore` improvements
Add standard Node.js / project patterns not already present:
- `.nyc_output/`, `coverage/` — test coverage
- `*.tgz` — npm pack artifacts
- `.npm/` — npm cache
- `.eslintcache` — lint cache
- `tmp/`, `temp/` — temp directories
- `.node_repl_history` — REPL history

## 2. `.dockerignore` improvements
Add patterns that should not be in the production Docker image:
- `test/` — tests are not needed in production image
- `.github/` — CI configs not needed
- `.kimchi/` — workspace artifacts
- `.dockerignore` — self
- `docker-compose.yml` — compose file not needed in image
- `.nyc_output/`, `coverage/` — coverage not needed

## 3. Refactor `.github/workflows/docker-build.yml`
- Keep as CI workflow: run tests on PRs and main branch pushes
- Remove tag/release triggers (handled by release workflow)
- Remove Docker build/push from this workflow
- Simplify to just `test` job

## 4. Create `.github/workflows/release.yml`
- Trigger: `push: tags: ['v*']`
- Skip beta tags: `if: ${{ !contains(github.ref_name, '-beta') }}`
- Jobs:
  1. `test` — run `npm test`
  2. `docker` — build and push to GHCR using semver tags
  3. `release` — create GitHub Release with auto-generated changelog
- Permissions: `contents: write`, `packages: write`
- Use `softprops/action-gh-release@v2` with `generate_release_notes: true`

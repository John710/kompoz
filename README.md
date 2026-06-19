# Kompoz

> Web-based editor & visualizer for Docker Compose files.

**Kompoz** is a lightweight, self-hosted web application for managing Docker Compose projects. It provides a file editor with YAML linting, service dependency maps, and a network topology scanner — all in a single container.

---

## Features

- **Project Management** — Create, rename, and organize multiple Docker Compose projects.
- **File Editor** — Syntax-highlighted YAML editor with real-time linting via `dclint`. Edit `.yml`, `.env`, and secrets files side-by-side.
- **Container Map** — Visualize service dependencies, networks, and volumes as an interactive tree.
- **Network Map** — Scan your local network, discover devices, build topology diagrams, and manage links.
- **Auth (optional)** — HMAC cookie-based or PostgreSQL-backed authentication.
- **Multi-language** — English and Russian localization.

---

## Architecture

| Layer | Technology |
|-------|------------|
| Backend | Node.js 22, Express 5, `yaml` 2.9, `dclint` 3.1 |
| Frontend | Vanilla JS, CodeMirror 5, D3.js, SVG |
| Database | PostgreSQL 16 (optional; falls back to JSON files) |
| Tests | `node:test` — 23 tests across 4 files |
| Container | Docker (Node 22 Alpine), `su-exec` entrypoint |

---

## Pages

| Page | Description |
|------|-------------|
| **Index** (`/`) | Project list with quick-access action icons |
| **Editor** (`/editor.html?project=...`) | YAML file editor with sidebar, tabs, and right panel |
| **Container Map** (`/map.html?project=...`) | Visual service dependency tree |
| **Network Map** (`/homelab.html`) | Network topology scanner & device manager |

---

## Quick Start

```bash
git clone https://github.com/John710/kompoz.git
cd kompoz
docker build -t ghcr.io/john710/kompoz:latest .
docker run -p 3710:3710 -v /your/compose:/compose ghcr.io/john710/kompoz:latest
```

Then open `http://localhost:3710`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3710` | HTTP server port |
| `COMPOSE_MOUNTS` | — | Comma-separated host paths mounted into container |
| `COMPOSE_ROOT` | `/compose` | Legacy fallback mount path |
| `DATABASE_URL` | — | PostgreSQL connection string (optional) |
| `AUTH_USER` | — | HMAC auth username (optional) |
| `AUTH_PASS` | — | HMAC auth password (optional) |
| `AUTH_SECRET` | — | HMAC signing secret (optional) |
| `STATUS_CHECK_INTERVAL` | `60000` | Container health check interval (ms) |

---

## Development

```bash
npm install
npm test        # Run all 23 tests
npm start       # Start server on :3710
```

---

## License

AGPL-3.0-or-later

---

*Version 0.6.0 *

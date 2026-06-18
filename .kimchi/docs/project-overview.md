# Kompoz Project Overview

> Generated for ferment `019ed893-393d-701e-9304-e1bfbe7514c7` — Project analysis and code review.

## What is Kompoz

**Kompoz** is a web-based editor and visual explorer for Docker Compose projects. It presents a classic IDE layout (file tree, tabbed editor, right-side panel with compose helpers) plus a D3-driven visual map of services, networks, and volumes.

- **Author**: John710 (GitHub)
- **Version**: 0.4.6
- **License**: MIT
- **Stack**: Node.js 20, Express 4, vanilla JavaScript (no frontend framework), CodeMirror 5, D3 v7, `yaml` parser, `dclint` (Docker Compose linter)

## Directory Structure

```
/opt/kompoz/
├── server/
│   ├── index.js            # Express app bootstrap, auth, mount setup
│   ├── routes/
│   │   ├── files.js        # CRUD + lint for project files
│   │   └── projects.js     # List / create / delete projects
│   └── utils/
│       └── fs.js           # safeResolvePath, getAllProjects, mount helpers
├── public/
│   ├── index.html          # Main SPA (editor view)
│   ├── editor.html         # Same as index.html (legacy/remapped entry)
│   ├── map.html            # D3 visual service/network/volume map
│   ├── login.html          # Simple login form (cookie-based)
│   ├── css/
│   │   ├── main.css        # Global dark/light theme variables & layout
│   │   └── header.css      # Header component styles
│   └── js/
│       ├── api.js          # Thin fetch wrapper around REST endpoints
│       ├── app.js          # Main application controller (orchestrates UI)
│       ├── editor.js       # CodeMirror 5 setup, lint integration, save
│       ├── i18n.js         # Client-side i18n (en/ru), JSON key lookups
│       ├── modals.js       # New-file / new-project / confirm dialogs
│       ├── parser.js       # Docker Compose YAML → service/network/volume graph
│       ├── rightpanel.js   # Right panel: service templates / snippet helpers
│       ├── sidebar.js      # File tree rendering, search, delete project btn
│       ├── state.js        # Global client state (selected project, tabs, unsaved)
│       ├── tabs.js         # Tab bar lifecycle
│       ├── templates.js    # Hard-coded compose service template snippets
│       ├── themes.js       # Dark/light theme toggle (CSS variables + localStorage)
│       └── toast.js        # Toast notification system
├── test/
│   └── server.test.js      # Single smoke test (exports a function)
├── locales/
│   ├── en.json             # English translation strings
│   └── ru.json             # Russian translation strings
├── Dockerfile              # Node 20 Alpine, production deps only
├── docker-compose.yml      # Self-hosting manifest with healthcheck
├── package.json            # Scripts, dependencies, node:test engine
├── README.md               # English usage docs
└── README.ru.md            # Russian usage docs
```

## Technology Stack Detail

### Backend
- **Runtime**: Node.js 20+ (Dockerfile uses `node:20-alpine`)
- **Framework**: Express 4 (`express@^4.21.2`)
- **Utilities**:
  - `yaml@^2.7.0` — YAML parsing / stringify for file CRUD
  - `dclint@^2.2.2` — Linting `docker-compose.yml` files (used server-side via Express route and client-side via CodeMirror addon)
  - `cookie` + HMAC signing (`crypto.createHmac`) for optional auth
  - Native `fs`, `path`, `node:test` (built-in test runner)

### Frontend
- **No framework** — vanilla JS in module-pattern files (`const X = (() => { ... })();`)
- **Editor**: CodeMirror 5.65.16 (loaded from CDN) with YAML, JS, and Properties modes; linters via `dclint`
- **Visualization**: D3 7.9.0 (loaded from CDN) for the service map (`map.html`)
- **Styling**: CSS custom properties for theming; Google Fonts (Inter + JetBrains Mono)
- **I18n**: Simple key-replacement system with `data-i18n` attributes

### Build / Dev
- No transpiler / bundler. Frontend is static HTML + `<script src="/js/...">` tags.
- `npm start` → `node server/index.js`
- `npm test` → `node --test test/server.test.js`

## Entry Points

| Entry | File | Role |
|---|---|---|
| Server | `server/index.js` | Creates Express app, registers routes, optional auth middleware, serves `public/` static files. Also exports `createApp(mounts)` for testability. |
| Client (Editor) | `public/index.html` / `public/editor.html` | Loads all JS modules; initializes i18n, themes, state, and App controller. |
| Client (Map) | `public/map.html` | Standalone D3 visualization page; fetches all project files via `/api/files/all` and calls `Parser.parseProject()`. |
| Client (Login) | `public/login.html` | Simple form posting to `/api/login`. |

## Key Modules & Integration Points

### `server/index.js`
- Parses `COMPOSE_MOUNTS` env var (JSON) to know which host directories are editable.
- Optional cookie auth using `AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`.
- Token format: `base64url(payload:expiry).base64url(HMAC-SHA256)`.
- Serves `public/` as static root.
- `/api/version` returns version from `package.json`.
- `/api/latest-release` fetches GitHub releases (proxied).

### `server/routes/files.js`
- **GET** `/api/files/list?project=` — lists all files under a project.
- **GET** `/api/files/read?project=&filename=` — reads a single file.
- **POST** `/api/files/save` — writes file content (creates dirs as needed).
- **DELETE** `/api/files/delete` — deletes a file.
- **POST** `/api/files/backup` — copies file to `.bak`.
- **POST** `/api/files/restore` — restores from `.bak`.
- **POST** `/api/files/lint` — runs `dclint` on provided content and returns diagnostics.
- **GET** `/api/files/all?project=` — returns *all* files and their contents (used by map parser).

### `server/routes/projects.js`
- **GET** `/api/projects?search=` — list projects across all mounts.
- **POST** `/api/projects` — create new project directory + scaffold `docker-compose.yml` and `.env`.
- **DELETE** `/api/projects/:name` — recursively delete project directory (with optional `force=true` to destroy `.env`).

### `server/utils/fs.js`
- `safeResolvePath(root, subPath)` — resolves `subPath` under `root`, preventing traversal above root.
- `getAllProjects(search?)` — scans all mount directories, returns project metadata.
- `fileExists(path)`, `listProjectFiles(mountDir, projectName)`.

### `public/js/api.js`
- Thin wrapper: `API.files.list(project)`, `API.files.read(...)`, `API.files.save(...)`, etc.
- Centralizes base URL and error handling.

### `public/js/parser.js`
- Parses an array of `{ filename, content }` objects (returned by `/api/files/all`) into a graph.
- Extracts `services`, `networks`, `volumes`, `depends_on`, `ports`, `image`, etc.
- Used by `rightpanel.js` and `map.html`.

### `public/js/app.js`
- Application controller: project switching, file open/save, tab management.
- Calls `API.*`, updates `State`, manages `Tabs`, and orchestrates `Editor`.

## Authentication

Optional HMAC-signed cookie authentication.
- Enabled if `AUTH_USER`, `AUTH_PASS`, and `AUTH_SECRET` are all set.
- Login POST sets a cookie named `kompoz_auth`.
- `requireAuth` middleware checks cookie signature and expiry.
- Logout POST clears the cookie.

## Configuration (Environment Variables)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `COMPOSE_MOUNTS` | JSON array of host directory paths to expose as editable projects |
| `AUTH_USER` | Optional basic-auth username |
| `AUTH_PASS` | Optional basic-auth password |
| `AUTH_SECRET` | HMAC secret for cookie signing |

## Notable Architectural Patterns

- **No bundler**: all frontend code is raw JS files loaded via `<script>` tags in a fixed order.
- **Module pattern**: each `public/js/*.js` file exposes a global (e.g., `API`, `App`, `State`).
- **Server-side lint**: `dclint` can be invoked via POST to `/api/files/lint`, but client-side lint is also performed in the editor via the same library loaded in-browser.
- **Mount-based multi-directory**: the app can serve multiple disjoint directories (`/mnt/data1`, `/opt/stacks`, etc.) from a single instance.

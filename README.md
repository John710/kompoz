# Kompoz

Web editor for Docker Compose with a visual dependency map, built-in linter, and bilingual UI.

[🇷🇺 Русская версия](README.ru.md)

---

## Features

- **File editor** — view and edit `docker-compose.yml`, `.env`, secrets, and configs with syntax highlighting (CodeMirror 5).
- **Visual map** — interactive diagram of services, networks, and volumes with connection highlighting and exposed port tooltips.
- **Linter** — on-the-fly compose file validation via [dclint](https://www.npmjs.com/package/dclint) with translated messages.
- **Multi-project** — support for multiple stacks in a single interface (direct and multi-mode mounts).
- **Themes** — dark and light themes, switchable without reload.
- **i18n** — Russian and English UI languages. Want to add your language? See [Contributing](CONTRIBUTING.md).
- **Portable** — runs in Docker, no database required.

---

## Quick Start

```bash
git clone <repository>
cd kompoz

# Edit docker-compose.yml: set your project paths
# Then run:
docker compose up -d
```

The app will be available at `http://localhost:3210`.

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `COMPOSE_MOUNTS` | Comma-separated list of mount points inside the container. You can override the project name with `\|`. | `/mnt/docker,/mnt/server,/mnt/trifi\|Trifi` |
| `TZ` | Container timezone | `Asia/Vladivostok` |
| `AUTH_USER` | Login username (optional, enables auth) | `admin` |
| `AUTH_PASS` | Login password (optional, enables auth) | `secret123` |
| `AUTH_SECRET` | Secret key for signing cookies | `random-string` |
| `COOKIE_SECURE` | Add `Secure` flag to auth cookie (set to `true` for HTTPS) | `true` |
| `FILE_EXT_WHITELIST` | Custom regex for allowed file extensions | `\.(yml\|yaml\|env)$` |
| `ALLOW_ALL_EXTENSIONS` | Bypass file extension whitelist | `true` |

### Mount Modes

- **Direct mode** — if a folder contains `.env`, `compose/`, or `.yml` files, it is treated as a single project. The name is taken from `basename` (or from `\|NAME`).
- **Multi mode** — if a folder shows no project signs, each subfolder inside it becomes a separate project.

---

## Project Structure

```
.
├── docker-compose.yml      # Docker Compose launch
├── Dockerfile              # Node 22 Alpine
├── package.json
├── public/
│   ├── index.html          # Home (project list)
│   ├── editor.html         # Editor
│   ├── map.html            # Visual map
│   ├── css/
│   │   └── main.css        # Editor styles
│   └── js/
│       ├── app.js          # Main controller
│       ├── editor.js       # CodeMirror + linter
│       ├── i18n.js         # Translations loader
│       ├── parser.js       # YAML → graph parser
│       ├── sidebar.js      # File sidebar
│       ├── tabs.js         # Tabs
│       ├── rightpanel.js   # Right panel (networks/env/secrets)
│       ├── themes.js       # Dark/light theme
│       └── ...             # API, modals, toast modules, etc.
├── locales/                # UI translations (JSON)
└── server/
    ├── index.js            # Express entrypoint
    ├── routes/
    │   ├── files.js        # File CRUD + linting
    │   └── projects.js     # Project management
    └── utils/
        └── fs.js           # FS and mount helpers
```

---

## Tech Stack

- **Backend:** Node.js 22, Express 5
- **Frontend:** Vanilla JS, CodeMirror 5, D3 (zoom/pan on the map)
- **Linting:** dclint, yaml
- **Deploy:** Docker Compose
- **CI:** GitHub Actions (auto-release + Docker image)

---

## Security

- **Authentication:** set `AUTH_USER` and `AUTH_PASS` to enable login/password protection. All pages and API endpoints require authentication when both are set.
- **Timing-safe comparison:** login and token verification use `crypto.timingSafeEqual` to prevent timing attacks.
- **Rate limiting:** login endpoint is limited to 5 attempts per 15 minutes per IP.
- **Path traversal protection:** `safeResolvePath` uses `fs.realpathSync` to block symlinks escaping the mount root.
- **XSS mitigation:** frontend renders dynamic content with DOM APIs and HTML entity escaping instead of `innerHTML`.
- **CSP-ready:** inline event handlers migrated to `addEventListener`.
- **File extension whitelist:** configurable whitelist on file create/save operations.

---

## License

AGPL-3.0-or-later

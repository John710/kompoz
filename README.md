# Kompoz

> Self-hosted web editor & visualizer for your Docker Compose stacks.

**Kompoz** helps you edit, organize, and understand Docker Compose projects from a single web interface. Multi-project support, live YAML linting, interactive dependency maps, and a built-in network scanner — all in one lightweight container.

---

## What you get

| Feature | What it does |
|---------|-------------|
| **📁 Project Manager** | Work with multiple compose stacks from one UI. Projects are auto-detected from mounted folders. |
| **✏️ YAML Editor** | Syntax highlighting, error linting, and tabbed editing for `.yml`, `.env`, and secrets — powered by CodeMirror. |
| **🗺️ Container Map** | Interactive graph of services, networks, and volumes. Zoom, pan, filter by type, and click any node to jump straight to its file. |
| **🌐 Network Scanner** | Scan local subnets, discover devices by open ports and TCP fingerprints, and build a network topology map. |
| **🛡️ Optional Auth** | Simple login with HMAC-signed cookies, or connect a PostgreSQL database for user management. |
| **🌙 Dark/Light Theme** | Switch instantly with zero reload. |
| **🌍 Bilingual** | English and Russian interface out of the box. |

---

## Quick Start

The fastest way is Docker Compose:

```bash
git clone https://github.com/John710/kompoz.git
cd kompoz
```

Edit `docker-compose.yml` to point `volumes` at your actual compose folders, then:

```bash
docker compose up -d
```

Open `http://localhost:3710`.

### Without Docker

```bash
npm install
npm start
```

---

## How it works

### Mounting projects

Point `COMPOSE_MOUNTS` to one or more folders on your host:

```
COMPOSE_MOUNTS=/mnt/docker,/mnt/server
```

Kompoz detects projects automatically:
- **Direct mode** — a folder containing `.yml` or `.env` files is treated as one project.
- **Multi mode** — a plain folder becomes a catalog, and every subfolder inside it is a separate project.

You can override project names with a pipe:

```
COMPOSE_MOUNTS=/mnt/docker,/mnt/server,/mnt/trifi|Trifi
```

### Pages

| Page | Path | Use for |
|------|------|---------|
| **Home** | `/` | Browse, create, and switch projects |
| **Editor** | `/editor.html` | Edit compose files, secrets, and environment variables |
| **Container Map** | `/map.html` | Visualize service dependencies and click any card to open its source file |
| **Network Map** | `/homelab.html` | Scan your LAN, find devices, draw links between them |

---

## Configuration

Set these via environment variables:

| Variable | What it does | Example |
|----------|-------------|---------|
| `COMPOSE_MOUNTS` | Where your compose projects live (comma-separated) | `/mnt/docker` |
| `DATABASE_URL` | Optional PostgreSQL connection string | `postgres://user:pass@localhost:5432/db` |
| `AUTH_USER` / `AUTH_PASS` | Login credentials (optional; enables auth) | `admin` / `secret` |
| `AUTH_SECRET` | Cookie signing key (random string) | ` anything long ` |
| `FILE_EXT_WHITELIST` | Allow extra file extensions | `\.(yml|yaml|env|json)$` |
| `ALLOW_ALL_EXTENSIONS` | Disable extension checks entirely | `true` |
| `TZ` | Container timezone | `Europe/Moscow` |
| `PORT` | HTTP port inside the container | `3710` |

---

## Tips

- **Scanner inside LXC / Docker?** The network scanner needs `NET_RAW` capability for ICMP ping. In the provided Compose template this is handled via `cap_add` and `network_mode: host`. If devices still don't appear, make sure your LXC container is bridged to the LAN — NAT mode isolates the scanner.
- **No database?** Kompoz works fine with just the filesystem. PostgreSQL is only needed if you want user accounts and scan history persistence.
- **First launch** — if you don't see any projects, check that `COMPOSE_MOUNTS` points to the right host paths inside the container.

---

## License

AGPL-3.0-or-later

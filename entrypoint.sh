#!/bin/sh
set -e

# Fix ownership of mount points so the node user can read/write compose files.
# COMPOSE_MOUNTS is a comma-separated list of paths (optionally with |name suffix).
# Falls back to COMPOSE_ROOT if COMPOSE_MOUNTS is not set.
MOUNTS="${COMPOSE_MOUNTS:-${COMPOSE_ROOT:-/compose}}"

echo "$MOUNTS" | tr ',' '\n' | while read -r entry; do
  mount_path=$(echo "$entry" | cut -d'|' -f1)
  mount_path=$(echo "$mount_path" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -n "$mount_path" ] && [ -d "$mount_path" ]; then
    echo "Fixing ownership of $mount_path"
    chown -R node:node "$mount_path" 2>/dev/null || true
  fi
done

exec su-exec node node server/index.js

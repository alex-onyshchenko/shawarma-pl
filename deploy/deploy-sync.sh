#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: ./deploy/deploy-sync.sh [user@server] [api-hostname]

Defaults: root@139.162.130.216 139-162-130-216.ip.linodeusercontent.com
Optional environment: SSH_PORT=22 DEPLOY_DIR=/opt/shaurmisha-sync
Requires remote Docker Compose v2+, Python 3 and curl.
All Sync routes are exposed over HTTPS; existing API authentication still applies.
The server .env.prod and Docker data volumes are preserved on updates.
HELP
}
if [[ ${1:-} == --help || ${1:-} == -h ]]; then usage; exit 0; fi
if (( $# > 2 )); then usage >&2; exit 2; fi
target=${1:-root@139.162.130.216}
api_host=${2:-139-162-130-216.ip.linodeusercontent.com}
ssh_port=${SSH_PORT:-22}
deploy_dir=${DEPLOY_DIR:-/opt/shaurmisha-sync}
# These values enter remote shell commands; only literal names/paths are allowed.
[[ $target =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || { echo 'Invalid SSH target' >&2; exit 2; }
[[ $api_host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$ ]] || { echo 'Use a DNS hostname without https:// or a path' >&2; exit 2; }
[[ $ssh_port =~ ^[0-9]+$ ]] || { echo 'Invalid SSH_PORT' >&2; exit 2; }
[[ $deploy_dir =~ ^/[a-zA-Z0-9_/-]+$ && $deploy_dir != / ]] || { echo 'Invalid DEPLOY_DIR' >&2; exit 2; }
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_cmd=(ssh -p "$ssh_port" -o ConnectTimeout=15 -o StrictHostKeyChecking=ask "$target")

echo "Checking $target (Docker, Compose, Python and curl)..."
"${ssh_cmd[@]}" "set -eu; docker info >/dev/null; docker compose version; command -v python3 >/dev/null; command -v curl >/dev/null; mkdir -p '$deploy_dir'"
echo 'Uploading source and configuration (no local env or database)...'
cd "$repo_dir"
files=(services/sync/*.js services/sync/package.json services/sync/package-lock.json
  services/sync/Dockerfile services/sync/.dockerignore deploy/sync/compose.yaml
  deploy/sync/Caddyfile deploy/sync/.env.prod.example deploy/sync/README.md)
COPYFILE_DISABLE=1 tar -cf - "${files[@]}" |
  "${ssh_cmd[@]}" "tar -xf - -C '$deploy_dir'"

echo 'Configuring and starting Sync + Caddy...'
"${ssh_cmd[@]}" "bash -s -- '$deploy_dir' '$api_host'" <<'REMOTE'
set -euo pipefail
cd "$1/deploy/sync"
# Generate credentials only on the server; preserve them on subsequent deploys.
python3 - "$2" <<'PY'
import os
import pathlib
import secrets
import sys
path = pathlib.Path('.env.prod')
if path.exists():
    lines = path.read_text().splitlines()
else:
    lines = [f'ADMIN_TOKEN={secrets.token_hex(32)}']
lines = [line for line in lines if not line.startswith('API_HOST=')]
lines.insert(0, f'API_HOST={sys.argv[1]}')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as stream:
    stream.write('\n'.join(lines) + '\n')
path.chmod(0o600)
PY

compose=(docker compose --env-file .env.prod)
"${compose[@]}" config --quiet
"${compose[@]}" run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
"${compose[@]}" up -d --build --wait --wait-timeout 180
# Reload changed bind-mounted config even if the container was not recreated.
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
"${compose[@]}" ps
echo 'Waiting for the public HTTPS certificate and API health check...'
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "https://$2/api/health"; then
    healthy=true
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then
  echo 'HTTPS check failed. Check DNS and inbound TCP 80/443 in the provider firewall.' >&2
  "${compose[@]}" logs --tail 40 caddy >&2
  exit 1
fi
echo
echo "Sync is available at https://$2"
REMOTE
echo "Deployment complete. Remote directory: $deploy_dir"

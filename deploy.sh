#!/usr/bin/env bash
# One-shot deploy for NeighbourAid on any Ubuntu/Debian VM
# (AWS Lightsail, AWS EC2, Oracle Always Free, DigitalOcean, Hetzner, etc.)
#
# Usage (fresh VM):
#   curl -fsSL https://raw.githubusercontent.com/pk23nk21/NeighbourAid/main/deploy.sh | bash
#
# Or clone first and run it:
#   git clone https://github.com/pk23nk21/NeighbourAid.git neighbouraid
#   cd neighbouraid && bash deploy.sh
#
# Re-runs are safe — it is idempotent.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/pk23nk21/NeighbourAid.git}"
APP_DIR="${APP_DIR:-$HOME/neighbouraid}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

say "Installing Docker (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

# Docker Compose v2 is bundled with modern Docker — double-check
if ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker Compose plugin"
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
fi

say "Fetching source into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"

say "Generating .env if missing"
if [ ! -f .env ]; then
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > .env <<EOF
JWT_SECRET=$SECRET
# Flip to 0 on a 2GB+ VM to load the real HuggingFace model.
NA_DISABLE_AI_MODEL=1
EOF
  echo "Wrote .env with a fresh JWT_SECRET."
fi

say "Building and starting the stack"
# sudo prefix survives the first-run case where the current shell hasn't
# picked up the new docker group membership yet.
sudo -E docker compose up -d --build

say "Waiting for services to become healthy"
sleep 6
sudo docker compose ps

PUBLIC_IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || echo 'your-server-ip')"
cat <<EOF

✅ NeighbourAid is up.

  Frontend:  http://$PUBLIC_IP:3000
  Backend:   http://$PUBLIC_IP:8000/docs

Next steps:
  • Open ports 3000 and 8000 in your cloud firewall (Lightsail / Security Group / ufw).
  • To use a domain with HTTPS, put Caddy or Traefik in front:
      docker run -d -p 80:80 -p 443:443 --name caddy caddy caddy reverse-proxy --from yourdomain.com --to localhost:3000
  • Set NA_DISABLE_AI_MODEL=0 in .env and \`docker compose up -d --build\`
    to load the real HuggingFace model (needs ~2 GB RAM).

EOF

#!/bin/bash
set -euo pipefail

cd /root/projects/prod/halloween-tbc

git pull --ff-only

# First deploy: create .env with a stable admin key so the admin link survives restarts.
if [ ! -f .env ]; then
  printf 'PORT=3131\nADMIN_KEY=%s\n' "$(openssl rand -hex 8)" > .env
  chmod 600 .env
fi

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "halloween-tbc deployed on :$(grep '^PORT=' .env | cut -d= -f2) (behind https://halloween.tbcap.mn)"
echo "Admin: https://halloween.tbcap.mn/admin?key=$(grep '^ADMIN_KEY=' .env | cut -d= -f2)"

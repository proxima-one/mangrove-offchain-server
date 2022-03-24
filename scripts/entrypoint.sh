#!/bin/sh

set -e
if [ "$MIGRATE_DB" == "1" ]; then
  echo "deploying prisma migrations..."
  npx prisma migrate deploy
fi

dumb-init node index.js "$@"

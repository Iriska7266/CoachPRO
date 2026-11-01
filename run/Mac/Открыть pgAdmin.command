#!/bin/zsh
set -e
cd "${0:A:h}"
if command -v node >/dev/null 2>&1; then
  task_node=$(command -v node)
else
  task_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
print 'pgAdmin: http://127.0.0.1:5050'
print 'Логин и пароль: PGADMIN_DEFAULT_EMAIL и PGADMIN_DEFAULT_PASSWORD в .env'
exec "$task_node" --env-file=.env scripts/pgadmin.js

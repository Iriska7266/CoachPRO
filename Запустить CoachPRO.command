#!/bin/zsh
set -e
cd "${0:A:h}"
if command -v node >/dev/null 2>&1; then
  task_node=$(command -v node)
else
  task_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$task_node" ]]; then
  print 'Нужен Node.js 24 или новее.'
  read '?Нажмите Enter для выхода'
  exit 1
fi
export PATH="${task_node:h}:$PATH"
"$task_node" scripts/setup-env.js
if [[ ! -d node_modules ]]; then
  print 'Сначала установите зависимости: pnpm install'
  read '?Нажмите Enter для выхода'
  exit 1
fi
print 'CoachPRO: http://localhost:3000'
print 'Остановка: Ctrl+C. Данные PostgreSQL сохраняются.'
exec "$task_node" --env-file=.env scripts/dev.js

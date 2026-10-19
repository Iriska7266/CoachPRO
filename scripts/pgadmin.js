// pgAdmin is a local administration tool, separate from the JavaScript application.
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
const root = resolve('.local/pgadmin-venv');
if (!existsSync(root)) {
  console.error('Сначала установите pgAdmin по README.');
  process.exit(1);
}
const py = readdirSync(join(root, 'lib')).find((n) => n.startsWith('python'));
const packageDir = join(root, 'lib', py, 'site-packages', 'pgadmin4');
const python = join(root, 'bin', 'python');
const dataDir = resolve('.local/pgadmin');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
writeFileSync(
  join(packageDir, 'config_local.py'),
  [
    'SERVER_MODE = True',
    `DATA_DIR = ${JSON.stringify(dataDir)}`,
    "DEFAULT_SERVER = '127.0.0.1'",
    'DEFAULT_SERVER_PORT = 5050',
    'UPGRADE_CHECK_ENABLED = False',
    "DEFAULT_LANGUAGE = 'ru'",
    '',
  ].join('\n'),
);
const env = {
  ...process.env,
  PGADMIN_SETUP_EMAIL: process.env.PGADMIN_DEFAULT_EMAIL,
  PGADMIN_SETUP_PASSWORD: process.env.PGADMIN_DEFAULT_PASSWORD,
};
function run(args) {
  const result = spawnSync(python, [join(packageDir, 'setup.py'), ...args], {
    env,
    encoding: 'utf8',
  });
  if (result.status) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status);
  }
  console.log(result.stdout.trim());
}
if (!existsSync(join(dataDir, 'pgadmin4.db'))) run(['setup-db']);
// This file is private to the local OS user, like .env; no password is printed or committed.
const pgpass = join(dataDir, 'pgpass');
const escape = (v) => v.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
writeFileSync(
  pgpass,
  `127.0.0.1:54329:*:${escape(process.env.POSTGRES_USER)}:${escape(process.env.POSTGRES_PASSWORD)}\n`,
  { mode: 0o600 },
);
const serverFile = join(dataDir, 'servers.json');
writeFileSync(
  serverFile,
  JSON.stringify({
    Servers: {
      1: {
        Name: 'CoachPRO · локальная база',
        Group: 'CoachPRO',
        Host: '127.0.0.1',
        Port: 54329,
        MaintenanceDB: 'coachpro',
        Username: process.env.POSTGRES_USER,
        ConnectionParameters: { sslmode: 'prefer', passfile: pgpass },
        Comment: 'Данные разработки. База coachpro_test предназначена только для автотестов.',
      },
    },
  }),
);
if (!existsSync(join(dataDir, 'servers-imported'))) {
  run(['load-servers', serverFile, '--user', process.env.PGADMIN_DEFAULT_EMAIL]);
  writeFileSync(join(dataDir, 'servers-imported'), '1');
}
console.log('pgAdmin: http://127.0.0.1:5050 · данные входа в .env');
const child = spawn(python, [join(packageDir, 'pgAdmin4.py')], { env, stdio: 'inherit' });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code || 0));

import { randomBytes, createECDH } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const secret = () => randomBytes(24).toString('hex');
const path = fileURLToPath(new URL('../.env', import.meta.url));
if (!existsSync(path))
  writeFileSync(
    path,
    [
      'COMPOSE_PROJECT_NAME=coachpro',
      'POSTGRES_DB=coachpro',
      'POSTGRES_USER=coachpro',
      `POSTGRES_PASSWORD=${secret()}`,
      `TEST_DB_PASSWORD=${secret()}`,
      'PGADMIN_DEFAULT_EMAIL=admin@example.com',
      `PGADMIN_DEFAULT_PASSWORD=${secret()}`,
      'APP_ORIGIN=http://localhost:3000',
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
const text = readFileSync(path, 'utf8');
if (!/^VAPID_PRIVATE_KEY=/m.test(text)) {
  const key = createECDH('prime256v1');
  key.generateKeys();
  appendFileSync(
    path,
    `\nVAPID_PUBLIC_KEY=${key.getPublicKey().toString('base64url')}\nVAPID_PRIVATE_KEY=${key.getPrivateKey().toString('base64url')}\nVAPID_SUBJECT=mailto:admin@coachpro.local\n`,
  );
}
console.log('.env готов. Существующие пароли сохранены. Секреты не выводятся в консоль.');

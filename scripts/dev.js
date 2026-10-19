import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
process.env.NODE_ENV = 'development';
let database;
if (!process.env.DATABASE_URL) {
  const dir = resolve('.local/postgres');
  mkdirSync('.local', { recursive: true });
  database = new EmbeddedPostgres({
    databaseDir: dir,
    user: process.env.POSTGRES_USER || 'coachpro',
    password: process.env.POSTGRES_PASSWORD,
    port: 54329,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(`${dir}/PG_VERSION`)) await database.initialise();
  await database.start();
  const client = database.getPgClient();
  await client.connect();
  for (const name of ['coachpro', 'coachpro_test']) {
    if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
      await client.query(`CREATE DATABASE ${name}`);
  }
  if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='coachpro_test'")).rowCount) {
    const sql = (
      await client.query("SELECT format('CREATE ROLE coachpro_test LOGIN PASSWORD %L',$1::text)", [
        process.env.TEST_DB_PASSWORD,
      ])
    ).rows[0].format;
    await client.query(sql);
  }
  await client.query('ALTER DATABASE coachpro_test OWNER TO coachpro_test');
  await client.query('REVOKE CONNECT ON DATABASE coachpro FROM PUBLIC');
  await client.query('REVOKE CONNECT ON DATABASE coachpro_test FROM PUBLIC');
  await client.query('GRANT CONNECT ON DATABASE coachpro_test TO coachpro_test');
  await client.end();
  const testClient = database.getPgClient('coachpro_test');
  await testClient.connect();
  await testClient.query('ALTER SCHEMA public OWNER TO coachpro_test');
  await testClient.end();
  console.log('PostgreSQL: 127.0.0.1:54329 · база coachpro (для pgAdmin)');
}
const { migrate } = await import('../server/migrate.js');
await migrate();
const { seed } = await import('../server/seed.js');
await seed();
const { start } = await import('../server/index.js');
const server = await start();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  const { pool } = await import('../server/db.js');
  await pool.end();
  if (database) await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

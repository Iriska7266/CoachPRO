import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
export async function migrate() {
  await pool.query(await readFile(new URL('./db/schema.sql', import.meta.url), 'utf8'));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate();
  await pool.end();
  console.log('Схема PostgreSQL готова.');
}

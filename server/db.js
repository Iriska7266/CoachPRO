import pg from 'pg';
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'coachpro'}:${process.env.POSTGRES_PASSWORD}@127.0.0.1:${process.env.PGPORT || 54329}/${process.env.POSTGRES_DB || 'coachpro'}`,
});
export const query = (text, params = []) => pool.query(text, params);
export async function transaction(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

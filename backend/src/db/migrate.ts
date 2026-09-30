import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config';

export async function runMigrations(pool?: Pool): Promise<void> {
  const client = pool ?? new Pool({ connectionString: config.db.url });
  const ownPool = !pool;

  const conn = await client.connect();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename    VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort().filter(f => f.endsWith('.sql'));

    for (const file of files) {
      const { rows } = await conn.query(
        'SELECT 1 FROM migrations WHERE filename = $1',
        [file],
      );
      if (rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] applying ${file}…`);
      try {
        await conn.query('BEGIN');
        await conn.query(sql);
        await conn.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        await conn.query('COMMIT');
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        await conn.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}\n${(err as Error).message}`);
      }
    }
  } finally {
    conn.release();
    if (ownPool) await client.end();
  }
}

// CLI entrypoint: ts-node src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => { console.log('[migrate] all done'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}

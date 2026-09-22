import fs from 'fs';
import path from 'path';
import { db } from './index';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    const { rows } = await db.query(
      'SELECT filename FROM migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  await db.end();
  console.log('Migrations complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

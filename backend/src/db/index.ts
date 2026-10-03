import { Pool } from 'pg';
import { config } from '../config';

export const db = new Pool({
  connectionString: config.db.url,
  max: 10,                        // reduced from 20 — prevents pool exhaustion under load
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // was 2000 — gives DB time to respond under load
});

db.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

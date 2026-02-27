import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../src/lib/db/client';

const migrationDir = join(process.cwd(), 'db/migrations');
const files = readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

for (const file of files) {
  const alreadyApplied = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1`,
    [file]
  );
  if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
    console.log(`Skipping ${file} (already applied)`);
    continue;
  }

  const migration = readFileSync(join(migrationDir, file), 'utf8');
  console.log(`Running ${file}`);
  await pool.query(migration);
  await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
}

await pool.end();
console.log('Migrations complete.');

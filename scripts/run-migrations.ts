import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../src/lib/db/client';

const migrationDir = join(process.cwd(), 'db/migrations');
const files = readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const migration = readFileSync(join(migrationDir, file), 'utf8');
  console.log(`Running ${file}`);
  await pool.query(migration);
}

await pool.end();
console.log('Migrations complete.');

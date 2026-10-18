import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const migrationUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!migrationUrl) throw new Error('Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL before running migrations.');
const pool = new Pool({ connectionString: migrationUrl, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

const directory = path.resolve('migrations');
const files = (await fs.readdir(directory)).filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort();
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const filename of files) {
    const prior = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (prior.rowCount) { console.log(`skip ${filename} (already applied)`); continue; }
    const sql = await fs.readFile(path.join(directory, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}

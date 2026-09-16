import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function backupDatabase(source: string, destination: string): Promise<void> {
  if (source === ':memory:')
    throw new Error('An in-memory test database cannot be backed up by this command');
  if (!existsSync(source)) throw new Error('Source database does not exist');
  if (resolve(source) === resolve(destination) || existsSync(destination))
    throw new Error('Choose a new backup filename; existing files will not be overwritten');
  mkdirSync(dirname(resolve(destination)), { recursive: true });
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(database, destination);
  } finally {
    database.close();
  }
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    const result = copy.prepare('PRAGMA quick_check').get();
    if (result?.quick_check !== 'ok') throw new Error('Backup integrity check failed');
  } finally {
    copy.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const demoMode =
    process.env.DEMO_MODE === 'true' ||
    (process.env.DEMO_MODE === undefined && process.env.NODE_ENV !== 'production');
  const source = process.env.DATABASE_PATH ?? (demoMode ? 'data/goatara-demo.sqlite' : 'data/goatara.sqlite');
  const destination =
    process.argv[2] ?? `data/backups/goatara-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
  try {
    await backupDatabase(source, destination);
    console.log(`Verified backup created: ${resolve(destination)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup failed');
    process.exitCode = 1;
  }
}

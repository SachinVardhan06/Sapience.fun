import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const dataDir = resolve(process.env.DATA_DIR || 'data');
const source = join(dataDir, 'sapience.sqlite');
if (!existsSync(source)) throw new Error(`Database not found: ${source}`);

const backupDir = join(dataDir, 'backups');
mkdirSync(backupDir, { recursive: true });
const destination = join(backupDir, `sapience-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  const copy = new DatabaseSync(destination);
  try {
    copy.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
    const result = copy.prepare('PRAGMA integrity_check').get();
    if (Object.values(result)[0] !== 'ok') throw new Error('Backup integrity check failed.');
  } finally { copy.close(); }
  console.log(`Verified backup: ${destination}`);
} finally { db.close(); }

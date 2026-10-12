import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [action, id] = process.argv.slice(2);
const file = join(resolve(process.env.DATA_DIR || 'data'), 'sapience.sqlite');
if (!existsSync(file)) {
  console.error('No Sapience database found. Set DATA_DIR to the server data directory.');
  process.exitCode = 1;
} else if (!['list', 'approve', 'reject'].includes(action)) {
  console.error('Usage: node moderate-feedback.mjs list | approve <id> | reject <id>');
  process.exitCode = 1;
} else {
  const db = new DatabaseSync(file);
  if (action === 'list') {
    const rows = db.prepare("SELECT feedback.id, users.email, feedback.display_name AS name, feedback.rating, feedback.message, feedback.created_at FROM feedback JOIN users ON users.id = feedback.user_id WHERE feedback.status = 'pending' ORDER BY feedback.created_at ASC").all();
    console.log(rows.length ? JSON.stringify(rows, null, 2) : 'No feedback awaiting review.');
  } else if (!/^[a-f0-9]{32}$/.test(id || '')) {
    console.error('Provide a feedback ID from the list command.');
    process.exitCode = 1;
  } else {
    const result = db.prepare('UPDATE feedback SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(action === 'approve' ? 'approved' : 'rejected', Date.now(), id, 'pending');
    if (!result.changes) { console.error('Pending feedback ID not found.'); process.exitCode = 1; }
    else console.log(`Feedback ${action === 'approve' ? 'approved' : 'rejected'}.`);
  }
  db.close();
}

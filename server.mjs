import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, extname, sep, isAbsolute } from 'node:path';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCallback);
const root = resolve('dist');
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.DATA_DIR || !isAbsolute(process.env.DATA_DIR))) {
  throw new Error('Production requires an absolute DATA_DIR on persistent storage.');
}
const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'sapience.sqlite'));
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY, checklist TEXT NOT NULL DEFAULT '{}', lessons TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS study (user_id TEXT PRIMARY KEY, bookmarks TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '{}', best_quiz INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, rating INTEGER NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));`);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const sessionMs = 30 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const securityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join('; ');
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const fail = (res, status, message) => json(res, status, { error: message });
const cookie = (token, maxAge) => `sapience_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`;
const cleanUser = user => ({ id: user.id, name: user.name, email: user.email });

function currentUser(req) {
  const match = /(?:^|;\s*)sapience_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  if (!match) return null;
  const row = db.prepare('SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(hash(match[1]), Date.now());
  return row || null;
}

function issueSession(res, user) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash(token), user.id, Date.now() + sessionMs);
  res.setHeader('Set-Cookie', cookie(token, Math.floor(sessionMs / 1000)));
  json(res, 200, { user: cleanUser(user) });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid request.'); }
}

function allowAttempt(req, purpose = 'auth', limit = 30, subject = req.socket.remoteAddress || 'unknown') {
  const key = `${purpose}:${subject}`;
  const now = Date.now();
  if (attempts.size > 10000) for (const [entry, value] of attempts) if (value.until < now) attempts.delete(entry);
  const record = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (now > record.until) { record.count = 0; record.until = now + 15 * 60 * 1000; }
  record.count++;
  attempts.set(key, record);
  return record.count <= limit;
}

function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && (!isProduction || origin.protocol === 'https:');
  } catch { return false; }
}

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/me') return json(res, 200, { user: currentUser(req) });
  if (req.method === 'GET' && pathname === '/api/feedback') {
    const items = db.prepare("SELECT display_name AS name, rating, message FROM feedback WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 8").all();
    return json(res, 200, { items });
  }
  if (req.method === 'GET' && pathname === '/api/my-feedback') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to view your feedback.');
    const feedback = db.prepare('SELECT display_name AS name, rating, message, status FROM feedback WHERE user_id = ?').get(user.id) || null;
    return json(res, 200, { feedback });
  }
  if (req.method === 'GET' && pathname === '/api/progress') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to sync progress.');
    const row = db.prepare('SELECT checklist, lessons FROM progress WHERE user_id = ?').get(user.id);
    return json(res, 200, { checklist: JSON.parse(row?.checklist || '{}'), lessons: JSON.parse(row?.lessons || '{}') });
  }
  if (req.method === 'GET' && pathname === '/api/study') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to sync your study tools.');
    const row = db.prepare('SELECT bookmarks, notes, best_quiz FROM study WHERE user_id = ?').get(user.id);
    return json(res, 200, { bookmarks: JSON.parse(row?.bookmarks || '{}'), notes: JSON.parse(row?.notes || '{}'), bestQuiz: row?.best_quiz || 0 });
  }
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');
  if (!sameOrigin(req)) return fail(res, 403, 'Request origin was not accepted.');
  if (['/api/register', '/api/login'].includes(pathname) && !allowAttempt(req, 'auth', 10)) return fail(res, 429, 'Too many attempts. Please try again later.');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'Send JSON to this endpoint.');
  let body;
  try { body = await readJson(req); } catch (error) { return fail(res, error.status || 400, error.message); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'Invalid request.');

  if (pathname === '/api/register') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password;
    if (name.length < 2 || name.length > 60) return fail(res, 400, 'Name must be 2–60 characters.');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return fail(res, 400, 'Password must be 12–128 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail(res, 409, 'An account with this email already exists.');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: randomBytes(16).toString('hex'), name, email };
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('INSERT INTO users (id, name, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, name, email, salt, passwordHash, Date.now());
      db.prepare('INSERT INTO progress (user_id) VALUES (?)').run(user.id);
      db.prepare('INSERT INTO study (user_id) VALUES (?)').run(user.id);
      db.exec('COMMIT');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      if (error.message?.includes('UNIQUE constraint failed: users.email')) return fail(res, 409, 'An account with this email already exists.');
      throw error;
    }
    return issueSession(res, user);
  }
  if (pathname === '/api/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password;
    if (email.length > 254 || typeof password !== 'string' || password.length > 128) return fail(res, 400, 'Invalid email or password.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const candidate = await scrypt(password, user?.salt || 'invalid-account-salt', 64);
    const expected = Buffer.from(user?.password_hash || '00'.repeat(64), 'hex');
    if (!user || !timingSafeEqual(candidate, expected)) return fail(res, 401, 'Invalid email or password.');
    return issueSession(res, user);
  }
  if (pathname === '/api/logout') {
    const match = /(?:^|;\s*)sapience_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    if (match) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(match[1]));
    res.setHeader('Set-Cookie', cookie('', 0));
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/progress') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to sync progress.');
    const allowedChecks = new Set(['unique-passwords', 'least-privilege', 'remove-accounts', 'updates', 'inventory', 'secrets', 'validation', 'output', 'authorization', 'https', 'logs', 'alerts', 'backups', 'contacts', 'plan']);
    const allowedLessons = new Set(['identity', 'attacks', 'software', 'response']);
    const validMap = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, checked]) => allowed.has(key) && typeof checked === 'boolean');
    if (!validMap(body.checklist, allowedChecks) || !validMap(body.lessons, allowedLessons)) return fail(res, 400, 'Invalid progress data.');
    db.prepare('UPDATE progress SET checklist = ?, lessons = ? WHERE user_id = ?').run(JSON.stringify(body.checklist), JSON.stringify(body.lessons), user.id);
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/study') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to sync your study tools.');
    const lessons = new Set(['identity', 'attacks', 'software', 'response']);
    const validBookmarks = body.bookmarks && typeof body.bookmarks === 'object' && !Array.isArray(body.bookmarks) && Object.entries(body.bookmarks).every(([key, value]) => lessons.has(key) && typeof value === 'boolean');
    const validNotes = body.notes && typeof body.notes === 'object' && !Array.isArray(body.notes) && Object.entries(body.notes).every(([key, value]) => lessons.has(key) && typeof value === 'string' && value.length <= 2000);
    if (!validBookmarks || !validNotes || !Number.isInteger(body.bestQuiz) || body.bestQuiz < 0 || body.bestQuiz > 4) return fail(res, 400, 'Invalid study data.');
    db.prepare('INSERT INTO study (user_id, bookmarks, notes, best_quiz) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET bookmarks = excluded.bookmarks, notes = excluded.notes, best_quiz = excluded.best_quiz').run(user.id, JSON.stringify(body.bookmarks), JSON.stringify(body.notes), body.bestQuiz);
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/feedback') {
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Sign in to leave feedback.');
    if (!allowAttempt(req, 'feedback', 5, user.id)) return fail(res, 429, 'Please wait before submitting again.');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (name.length < 2 || name.length > 40) return fail(res, 400, 'Display name must be 2–40 characters.');
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return fail(res, 400, 'Choose a rating from 1 to 5.');
    if (message.length < 30 || message.length > 600) return fail(res, 400, 'Feedback must be 30–600 characters.');
    if (body.consent !== true) return fail(res, 400, 'Please agree to public display before submitting.');
    const now = Date.now();
    db.prepare("INSERT INTO feedback (id, user_id, display_name, rating, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, rating = excluded.rating, message = excluded.message, status = 'pending', updated_at = excluded.updated_at").run(randomBytes(16).toString('hex'), user.id, name, body.rating, message, now, now);
    return json(res, 200, { status: 'pending' });
  }
  return fail(res, 404, 'Not found.');
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', securityPolicy);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed.');
      db.prepare('SELECT 1').get();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : 'ok');
    }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed.');
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(root, `.${decodeURIComponent(requested)}`);
    if (!file.startsWith(root + sep) || !existsSync(file) || !types[extname(file)]) return fail(res, 404, 'Not found.');
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) fail(res, 500, 'Something went wrong.');
    else res.end();
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Sapience listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(() => db.close());
  setTimeout(() => server.closeAllConnections(), 10000).unref();
});

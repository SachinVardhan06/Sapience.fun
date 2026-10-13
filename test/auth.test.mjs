import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = mkdtempSync(join(tmpdir(), 'sapience-auth-test-'));
const port = await new Promise((resolvePort, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const chosen = probe.address().port;
    probe.close(() => resolvePort(chosen));
  });
});
const origin = `http://127.0.0.1:${port}`;
let child;
async function start() {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: resolve('.'), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before startup.');
    try { if ((await fetch(`${origin}/api/me`)).ok) return; } catch { /* Still starting. */ }
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error('Server did not start.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(done => { child.once('exit', done); child.kill(); });
}
async function request(path, method = 'GET', body, session, requestOrigin = origin) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, value: await response.json(), session: response.headers.get('set-cookie')?.split(';')[0] };
}

test('accounts authenticate and progress survives a server restart', async () => {
  try {
    await start();
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    assert.match(health.headers.get('content-security-policy'), /script-src 'self'/);
    const email = 'reader@example.test';
    const registered = await request('/api/register', 'POST', { name: 'Reader Test', email, password: 'A secure example passphrase 123' });
    assert.equal(registered.status, 200);
    assert.equal(registered.value.user.email, email);
    assert.match(registered.session, /^sapience_session=/);
    assert.equal((await request('/api/register', 'POST', { name: 'Another Reader', email, password: 'Another secure passphrase 123' })).status, 409);
    assert.equal((await request('/api/progress', 'POST', { checklist: { https: true }, lessons: { identity: true } }, registered.session)).status, 200);
    assert.equal((await request('/api/study', 'POST', { bookmarks: { identity: true }, notes: { identity: 'Enable MFA.' }, bestQuiz: 3 }, registered.session)).status, 200);
    assert.equal((await request('/api/feedback', 'POST', { name: 'Reader', rating: 5, message: 'The guided steps made MFA much easier to understand.', consent: false }, registered.session)).status, 400);
    assert.equal((await request('/api/feedback', 'POST', { name: 'Reader', rating: 5, message: 'The guided steps made MFA much easier to understand.', consent: true }, registered.session)).status, 200);
    assert.deepEqual((await request('/api/feedback')).value.items, []);
    assert.equal((await request('/api/my-feedback', 'GET', undefined, registered.session)).value.feedback.status, 'pending');
    assert.equal((await request('/api/logout', 'POST', {}, registered.session)).status, 200);
    assert.equal((await request('/api/me', 'GET', undefined, registered.session)).value.user, null);
    assert.equal((await request('/api/login', 'POST', { email, password: 'wrong password' })).status, 401);
    assert.equal((await request('/api/login', 'POST', { email, password: 'A secure example passphrase 123' }, undefined, 'https://elsewhere.example')).status, 403);
    const oversized = await request('/api/study', 'POST', { notes: { identity: 'x'.repeat(17000) } }, registered.session);
    assert.equal(oversized.status, 413);
    execFileSync(process.execPath, ['backup.mjs'], { cwd: resolve('.'), env: { ...process.env, DATA_DIR: dataDir } });
    const copies = readdirSync(join(dataDir, 'backups'));
    assert.equal(copies.length, 1);
    const copy = new DatabaseSync(join(dataDir, 'backups', copies[0]), { readOnly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS total FROM users').get().total, 1);
    copy.close();
    await stop();
    const cliEnv = { ...process.env, DATA_DIR: dataDir };
    const pending = JSON.parse(execFileSync(process.execPath, ['moderate-feedback.mjs', 'list'], { cwd: resolve('.'), env: cliEnv, encoding: 'utf8' }));
    assert.equal(pending.length, 1);
    execFileSync(process.execPath, ['moderate-feedback.mjs', 'approve', pending[0].id], { cwd: resolve('.'), env: cliEnv });
    await start();
    const loggedIn = await request('/api/login', 'POST', { email, password: 'A secure example passphrase 123' });
    assert.equal(loggedIn.status, 200);
    const progress = await request('/api/progress', 'GET', undefined, loggedIn.session);
    assert.deepEqual(progress.value, { checklist: { https: true }, lessons: { identity: true } });
    const study = await request('/api/study', 'GET', undefined, loggedIn.session);
    assert.deepEqual(study.value, { bookmarks: { identity: true }, notes: { identity: 'Enable MFA.' }, bestQuiz: 3 });
    assert.deepEqual((await request('/api/feedback')).value.items, [{ name: 'Reader', rating: 5, message: 'The guided steps made MFA much easier to understand.' }]);
  } finally {
    await stop();
    if (!resolve(dataDir).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing to remove test data outside the temporary directory.');
    rmSync(dataDir, { recursive: true, force: true });
  }
});

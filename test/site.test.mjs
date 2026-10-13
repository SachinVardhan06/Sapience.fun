import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const pages = ['index.html', 'products.html', 'privacy.html', 'learn.html', 'protect.html', 'resources.html', 'account.html'];

test('published pages and their local links are included in the build', () => {
  for (const page of pages) {
    const file = join(dist, page);
    assert.ok(existsSync(file), `${page} is missing from dist`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<main\b/);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1], `https://sapience.fun/${page}`);
      if (url.origin !== 'https://sapience.fun' || match[1].startsWith('#')) continue;
      const target = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      assert.ok(existsSync(join(dist, target)), `${page} links to missing ${target}`);
    }
  }
});

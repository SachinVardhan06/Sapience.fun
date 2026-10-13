import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const file of ['index.html', 'products.html', 'privacy.html', 'learn.html', 'protect.html', 'resources.html', 'account.html', 'styles.css', 'products.css', 'education.css', 'account.css', 'features.css', 'feedback.css', 'script.js', 'auth.js', 'feedback.js', 'favicon.svg']) {
  cpSync(file, `dist/${file}`);
}
cpSync('assets', 'dist/assets', { recursive: true });

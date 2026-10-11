import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const file of ['index.html', 'learn.html', 'protect.html', 'resources.html', 'styles.css', 'education.css', 'script.js', 'favicon.svg']) {
  cpSync(file, `dist/${file}`);
}
cpSync('assets', 'dist/assets', { recursive: true });

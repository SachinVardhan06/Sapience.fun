# Sapience

The cybersecurity education website for [sapience.fun](https://sapience.fun). This is a static site with four pages:

- `index.html` — introduction, learning paths, and a quick defensive scenario
- `learn.html` — four interactive beginner lessons
- `protect.html` — a 15-step website security checklist with browser-local progress
- `resources.html` — a searchable, filterable archive of 6,526 public research links from the supplied collection

## Build

Run `npm run build`. The publishable files are written to `dist/`.

For a quick local preview, serve the repository root or `dist/` with any static HTTP server. The pages share `styles.css`, `education.css`, `script.js`, `favicon.svg`, and `assets/`. The research archive is loaded from `assets/research-index.json`; eight featured links remain visible if it cannot load.

Checklist progress is stored in the visitor's browser with `localStorage`; there is no account or server-side data collection.

## Hosting

The included `render.yaml` configures the existing `sapience-fun` Render static site to publish `dist/` from `main` with the custom domain `sapience.fun`. If the service was configured directly in the Render dashboard rather than through a Blueprint, set its build command to `npm install && npm run build`, its publish directory to `dist`, and ensure the custom domain is connected there.

Contact email: vardhansachin@sapience.fun.

# Sapience

The cybersecurity website for [sapience.fun](https://sapience.fun). This repository now contains only the static marketing site.

## Build

Run `npm run build`. The publishable files are written to `dist/`.

For a quick local preview, serve the repository root with any static HTTP server. The page uses `index.html`, `styles.css`, `script.js`, `favicon.svg`, and `assets/`.

## Hosting

The included `render.yaml` configures the existing `sapience-fun` Render static site to publish `dist/` from `main` with the custom domain `sapience.fun`. If the service was configured directly in the Render dashboard rather than through a Blueprint, set its build command to `npm install && npm run build`, its publish directory to `dist`, and ensure the custom domain is connected there.

Contact email: vardhansachin@sapience.fun.

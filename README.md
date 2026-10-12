# Sapience

The cybersecurity education website for [sapience.fun](https://sapience.fun). The site now includes a small Node server for accounts and synced progress:

- `index.html` — introduction, learning paths, and a quick defensive scenario
- `learn.html` — four interactive beginner lessons
- `protect.html` — a 15-step website security checklist with browser-local progress
- `resources.html` — a searchable, filterable archive of 6,526 public research links from the supplied collection
- `account.html` — email and password sign-up, login, and a progress dashboard

Each lesson includes a step-by-step interactive walkthrough, a bookmark, and a private note. The learning page also has a four-question defender quiz. Visitors can use the lessons and checklist without an account; signed-in visitors can save their progress, bookmarks, notes, and best quiz score across visits.

The homepage includes a factual feature overview, INR pricing cards, an April–July 2027 target roadmap, an animated feedback carousel, and a FAQ. Paid plan buttons open a preaddressed membership inquiry email. Plan terms are confirmed before payment; no checkout or paid access control is implemented in this repository yet. All currently published material is free, and the 30-day membership trial requires direct inquiry. Until real feedback is approved, the carousel shows clearly labeled fictional examples with names, not customer testimonials.

## Build

Use Node.js 24 or newer. Run `npm run build && npm start`, then open `http://localhost:3000`. The publishable files are written to `dist/`; the server serves those files and the account API.

The pages share `styles.css`, `education.css`, `account.css`, `features.css`, `feedback.css`, `script.js`, `auth.js`, `feedback.js`, `favicon.svg`, and `assets/`. The research archive is loaded from `assets/research-index.json`; eight featured links remain visible if it cannot load.

Account data and progress are stored in a SQLite database in `data/` locally, or in `DATA_DIR` when set. Passwords are salted and hashed with scrypt. Session tokens are stored as hashes in the database and sent in HTTP-only cookies. Signed-out progress stays in browser storage. The site does not send verification or password reset emails yet, so deployers should add those before relying on it for sensitive account use.

## Feedback moderation

Signed-in learners can submit one feedback entry and choose the name displayed if it is published. Feedback starts in a pending state and appears publicly only after review. Run `node moderate-feedback.mjs list` in the server environment to inspect pending entries, then `node moderate-feedback.mjs approve <id>` or `node moderate-feedback.mjs reject <id>`. Set `DATA_DIR` to the same directory used by the server in production. Editing a published entry sends it back for review.

## Hosting

The included `render.yaml` configures a Render Node web service with a persistent disk mounted at `/var/data`. Render requires a paid service for persistent disks. If `sapience.fun` currently points to a static site, create or migrate to the web service, then move the custom domain after checking the new service. Use build command `npm install && npm run build`, start command `npm start`, `NODE_ENV=production`, `DATA_DIR=/var/data`, and a persistent disk at `/var/data`. Do not deploy the account server with an ephemeral filesystem: users and progress would disappear after a restart.

Contact email: vardhansachin@sapience.fun.

# SEO Bunny — Local Setup & Workspace Guide

**Author:** Mal

## Run

Double-click `Start SEO Bunny.cmd`, then open http://127.0.0.1:3210.
The launcher runs the production build. After editing source, run `npm run build` before launching again. For development, use `npm run dev -- --hostname 127.0.0.1 --port 3210`.

First-time setup on another machine:

```bash
npm ci
npm run setup:local
```

This workspace uses its own `prisma/dev.db`. It starts empty and stores all scans, business profiles, proxies, and settings locally.

The platform includes grid rank scans, scan history and schedules, competitor intelligence, review analysis, business profiles, reports, proxy settings, presets, logs, and webhooks. Scans and schedules require the local server to remain running.

Offline postal grids require GeoNames data: download `allCountries.zip` from https://download.geonames.org/export/zip/, extract `allCountries.txt` into `data/`, and run `node scripts/build-postal-data.js`. Square/circle grids do not need this dataset.

## Workspace Features

- Warm vanilla cream, terracotta, and sage theme, responsive navigation, and **SEO Bunny · Crafted by Mal ❤️** throughout the app shell and exported reports.
- Business workspaces connect saved client details with scans and review analyses; both creation flows can be prefilled.
- Review collections run as database-backed jobs, with cancellation, duplicate retry protection, restart recovery, bounded progress logs, and immutable report snapshots per run. An interrupted collection needs an explicit retry. A failed or cancelled refresh preserves the last saved report.
- Reports distinguish collected reviews from Google's total and mark incomplete/unknown coverage as partial.
- Pattern flags are heuristic hints, with reasons. Hindi/Gujarati script is explicitly unassessed by the English scorer.
- Schedules run on the server every 30 seconds without requiring an open browser tab while the server and computer remain running.
- Settings supports JSON backup/restore. Restore validates the file, refuses active jobs, saves a recovery backup in `.local-backups`, and changes data transactionally.
- Export libraries and secondary rank-report components load on demand. Reports fetch only needed ranking fields; review lists are paginated, completed review reports stop polling, and hidden tabs stop their polling.

## Google Business Profile Connection

Open Settings → Google Business Profile, or http://127.0.0.1:3210/settings/google. The page includes Google's project approval and OAuth setup steps. Use the account that is an owner or manager of the client profile.

Create a Google **Web application** OAuth client with the exact authorised redirect URI `http://127.0.0.1:3210/api/gbp/callback`. Enter its client ID and secret in the local app. After Google sign-in, load accounts, choose a location group, and select businesses to import or refresh. Google requires the `business.manage` scope.

Client secrets, refresh/access tokens, and temporary Google profile details are encrypted with AES-256-GCM. The per-workspace key is stored outside the checkout under the current user's local application data.

## Client Growth Workspace

Open http://127.0.0.1:3210/growth. Each saved business has its own review drafts, posts, contacts, review QR code, and workspace detail checks.

- **Review Inbox:** Uses the latest complete or partial public review analysis until official Google reviews are synced. Local templates supply editable starter replies.
- **Post Studio:** Saves standard update posts with optional image URL and a supported action button. Publishing and scheduling require an imported Google business and explicit approval of the exact draft.
- **QR Studio:** Generates review QR codes locally with SVG download and print-ready cards.
- **Contacts:** Supports client-specific stages, notes, permission recording, CSV export, and WhatsApp message preview links.
- **Profile Checklist:** Reports presence of saved fields in the workspace.

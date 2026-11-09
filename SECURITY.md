# Security and data

SEO Bunny is a single-user, local-first application. Its server must bind to
127.0.0.1. It has no multi-user login or tenant isolation and is not suitable
for exposure through a public URL, reverse proxy, or tunnel.

All API routes validate the local Host. Mutations require a matching browser
Origin; cross-site browser reads are blocked. Google OAuth additionally uses
PKCE, browser-bound state, and encrypted local credential storage.

Private workspace backups contain client contacts, notes, reviews, proxy
credentials, and settings. Never attach them to a public issue. Use the separate
shareable rank report export when appropriate; it still contains business names,
search keywords, and locations, so review the file before sharing.

The demo is fictional, runs in browser memory, and does not read or modify the
workspace database. Map tiles are requested from OpenStreetMap.

Never commit .env files, SQLite databases, recovery backups, private Google keys,
customer exports, or local artifacts. Run `npm run check:public` before publishing.
This lightweight source preflight does not audit Git history or prove that no
secrets exist. Rotate any credential that was previously exposed.

Report security issues privately to the maintainer through GitHub private
vulnerability reporting when enabled. Do not post credentials in a public issue.

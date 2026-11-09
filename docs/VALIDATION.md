# Version 2.1 validation — 9 November 2026

- 35 automated tests pass, including real SQLite transactions, scanner failures,
  retry history preservation, additive desktop upgrades, export redaction, and
  local request guards. Google calls and browser search collection are simulated.
- TypeScript and production/standalone builds pass.
- All 12 desktop packaging checks pass, including runtime dependency inclusion
  and exclusion of private environment/database files.
- A Windows package was built with Electron 45.2.3 and opened using a separate
  test profile. Its local server, demo, and review example loaded successfully.
  The package is unsigned. macOS was not built or tested here.
- Browser checks passed at 1440px and 390px widths: demo history switching,
  checkpoint inspection, reset, sample export, navigation, no horizontal
  overflow, and no uncaught page errors. XLSX export/import roundtrip passed.
- API requests from external origins/rebinding hosts and mutations without a
  matching local Origin were rejected; valid local mutations succeeded.
- A separate dependency installation completed successfully. `npm audit` reports
  zero vulnerabilities for the resulting dependency graph as of this date.
- Source preflight passed. This directory has no Git metadata, so no commit
  history was audited. Review the intended repository separately before publishing.

No live Google publishing or real Google ranking accuracy claim is established
by these checks. The demo screenshots contain fictional data only.

## UI and map update

- The live demo basemap returned HTTP 200 for all visible tiles with an origin
  Referer present. Repeated interaction tests used fixture tiles to avoid loading
  community tile servers unnecessarily.
- Business selection persists across rankings, reviews, and reports. Report
  details use the record's own business rather than an unrelated workspace filter.
- Desktop and 390px mobile checks passed for checkpoint inspection, run changes,
  export, navigation, blocked-tile feedback, and manual map recovery.
- The report map is shown before competitor and historical analytics. Mobile
  checkpoint details use a closable bottom panel.
- Previously unwired retry/history checkboxes now describe actual behavior.

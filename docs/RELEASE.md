# Release checklist

- Run `npm ci`, `npm test`, `npm run typecheck`, `npm run check:public`, and a
  production build using a disposable database.
- Run `npm audit`; review dependency overrides when updating Electron/ExcelJS.
  Overrides for brace-expansion, minimatch, and ExcelJS's UUID dependency replace
  versions flagged by the audit. Verify XLSX exports and desktop packaging after
  changing them.
- Audit Git history separately before changing repository visibility. This local
  source tree may not include repository metadata; source preflight is not proof
  that earlier commits are clean.
- Exclude .env, SQLite data, credentials, client reports, backups, and artifacts.
  Desktop packaging excludes these files from standalone resources too.
- Use fictional demo screenshots. Review any real client data before sharing.
- Test an installer on a fresh user account: first launch, browser download,
  demo, one small scan, report export, restart/recovery, and uninstall/reinstall
  without data loss.
- Confirm Google API approval using the release's configured Cloud project.
  Do not advertise working official publishing until that end-to-end check passes.
- Verify code signing on Windows and signing/notarization on macOS if distributing
  trusted installers. The repository does not supply signing credentials.
- Enable GitHub private vulnerability reporting and secret scanning when creating
  or preparing the public repository. Do not include local private backups.

## Existing data

Version 2.1 adds captureStatus/captureError to rank results. Older captures with
actual ranks or non-empty listings remain usable. Ambiguous empty older captures
are labelled unknown and can be retried. Existing backups remain compatible;
storage directories and the backup format identifier intentionally retain their
older names.

Use `node scripts/upgrade-local.cjs` with the app stopped to add these columns to
an existing web workspace. It makes a SQLite recovery copy first. Desktop startup
has equivalent additive column migrations.

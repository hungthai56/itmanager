# Lotus IT Command v0.6 — PHP 8.3 + MySQL API / Web

This is a **pilot implementation** of a shared backend for Windows Electron and browser. It is not a certified or fully audited production service. See [DEPLOY_VI.md](DEPLOY_VI.md) and `docs/ARCHITECTURE_SECURITY_V06.md`.

Public document root: `server/public/`. Application and secrets stay outside it.

Quick path (after setting up a private MySQL 8+ instance and DB user):

```sh
php server/bin/doctor.php
php server/bin/setup.php
npm ci
npm run build:web
```

Serve the public root with HTTPS and configure `/api/v1/dispatch` rewrite. Online login available at `/app/`. To run local HTTP for testing only, set `LOTUS_ALLOW_HTTP_LOCALHOST=1` and use the PHP local server with the included router script (do not expose to networks).

The server supports role-protected module CRUD, admin users/sites, batch task status, checklist, roster, project subtasks, contract addenda, settings, dashboard and audit. It **does not yet support** upload, attachment download, backup via HTTP, online Excel report or mobile QR view. Local SQLite data is **not** migrated automatically.
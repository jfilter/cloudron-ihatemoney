# I Hate Money — Cloudron package

A community Cloudron package for [IHateMoney](https://ihatemoney.org), the
lightweight shared-expense app. Wraps the official upstream release on
`cloudron/base`, runs on Cloudron's managed **MySQL** and mail addons, and
applies its own schema migrations automatically on start.

There is no IHateMoney package in the official Cloudron App Store — this is a
self-published **community app** distributed via a `CloudronVersions.json`
catalog, so installs get automatic update prompts like any store app.

> Requires Cloudron **9.1+** (community apps / version catalog).

## Install

In the Cloudron dashboard: **App Store → Community apps → add the catalog URL**,
or via CLI:

```sh
cloudron install --versions-url https://raw.githubusercontent.com/jfilter/cloudron-ihatemoney/main/CloudronVersions.json
```

Once installed, new releases show up as update prompts automatically.

## How it fits together

- **Database:** Cloudron `mysql` addon (MySQL 8.0), reached via `mysql+pymysql://`
  (the `pymysql` driver ships in `ihatemoney[database]`).
- **Mail:** Cloudron `sendmail` addon (invitation / reminder mails).
- **Config:** rendered at runtime into `/app/data/ihatemoney.cfg` (the rootfs is
  read-only on Cloudron). `SECRET_KEY` is generated once and persisted.
- **Migrations:** ihatemoney runs Alembic `upgrade head` on start, so updates —
  including major-version jumps — apply themselves. Cloudron backs up first.

## Admin dashboard

Off by default; it activates once a password hash exists at
`/app/data/admin_password_hash` (kept out of the image, git and logs):

```sh
# generate a hash (prompts for a password), then store it:
cloudron exec --app <location> -- /app/code/venv/bin/ihatemoney generate_password_hash
cloudron exec --app <location> -- bash -c 'cat > /app/data/admin_password_hash' <<< 'THE_HASH'
cloudron restart --app <location>
```

## Configuration

Behaviour defaults live in `start.sh` (rendered into the config each boot):
`ALLOW_PUBLIC_PROJECT_CREATION=False`, `ACTIVATE_DEMO_PROJECT=False`,
`SHOW_ADMIN_EMAIL=True`, `SESSION_COOKIE_SECURE=True`, `DEBUG=False`. Mail goes
through the Cloudron relay; to use an external SMTP instead, edit the `MAIL_*`
block in `start.sh` and drop the `sendmail` addon from `CloudronManifest.json`.

## Releasing & updates (maintainer)

A release is two edits + one workflow run:

1. Bump `version` in `CloudronManifest.json` (the catalog key) and
   `IHATEMONEY_VERSION` in the `Dockerfile` (the upstream version to ship).
   Add a `CHANGELOG.md` entry. Commit.
2. **Actions → release → Run workflow** (tick `deploy` to also push it to a
   running app immediately).

The `release` workflow then:

- builds the image and pushes it to **GHCR** (`ghcr.io/jfilter/ihatemoney:<version>`),
- updates `CloudronVersions.json` (via `scripts/update-versions.mjs`) and commits
  it back — that's the published catalog, served straight from raw GitHub,
- optionally runs `cloudron update` for your app.

Nothing is built on the Cloudron server — it only **pulls** the finished image
from GHCR. Apps installed via the catalog URL pick up the new version on their
own. (Prefer GitHub Pages over raw GitHub? Point Pages at this repo and use the
`…github.io/cloudron-ihatemoney/CloudronVersions.json` URL instead.)

### One-time setup

1. **GHCR push** needs nothing — the workflow uses the built-in `GITHUB_TOKEN`.
2. **Make the GHCR package public** (GitHub → Packages → ihatemoney → change
   visibility) so Cloudron — and anyone else — can pull without credentials.
   The image holds no secrets; those are injected at runtime. (To keep it
   private instead, add `ghcr.io` credentials in Cloudron under *System → Docker*.)
3. **For the optional `deploy` step:** add repo secrets `CLOUDRON_SERVER` and
   `CLOUDRON_TOKEN` (a read/write API token from your Cloudron profile) and a
   repo variable `CLOUDRON_APP` (the app's domain).
4. Keep this workflow **dispatch-only**. On a public repo, never wire the
   `CLOUDRON_TOKEN` step to a `pull_request` trigger (fork PRs could try to
   exfiltrate it; `workflow_dispatch` is collaborator-only).

## Testing

Two e2e levels, sharing the same REST-API checks (`test/lib/flow.js`):

**Local — no Cloudron needed** (docker compose: the image + MySQL 8):

```sh
cd test && npm install
npm run test:local
```

Builds the image, brings up MySQL, exercises the REST API (create project →
members → bill → verify balances) and checks persistence across a restart. Runs
in CI on every push (`.github/workflows/ci.yml`). Needs Docker + Node 18+.

**Cloudron lifecycle — against a live Cloudron** (install → API → restart →
uninstall):

```sh
cd test && npm install
LOCATION=ihatemoney-test.example.com npm test
```

Needs the `cloudron` CLI logged in and the GHCR image public. Installs/uninstalls
a throwaway app at `LOCATION` — use a test subdomain, not production.

## License

Packaging in this repository is licensed under **AGPL-3.0** (see [`LICENSE`](LICENSE)).
IHateMoney is an independent upstream project distributed under its own license.

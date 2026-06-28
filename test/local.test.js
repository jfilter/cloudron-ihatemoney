'use strict';

/*
 * Local e2e test — runs the app + MySQL via docker compose, NO Cloudron needed.
 * Exercises the same REST-API flow as the Cloudron test against localhost.
 *
 *   cd test && npm install && npm run test:local
 *
 * Requires Docker (with `docker compose`) and Node 18+. Covers the real risk
 * areas (MySQL 8 connectivity/auth, schema migration on boot, /app/data, the
 * REST flows) without touching a Cloudron.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const { exerciseApi, assertPersisted } = require('./lib/flow.js');

const COMPOSE = `docker compose -f ${path.join(__dirname, 'docker-compose.yml')}`;
const BASE = 'http://localhost:8000';

function sh(cmd) {
  console.log(`    $ ${cmd}`);
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHealthy(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (res.status >= 200 && res.status < 400) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('app did not become healthy in time');
    await sleep(5000);
  }
}

describe('IHateMoney local (docker compose) e2e', function () {
  this.timeout(25 * 60 * 1000); // first run builds the image (emulated on arm)

  before(async function () {
    sh(`${COMPOSE} up -d --build`);
    await waitForHealthy();
    // enable project creation (same mechanism as on Cloudron)
    sh(`${COMPOSE} exec -T app bash -c 'echo "ALLOW_PUBLIC_PROJECT_CREATION = True" > /app/data/overrides.cfg'`);
    sh(`${COMPOSE} restart app`);
    await waitForHealthy();
  });

  it('exercises the REST API (project, members, bill, balances)', async function () {
    await exerciseApi(BASE);
  });

  it('persists data across an app restart', async function () {
    sh(`${COMPOSE} restart app`);
    await waitForHealthy();
    await assertPersisted(BASE);
  });

  after(function () {
    try { sh(`${COMPOSE} down -v`); } catch (e) { console.error('compose down failed:', e.message); }
  });
});

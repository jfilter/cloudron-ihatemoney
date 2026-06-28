'use strict';

/*
 * Cloudron lifecycle e2e test for the IHateMoney package.
 *
 * Runs against a LIVE Cloudron (the `cloudron` CLI must be logged in). Installs
 * the app at LOCATION from the community catalog, exercises the REST API, checks
 * the data survives a restart, then uninstalls.
 *
 *   cd test && npm install
 *   LOCATION=ihatemoney-test.example.com npm test
 *
 * For a quick check WITHOUT a Cloudron, use the local docker-compose test
 * instead:  npm run test:local
 *
 * Requires Node 18+ (global fetch) and the cloudron CLI on PATH. Installs and
 * uninstalls a throwaway app at LOCATION — use a TEST subdomain, not production.
 */

const { execSync } = require('node:child_process');
const { exerciseApi, assertPersisted } = require('./lib/flow.js');

const LOCATION = process.env.LOCATION;
const VERSIONS_URL = process.env.VERSIONS_URL ||
  'https://raw.githubusercontent.com/jfilter/cloudron-ihatemoney/main/CloudronVersions.json';

if (!LOCATION) {
  console.error('Set LOCATION=<subdomain>, e.g. LOCATION=ihatemoney-test.example.com');
  process.exit(1);
}

const BASE = `https://${LOCATION}`;

function cloudron(args) {
  console.log(`    $ cloudron ${args}`);
  return execSync(`cloudron ${args}`, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHealthy(timeoutMs = 180000) {
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

describe('IHateMoney Cloudron lifecycle', function () {
  this.timeout(20 * 60 * 1000);

  it('installs from the community catalog', function () {
    cloudron(`install --versions-url ${VERSIONS_URL} --location ${LOCATION}`);
  });

  it('serves the home page (healthcheck)', async function () {
    await waitForHealthy();
  });

  it('enables project creation for the test (overrides.cfg)', async function () {
    cloudron(`exec --app ${LOCATION} -- bash -c 'echo "ALLOW_PUBLIC_PROJECT_CREATION = True" > /app/data/overrides.cfg'`);
    cloudron(`restart --app ${LOCATION}`);
    await waitForHealthy();
  });

  it('exercises the REST API (project, members, bill, balances)', async function () {
    await exerciseApi(BASE);
  });

  it('persists data across a restart', async function () {
    cloudron(`restart --app ${LOCATION}`);
    await waitForHealthy();
    await assertPersisted(BASE);
  });

  after(function () {
    try { cloudron(`uninstall --app ${LOCATION}`); } catch (e) { console.error('uninstall failed:', e.message); }
  });
});

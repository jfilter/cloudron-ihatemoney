'use strict';

// Shared REST-API exercise used by both the local (docker compose) and the
// Cloudron lifecycle e2e tests. Given a base URL of a running ihatemoney, it
// creates a project, two members and a bill, and asserts the balances.
//
// Project creation requires ALLOW_PUBLIC_PROJECT_CREATION=True (the callers
// enable it via /app/data/overrides.cfg before running this). The ihatemoney
// API takes form-encoded params; member/bill creation return a bare integer id.

const assert = require('node:assert/strict');

const PROJECT = 'e2e';
const PASSWORD = 'e2e-secret';
const AUTH = 'Basic ' + Buffer.from(`${PROJECT}:${PASSWORD}`).toString('base64');

async function api(base, path, { method = 'GET', auth = false, form } = {}) {
  const headers = {};
  if (auth) headers.Authorization = AUTH;

  let body;
  if (form) {
    body = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) {
      if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
      else body.append(k, v);
    }
    // fetch sets Content-Type: application/x-www-form-urlencoded for URLSearchParams
  }

  const res = await fetch(`${base}${path}`, { method, headers, body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

// create project -> members -> bill -> assert balances
async function exerciseApi(base) {
  let r = await api(base, '/api/projects', {
    method: 'POST',
    form: { name: 'E2E', id: PROJECT, password: PASSWORD, contact_email: 'e2e@example.com' },
  });
  assert.ok(r.status === 201 || r.status === 200, `create project -> ${r.status}: ${JSON.stringify(r.body)}`);

  r = await api(base, `/api/projects/${PROJECT}/members`, { method: 'POST', auth: true, form: { name: 'Alice' } });
  const alice = typeof r.body === 'number' ? r.body : r.body.id;
  assert.ok(Number.isInteger(alice), `add Alice -> ${r.status}: ${JSON.stringify(r.body)}`);

  r = await api(base, `/api/projects/${PROJECT}/members`, { method: 'POST', auth: true, form: { name: 'Bob' } });
  const bob = typeof r.body === 'number' ? r.body : r.body.id;
  assert.ok(Number.isInteger(bob), `add Bob -> ${r.status}: ${JSON.stringify(r.body)}`);

  r = await api(base, `/api/projects/${PROJECT}/bills`, {
    method: 'POST', auth: true,
    form: { what: 'Pizza', payer: alice, payed_for: [alice, bob], amount: 10, date: '2026-01-01' },
  });
  assert.ok(r.status === 201 || Number.isInteger(r.body), `add bill -> ${r.status}: ${JSON.stringify(r.body)}`);

  r = await api(base, `/api/projects/${PROJECT}/statistics`, { auth: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const byId = Object.fromEntries(r.body.map((s) => [s.member.id, Number(s.balance)]));
  // Alice paid 10 for both -> she is owed 5; Bob owes 5.
  assert.ok(byId[alice] > 0 && byId[bob] < 0, `balances: ${JSON.stringify(byId)}`);
  assert.ok(Math.abs(byId[alice] + byId[bob]) < 0.001, `balances should net to 0: ${JSON.stringify(byId)}`);
}

// re-read after a restart: the bill is still there
async function assertPersisted(base) {
  const r = await api(base, `/api/projects/${PROJECT}/bills`, { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1, `expected 1 bill, got ${JSON.stringify(r.body)}`);
  assert.equal(r.body[0].what, 'Pizza');
}

module.exports = { exerciseApi, assertPersisted, PROJECT, PASSWORD };

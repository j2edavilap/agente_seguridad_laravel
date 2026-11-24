import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

import {
  applyCanary,
  buildCanaryEntry,
  discoverCanary,
  extractCandidates,
} from '../src/phases/canary.js';
import { parseCredentials } from '../src/policy/credentials.js';

const CREDENTIALS = parseCredentials(`SECTEST_USER_B_USERNAME=userb@demo.local
SECTEST_USER_B_PASSWORD=userbpass
`);

const PLAN = {
  version: 1,
  login: {
    url: '/login',
    contentType: 'form',
    fields: { email: '{{username}}', password: '{{password}}' },
    csrf: { url: '/login', field: '_token', pattern: 'name="_token" value="([^"]+)"' },
    successStatus: [302],
  },
};

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
  });
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    const url = new URL(request.url, 'http://127.0.0.1');
    const sid = /sid=([^;]+)/.exec(request.headers.cookie ?? '')?.[1] ?? null;

    if (url.pathname === '/login' && request.method === 'GET') {
      response.writeHead(200);
      response.end('<input type="hidden" name="_token" value="tok">');
      return;
    }

    if (url.pathname === '/login' && request.method === 'POST') {
      const form = new URLSearchParams(body);
      const ok = form.get('_token') === 'tok' && form.get('email') === 'userb@demo.local';
      response.writeHead(ok ? 302 : 200, ok ? { Location: '/', 'Set-Cookie': 'sid=userB; Path=/' } : {});
      response.end();
      return;
    }

    if (url.pathname === '/api/invoices' && sid === 'userB') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          data: [
            { id: 5002, name: 'Factura 5002' },
            { id: 5003, name: 'Factura 5003' },
            { id: 5002, name: 'Duplicada' },
          ],
        }),
      );
      return;
    }

    response.writeHead(401);
    response.end('unauthorized');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('extractCandidates acepta array, data e items y deduplica', () => {
  assert.equal(extractCandidates([{ id: 1 }, { id: 2 }]).length, 2);
  assert.equal(extractCandidates({ data: [{ id: 1 }] }).length, 1);
  assert.equal(extractCandidates({ items: [{ id: 1 }] }).length, 1);
  assert.equal(extractCandidates({ data: [{ id: 1 }, { id: 1 }] }).length, 1);
  assert.equal(extractCandidates({ data: [{ name: 'sin id' }] }).length, 0);
});

test('buildCanaryEntry arma la URL y la entrada de crossAccess', () => {
  assert.equal(buildCanaryEntry({ listUrl: '/api/invoices', id: 5002 }).url, '/api/invoices/5002');
  assert.equal(buildCanaryEntry({ listUrl: '/api/invoices/', id: 5002 }).url, '/api/invoices/5002');

  const entry = buildCanaryEntry({ listUrl: '/api/invoices', id: 5002, label: 'Factura 5002' });
  assert.equal(entry.as, 'user');
  assert.equal(entry.owner, 'userB');
  assert.deepEqual(entry.expect, [403, 404]);
});

test('applyCanary agrega una sola vez', () => {
  const entry = buildCanaryEntry({ listUrl: '/api/invoices', id: 5002 });
  const first = applyCanary({ version: 1 }, entry);
  const second = applyCanary(first, entry);
  assert.equal(first.crossAccess.length, 1);
  assert.equal(second.crossAccess.length, 1);
});

test('discoverCanary se autentica como B y lista sus recursos', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const result = await discoverCanary({
    baseUrl: base,
    whitelist: ['127.0.0.1'],
    plan: PLAN,
    credentials: CREDENTIALS,
    listUrl: '/api/invoices',
    idField: 'id',
    role: 'userB',
  });

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates[0], { id: '5002', label: 'Factura 5002' });
});

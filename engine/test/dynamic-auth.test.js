import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

import { runDynamicPhase } from '../src/phases/dynamic.js';
import { parseCredentials } from '../src/policy/credentials.js';

const CREDENTIALS = parseCredentials(`SECTEST_USER_USERNAME=user@demo.local
SECTEST_USER_PASSWORD=userpass
SECTEST_USER_B_USERNAME=userb@demo.local
SECTEST_USER_B_PASSWORD=userbpass
SECTEST_ADMIN_USERNAME=admin@demo.local
SECTEST_ADMIN_PASSWORD=adminpass
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
  adminEndpoints: [{ name: 'panel de usuarios', url: '/admin/users', expect: [403] }],
  crossAccess: [
    { name: 'nota de B', url: '/api/notes/1', as: 'user', owner: 'userB', expect: [403, 404] },
    { name: 'recurso fantasma', url: '/api/ghost/1', as: 'user', owner: 'userB', expect: [403, 404] },
  ],
  smoke: ['/boom'],
  logout: { url: '/logout', protectedUrl: '/api/me' },
};

const ENUM_PLAN = {
  ...PLAN,
  crossAccess: [],
  smoke: [],
  logout: undefined,
  enumerate: [
    { name: 'items', urlTemplate: '/api/items/{id}', from: 1, to: 3, as: 'user', expect: [403, 404] },
  ],
};

const USERS = {
  'user@demo.local': { password: 'userpass', sid: 'user' },
  'userb@demo.local': { password: 'userbpass', sid: 'userB' },
  'admin@demo.local': { password: 'adminpass', sid: 'admin' },
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
    const cookie = request.headers.cookie ?? '';
    const sid = /sid=([^;]+)/.exec(cookie)?.[1] ?? null;

    if (url.pathname === '/login' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<form><input type="hidden" name="_token" value="tok123"></form>');
      return;
    }

    if (url.pathname === '/login' && request.method === 'POST') {
      const form = new URLSearchParams(body);
      const user = USERS[form.get('email')];
      if (form.get('_token') !== 'tok123' || !user || user.password !== form.get('password')) {
        response.writeHead(200);
        response.end('invalid credentials');
        return;
      }
      response.writeHead(302, { Location: '/', 'Set-Cookie': `sid=${user.sid}; Path=/` });
      response.end();
      return;
    }

    if (url.pathname === '/admin/users') {
      if (sid === 'admin') {
        response.writeHead(200);
        response.end('admin panel');
        return;
      }
      response.writeHead(sid ? 403 : 401);
      response.end('forbidden');
      return;
    }

    if (url.pathname === '/api/invoices/1') {
      response.writeHead(sid ? 200 : 401);
      response.end(sid ? '{"id":1,"total":100}' : 'unauthorized');
      return;
    }

    if (url.pathname === '/api/notes/1') {
      response.writeHead(sid === 'user' || sid === 'userB' ? 200 : 403);
      response.end(JSON.stringify({ id: 1, owner: 'userB' }));
      return;
    }

    if (url.pathname === '/api/ghost/1') {
      response.writeHead(sid === 'user' ? 200 : 404);
      response.end('{"id":1}');
      return;
    }

    if (url.pathname.startsWith('/api/items/')) {
      const id = Number(url.pathname.split('/').pop());
      response.writeHead(sid === 'user' && id === 2 ? 200 : 404);
      response.end(JSON.stringify({ id }));
      return;
    }

    if (url.pathname === '/api/me') {
      response.writeHead(sid ? 200 : 401);
      response.end(sid ? '{"me":true}' : 'unauthorized');
      return;
    }

    if (url.pathname === '/boom') {
      response.writeHead(sid ? 500 : 401);
      response.end('boom');
      return;
    }

    if (url.pathname === '/logout' && request.method === 'POST') {
      // a propósito no invalida la sesión, para que el check la detecte
      response.writeHead(200);
      response.end('ok');
      return;
    }

    response.writeHead(200);
    response.end('ok');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('el plan autenticado detecta IDOR y logout que no invalida', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({
    baseUrl: base,
    whitelist: ['127.0.0.1'],
    plan: PLAN,
    credentials: CREDENTIALS,
  });

  const titles = phase.findings.map((finding) => finding.title);
  assert.ok(titles.includes('Acceso a recurso ajeno: nota de B'));
  assert.ok(titles.includes('Acceso a recurso ajeno: recurso fantasma'));
  assert.ok(titles.includes('La sesión sobrevive al logout'));
  assert.ok(titles.includes('Error 5xx con sesión autenticada'));

  const confirmed = phase.findings.find((finding) => finding.title === 'Acceso a recurso ajeno: nota de B');
  assert.equal(confirmed.severity, 'alto');
  assert.equal(confirmed.confidence, 'confirmado');
  assert.match(confirmed.evidence, /control como userB: HTTP 200/);

  const probable = phase.findings.find((finding) => finding.title === 'Acceso a recurso ajeno: recurso fantasma');
  assert.equal(probable.severity, 'medio');
  assert.equal(probable.confidence, 'probable');
  assert.match(probable.evidence, /control como userB: HTTP 404/);
  assert.equal(
    titles.includes('Escalada vertical: usuario normal accede a endpoint administrativo'),
    false,
  );

  const login = phase.checks.find((check) => check.name === 'auth-login');
  assert.equal(login.status, 'ejecutada');

  const admin = phase.checks.find((check) => check.name === 'authz-admin');
  assert.equal(admin.status, 'ejecutada');

  const idor = phase.findings.find((finding) => finding.title === 'Acceso a recurso ajeno: nota de B');
  assert.equal(idor.severity, 'alto');
  assert.match(idor.id, /^A03-SEC-\d{3}$/);
});

test('la evidencia no expone contraseñas ni cookies de sesión', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({
    baseUrl: base,
    whitelist: ['127.0.0.1'],
    plan: PLAN,
    credentials: CREDENTIALS,
  });

  const serialized = JSON.stringify(phase.evidence);
  assert.equal(serialized.includes('userpass'), false);
  assert.equal(serialized.includes('adminpass'), false);
  assert.equal(serialized.includes('sid=user'), false);
  assert.ok(serialized.includes('body_sha256'));
});

test('sin plan no se habilita POST', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'] });
  assert.equal(phase.checks.some((check) => check.name === 'auth-login'), false);
});

test('la enumeración autorizada reporta IDs accesibles como probables', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({
    baseUrl: base,
    whitelist: ['127.0.0.1'],
    plan: ENUM_PLAN,
    credentials: CREDENTIALS,
    allowEnumeration: true,
  });

  const finding = phase.findings.find((item) => item.title === 'ID enumerado accesible: items');
  assert.ok(finding);
  assert.equal(finding.confidence, 'probable');
  assert.match(finding.evidence, /ID 2/);

  const check = phase.checks.find((item) => item.name === 'authz-enumerate');
  assert.equal(check.status, 'ejecutada');
  assert.match(check.note, /3 ID/);
});

test('sin la casilla, la enumeración queda bloqueada', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({
    baseUrl: base,
    whitelist: ['127.0.0.1'],
    plan: ENUM_PLAN,
    credentials: CREDENTIALS,
  });

  const check = phase.checks.find((item) => item.name === 'authz-enumerate');
  assert.equal(check.status, 'bloqueada');
  assert.match(check.note, /Enumeración controlada/);
});

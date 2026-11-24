import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

import { createClient } from '../src/http/client.js';
import { assertAllowedTarget } from '../src/policy/target.js';
import { runDynamicPhase } from '../src/phases/dynamic.js';

const COOKIE = 'session=abcdef123456; Path=/';

async function startServer() {
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin;

    if (request.url === '/.env') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('APP_KEY=base64:secreto');
      return;
    }

    if (request.url === '/redirect') {
      response.writeHead(302, { Location: 'http://evil.example/' });
      response.end();
      return;
    }

    if (request.url === '/') {
      const headers = {
        'Content-Type': 'text/html',
        'X-Powered-By': 'PHP/8.5.12',
        'Set-Cookie': COOKIE,
      };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      response.writeHead(200, headers);
      response.end('<html><body>ok</body></html>');
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('la lista blanca rechaza hosts y protocolos no autorizados', () => {
  assert.throws(() => assertAllowedTarget('https://evil.example/', { whitelist: ['127.0.0.1'] }));
  assert.throws(() => assertAllowedTarget('file:///etc/passwd', { whitelist: ['127.0.0.1'] }));
  assert.doesNotThrow(() => assertAllowedTarget('http://127.0.0.1:8080/x', { whitelist: ['127.0.0.1'] }));
});

test('el cliente no sigue una redirección fuera de la lista blanca', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const client = createClient({ whitelist: ['127.0.0.1'] });
  await assert.rejects(() => client.request(`${base}/redirect`), /lista blanca/);
});

test('la fase dinámica detecta exposición, CORS y cookies sin flags', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'] });

  const titles = phase.findings.map((finding) => finding.title);
  assert.ok(titles.includes('Archivo .env expuesto'));
  assert.ok(titles.includes('CORS refleja cualquier origen'));
  assert.ok(titles.includes('Cookie sin Secure'));
  assert.ok(titles.includes('Cookie sin HttpOnly'));
  assert.ok(titles.includes('Cookie sin SameSite'));
  assert.ok(titles.includes('HSTS ausente'));

  const env = phase.findings.find((finding) => finding.title === 'Archivo .env expuesto');
  assert.equal(env.severity, 'critico');
  assert.match(env.id, /^A03-SEC-\d{3}$/);

  const headers = phase.checks.find((check) => check.name === 'security-headers');
  assert.equal(headers.status, 'ejecutada');

  const redirect = phase.checks.find((check) => check.name === 'https-redirect');
  assert.equal(redirect.status, 'bloqueada');
  assert.match(redirect.note, /no es https/);
});

test('la evidencia enmascara el valor de la cookie', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'] });
  const serialized = JSON.stringify(phase.evidence);

  assert.equal(serialized.includes('abcdef123456'), false);
  assert.ok(serialized.includes('ab***56'));
});

test('el contrato dinámico valida y es determinista', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const first = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'] });
  const second = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'] });

  assert.deepEqual(second.contract, first.contract);
  assert.deepEqual(
    second.findings.map((finding) => `${finding.id}|${finding.title}|${finding.severity}`),
    first.findings.map((finding) => `${finding.id}|${finding.title}|${finding.severity}`),
  );
});

test('el presupuesto de peticiones corta la fase', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const phase = await runDynamicPhase({ baseUrl: base, whitelist: ['127.0.0.1'], maxRequests: 2 });
  const blocked = phase.checks.filter((check) => check.status === 'bloqueada');
  assert.ok(blocked.length > 0);
  assert.ok(blocked.some((check) => /presupuesto/.test(check.note ?? '')));
});

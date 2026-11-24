import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const NOW = '2026-11-06T15:00:00-03:00';

function authorization({ getChecked = true } = {}) {
  return `# Autorización de pruebas de seguridad

> Estado: firmada.

## 1. Proyecto

- **Nombre del proyecto:** dynamic-demo
- **Versión / commit auditado:** demo

## 3. Lista blanca de hosts e IPs

- IP/CIDR: 127.0.0.1

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-01-01T00:00:00-03:00
- **Fin (ISO 8601):** 2027-01-01T00:00:00-03:00
- **Zona horaria:** America/Santiago

## 6. Pruebas autorizadas

- [${getChecked ? 'x' : ' '}] Peticiones HTTP GET de reconocimiento

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-01-01
- **Firma / aprobación:** firmado
`;
}

function buildProject(getChecked) {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-dynamic-'));
  mkdirSync(path.join(root, 'sectest', 'scope'), { recursive: true });
  writeFileSync(path.join(root, 'sectest', 'scope', 'authorization.md'), authorization({ getChecked }), 'utf8');
  writeFileSync(
    path.join(root, 'sectest', 'scope', 'credentials.conf'),
    'SECTEST_ANON_ENABLED=true\nSECTEST_USER_USERNAME=\nSECTEST_USER_PASSWORD=\n',
    'utf8',
  );
  return root;
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === '/.env') {
      response.writeHead(200);
      response.end('APP_KEY=secreto');
      return;
    }
    response.writeHead(200, { 'Set-Cookie': 'session=abcdef123456; Path=/' });
    response.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('dynamic --write emite contrato, evidencia y reporte', async (t) => {
  const { server, base } = await startServer();
  const root = buildProject(true);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  const result = await runCli([
    'dynamic',
    '--project',
    root,
    '--base-url',
    base,
    '--now',
    NOW,
    '--write',
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  for (const file of [
    'sectest/reports/contratos/A-03-DYNAMIC.json',
    'sectest/reports/hallazgos/A-DYNAMIC.json',
    'sectest/reports/A-03-DYNAMIC.md',
    'sectest/reports/evidencia/A-03-security-headers.json',
    'sectest/reports/evidencia/A-03-exposed-files.json',
  ]) {
    assert.equal(existsSync(path.join(root, file)), true, `falta ${file}`);
  }
});

test('dynamic se niega si la autorización no habilita GET', async (t) => {
  const { server, base } = await startServer();
  const root = buildProject(false);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  const result = await runCli([
    'dynamic',
    '--project',
    root,
    '--base-url',
    base,
    '--now',
    NOW,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no habilita/);
});

test('dynamic rechaza una base-url fuera de la lista blanca', async (t) => {
  const { server } = await startServer();
  const root = buildProject(true);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  const result = await runCli([
    'dynamic',
    '--project',
    root,
    '--base-url',
    'https://evil.example',
    '--now',
    NOW,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lista blanca/);
});

test('un plan exige la casilla de autenticación y sesión', async (t) => {
  const { server, base } = await startServer();
  const root = buildProject(true);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeFileSync(
    path.join(root, 'sectest', 'scope', 'dynamic-plan.json'),
    JSON.stringify({
      version: 1,
      login: {
        url: '/login',
        fields: { email: '{{username}}', password: '{{password}}' },
      },
    }),
    'utf8',
  );

  const result = await runCli([
    'dynamic',
    '--project',
    root,
    '--base-url',
    base,
    '--now',
    NOW,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /autenticación y sesión/);
});

test('un plan inválido se rechaza con el motivo', async (t) => {
  const { server, base } = await startServer();
  const root = buildProject(true);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  const planPath = path.join(root, 'sectest', 'scope', 'bad-plan.json');
  writeFileSync(planPath, JSON.stringify({ version: 1, login: { url: '/login', fields: {} } }), 'utf8');
  writeFileSync(
    path.join(root, 'sectest', 'scope', 'authorization.md'),
    authorization({ getChecked: true }).replace(
      '- [x] Peticiones HTTP GET de reconocimiento',
      '- [x] Peticiones HTTP GET de reconocimiento\n- [x] Pruebas de autenticación y sesión',
    ),
    'utf8',
  );

  const result = await runCli([
    'dynamic',
    '--project',
    root,
    '--base-url',
    base,
    '--plan',
    planPath,
    '--now',
    NOW,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /{{username}}/);
});

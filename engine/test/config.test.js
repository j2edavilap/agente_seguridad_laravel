import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateContract } from '../src/domain/contract.js';
import {
  analyzeGitignore,
  analyzePhpIni,
  analyzeServerConfig,
  runConfigPhase,
} from '../src/phases/config.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

const STUB_TOOLS = {
  git: { available: false, reason: 'stub' },
  php: { available: false, reason: 'stub' },
};

const AUTHORIZATION = `# Autorización de pruebas de seguridad

> Estado: firmada.

## 1. Proyecto

- **Nombre del proyecto:** config-demo
- **Versión / commit auditado:** demo

## 3. Lista blanca de hosts e IPs

- IP/CIDR: 127.0.0.1

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-01-01T00:00:00-03:00
- **Fin (ISO 8601):** 2027-01-01T00:00:00-03:00
- **Zona horaria:** America/Santiago

## 6. Pruebas autorizadas

- [x] Revisión de configuración local

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-01-01
- **Firma / aprobación:** firmado
`;

test('analyzePhpIni detecta configuraciones inseguras', () => {
  const findings = analyzePhpIni({
    expose_php: '1',
    display_errors: '1',
    allow_url_include: '1',
    'session.cookie_secure': '0',
    'session.cookie_httponly': '0',
    'session.cookie_samesite': '',
    'session.use_strict_mode': '0',
  });
  const titles = findings.map((finding) => finding.title);
  assert.ok(titles.includes('allow_url_include habilitado'));
  assert.ok(titles.includes('display_errors habilitado'));
  assert.ok(titles.includes('Cookie de sesión sin Secure'));
  assert.ok(titles.includes('use_strict_mode deshabilitado'));
  assert.equal(findings.find((finding) => finding.title === 'allow_url_include habilitado').severity, 'alto');
});

test('analyzePhpIni no reporta una configuración endurecida', () => {
  const findings = analyzePhpIni({
    expose_php: '',
    display_errors: '',
    allow_url_include: '',
    'session.cookie_secure': '1',
    'session.cookie_httponly': '1',
    'session.cookie_samesite': 'Lax',
    'session.use_strict_mode': '1',
  });
  assert.deepEqual(findings, []);
});

test('analyzeGitignore exige .env y credentials.conf', () => {
  const findings = analyzeGitignore('vendor/\nnode_modules/\n');
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.severity === 'medio'));
});

test('analyzeServerConfig detecta root, latest y secretos en ENV', () => {
  const findings = analyzeServerConfig(
    'FROM node:latest\nUSER root\nENV DB_PASSWORD=secreto\nOptions Indexes\nserver_tokens on\n',
    'Dockerfile',
  );
  const titles = findings.map((finding) => finding.title);
  assert.ok(titles.includes('Imagen base con tag latest'));
  assert.ok(titles.includes('Contenedor ejecutado como root'));
  assert.ok(titles.includes('Secreto en variable ENV del Dockerfile'));
  assert.ok(titles.includes('Listado de directorios habilitado'));
  assert.ok(titles.includes('server_tokens habilitado'));
});

test('la fase de configuración produce un contrato válido', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(path.join(root, '.gitignore'), 'vendor/\n', 'utf8');
  writeFileSync(
    path.join(root, 'Dockerfile'),
    'FROM node:latest\nUSER root\nENV DB_PASSWORD=secreto\n',
    'utf8',
  );

  const phase = runConfigPhase({ projectRoot: root, tools: STUB_TOOLS });

  assert.equal(phase.contract.hallazgos.alto, 2);
  assert.equal(phase.contract.hallazgos.medio, 2);
  assert.equal(phase.contract.hallazgos.bajo, 1);
  assert.equal(phase.contract.metricas.controles_aplicables, 2);
  assert.equal(phase.contract.metricas.controles_no_probados, 2);
  assert.deepEqual(validateContract(phase.contract), []);
});

test('config --write emite contrato, hallazgos y reporte', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-config-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(path.join(root, 'sectest', 'scope'), { recursive: true });
  writeFileSync(path.join(root, 'sectest', 'scope', 'authorization.md'), AUTHORIZATION, 'utf8');
  writeFileSync(
    path.join(root, 'sectest', 'scope', 'credentials.conf'),
    'SECTEST_ANON_ENABLED=true\n',
    'utf8',
  );
  writeFileSync(path.join(root, '.gitignore'), 'vendor/\n', 'utf8');

  const result = spawnSync(
    process.execPath,
    [CLI, 'config', '--project', root, '--now', '2026-11-06T15:00:00-03:00', '--write'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  for (const file of [
    'sectest/reports/contratos/A-02-CONFIG.json',
    'sectest/reports/hallazgos/A-CONFIG.json',
    'sectest/reports/A-02-CONFIG.md',
  ]) {
    assert.equal(existsSync(path.join(root, file)), true, `falta ${file}`);
  }

  const report = readFileSync(path.join(root, 'sectest', 'reports', 'A-02-CONFIG.md'), 'utf8');
  assert.ok(report.includes('A-02 — Configuración e infraestructura'));
});

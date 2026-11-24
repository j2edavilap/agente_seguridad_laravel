import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ipv4InCidr,
  isHostAllowed,
  parseAuthorization,
  validateAuthorization,
} from '../src/policy/authorization.js';

const AUTHORIZATION = `# Autorización de pruebas de seguridad

> Estado: firmada por el responsable.

## 1. Proyecto

- **Nombre del proyecto:** demo-laravel
- **Ruta local / repositorio:** C:\\demo
- **Versión / commit auditado:** abc1234
- **Responsable técnico del proyecto:** Ana Pérez

## 2. Entornos autorizados

| Entorno | URL base | ¿Autorizado? |
|---|---|---|
| Staging | https://staging.demo.local | Sí |
| Producción | — | **Nunca** |

## 3. Lista blanca de hosts e IPs

- \`https://staging.demo.local\`
- IP/CIDR: 10.0.0.0/24

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-11-06T08:00:00-03:00
- **Fin (ISO 8601):** 2026-11-06T18:00:00-03:00
- **Zona horaria:** America/Santiago

## 5. Credenciales de prueba

| Rol | ¿Disponible? | Claves |
|---|---|---|
| Usuario normal | Sí | SECTEST_USER_* |

## 6. Pruebas autorizadas

- [x] Análisis estático

## 7. Prohibiciones explícitas

- [x] No explotar vulnerabilidades

## 8. Umbrales de aceptación (opcional)

- Seguridad (SEG) ≥ 70
- Control de información (CI) ≥ 75
- Calidad de software (CS) ≥ 65

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-11-06
- **Firma / aprobación:** firmado digitalmente
`;

const INSIDE = new Date('2026-11-06T15:00:00-03:00');
const OUTSIDE = new Date('2026-11-07T00:00:00Z');

test('parsea la autorizacion completa', () => {
  const doc = parseAuthorization(AUTHORIZATION);
  assert.equal(doc.draft, false);
  assert.equal(doc.project, 'demo-laravel');
  assert.equal(doc.version, 'abc1234');
  assert.equal(doc.window.start, '2026-11-06T08:00:00-03:00');
  assert.equal(doc.window.timezone, 'America/Santiago');
  assert.equal(doc.signature.name, 'Ana Pérez');
  assert.equal(doc.signature.approval, 'firmado digitalmente');
  assert.equal(doc.thresholds.seg, 70);
  assert.equal(doc.whitelist.length, 2);
});

test('acepta una autorizacion firmada dentro de la ventana', () => {
  const doc = parseAuthorization(AUTHORIZATION);
  const gate = validateAuthorization(doc, { now: INSIDE });
  assert.equal(gate.ok, true, gate.errors.join(' | '));
  assert.equal(doc.signed, true);
});

test('rechaza fuera de la ventana', () => {
  const doc = parseAuthorization(AUTHORIZATION);
  const gate = validateAuthorization(doc, { now: OUTSIDE });
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((error) => error.includes('venció')));
});

test('rechaza un borrador', () => {
  const doc = parseAuthorization(AUTHORIZATION.replace('> Estado: firmada por el responsable.', '> Estado: BORRADOR generado por el agente.'));
  const gate = validateAuthorization(doc, { now: INSIDE });
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((error) => error.includes('BORRADOR')));
});

test('rechaza una firma incompleta', () => {
  const doc = parseAuthorization(AUTHORIZATION.replace('- **Firma / aprobación:** firmado digitalmente', '- **Firma / aprobación:**'));
  const gate = validateAuthorization(doc, { now: INSIDE });
  assert.ok(gate.errors.some((error) => error.includes('firma o aprobación')));
});

test('rechaza fechas sin offset', () => {
  const doc = parseAuthorization(AUTHORIZATION.replace('2026-11-06T08:00:00-03:00', '2026-11-06T08:00:00'));
  const gate = validateAuthorization(doc, { now: INSIDE });
  assert.ok(gate.errors.some((error) => error.includes('ISO 8601 con offset')));
});

test('rechaza una lista blanca vacia', () => {
  const doc = parseAuthorization(AUTHORIZATION.replace('- `https://staging.demo.local`\n- IP/CIDR: 10.0.0.0/24', '- PENDIENTE'));
  const gate = validateAuthorization(doc, { now: INSIDE });
  assert.ok(gate.errors.some((error) => error.includes('lista blanca')));
});

test('lista blanca: host exacto, comodin y CIDR', () => {
  const whitelist = ['https://staging.demo.local', '*.demo.local', '10.0.0.0/24'];
  assert.equal(isHostAllowed('https://staging.demo.local/api', whitelist), true);
  assert.equal(isHostAllowed('https://api.demo.local/x', whitelist), true);
  assert.equal(isHostAllowed('http://10.0.0.7/x', whitelist), true);
  assert.equal(isHostAllowed('https://evil.example', whitelist), false);
  assert.equal(isHostAllowed('https://demo.local.evil.example', whitelist), false);
});

test('CIDR IPv4', () => {
  assert.equal(ipv4InCidr('10.0.0.7', '10.0.0.0/24'), true);
  assert.equal(ipv4InCidr('10.0.1.7', '10.0.0.0/24'), false);
  assert.equal(ipv4InCidr('192.168.1.1', '0.0.0.0/0'), true);
});

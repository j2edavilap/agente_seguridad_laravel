import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeCredentials,
  isConfigured,
  mask,
  missingCredentials,
  parseCredentials,
  redact,
  withSecret,
} from '../src/policy/credentials.js';

const CONTENT = `# sectest/scope/credentials.conf
SECTEST_ANON_ENABLED=true
SECTEST_USER_USERNAME=auditor
SECTEST_USER_PASSWORD=sup3r-secret
SECTEST_USER_TOTP_SECRET=
SECTEST_ADMIN_USERNAME=
SECTEST_ADMIN_PASSWORD_REF=env:SECTEST_ADMIN_PASS
OTHER_IGNORED=no
clave_invalida=no
`;

test('parsea solo claves SECTEST_ y descarta comentarios', () => {
  const values = parseCredentials(CONTENT);
  assert.equal(values.get('SECTEST_USER_USERNAME'), 'auditor');
  assert.equal(values.get('SECTEST_USER_PASSWORD'), 'sup3r-secret');
  assert.equal(values.has('OTHER_IGNORED'), false);
  assert.equal(values.has('clave_invalida'), false);
});

test('una referencia _REF cuenta como credencial configurada', () => {
  const values = parseCredentials(CONTENT);
  assert.equal(isConfigured(values, 'SECTEST_ADMIN_PASSWORD'), true);
  assert.equal(isConfigured(values, 'SECTEST_ADMIN_USERNAME'), false);
});

test('detecta las claves faltantes sin filtrar valores', () => {
  const values = parseCredentials(CONTENT);
  const missing = missingCredentials(values);
  assert.deepEqual(missing, [{ role: 'admin', key: 'SECTEST_ADMIN_USERNAME' }]);
});

test('mask no revela el secreto completo', () => {
  assert.equal(mask('sup3r-secret'), 'su***et');
  assert.equal(mask('abc'), '****');
  assert.equal(mask(''), '');
});

test('redact elimina el secreto de un texto de evidencia', () => {
  const output = redact('password=sup3r-secret en el body', ['sup3r-secret']);
  assert.equal(output.includes('sup3r-secret'), false);
  assert.equal(output.includes('su***et'), true);
});

test('withSecret usa el valor directo sin exponerlo fuera del callback', async () => {
  const values = parseCredentials(CONTENT);
  const seen = await withSecret(values, 'SECTEST_USER_PASSWORD', (secret) => secret.length);
  assert.equal(seen, 12);
});

test('withSecret resuelve una referencia env:', async () => {
  process.env.SECTEST_ADMIN_PASS = 'clave-admin';
  const values = parseCredentials(CONTENT);
  const resolved = await withSecret(values, 'SECTEST_ADMIN_PASSWORD', (secret) => secret);
  assert.equal(resolved, 'clave-admin');
  delete process.env.SECTEST_ADMIN_PASS;
});

test('withSecret falla con un mensaje que no contiene secretos', async () => {
  const values = parseCredentials(CONTENT);
  await assert.rejects(
    () => withSecret(values, 'SECTEST_USER_TOTP_SECRET', (secret) => secret),
    (error) => {
      assert.ok(error.message.includes('SECTEST_USER_TOTP_SECRET'));
      assert.equal(error.message.includes('sup3r-secret'), false);
      return true;
    },
  );
});

test('describeCredentials reporta estado sin valores', () => {
  const values = parseCredentials(CONTENT);
  const lines = describeCredentials(values).join('\n');
  assert.equal(lines.includes('sup3r-secret'), false);
  assert.equal(lines.includes('VACÍA'), true);
  assert.equal(lines.includes('cargada'), true);
});

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { CREDENTIALS_FILE } from '../paths.js';

export { CREDENTIALS_FILE };

export const ROLES = Object.freeze({
  anonymous: [],
  user: ['SECTEST_USER_USERNAME', 'SECTEST_USER_PASSWORD'],
  userB: ['SECTEST_USER_B_USERNAME', 'SECTEST_USER_B_PASSWORD'],
  admin: ['SECTEST_ADMIN_USERNAME', 'SECTEST_ADMIN_PASSWORD'],
});

export function parseCredentials(text) {
  const values = new Map();
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^SECTEST_[A-Z0-9_]+$/.test(key)) continue;
    values.set(key, line.slice(separator + 1).trim());
  }
  return values;
}

/** Una clave cuenta como configurada si tiene valor directo o una referencia `_REF`. */
export function isConfigured(values, key) {
  return Boolean(values.get(key)) || Boolean(values.get(`${key}_REF`));
}

export function missingCredentials(values, roles = ['user', 'admin']) {
  const missing = [];
  for (const role of roles) {
    for (const key of ROLES[role] ?? []) {
      if (!isConfigured(values, key)) missing.push({ role, key });
    }
  }
  return missing;
}

/** Enmascara sin revelar longitud ni contenido util. */
export function mask(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function redact(text, secrets = []) {
  let output = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 3) {
      output = output.split(secret).join(mask(secret));
    }
  }
  return output;
}

function resolveReference(reference) {
  if (reference.startsWith('env:')) {
    const name = reference.slice(4);
    const value = process.env[name];
    if (!value) throw new Error(`la variable de entorno ${name} de ${reference} está vacía`);
    return value;
  }
  if (reference.startsWith('file:')) {
    return readFileSync(reference.slice(5), 'utf8').trim();
  }
  if (reference.startsWith('op://')) {
    try {
      return execFileSync('op', ['read', reference], { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('no se pudo resolver la referencia op:// (¿1Password CLI instalado y sesión activa?)');
    }
  }
  if (reference.startsWith('vault://')) {
    throw new Error('vault:// todavía no está soportado por el motor (E1); usa env: o file:');
  }
  throw new Error(`referencia de credencial no reconocida: '${reference.split(':')[0]}:…'`);
}

/**
 * Resuelve el secreto y lo pasa a un callback. Nunca se devuelve el valor a quien
 * podría imprimirlo: solo lo recibe la función que arma la petición.
 */
export async function withSecret(values, key, callback) {
  let secret = values.get(key);
  if (!secret) {
    const reference = values.get(`${key}_REF`);
    if (!reference) throw new Error(`credencial ausente: ${key}`);
    secret = resolveReference(reference);
  }
  if (!secret) throw new Error(`credencial vacía: ${key}`);

  try {
    return await callback(secret);
  } finally {
    secret = null;
  }
}

/** Estado legible sin filtrar valores: útil para el CLI y los informes. */
export function describeCredentials(values) {
  const lines = [];
  for (const [role, keys] of Object.entries(ROLES)) {
    if (keys.length === 0) {
      lines.push(`${role}: no requiere credenciales`);
      continue;
    }
    const state = keys.map((key) => `${key}=${isConfigured(values, key) ? 'cargada' : 'VACÍA'}`);
    lines.push(`${role}: ${state.join(' ')}`);
  }
  return lines;
}

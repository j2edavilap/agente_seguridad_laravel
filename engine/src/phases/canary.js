import { createClient } from '../http/client.js';
import { isConfigured, withSecret } from '../policy/credentials.js';
import { loginAs, planUrl } from '../policy/session.js';

const ROLE_PREFIX = { user: 'USER', userB: 'USER_B', admin: 'ADMIN' };

export function extractCandidates(payload, idField = 'id') {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  const seen = new Set();
  const candidates = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const raw = row[idField];
    if (raw === undefined || raw === null) continue;
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    const label = row.name ?? row.title ?? row.number ?? row.code ?? row.subject ?? id;
    candidates.push({ id, label: String(label) });
  }

  return candidates;
}

export function buildCanaryEntry({ listUrl, id, label }) {
  const base = String(listUrl).replace(/\/+$/, '');
  return {
    name: label ? `canario: ${label}` : `canario: recurso ${id} de B`,
    url: `${base}/${id}`,
    as: 'user',
    owner: 'userB',
    expect: [403, 404],
  };
}

export function applyCanary(plan, entry) {
  const next = { ...plan };
  next.crossAccess = Array.isArray(next.crossAccess) ? [...next.crossAccess] : [];
  if (!next.crossAccess.some((item) => item.url === entry.url)) {
    next.crossAccess.push(entry);
  }
  return next;
}

export async function discoverCanary({
  baseUrl,
  whitelist,
  plan,
  credentials,
  listUrl,
  idField = 'id',
  role = 'userB',
  fetchImpl = globalThis.fetch,
}) {
  if (!plan?.login) throw new Error('el plan no define login; generá el plan primero');

  const prefix = ROLE_PREFIX[role];
  if (!prefix) throw new Error(`rol no soportado: ${role}`);

  const username = credentials.get(`SECTEST_${prefix}_USERNAME`);
  if (!username || !isConfigured(credentials, `SECTEST_${prefix}_PASSWORD`)) {
    throw new Error(`faltan credenciales de ${role} en sectest/scope/credentials.conf`);
  }

  const client = createClient({ whitelist, fetchImpl, maxRequests: 10, allowedMethods: ['GET', 'POST'] });
  const password = await withSecret(credentials, `SECTEST_${prefix}_PASSWORD`, (secret) => secret);
  const session = await loginAs({ client, baseUrl, login: plan.login, username, password });

  const response = await client.request(planUrl(baseUrl, listUrl), {
    headers: { cookie: session.cookie },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`la lista ${listUrl} respondió HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new Error(`la lista ${listUrl} no devolvió JSON`);
  }

  const candidates = extractCandidates(payload, idField);
  if (candidates.length === 0) {
    throw new Error(`no se encontraron candidatos con el campo '${idField}' en ${listUrl}`);
  }

  return {
    generado: new Date().toISOString(),
    listUrl,
    idField,
    role,
    candidates: candidates.slice(0, 50),
  };
}

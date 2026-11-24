import { createHash } from 'node:crypto';

import { mask } from '../policy/credentials.js';
import { assertAllowedTarget } from '../policy/target.js';

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;

export function maskHeaderValue(name, value) {
  if (!SENSITIVE_HEADER.test(name)) return value;
  if (/^set-cookie$/i.test(name)) {
    return String(value).replace(/(=\s*)([^;]+)/, (match, separator, secret) => `${separator}${mask(secret.trim())}`);
  }
  return mask(String(value));
}

export function snapshotHeaders(headers) {
  const snapshot = {};
  for (const [name, value] of headers.entries()) {
    snapshot[name] = maskHeaderValue(name, value);
  }
  return snapshot;
}

const MAX_REDIRECTS = 3;

async function readLimited(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      const remaining = maxBytes - size;
      if (chunk.length >= remaining) {
        chunks.push(chunk.subarray(0, remaining));
        size = maxBytes;
        break;
      }
      chunks.push(chunk);
      size += chunk.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // el cuerpo ya terminó
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createClient({
  whitelist = [],
  timeoutMs = 10000,
  maxBytes = 512 * 1024,
  fetchImpl = globalThis.fetch,
  maxRequests = 40,
  allowedMethods = ['GET'],
} = {}) {
  const transcripts = [];
  let count = 0;

  async function request(url, { method = 'GET', headers = {}, body = null, followRedirects = true } = {}) {
    const verb = String(method).toUpperCase();
    if (!allowedMethods.includes(verb)) {
      throw new Error(`método no permitido: ${verb}`);
    }

    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      assertAllowedTarget(current, { whitelist });

      if (count >= maxRequests) {
        throw new Error(`presupuesto de peticiones agotado (${maxRequests})`);
      }
      count += 1;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();

      let response;
      try {
        response = await fetchImpl(current, {
          method: verb,
          headers,
          body: body ?? undefined,
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const responseBody = await readLimited(response, maxBytes);
      const setCookie =
        typeof response.headers.getSetCookie === 'function'
          ? response.headers.getSetCookie()
          : [response.headers.get('set-cookie')].filter(Boolean);

      const entry = {
        method: verb,
        url: current,
        status: response.status,
        request_headers: snapshotHeaders(new Headers(headers)),
        response_headers: snapshotHeaders(response.headers),
        set_cookie: setCookie.map((cookie) => maskHeaderValue('set-cookie', cookie)),
        body_sha256: body ? createHash('sha256').update(String(body)).digest('hex') : null,
        body_muestra: responseBody.slice(0, 800),
        duracion_ms: Date.now() - startedAt,
      };
      transcripts.push(entry);

      const location = response.headers.get('location');
      if (followRedirects && response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }

      return { ...entry, body: responseBody, rawSetCookie: setCookie, location };
    }

    throw new Error(`demasiadas redirecciones partiendo de ${url}`);
  }

  return {
    request,
    get transcripts() {
      return transcripts;
    },
    get count() {
      return count;
    },
  };
}

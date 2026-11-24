import { isHostAllowed } from './authorization.js';

export function assertAllowedTarget(url, { whitelist = [] } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`protocolo no permitido: ${parsed.protocol}`);
  }
  if (!isHostAllowed(parsed.toString(), whitelist)) {
    throw new Error(`host fuera de la lista blanca: ${parsed.hostname}`);
  }
  return parsed;
}

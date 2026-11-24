import { extractJson } from '../runner.js';
import { mapSeverity } from './composer-audit.js';

export function parseNpmAudit(text) {
  const data = extractJson(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const items = [];
  for (const [packageName, vulnerability] of Object.entries(data.vulnerabilities ?? {})) {
    const via = Array.isArray(vulnerability.via)
      ? vulnerability.via.find((entry) => entry && typeof entry === 'object') ?? null
      : null;
    items.push({
      packageName,
      severity: vulnerability.severity ?? via?.severity ?? null,
      title: via?.title ?? 'Vulnerabilidad en dependencia',
      cwe: Array.isArray(via?.cwe) ? via.cwe.join(', ') : null,
      range: vulnerability.range ?? '',
      direct: Boolean(vulnerability.isDirect),
      fixAvailable: vulnerability.fixAvailable ?? null,
    });
  }
  items.sort((a, b) => a.packageName.localeCompare(b.packageName));
  return { items };
}

export function npmFindings(parsed) {
  return parsed.items.map((item) => ({
    code: 'SEC',
    rule: `NPM-${item.packageName}`.toUpperCase(),
    title: `Dependencia vulnerable: ${item.packageName}`,
    severity: mapSeverity(item.severity, 'medio'),
    confidence: 'confirmado',
    cwe: item.cwe ?? 'CWE-1395',
    owasp: 'A06:2021',
    iso: 'A.8.8',
    file: 'package-lock.json',
    line: 0,
    evidence: `${item.title} — rango ${item.range || 'sin especificar'}${item.direct ? ' (dependencia directa)' : ''}`.slice(
      0,
      240,
    ),
    remediation:
      'Actualizar con `npm audit fix` o subir la dependencia a una versión corregida y volver a auditar.',
  }));
}

export function npmCommand(tools) {
  if (!tools.npm?.available) return null;
  return {
    command: tools.npm.invoke[0],
    args: [...tools.npm.invoke.slice(1), 'audit', '--json', '--package-lock-only'],
  };
}

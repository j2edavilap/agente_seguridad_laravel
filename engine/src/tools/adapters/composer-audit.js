import { extractJson } from '../runner.js';

const SEVERITY_MAP = {
  critical: 'critico',
  critico: 'critico',
  high: 'alto',
  alto: 'alto',
  medium: 'medio',
  moderate: 'medio',
  medio: 'medio',
  low: 'bajo',
  bajo: 'bajo',
  info: 'informativo',
  informational: 'informativo',
};

export function mapSeverity(value, fallback = 'medio') {
  if (!value) return fallback;
  return SEVERITY_MAP[String(value).toLowerCase()] ?? fallback;
}

export function parseComposerAudit(text) {
  const data = extractJson(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const items = [];
  for (const [packageName, advisories] of Object.entries(data.advisories ?? {})) {
    for (const advisory of advisories ?? []) {
      items.push({
        packageName,
        advisoryId: String(advisory.advisoryId ?? ''),
        title: String(advisory.title ?? 'Aviso de seguridad'),
        cve: advisory.cve ? String(advisory.cve) : null,
        link: advisory.link ? String(advisory.link) : null,
        affectedVersions: String(advisory.affectedVersions ?? ''),
        severity: advisory.severity ? String(advisory.severity) : null,
      });
    }
  }
  items.sort(
    (a, b) => a.packageName.localeCompare(b.packageName) || a.advisoryId.localeCompare(b.advisoryId),
  );
  return { items, abandoned: Object.keys(data.abandoned ?? {}) };
}

export function composerFindings(parsed) {
  return parsed.items.map((item) => ({
    code: 'SEC',
    rule: `COMPOSER-${item.advisoryId || item.packageName}`.toUpperCase(),
    title: `Dependencia vulnerable: ${item.packageName}`,
    severity: mapSeverity(item.severity, 'medio'),
    confidence: 'confirmado',
    cwe: 'CWE-1395',
    owasp: 'A06:2021',
    iso: 'A.8.8',
    file: 'composer.lock',
    line: 0,
    evidence: `${item.advisoryId || 'aviso'}${item.cve ? ` (${item.cve})` : ''}: ${item.title} — afecta ${item.affectedVersions || 'versiones sin especificar'}`.slice(
      0,
      240,
    ),
    remediation:
      'Actualizar el paquete a una versión fuera del rango afectado (`composer update <paquete>`) y verificar con `composer audit`.',
  }));
}

export function composerCommand(tools) {
  if (!tools.composer?.available) return null;
  return {
    command: tools.composer.invoke[0],
    args: [...tools.composer.invoke.slice(1), 'audit', '--format=json', '--no-interaction', '--locked'],
  };
}

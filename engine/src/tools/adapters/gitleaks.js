import { extractJson } from '../runner.js';

export function parseGitleaks(text) {
  const data = extractJson(text);
  if (!Array.isArray(data)) return null;

  const items = data
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ruleId: String(entry.RuleID ?? 'gitleaks'),
      description: String(entry.Description ?? 'Secreto detectado'),
      file: String(entry.File ?? ''),
      line: Number(entry.StartLine) || 0,
      secret: entry.Secret ? String(entry.Secret) : '',
    }));

  const seen = new Set();
  return {
    items: items.filter((item) => {
      const key = `${item.ruleId}|${item.file}|${item.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

export function gitleaksFindings(parsed) {
  return parsed.items.map((item) => ({
    code: 'SEC',
    rule: `GITLEAKS-${item.ruleId}`.toUpperCase(),
    title: `Secreto detectado: ${item.description}`,
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-798',
    owasp: 'A07:2021',
    iso: 'A.8.24',
    file: item.file.split('\\').join('/'),
    line: item.line,
    evidence: `${item.ruleId} — valor enmascarado por --redact`.slice(0, 240),
    remediation:
      'Rotar el secreto, eliminarlo del historial del repositorio y moverlo a `sectest/scope/credentials.conf` o a un gestor de secretos.',
  }));
}

export function gitleaksCommand(tools, projectRoot, reportPath) {
  if (!tools.gitleaks?.available) return null;
  return {
    command: tools.gitleaks.invoke[0],
    args: [
      ...tools.gitleaks.invoke.slice(1),
      'detect',
      '--no-git',
      '--redact',
      '--exit-code',
      '0',
      '--report-format',
      'json',
      '--report-path',
      reportPath,
      '--source',
      projectRoot,
    ],
  };
}

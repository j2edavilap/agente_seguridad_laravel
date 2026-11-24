import { existsSync } from 'node:fs';
import path from 'node:path';

import { extractJson } from '../runner.js';

export function parsePhpstan(text) {
  const data = extractJson(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const messages = [];
  for (const [file, info] of Object.entries(data.files ?? {})) {
    for (const message of info?.messages ?? []) {
      messages.push({
        file,
        line: Number(message.line) || 0,
        message: String(message.message ?? ''),
        identifier: String(message.identifier ?? 'phpstan'),
      });
    }
  }

  return { total: Number(data.totals?.file_errors ?? messages.length), messages };
}

function toRelative(projectRoot, file) {
  const relative = path.relative(projectRoot, file);
  return (relative.startsWith('..') ? file : relative).split(path.sep).join('/');
}

/**
 * Agrupa por identificador de phpstan para no emitir cien hallazgos por el mismo patrón.
 * Determinista: ordena por identificador y usa la primera ubicación.
 */
export function phpstanFindings(parsed, projectRoot) {
  const groups = new Map();
  for (const message of parsed.messages) {
    const key = message.identifier;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(message);
  }

  const findings = [];
  for (const [identifier, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const first = list[0];
    findings.push({
      code: 'QAL',
      rule: `PHPSTAN-${identifier}`.toUpperCase(),
      title: `Error de análisis estático: ${identifier}`,
      severity: 'bajo',
      confidence: 'confirmado',
      cwe: 'CWE-710',
      owasp: 'A06:2021',
      iso: 'A.8.28',
      file: toRelative(projectRoot, first.file),
      line: first.line,
      evidence: `${list.length} ocurrencia(s); primera: ${first.message}`.slice(0, 240),
      remediation:
        'Corregir el error reportado. Si es un falso positivo, documentarlo con una supresión justificada y registrar la decisión.',
    });
  }
  return findings;
}

export function phpstanCommand(tools, projectRoot) {
  if (!tools.phpstan?.available) return null;
  const args = [
    ...tools.phpstan.invoke.slice(1),
    'analyse',
    '--no-progress',
    '--error-format=json',
    '--level=max',
  ];
  const appDirectory = path.join(projectRoot, 'app');
  if (existsSync(appDirectory)) args.push(appDirectory);
  return { command: tools.phpstan.invoke[0], args };
}

export const SEVERITY_ORDER = Object.freeze(['critico', 'alto', 'medio', 'bajo', 'informativo']);

const SEVERITY_LABEL = Object.freeze({
  critico: 'crítico',
  alto: 'alta',
  medio: 'media',
  bajo: 'baja',
  informativo: 'informativa',
});

export function severityLabel(value) {
  return SEVERITY_LABEL[value] ?? String(value ?? '');
}

export function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`);
  return [head, separator, ...body].join('\n');
}

export function formatScore(value) {
  return value === null || value === undefined ? 'no evaluable' : String(value);
}

export function formatCounts(counts) {
  return SEVERITY_ORDER.map((severity) => `${severity} ${counts?.[severity] ?? 0}`).join(' · ');
}

export function sortFindings(findings) {
  const rank = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));
  return [...findings].sort(
    (a, b) =>
      (rank.get(a.severity) ?? 99) - (rank.get(b.severity) ?? 99) ||
      String(a.file).localeCompare(String(b.file)) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      String(a.id ?? '').localeCompare(String(b.id ?? '')),
  );
}

export function findingLocation(finding) {
  if (!finding) return '';
  return finding.line > 0 ? `${finding.file}:${finding.line}` : String(finding.file ?? '');
}

export function checkMark(condition) {
  return condition ? 'sí' : 'no';
}

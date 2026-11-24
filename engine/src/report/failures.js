import { findingLocation, severityLabel, sortFindings, SEVERITY_ORDER, table } from './format.js';

/**
 * Listado de fallos para otra IA especializada. No incluye soluciones,
 * estimaciones de esfuerzo ni responsables: solo qué se encontró y cómo replicarlo.
 */
export function renderFailuresReport({ resumen, artifacts = [], generatedAt }) {
  const findings = sortFindings(artifacts.flatMap((artifact) => artifact.findings ?? []));

  const counts = SEVERITY_ORDER.map((severity) => [
    severityLabel(severity),
    findings.filter((finding) => finding.severity === severity).length,
  ]);

  const lines = [];
  lines.push(`# Hallazgos y fallas — ${resumen.proyecto || 'sin nombre'}`);
  lines.push('');
  lines.push(`> Generado por laravel-sec-engine el ${generatedAt}.`);
  lines.push(
    `> Versión auditada: ${resumen.version || 'sin versión'} · Total de fallos: ${findings.length}`,
  );
  lines.push('>');
  lines.push('> Este documento **no contiene soluciones, estimaciones de esfuerzo ni responsables**.');
  lines.push('> Está pensado para que otra IA especializada evalúe y corrija cada fallo.');
  lines.push('');

  lines.push('## Resumen por prioridad');
  lines.push('');
  lines.push(table(['Prioridad', 'Cantidad'], counts));
  lines.push('');

  if (findings.length === 0) {
    lines.push('No se registraron fallos.');
    lines.push('');
    return `${lines.join('\n').trimEnd()}\n`;
  }

  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;

    lines.push(`## ${severityLabel(severity).toUpperCase()} (${group.length})`);
    lines.push('');

    for (const finding of group) {
      lines.push(`### ${finding.id} — ${finding.title}`);
      lines.push('');
      lines.push(`- **Prioridad:** ${severityLabel(finding.severity)} · **Estado:** ${finding.confidence}`);
      lines.push(`- **Descripción:** ${finding.description ?? finding.title}`);
      lines.push(`- **Ubicación:** \`${findingLocation(finding)}\``);
      if (finding.evidence) lines.push(`- **Evidencia:** \`${finding.evidence}\``);
      lines.push(`- **Por qué es un problema:** ${finding.impact ?? '—'}`);
      lines.push(
        `- **OWASP:** ${finding.owasp ?? '—'} · **CWE:** ${finding.cwe ?? '—'} · **ISO 27001:** ${finding.iso ?? '—'}`,
      );
      lines.push(`- **Cómo se encontró:** ${finding.source ?? 'Auditoría'} — regla \`${finding.rule ?? '—'}\``);
      lines.push(
        `- **Cómo se replica:** ${finding.reproduction ?? `Revisar ${findingLocation(finding)} y repetir la comprobación.`}`,
      );
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

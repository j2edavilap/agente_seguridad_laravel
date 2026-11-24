import {
  findingLocation,
  formatCounts,
  severityLabel,
  sortFindings,
  table,
} from './format.js';

function toolRows(manifest = []) {
  return manifest.map((tool) => [tool.nombre, tool.version || '—', tool.ruta || '—']);
}

export function renderIndividualReport({
  reportCode,
  title,
  subagente,
  contract,
  findings = [],
  checks = [],
  manifest = [],
  authorization = {},
  generatedAt,
}) {
  const ordered = sortFindings(findings);
  const blocked = checks.filter((check) => check.status === 'bloqueada');
  const clean = checks.filter((check) => check.status === 'ejecutada' && check.findings === 0);

  const lines = [];
  lines.push(`# ${reportCode} — ${title}`);
  lines.push('');
  lines.push(`> Generado por laravel-sec-engine el ${generatedAt}.`);
  lines.push(
    `> Proyecto: ${authorization.project ?? 'sin nombre'} · Versión: ${authorization.version ?? 'sin versión'} · Subagente: ${subagente}`,
  );
  lines.push('');

  lines.push('## 1. Resumen ejecutivo');
  lines.push('');
  lines.push(
    table(
      ['Métrica', 'Valor'],
      [
        ['Pruebas ejecutadas', contract.pruebas_ejecutadas],
        ['Aprobadas', contract.pruebas_aprobadas],
        ['Fallidas', contract.pruebas_fallidas],
        ['Bloqueadas', contract.pruebas_bloqueadas],
        ['Hallazgos', `${ordered.length} (${formatCounts(contract.hallazgos)})`],
        ['Confirmados', contract.hallazgos_confirmados],
        ['Falsos positivos', contract.falsos_positivos],
      ],
    ),
  );
  lines.push('');

  lines.push('## 2. Herramientas');
  lines.push('');
  lines.push(table(['Herramienta', 'Versión', 'Ruta'], toolRows(manifest)));
  lines.push('');

  lines.push('## 3. Fallos');
  lines.push('');
  if (ordered.length === 0) {
    lines.push('Sin fallos.');
    lines.push('');
  }
  for (const finding of ordered) {
    lines.push(`### ${finding.id} — ${finding.title}`);
    lines.push('');
    lines.push(
      `- **Severidad:** ${severityLabel(finding.severity)} · **Estado:** ${finding.confidence}`,
    );
    lines.push(`- **Descripción:** ${finding.description ?? finding.title}`);
    lines.push(`- **Ubicación:** \`${findingLocation(finding)}\``);
    if (finding.evidence) lines.push(`- **Evidencia:** \`${finding.evidence}\``);
    lines.push(`- **Por qué es un problema:** ${finding.impact ?? '—'}`);
    lines.push(
      `- **OWASP:** ${finding.owasp ?? '—'} · **CWE:** ${finding.cwe ?? '—'} · **ISO 27001:** ${finding.iso ?? '—'}`,
    );
    lines.push('');
  }

  lines.push('## 4. Pruebas bloqueadas');
  lines.push('');
  if (blocked.length === 0) {
    lines.push('Ninguna.');
  } else {
    lines.push(table(['Prueba', 'Motivo'], blocked.map((check) => [check.name, check.note ?? ''])));
  }
  lines.push('');

  lines.push('## 5. Controles verificados sin hallazgos');
  lines.push('');
  if (clean.length === 0) {
    lines.push('Ninguno.');
  } else {
    for (const check of clean) lines.push(`- ${check.name} (${check.version ?? 'sin versión'})`);
  }
  lines.push('');

  lines.push('## 6. Métricas del subagente');
  lines.push('');
  lines.push(
    table(
      ['Ejecutadas', 'Aprobadas', 'Fallidas', 'Bloqueadas'],
      [[contract.pruebas_ejecutadas, contract.pruebas_aprobadas, contract.pruebas_fallidas, contract.pruebas_bloqueadas]],
    ),
  );
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

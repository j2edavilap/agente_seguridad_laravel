import {
  findingLocation,
  formatCounts,
  formatScore,
  severityLabel,
  sortFindings,
  SEVERITY_ORDER,
  table,
} from './format.js';

const DEFAULT_THRESHOLDS = { seg: 80, ci: 85, cs: 75 };

function dimensionRows(resumen, thresholds) {
  const rows = [];
  const dims = [
    ['SEG', 'seguridad', thresholds.seg],
    ['CI', 'control_informacion', thresholds.ci],
    ['CS', 'calidad_software', thresholds.cs],
  ];
  for (const [label, key, threshold] of dims) {
    const value = resumen.dimensiones[key];
    const status = value === null ? 'no evaluable' : value >= threshold ? 'cumple' : 'no cumple';
    rows.push([label, formatScore(value), threshold, status]);
  }
  return rows;
}

function calculationDetail(resumen) {
  const rows = [];
  for (const [key, calculation] of Object.entries(resumen.calculos)) {
    rows.push([key, calculation.formula, JSON.stringify(calculation.entradas), formatScore(calculation.resultado)]);
  }
  return rows;
}

export function renderFinalReport({
  resumen,
  artifacts = [],
  thresholds = DEFAULT_THRESHOLDS,
  verdict = null,
  generatedAt,
}) {
  const findings = sortFindings(artifacts.flatMap((artifact) => artifact.findings ?? []));
  const blocked = artifacts.flatMap((artifact) =>
    (artifact.checks ?? [])
      .filter((check) => check.status === 'bloqueada')
      .map((check) => [artifact.subagente, check.name, check.note ?? '']),
  );
  const topRisks = findings.slice(0, 5);

  const lines = [];
  lines.push(`# Informe final de auditoría — ${resumen.proyecto || 'sin nombre'}`);
  lines.push('');
  lines.push(`> Generado por laravel-sec-engine el ${generatedAt}.`);
  lines.push(
    `> Versión auditada: ${resumen.version || 'sin versión'} · Ventana autorizada: ${resumen.ventana_autorizada.inicio || '?'} → ${resumen.ventana_autorizada.fin || '?'} (${resumen.ventana_autorizada.zona || 'sin zona'})`,
  );
  lines.push('');

  lines.push('## 1. Resumen ejecutivo');
  lines.push('');
  const reason = verdict?.reason ? ` — ${verdict.reason}` : '';
  lines.push(`**Veredicto: ${resumen.veredicto}**${reason}`);
  lines.push('');
  lines.push(table(['Dimensión', 'Puntuación', 'Umbral', 'Estado'], dimensionRows(resumen, thresholds)));
  lines.push('');
  lines.push('Riesgos principales:');
  lines.push('');
  if (topRisks.length === 0) {
    lines.push('Sin hallazgos registrados.');
  } else {
    for (const finding of topRisks) {
      lines.push(
        `- **${finding.id}** — ${finding.title} (${severityLabel(finding.severity)}, \`${findingLocation(finding)}\`)`,
      );
    }
  }
  lines.push('');

  lines.push('## 2. Alcance y metodología');
  lines.push('');
  lines.push(`- Informes consolidados: ${artifacts.map((artifact) => artifact.subagente).join(', ') || 'ninguno'}.`);
  lines.push(`- Hallazgos totales: ${findings.length} (${formatCounts(resumen.hallazgos)}).`);
  lines.push('- Normas de referencia: ISO/IEC 25010, ISO/IEC 27001 Anexo A, ISO/IEC/IEEE 29119-4, OWASP Top 10 2021.');
  lines.push('- Herramientas y versiones: ver el anexo de cada informe individual.');
  lines.push('');

  lines.push('## 3. Cuantificación');
  lines.push('');
  lines.push(
    table(
      ['Dimensión', 'Resultado', 'Fórmula', 'Entradas', 'Resultado declarado'],
      calculationDetail(resumen),
    ),
  );
  lines.push('');
  lines.push('Las entradas quedan registradas para que cualquiera recompruebe el número.');
  lines.push('');

  lines.push('## 4. Fallos');
  lines.push('');
  if (findings.length === 0) {
    lines.push('Sin fallos registrados.');
  } else {
    for (const severity of SEVERITY_ORDER) {
      const group = findings.filter((finding) => finding.severity === severity);
      if (group.length === 0) continue;

      lines.push(`### ${severityLabel(severity)} (${group.length})`);
      lines.push('');

      for (const finding of group) {
        lines.push(`#### ${finding.id} — ${finding.title}`);
        lines.push(`- **Descripción:** ${finding.description ?? finding.title}`);
        lines.push(`- **Ubicación:** \`${findingLocation(finding)}\``);
        if (finding.evidence) lines.push(`- **Evidencia:** \`${finding.evidence}\``);
        lines.push(`- **Por qué es un problema:** ${finding.impact ?? '—'}`);
        lines.push(
          `- **OWASP:** ${finding.owasp ?? '—'} · **CWE:** ${finding.cwe ?? '—'} · **ISO 27001:** ${finding.iso ?? '—'}`,
        );
        lines.push('');
      }
    }
  }
  lines.push('');

  lines.push('## 5. Análisis por dimensión');
  lines.push('');
  lines.push(`- **Seguridad (SEG):** ${formatScore(resumen.dimensiones.seguridad)}.`);
  lines.push(
    `- **Control de información (CI):** ${formatScore(resumen.dimensiones.control_informacion)}.`,
  );
  lines.push(`- **Calidad de software (CS):** ${formatScore(resumen.dimensiones.calidad_software)}.`);
  lines.push('');
  lines.push(
    'El detalle de cada fallo está en la sección 4 y en `sectest/reports/HALLAZGOS_FALLAS.md`.',
  );
  lines.push('');

  lines.push('## 6. Madurez SPICE');
  lines.push('');
  if (Array.isArray(resumen.spice) && resumen.spice.length > 0) {
    lines.push(table(['Proceso', 'Nivel', 'Evidencia'], resumen.spice.map((item) => [item.proceso ?? '', item.nivel ?? '', item.evidencia ?? ''])));
  } else {
    lines.push('No evaluada en esta corrida.');
  }
  lines.push('');

  lines.push('## 7. Pruebas no ejecutadas');
  lines.push('');
  if (blocked.length === 0) {
    lines.push('Ninguna.');
  } else {
    lines.push(table(['Informe', 'Prueba', 'Motivo'], blocked));
  }
  lines.push('');

  lines.push('## 8. Limitaciones');
  lines.push('');
  lines.push('- El entorno de staging puede no ser idéntico a producción.');
  lines.push('- Los resultados están acotados a las herramientas y reglas del manifiesto.');
  lines.push('- Una prueba sin evidencia registrada se considera bloqueada, nunca aprobada.');
  lines.push('- Las herramientas ausentes se declaran; no se infiere su resultado.');
  lines.push('');

  lines.push('## 9. Anexos');
  lines.push('');
  lines.push('- `sectest/reports/HALLAZGOS_FALLAS.md` — fallos para otra IA: cómo se encontraron y cómo se replican.');
  for (const artifact of artifacts) {
    lines.push(`- \`${artifact.archivo_reporte}\` — ${artifact.subagente}`);
  }
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderIndex({ artifacts = [], extra = [] }) {
  const rows = [
    ['`sectest/reports/INFORME_FINAL.md`', 'Informe consolidado y veredicto'],
    ['`sectest/reports/HALLAZGOS_FALLAS.md`', 'Solo fallos: cómo se encontraron y cómo se replican'],
    ['`sectest/reports/resumen.json`', 'Datos consolidados y trazabilidad del cálculo'],
    ...artifacts.map((artifact) => [
      `\`${artifact.archivo_reporte}\``,
      `Informe individual ${artifact.subagente}`,
    ]),
    ['`sectest/reports/contratos/`', 'Contratos JSON validados por subagente'],
    ['`sectest/reports/hallazgos/`', 'Hallazgos con evidencia y manifiesto de herramientas'],
    ...extra,
  ];

  const lines = [];
  lines.push('# Índice de informes');
  lines.push('');
  lines.push(table(['Archivo', 'Contenido'], rows));
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

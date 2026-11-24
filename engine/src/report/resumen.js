import { validateResumen } from '../domain/contract.js';
import { computeCi, computeCs, computeSeg, computeVerdict } from '../domain/scoring.js';
import { addCounts, emptyCounts, subtractCounts } from '../domain/severity.js';

function contractBy(reportCode, contratos) {
  return contratos.find((contract) => contract.subagente === reportCode) ?? null;
}

export function buildResumen({
  project = '',
  version = '',
  fecha = new Date().toISOString(),
  ventana = null,
  herramientas = [],
  contratos,
  thresholds = {},
}) {
  const totals = emptyCounts();
  const confirmed = emptyCounts();
  let falsePositives = 0;

  for (const contract of contratos) {
    addCounts(totals, contract.hallazgos);
    addCounts(confirmed, contract.confirmados);
    falsePositives += contract.falsos_positivos ?? 0;
  }

  const config = contractBy('A-CONFIG', contratos);
  const quality = contractBy('A-QUALITY', contratos);
  const statics = contractBy('A-STATIC', contratos);

  const controls = contratos.reduce(
    (acc, contract) => ({
      aplicables: acc.aplicables + (contract.metricas?.controles_aplicables ?? 0),
      conformes: acc.conformes + (contract.metricas?.controles_conformes ?? 0),
      no_probados: acc.no_probados + (contract.metricas?.controles_no_probados ?? 0),
    }),
    { aplicables: 0, conformes: 0, no_probados: 0 },
  );
  const controlsMeasured = contratos.some((contract) =>
    Number.isFinite(contract.metricas?.controles_aplicables),
  );

  const seg = computeSeg({
    confirmed,
    controlsNotTested: controlsMeasured ? controls.no_probados : null,
  });
  const ci = computeCi({
    aplicables: controlsMeasured ? controls.aplicables : null,
    conformes: controlsMeasured ? controls.conformes : null,
  });
  // La mantenibilidad la mide A-STATIC; A-QUALITY reporta el resto. Se fusionan por dueno.
  const qualityMetrics = {
    ...(quality?.metricas ?? {}),
    errores_estaticos:
      statics?.metricas?.errores_estaticos ?? quality?.metricas?.errores_estaticos ?? null,
    kloc_analizado: statics?.metricas?.kloc_analizado ?? quality?.metricas?.kloc_analizado ?? null,
  };
  const cs = computeCs(qualityMetrics);

  const probable = subtractCounts(totals, confirmed);
  const verdict = computeVerdict({
    seg: seg.value,
    ci: ci.value,
    cs: cs.value,
    criticalConfirmed: confirmed.critico > 0,
    criticalProbable: probable.critico > 0,
    thresholds,
  });

  const resumen = {
    proyecto: project,
    version,
    fecha,
    ventana_autorizada: ventana ?? { inicio: '', fin: '', zona: '' },
    herramientas,
    por_subagente: contratos.map((contract) => ({
      subagente: contract.subagente,
      archivo_reporte: contract.archivo_reporte,
      pruebas_ejecutadas: contract.pruebas_ejecutadas,
      hallazgos: contract.hallazgos,
      confirmados: contract.confirmados,
    })),
    hallazgos: totals,
    dimensiones: {
      seguridad: seg.value,
      control_informacion: ci.value,
      calidad_software: cs.value,
    },
    no_evaluable: {
      seguridad: seg.value === null,
      control_informacion: ci.value === null,
      calidad_software: cs.value === null,
    },
    calculos: {
      seguridad: {
        formula: seg.formula,
        entradas: { ...seg.entradas, supuestos: seg.supuestos },
        resultado: seg.value,
      },
      control_informacion: {
        formula: ci.formula,
        entradas: { ...ci.entradas, supuestos: ci.supuestos },
        resultado: ci.value,
      },
      calidad_software: {
        formula: cs.formula,
        entradas: { supuestos: cs.supuestos },
        componentes: cs.componentes,
        resultado: cs.value,
      },
    },
    veredicto: verdict.value,
    spice: [],
    bloqueos: [],
    archivo_informe: 'sectest/reports/INFORME_FINAL.md',
  };

  const errors = validateResumen(resumen);
  return { resumen, errors, verdict, seg, ci, cs, totals, confirmed, probable, falsePositives };
}

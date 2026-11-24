import { PENALTIES, SEVERITIES } from './severity.js';

const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const SEG_FORMULA =
  'SEG = max(0, min(100, 100 - P - B)); P = 25*critico + 10*alto + 4*medio + 1*bajo; B = min(10, 0.5*controles_no_probados)';

export const CI_FORMULA = 'CI = 100 * sum(conformes) / sum(aplicables), ponderacion uniforme';

export const CS_FORMULA =
  'CS = promedio de los componentes medibles, con peso 0.25 re-normalizado; componentes: cobertura, mantenibilidad, fiabilidad, estandares';

/**
 * SEG penaliza solo hallazgos confirmados. Si no se midieron los controles no probados,
 * B = 0 y se declara el supuesto en lugar de inventar un valor.
 */
export function computeSeg({ confirmed, controlsNotTested = null }) {
  const p = SEVERITIES.reduce(
    (acc, severity) => acc + PENALTIES[severity] * (confirmed?.[severity] ?? 0),
    0,
  );
  const measured = Number.isFinite(controlsNotTested);
  const b = measured ? Math.min(10, 0.5 * controlsNotTested) : 0;
  const value = clamp(round1(100 - p - b), 0, 100);

  return {
    value,
    formula: SEG_FORMULA,
    entradas: {
      confirmados: { ...confirmed },
      P: p,
      controles_no_probados: measured ? controlsNotTested : null,
      B: b,
    },
    supuestos: measured ? [] : ['controles_no_probados no medidos: se aplica B = 0'],
  };
}

/**
 * CI exige conteos del Anexo A. Sin controles aplicables no hay denominador: null, nunca 0.
 * La ponderacion por criticidad de activo queda pendiente: el contrato solo trae conteos.
 */
export function computeCi({ aplicables = null, conformes = null }) {
  if (!Number.isFinite(aplicables) || aplicables <= 0) {
    return {
      value: null,
      formula: CI_FORMULA,
      entradas: { controles_aplicables: aplicables, controles_conformes: conformes },
      supuestos: ['sin controles aplicables: CI no evaluable'],
    };
  }
  const ok = Number.isFinite(conformes) ? conformes : 0;
  const value = clamp(round1((100 * ok) / aplicables), 0, 100);
  return {
    value,
    formula: CI_FORMULA,
    entradas: {
      controles_aplicables: aplicables,
      controles_conformes: ok,
      controles_no_probados: Math.max(0, aplicables - ok),
      ponderacion: 'uniforme',
    },
    supuestos: ['sin clasificacion de activos en el contrato: todos los controles pesan 1'],
  };
}

export function maintainabilityScore(metrics) {
  const errors = metrics?.errores_estaticos;
  const kloc = metrics?.kloc_analizado;
  if (!Number.isFinite(errors) || !Number.isFinite(kloc)) return null;
  if (kloc === 0) return errors === 0 ? 100 : null;

  const perKloc = errors / kloc;
  if (perKloc === 0) return 100;
  if (perKloc <= 5) return 90;
  if (perKloc <= 20) return 75;
  if (perKloc <= 50) return 55;
  if (perKloc <= 100) return 35;
  return 15;
}

export function reliabilityScore(metrics) {
  const total = metrics?.pruebas_totales;
  const passed = metrics?.pruebas_aprobadas_n;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(passed)) return null;
  return clamp(round1((100 * passed) / total), 0, 100);
}

export function standardsScore(metrics) {
  const violations = metrics?.violaciones_estilo;
  if (!Number.isFinite(violations)) return null;
  if (violations === 0) return 100;
  if (violations <= 10) return 85;
  if (violations <= 50) return 65;
  if (violations <= 200) return 40;
  return 20;
}

export function computeCs(metrics = {}) {
  const components = {
    cobertura_pruebas: Number.isFinite(metrics.cobertura_lineas_pct)
      ? clamp(round1(metrics.cobertura_lineas_pct), 0, 100)
      : null,
    mantenibilidad: maintainabilityScore(metrics),
    fiabilidad: reliabilityScore(metrics),
    estandares_codigo: standardsScore(metrics),
  };

  const measured = Object.entries(components).filter(([, value]) => value !== null);
  if (measured.length === 0) {
    return {
      value: null,
      formula: CS_FORMULA,
      componentes: components,
      supuestos: ['ningun componente de calidad medible: CS no evaluable'],
    };
  }

  const totalWeight = measured.length * 0.25;
  const weighted = measured.reduce((acc, [, value]) => acc + 0.25 * value, 0);
  const value = clamp(round1(weighted / totalWeight), 0, 100);

  return {
    value,
    formula: CS_FORMULA,
    componentes: components,
    supuestos: [
      `${Object.keys(components).length - measured.length} componente(s) sin medir: peso re-normalizado`,
    ],
  };
}

export const DEFAULT_THRESHOLDS = Object.freeze({ seg: 80, ci: 85, cs: 75, floor: 60 });

export function computeVerdict({
  seg,
  ci,
  cs,
  criticalConfirmed = false,
  criticalProbable = false,
  thresholds = {},
}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const dims = [
    ['seguridad', seg],
    ['control_informacion', ci],
    ['calidad_software', cs],
  ];
  const nullCount = dims.filter(([, value]) => value === null).length;

  if (nullCount >= 2) {
    return { value: 'no_evaluable', reason: `${nullCount} dimensiones sin evaluar` };
  }
  if (criticalConfirmed) {
    return { value: 'rechazado', reason: 'hallazgo critico confirmado' };
  }

  const belowFloor = dims.filter(([, value]) => value !== null && value < t.floor).map(([name]) => name);
  if (belowFloor.length > 0) {
    return { value: 'rechazado', reason: `dimension bajo ${t.floor}: ${belowFloor.join(', ')}` };
  }

  const meets =
    seg !== null && seg >= t.seg && ci !== null && ci >= t.ci && cs !== null && cs >= t.cs;

  if (meets && !criticalProbable) {
    return { value: 'aprobado', reason: 'dimensiones sobre umbral y sin criticos' };
  }
  if (criticalProbable) {
    return { value: 'condicionado', reason: 'hay un critico probable sin confirmar' };
  }
  return { value: 'condicionado', reason: 'no cumple todos los umbrales' };
}

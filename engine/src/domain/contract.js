import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateSchema } from '../schema/validate.js';
import { isCounts, sumCounts } from './severity.js';
import { REPORT_FILE } from '../paths.js';

const SUBAGENT_SCHEMA_URL = new URL('../../../schemas/subagent-summary.schema.json', import.meta.url);
const RESUMEN_SCHEMA_URL = new URL('../../../schemas/resumen.schema.json', import.meta.url);

export const subagentSchema = JSON.parse(readFileSync(fileURLToPath(SUBAGENT_SCHEMA_URL), 'utf8'));
export const resumenSchema = JSON.parse(readFileSync(fileURLToPath(RESUMEN_SCHEMA_URL), 'utf8'));

export const EXPECTED_REPORT = Object.freeze({
  'A-STATIC': REPORT_FILE('A-01-STATIC.md'),
  'A-CONFIG': REPORT_FILE('A-02-CONFIG.md'),
  'A-DYNAMIC': REPORT_FILE('A-03-DYNAMIC.md'),
  'A-QUALITY': REPORT_FILE('A-04-QUALITY.md'),
});

export const ID_NAMESPACE = Object.freeze({
  'A-STATIC': 'A01-',
  'A-CONFIG': 'A02-',
  'A-DYNAMIC': 'A03-',
  'A-QUALITY': 'A04-',
});

export function validateContract(contract) {
  const errors = validateSchema(contract, subagentSchema, 'contrato');
  if (contract === null || typeof contract !== 'object') return errors;

  const expectedReport = EXPECTED_REPORT[contract.subagente];
  if (expectedReport && contract.archivo_reporte !== expectedReport) {
    errors.push(
      `contrato.archivo_reporte: '${contract.archivo_reporte}' no corresponde a ${contract.subagente}`,
    );
  }

  const namespace = ID_NAMESPACE[contract.subagente];
  if (namespace && Array.isArray(contract.ids_hallazgos)) {
    const seen = new Set();
    for (const id of contract.ids_hallazgos) {
      if (typeof id !== 'string') continue;
      if (!id.startsWith(namespace)) {
        errors.push(`contrato.ids_hallazgos: '${id}' no pertenece al namespace ${namespace}`);
      }
      if (seen.has(id)) errors.push(`contrato.ids_hallazgos: id duplicado '${id}'`);
      seen.add(id);
    }
  }

  if (isCounts(contract.confirmados) && isCounts(contract.hallazgos)) {
    const confirmedSum = sumCounts(contract.confirmados);
    if (confirmedSum !== contract.hallazgos_confirmados) {
      errors.push(
        `contrato.confirmados: suma ${confirmedSum} != hallazgos_confirmados ${contract.hallazgos_confirmados}`,
      );
    }
    for (const [severity, value] of Object.entries(contract.confirmados)) {
      if (value > contract.hallazgos[severity]) {
        errors.push(
          `contrato.confirmados.${severity}: ${value} > hallazgos.${severity} ${contract.hallazgos[severity]}`,
        );
      }
    }
  }

  return errors;
}

export function validateResumen(resumen) {
  const errors = validateSchema(resumen, resumenSchema, 'resumen');
  if (errors.length > 0) return errors;

  const dimensions = resumen.dimensiones;
  const nulls = Object.values(dimensions).filter((value) => value === null).length;

  for (const [name, value] of Object.entries(dimensions)) {
    const flagged = resumen.no_evaluable[name];
    const computed = resumen.calculos[name].resultado;
    if (value === null) {
      if (!flagged) errors.push(`resumen: dimensiones.${name} es null y no_evaluable.${name} es false`);
      if (computed !== null) errors.push(`resumen: dimensiones.${name} es null y calculos.${name} no`);
      continue;
    }
    if (flagged) errors.push(`resumen: dimensiones.${name} tiene valor y no_evaluable.${name} es true`);
    if (computed === null || Math.abs(value - computed) > 0.05) {
      errors.push(`resumen: dimensiones.${name} (${value}) no coincide con calculos.${name} (${computed})`);
    }
  }

  if (resumen.veredicto === 'aprobado' && nulls > 0) {
    errors.push(`resumen: veredicto 'aprobado' con ${nulls} dimension(es) sin evaluar`);
  }
  if (resumen.veredicto === 'no_evaluable' && nulls < 2) {
    errors.push(`resumen: veredicto 'no_evaluable' exige 2 dimensiones nulas (hay ${nulls})`);
  }

  return errors;
}

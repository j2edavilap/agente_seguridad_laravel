import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeCi,
  computeCs,
  computeSeg,
  computeVerdict,
  maintainabilityScore,
  standardsScore,
} from '../src/domain/scoring.js';

test('SEG reproduce el ejemplo documentado (1 alto, 2 medios, 3 bajos, 4 controles sin probar)', () => {
  const result = computeSeg({
    confirmed: { critico: 0, alto: 1, medio: 2, bajo: 3, informativo: 0 },
    controlsNotTested: 4,
  });
  assert.equal(result.value, 77);
  assert.equal(result.entradas.P, 21);
  assert.equal(result.entradas.B, 2);
});

test('SEG nunca baja de cero', () => {
  const result = computeSeg({
    confirmed: { critico: 5, alto: 5, medio: 5, bajo: 5, informativo: 0 },
    controlsNotTested: 40,
  });
  assert.equal(result.value, 0);
});

test('SEG declara el supuesto cuando no se midieron los controles', () => {
  const result = computeSeg({
    confirmed: { critico: 0, alto: 1, medio: 0, bajo: 0, informativo: 0 },
    controlsNotTested: null,
  });
  assert.equal(result.value, 90);
  assert.equal(result.entradas.B, 0);
  assert.equal(result.supuestos.length, 1);
});

test('CI es null sin controles aplicables, nunca cero', () => {
  assert.equal(computeCi({ aplicables: 0, conformes: 0 }).value, null);
  assert.equal(computeCi({ aplicables: null, conformes: null }).value, null);
});

test('CI calcula el porcentaje de controles conformes', () => {
  assert.equal(computeCi({ aplicables: 8, conformes: 7 }).value, 87.5);
  assert.equal(computeCi({ aplicables: 8, conformes: null }).value, 0);
});

test('mantenibilidad usa bandas por KLOC', () => {
  assert.equal(maintainabilityScore({ errores_estaticos: 0, kloc_analizado: 10 }), 100);
  assert.equal(maintainabilityScore({ errores_estaticos: 50, kloc_analizado: 10 }), 90);
  assert.equal(maintainabilityScore({ errores_estaticos: 500, kloc_analizado: 10 }), 55);
  assert.equal(maintainabilityScore({ errores_estaticos: 0, kloc_analizado: 0 }), 100);
  assert.equal(maintainabilityScore({ errores_estaticos: 3, kloc_analizado: 0 }), null);
  assert.equal(maintainabilityScore({ errores_estaticos: 3, kloc_analizado: null }), null);
});

test('estandares usa bandas por cantidad de violaciones', () => {
  assert.equal(standardsScore({ violaciones_estilo: 0 }), 100);
  assert.equal(standardsScore({ violaciones_estilo: 10 }), 85);
  assert.equal(standardsScore({ violaciones_estilo: 51 }), 40);
  assert.equal(standardsScore({ violaciones_estilo: null }), null);
});

test('CS re-normaliza el peso cuando falta un componente', () => {
  const result = computeCs({
    cobertura_lineas_pct: null,
    errores_estaticos: 50,
    kloc_analizado: 10,
    pruebas_totales: 10,
    pruebas_aprobadas_n: 9,
    violaciones_estilo: 0,
  });
  assert.equal(result.value, 93.3);
  assert.equal(result.componentes.cobertura_pruebas, null);
});

test('CS es null si ningun componente es medible', () => {
  const result = computeCs({});
  assert.equal(result.value, null);
  assert.equal(result.supuestos.length, 1);
});

test('CS calcula el promedio completo cuando todo se midio', () => {
  const result = computeCs({
    cobertura_lineas_pct: 80,
    errores_estaticos: 50,
    kloc_analizado: 10,
    pruebas_totales: 10,
    pruebas_aprobadas_n: 9,
    violaciones_estilo: 0,
  });
  assert.equal(result.value, 90);
});

test('veredicto aprobado exige las tres dimensiones sobre umbral y sin criticos', () => {
  assert.equal(computeVerdict({ seg: 90, ci: 90, cs: 90 }).value, 'aprobado');
});

test('un critico probable impide aprobado sin forzar rechazado', () => {
  assert.equal(computeVerdict({ seg: 90, ci: 90, cs: 90, criticalProbable: true }).value, 'condicionado');
});

test('un critico confirmado rechaza', () => {
  assert.equal(computeVerdict({ seg: 90, ci: 90, cs: 90, criticalConfirmed: true }).value, 'rechazado');
});

test('una dimension bajo el piso rechaza', () => {
  assert.equal(computeVerdict({ seg: 40, ci: 90, cs: 90 }).value, 'rechazado');
});

test('dos dimensiones nulas son no evaluable', () => {
  assert.equal(computeVerdict({ seg: 90, ci: null, cs: null }).value, 'no_evaluable');
});

test('una dimension nula impide aprobado', () => {
  assert.equal(computeVerdict({ seg: 90, ci: 90, cs: null }).value, 'condicionado');
});

test('los umbrales de la organizacion prevalecen', () => {
  assert.equal(computeVerdict({ seg: 70, ci: 70, cs: 70, thresholds: { seg: 65, ci: 65, cs: 65 } }).value, 'aprobado');
});

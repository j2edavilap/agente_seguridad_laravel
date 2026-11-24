import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateContract, validateResumen } from '../src/domain/contract.js';

const fixture = (relativePath) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../tools/tests/fixtures/${relativePath}`, import.meta.url)), 'utf8'));

test('acepta el contrato valido de las fixtures', () => {
  const contract = fixture('valid/contratos/A-01-STATIC.json');
  assert.deepEqual(validateContract(contract), []);
});

test('acepta el resumen valido de las fixtures', () => {
  const resumen = fixture('valid/resumen.json');
  assert.deepEqual(validateResumen(resumen), []);
});

test('rechaza el contrato invalido de las fixtures', () => {
  const contract = fixture('invalid/contratos/A-01-STATIC.json');
  const errors = validateContract(contract);
  assert.ok(errors.length >= 4, `se esperaban varios errores, llegaron ${errors.length}`);
  assert.ok(errors.some((error) => error.includes('namespace')));
  assert.ok(errors.some((error) => error.includes('confirmados')));
});

test('rechaza el resumen invalido de las fixtures', () => {
  const resumen = fixture('invalid/resumen.json');
  const errors = validateResumen(resumen);
  assert.ok(errors.some((error) => error.includes('no coincide con calculos')));
  assert.ok(errors.some((error) => error.includes('no_evaluable')));
});

test('detecta una clave sobrante en el contrato', () => {
  const contract = fixture('valid/contratos/A-01-STATIC.json');
  const errors = validateContract({ ...contract, dimensiones: { seguridad: 90 } });
  assert.ok(errors.some((error) => error.includes('clave no permitida')));
});

test('detecta que los confirmados no suman hallazgos_confirmados', () => {
  const contract = fixture('valid/contratos/A-01-STATIC.json');
  const errors = validateContract({
    ...contract,
    confirmados: { critico: 0, alto: 1, medio: 0, bajo: 0, informativo: 0 },
  });
  assert.ok(errors.some((error) => error.includes('suma 1 != hallazgos_confirmados 5')));
});

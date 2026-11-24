import assert from 'node:assert/strict';
import test from 'node:test';

import { validateContract } from '../src/domain/contract.js';
import { countPintFiles, parseClover, parseJunit, runQualityPhase } from '../src/phases/quality.js';

const STUB_TOOLS = {
  php: { available: false, reason: 'stub' },
  phpunit: { available: false, reason: 'stub' },
  pest: { available: false, reason: 'stub' },
  pint: { available: false, reason: 'stub' },
};

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="default" tests="10" failures="2" errors="1" skipped="1">
    <testcase name="a" />
    <testcase name="b"><failure>boom</failure></testcase>
  </testsuite>
</testsuites>
`;

const CLOVER = `<?xml version="1.0" encoding="UTF-8"?>
<coverage generated="1" lines-covered="80" lines-valid="100" line-rate="0.8">
  <project timestamp="1">
    <metrics statements="100" coveredstatements="80" />
  </project>
</coverage>
`;

test('parseJunit extrae los totales del primer testsuite', () => {
  assert.deepEqual(parseJunit(JUNIT), { tests: 10, failures: 2, errors: 1, skipped: 1 });
  assert.equal(parseJunit('no es xml'), null);
});

test('parseClover calcula el porcentaje de líneas', () => {
  assert.equal(parseClover(CLOVER), 80);
  assert.equal(parseClover('<coverage />'), null);
});

test('countPintFiles tolera array, objeto y pass', () => {
  assert.equal(countPintFiles('{"files":["a.php","b.php"]}'), 2);
  assert.equal(countPintFiles('{"files":{"a.php":{}}}'), 1);
  assert.equal(countPintFiles('{"result":"pass"}'), 0);
  assert.equal(countPintFiles('no json'), null);
});

test('sin herramientas, todas las pruebas de calidad quedan bloqueadas', () => {
  const phase = runQualityPhase({ projectRoot: 'C:\\inexistente', tools: STUB_TOOLS });

  assert.equal(phase.contract.pruebas_bloqueadas, 3);
  assert.equal(phase.contract.pruebas_ejecutadas, 3);
  assert.equal(phase.contract.pruebas_fallidas, 0);
  assert.equal(phase.contract.metricas.cobertura_lineas_pct, null);
  assert.equal(phase.contract.metricas.pruebas_totales, null);
  assert.equal(phase.contract.metricas.violaciones_estilo, null);
  assert.deepEqual(validateContract(phase.contract), []);
});

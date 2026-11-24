import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateContract } from '../src/domain/contract.js';
import { runStaticPhase } from '../src/phases/static.js';

const PROJECT = fileURLToPath(new URL('../examples/vulnerable-app', import.meta.url));

const STUB_TOOLS = {
  php: { available: false, reason: 'stub' },
  composer: { available: false, reason: 'stub' },
  phpstan: { available: false, reason: 'stub' },
  npm: { available: false, reason: 'stub' },
  semgrep: { available: false, reason: 'stub' },
  gitleaks: { available: false, reason: 'stub' },
};

test('la fase estatica detecta los patrones del ejemplo', () => {
  const phase = runStaticPhase({ projectRoot: PROJECT, tools: STUB_TOOLS });

  const rules = phase.findings.map((finding) => finding.rule).sort();
  assert.deepEqual(rules, [
    'DEBUG',
    'DEBUG-TRUE',
    'ENV-OUTSIDE-CONFIG',
    'EXEC',
    'HARDCODED-SECRET',
    'SQLRAW',
    'WEAKCRYPTO',
  ]);

  assert.equal(phase.contract.hallazgos.critico, 0);
  assert.equal(phase.contract.hallazgos.alto, 3);
  assert.equal(phase.contract.hallazgos.medio, 2);
  assert.equal(phase.contract.hallazgos.bajo, 2);
  assert.equal(phase.contract.hallazgos_confirmados, 4);
});

test('el contrato de la fase estatica valida', () => {
  const phase = runStaticPhase({ projectRoot: PROJECT, tools: STUB_TOOLS });
  assert.deepEqual(validateContract(phase.contract), []);
});

test('las herramientas ausentes quedan bloqueadas, nunca aprobadas', () => {
  const phase = runStaticPhase({ projectRoot: PROJECT, tools: STUB_TOOLS });
  const blocked = phase.checks.filter((check) => check.status === 'bloqueada').map((check) => check.name);
  assert.deepEqual(blocked.sort(), ['composer-audit', 'gitleaks', 'npm-audit', 'phpstan', 'semgrep']);
  assert.equal(phase.contract.pruebas_bloqueadas, 5);
});

test('la fase es determinista', () => {
  const first = runStaticPhase({ projectRoot: PROJECT, tools: STUB_TOOLS });
  const second = runStaticPhase({ projectRoot: PROJECT, tools: STUB_TOOLS });
  assert.deepEqual(second.contract, first.contract);
  assert.deepEqual(
    second.findings.map((finding) => `${finding.id}|${finding.file}|${finding.line}|${finding.evidence}`),
    first.findings.map((finding) => `${finding.id}|${finding.file}|${finding.line}|${finding.evidence}`),
  );
});

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runStaticPhase } from '../src/phases/static.js';
import { escapeCell } from '../src/report/format.js';
import { renderFinalReport, renderIndex } from '../src/report/final.js';
import { renderIndividualReport } from '../src/report/individual.js';
import { buildResumen } from '../src/report/resumen.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const VULNERABLE = fileURLToPath(new URL('../examples/vulnerable-app', import.meta.url));
const DEMO_CONTRACTS = fileURLToPath(new URL('../examples/demo-project/sectest/reports/contratos', import.meta.url));
const NOW = '2026-11-06T15:00:00-03:00';

const STUB_TOOLS = {
  php: { available: false, reason: 'stub' },
  composer: { available: false, reason: 'stub' },
  phpstan: { available: false, reason: 'stub' },
  npm: { available: false, reason: 'stub' },
  semgrep: { available: false, reason: 'stub' },
  gitleaks: { available: false, reason: 'stub' },
};

function demoContracts() {
  return ['A-01-STATIC.json', 'A-02-CONFIG.json', 'A-03-DYNAMIC.json', 'A-04-QUALITY.json'].map((name) =>
    JSON.parse(readFileSync(path.join(DEMO_CONTRACTS, name), 'utf8')),
  );
}

test('el informe individual tiene las secciones y la evidencia', () => {
  const phase = runStaticPhase({ projectRoot: VULNERABLE, tools: STUB_TOOLS });
  const markdown = renderIndividualReport({
    reportCode: 'A-01',
    title: 'Auditoría estática (Fase 1)',
    subagente: 'A-STATIC',
    contract: phase.contract,
    findings: phase.findings,
    checks: phase.checks,
    manifest: phase.manifestReport,
    authorization: { project: 'vulnerable-app', version: 'demo' },
    generatedAt: NOW,
  });

  assert.ok(markdown.startsWith('# A-01 — Auditoría estática (Fase 1)'));
  assert.ok(markdown.includes('## 3. Fallos'));
  assert.ok(markdown.includes('### A01-SEC-001'));
  assert.ok(markdown.includes('**Por qué es un problema:**'));
  assert.ok(markdown.includes('## 4. Pruebas bloqueadas'));
  assert.ok(markdown.includes('## 6. Métricas del subagente'));
  assert.ok(markdown.includes('`app/Http/Controllers/ExportController.php:12`'));
});

test('el informe individual es determinista', () => {
  const phase = runStaticPhase({ projectRoot: VULNERABLE, tools: STUB_TOOLS });
  const findings = phase.findings.map((finding, index) =>
    index === 0 ? { ...finding, title: 'Título | con pipe' } : finding,
  );
  const render = () =>
    renderIndividualReport({
      reportCode: 'A-01',
      title: 'Auditoría estática (Fase 1)',
      subagente: 'A-STATIC',
      contract: phase.contract,
      findings,
      checks: phase.checks,
      manifest: phase.manifestReport,
      authorization: { project: 'vulnerable-app', version: 'demo' },
      generatedAt: NOW,
    });

  const first = render();
  assert.ok(first.includes('Título | con pipe'));
  assert.equal(render(), first);
});

test('escapeCell neutraliza pipes en tablas markdown', () => {
  assert.equal(escapeCell('a | b'), 'a \\| b');
  assert.equal(escapeCell('linea1\nlinea2'), 'linea1 linea2');
});

test('el informe final expone veredicto, puntuaciones y riesgos', () => {
  const contracts = demoContracts();
  const { resumen, verdict } = buildResumen({
    project: 'demo-laravel',
    version: 'abc1234',
    fecha: NOW,
    ventana: { inicio: '2026-11-06T08:00:00-03:00', fin: '2026-11-06T18:00:00-03:00', zona: 'America/Santiago' },
    contratos: contracts,
  });

  const artifacts = [
    {
      subagente: 'A-STATIC',
      archivo_reporte: 'sectest/reports/A-01-STATIC.md',
      findings: [
        {
          id: 'A01-SEC-001',
          title: 'Ejecución de comandos',
          severity: 'alto',
          confidence: 'confirmado',
          cwe: 'CWE-78',
          file: 'app/X.php',
          line: 12,
        },
      ],
      checks: [{ name: 'phpstan', status: 'bloqueada', note: 'sin vendor/autoload.php' }],
    },
  ];

  const markdown = renderFinalReport({
    resumen,
    artifacts,
    thresholds: { seg: 80, ci: 85, cs: 75 },
    verdict,
    generatedAt: NOW,
  });

  assert.ok(markdown.startsWith('# Informe final de auditoría — demo-laravel'));
  assert.ok(markdown.includes('**Veredicto: condicionado**'));
  assert.ok(markdown.includes('| SEG | 60.5 | 80 | no cumple |'));
  assert.ok(markdown.includes('A01-SEC-001'));
  assert.ok(markdown.includes('## 7. Pruebas no ejecutadas'));
  assert.ok(markdown.includes('sin vendor/autoload.php'));

  assert.equal(
    renderFinalReport({ resumen, artifacts, thresholds: { seg: 80, ci: 85, cs: 75 }, verdict, generatedAt: NOW }),
    markdown,
  );
});

test('el indice lista los informes y los contratos', () => {
  const markdown = renderIndex({
    artifacts: [{ subagente: 'A-STATIC', archivo_reporte: 'sectest/reports/A-01-STATIC.md' }],
  });
  assert.ok(markdown.includes('# Índice de informes'));
  assert.ok(markdown.includes('`sectest/reports/INFORME_FINAL.md`'));
  assert.ok(markdown.includes('`sectest/reports/HALLAZGOS_FALLAS.md`'));
  assert.ok(markdown.includes('`sectest/reports/A-01-STATIC.md`'));
  assert.ok(markdown.includes('`sectest/reports/contratos/`'));
});

test('end-to-end: static y run escriben los reportes entregables', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-reports-'));
  try {
    cpSync(VULNERABLE, root, { recursive: true });

    const staticRun = spawnSync(
      process.execPath,
      [CLI, 'static', '--project', root, '--now', NOW, '--write'],
      { encoding: 'utf8' },
    );
    assert.equal(staticRun.status, 0, staticRun.stdout + staticRun.stderr);

    const firstRun = spawnSync(process.execPath, [CLI, 'run', '--project', root, '--now', NOW, '--write'], {
      encoding: 'utf8',
    });
    assert.equal(firstRun.status, 0, firstRun.stdout + firstRun.stderr);

    for (const file of [
      'sectest/reports/A-01-STATIC.md',
      'sectest/reports/INFORME_FINAL.md',
      'sectest/reports/INDICE.md',
      'sectest/reports/HALLAZGOS_FALLAS.md',
      'sectest/reports/resumen.json',
      'sectest/reports/hallazgos/A-STATIC.json',
      'sectest/reports/contratos/A-01-STATIC.json',
    ]) {
      assert.equal(existsSync(path.join(root, file)), true, `falta ${file}`);
    }

    const finalMarkdown = readFileSync(path.join(root, 'sectest', 'reports', 'INFORME_FINAL.md'), 'utf8');
    assert.ok(finalMarkdown.includes('Veredicto:'));
    assert.ok(finalMarkdown.includes('A01-'));

    const failuresMarkdown = readFileSync(
      path.join(root, 'sectest', 'reports', 'HALLAZGOS_FALLAS.md'),
      'utf8',
    );
    assert.ok(failuresMarkdown.includes('## Resumen por prioridad'));
    assert.ok(failuresMarkdown.includes('**Cómo se encontró:**'));
    assert.ok(failuresMarkdown.includes('**Cómo se replica:**'));
    assert.equal(failuresMarkdown.includes('Remediación'), false);

    const secondRun = spawnSync(process.execPath, [CLI, 'run', '--project', root, '--now', NOW, '--write'], {
      encoding: 'utf8',
    });
    assert.equal(secondRun.status, 0, secondRun.stdout + secondRun.stderr);
    assert.equal(readFileSync(path.join(root, 'sectest', 'reports', 'INFORME_FINAL.md'), 'utf8'), finalMarkdown);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

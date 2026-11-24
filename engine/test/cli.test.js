import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const NOW_INSIDE = '2026-11-06T15:00:00-03:00';

const AUTHORIZATION = `# Autorización de pruebas de seguridad

> Estado: firmada por el responsable.

## 1. Proyecto

- **Nombre del proyecto:** demo-laravel
- **Ruta local / repositorio:** C:\\demo
- **Versión / commit auditado:** abc1234
- **Responsable técnico del proyecto:** Ana Pérez

## 2. Entornos autorizados

| Staging | https://staging.demo.local | Sí |

## 3. Lista blanca de hosts e IPs

- \`https://staging.demo.local\`

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-11-06T08:00:00-03:00
- **Fin (ISO 8601):** 2026-11-06T18:00:00-03:00
- **Zona horaria:** America/Santiago

## 8. Umbrales de aceptación (opcional)

- Seguridad (SEG) ≥ 80

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-11-06
- **Firma / aprobación:** firmado digitalmente
`;

const CREDENTIALS = `SECTEST_ANON_ENABLED=true
SECTEST_USER_USERNAME=auditor
SECTEST_USER_PASSWORD=sup3r-secret
SECTEST_ADMIN_USERNAME=admin
SECTEST_ADMIN_PASSWORD=otra-clave
`;

const baseMetrics = {
  cobertura_lineas_pct: null,
  pruebas_totales: null,
  pruebas_aprobadas_n: null,
  errores_estaticos: null,
  kloc_analizado: null,
  violaciones_estilo: null,
  controles_aplicables: null,
  controles_conformes: null,
  controles_no_probados: null,
};

const zero = { critico: 0, alto: 0, medio: 0, bajo: 0, informativo: 0 };

const CONTRACTS = {
  'A-01-STATIC.json': {
    subagente: 'A-STATIC',
    fase: '1',
    pruebas_ejecutadas: 10,
    pruebas_aprobadas: 6,
    pruebas_fallidas: 4,
    pruebas_bloqueadas: 0,
    hallazgos: { critico: 0, alto: 2, medio: 3, bajo: 1, informativo: 0 },
    hallazgos_confirmados: 5,
    confirmados: { critico: 0, alto: 2, medio: 2, bajo: 1, informativo: 0 },
    falsos_positivos: 0,
    metricas: { ...baseMetrics, errores_estaticos: 12, kloc_analizado: 8.5 },
    ids_hallazgos: ['A01-SEC-001'],
    archivo_reporte: 'sectest/reports/A-01-STATIC.md',
  },
  'A-02-CONFIG.json': {
    subagente: 'A-CONFIG',
    fase: '2,5',
    pruebas_ejecutadas: 10,
    pruebas_aprobadas: 9,
    pruebas_fallidas: 1,
    pruebas_bloqueadas: 0,
    hallazgos: { critico: 0, alto: 1, medio: 0, bajo: 0, informativo: 0 },
    hallazgos_confirmados: 1,
    confirmados: { critico: 0, alto: 1, medio: 0, bajo: 0, informativo: 0 },
    falsos_positivos: 0,
    metricas: { ...baseMetrics, controles_aplicables: 8, controles_conformes: 7, controles_no_probados: 1 },
    ids_hallazgos: ['A02-INF-001'],
    archivo_reporte: 'sectest/reports/A-02-CONFIG.md',
  },
  'A-03-DYNAMIC.json': {
    subagente: 'A-DYNAMIC',
    fase: '3',
    pruebas_ejecutadas: 0,
    pruebas_aprobadas: 0,
    pruebas_fallidas: 0,
    pruebas_bloqueadas: 4,
    hallazgos: zero,
    hallazgos_confirmados: 0,
    confirmados: zero,
    falsos_positivos: 0,
    metricas: { ...baseMetrics },
    ids_hallazgos: [],
    archivo_reporte: 'sectest/reports/A-03-DYNAMIC.md',
  },
  'A-04-QUALITY.json': {
    subagente: 'A-QUALITY',
    fase: 'transversal,6',
    pruebas_ejecutadas: 10,
    pruebas_aprobadas: 9,
    pruebas_fallidas: 1,
    pruebas_bloqueadas: 0,
    hallazgos: zero,
    hallazgos_confirmados: 0,
    confirmados: zero,
    falsos_positivos: 0,
    metricas: {
      ...baseMetrics,
      cobertura_lineas_pct: 80,
      pruebas_totales: 10,
      pruebas_aprobadas_n: 9,
      violaciones_estilo: 0,
    },
    ids_hallazgos: [],
    archivo_reporte: 'sectest/reports/A-04-QUALITY.md',
  },
};

function buildProject(root, { authorization = AUTHORIZATION, withCredentials = true } = {}) {
  mkdirSync(path.join(root, 'sectest', 'scope'), { recursive: true });
  mkdirSync(path.join(root, 'sectest', 'reports', 'contratos'), { recursive: true });
  writeFileSync(path.join(root, 'sectest', 'scope', 'authorization.md'), authorization, 'utf8');
  if (withCredentials) {
    writeFileSync(path.join(root, 'sectest', 'scope', 'credentials.conf'), CREDENTIALS, 'utf8');
  }
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    writeFileSync(path.join(root, 'sectest', 'reports', 'contratos', name), JSON.stringify(contract, null, 2), 'utf8');
  }
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('check valida un proyecto completo sin escribir nada', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-check-'));
  try {
    buildProject(root);
    const result = runCli(['check', '--project', root, '--now', NOW_INSIDE]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.includes('4 contrato(s) valido(s)'), true);
    assert.equal(existsSync(path.join(root, 'sectest', 'reports', 'resumen.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check no falla si falta credentials.conf, pero avisa', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-nocred-'));
  try {
    buildProject(root, { withCredentials: false });
    const result = runCli(['check', '--project', root, '--now', NOW_INSIDE]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no existe sectest\/scope\/credentials\.conf/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run --write emite un resumen.json valido y determinista', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-run-'));
  try {
    buildProject(root);
    const result = runCli(['run', '--project', root, '--now', NOW_INSIDE, '--write']);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const resumen = JSON.parse(readFileSync(path.join(root, 'sectest', 'reports', 'resumen.json'), 'utf8'));
    assert.equal(resumen.dimensiones.seguridad, 60.5);
    assert.equal(resumen.dimensiones.control_informacion, 87.5);
    assert.equal(resumen.dimensiones.calidad_software, 90);
    assert.equal(resumen.veredicto, 'condicionado');
    assert.equal(resumen.hallazgos.alto, 3);
    assert.equal(resumen.calculos.seguridad.resultado, 60.5);

    const again = runCli(['run', '--project', root, '--now', NOW_INSIDE, '--write']);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    const second = readFileSync(path.join(root, 'sectest', 'reports', 'resumen.json'), 'utf8');
    assert.equal(second, JSON.stringify(resumen, null, 2) + '\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run aborta fuera de la ventana y no escribe resumen', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-gate-'));
  try {
    buildProject(root);
    const result = runCli(['run', '--project', root, '--now', '2026-11-07T00:00:00Z', '--write']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.includes('run abortado'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check falla con un contrato invalido', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-bad-'));
  try {
    buildProject(root);
    const broken = { ...CONTRACTS['A-01-STATIC.json'], ids_hallazgos: ['SEC-001'] };
    writeFileSync(path.join(root, 'sectest', 'reports', 'contratos', 'A-01-STATIC.json'), JSON.stringify(broken), 'utf8');
    const result = runCli(['check', '--project', root, '--now', NOW_INSIDE]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes('namespace'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

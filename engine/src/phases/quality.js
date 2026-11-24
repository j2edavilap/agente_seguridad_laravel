import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { detectTools } from '../tools/manifest.js';
import { extractJson, runTool } from '../tools/runner.js';
import { enrichFindings } from '../report/narrative.js';

export function parseJunit(xml) {
  const match = String(xml ?? '').match(/<testsuite\b([^>]*)>/i);
  if (!match) return null;
  const attributes = match[1];
  const num = (name) => {
    const found = attributes.match(new RegExp(`${name}="(\\d+)"`, 'i'));
    return found ? Number(found[1]) : 0;
  };
  return {
    tests: num('tests'),
    failures: num('failures'),
    errors: num('errors'),
    skipped: num('skipped'),
  };
}

export function parseClover(xml) {
  const text = String(xml ?? '');
  const coverage = text.match(/<coverage\b([^>]*)>/i);
  if (coverage) {
    const covered = coverage[1].match(/lines-covered="(\d+)"/i);
    const valid = coverage[1].match(/lines-valid="(\d+)"/i);
    if (covered && valid && Number(valid[1]) > 0) {
      return Math.round((Number(covered[1]) / Number(valid[1])) * 1000) / 10;
    }
  }

  const metrics = text.match(/<metrics\b([^>]*)>/i);
  if (metrics) {
    const covered = metrics[1].match(/coveredstatements="(\d+)"/i);
    const total = metrics[1].match(/statements="(\d+)"/i);
    if (covered && total && Number(total[1]) > 0) {
      return Math.round((Number(covered[1]) / Number(total[1])) * 1000) / 10;
    }
  }
  return null;
}

export function countPintFiles(text) {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  const files = parsed.files;
  if (Array.isArray(files)) return files.length;
  if (files && typeof files === 'object') return Object.keys(files).length;
  if (parsed.result === 'pass') return 0;
  return null;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function tempFile(prefix, extension) {
  return path.join(os.tmpdir(), `sectest-${prefix}-${process.pid}-${Date.now()}.${extension}`);
}

function removeQuietly(file) {
  try {
    unlinkSync(file);
  } catch {
    // el temporal ya no está
  }
}

function qualityFinding({ title, severity, evidence, remediation, cwe = 'CWE-710', owasp = 'A06:2021', iso = 'A.8.28' }) {
  return {
    code: 'QAL',
    rule: 'QUALITY',
    title,
    severity,
    confidence: 'confirmado',
    cwe,
    owasp,
    iso,
    file: '',
    line: 0,
    evidence,
    remediation,
  };
}

export function runQualityPhase({ projectRoot, tools = null, timeoutMs = 300000 }) {
  const manifest = tools ?? detectTools(projectRoot);
  const checks = [];
  const findings = [];

  const metrics = {
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

  const runner = manifest.pest?.available ? manifest.pest : manifest.phpunit?.available ? manifest.phpunit : null;

  const harnessConfig = existsSync(path.join(projectRoot, 'sectest', 'tests', 'phpunit.xml'))
    ? path.join('sectest', 'tests', 'phpunit.xml')
    : null;
  const configArgs = harnessConfig ? ['-c', harnessConfig] : [];

  const phpunitXml =
    readText(path.join(projectRoot, 'phpunit.xml')) ?? readText(path.join(projectRoot, 'phpunit.xml.dist'));
  const envTesting = existsSync(path.join(projectRoot, '.env.testing'));
  const safeDatabase =
    Boolean(harnessConfig) ||
    envTesting ||
    (phpunitXml
      ? /DB_CONNECTION[^>]*sqlite/i.test(phpunitXml) || /:memory:/i.test(phpunitXml)
      : false);

  if (!runner) {
    checks.push({
      name: 'tests',
      status: 'bloqueada',
      findings: 0,
      note: manifest.phpunit?.reason ?? 'sin runner de pruebas',
    });
  } else if (!safeDatabase) {
    checks.push({
      name: 'tests',
      status: 'bloqueada',
      findings: 0,
      note: 'no se pudo confirmar una base de test aislada (phpunit.xml o .env.testing)',
    });
  } else {
    const junitPath = tempFile('junit', 'xml');
    const result = runTool({
      command: runner.invoke[0],
      args: [...runner.invoke.slice(1), ...configArgs, '--log-junit', junitPath],
      cwd: projectRoot,
      timeoutMs,
    });
    const xml = readText(junitPath);
    removeQuietly(junitPath);
    const parsed = xml ? parseJunit(xml) : null;

    if (!parsed) {
      checks.push({
        name: 'tests',
        status: 'bloqueada',
        findings: 0,
        version: runner.version,
        note: result.timedOut ? `timeout tras ${timeoutMs} ms` : 'salida JUnit no interpretable',
      });
    } else {
      metrics.pruebas_totales = parsed.tests;
      metrics.pruebas_aprobadas_n = Math.max(0, parsed.tests - parsed.failures - parsed.errors);
      const failed = parsed.failures + parsed.errors;
      if (failed > 0) {
        findings.push({
          ...qualityFinding({
            title: 'Pruebas automatizadas fallidas',
            severity: 'medio',
            evidence: `${failed} fallida(s) de ${parsed.tests}`,
            remediation: 'Corregir las pruebas o el código que rompe el contrato.',
            cwe: 'CWE-1120',
          }),
          file: 'tests/',
        });
      }
      checks.push({
        name: 'tests',
        status: 'ejecutada',
        findings: failed > 0 ? 1 : 0,
        version: runner.version,
        note: `${parsed.tests} prueba(s), ${parsed.skipped} omitida(s)`,
      });
    }
  }

  if (!manifest.php?.available) {
    checks.push({ name: 'cobertura', status: 'bloqueada', findings: 0, note: manifest.php.reason });
  } else if (!runner) {
    checks.push({ name: 'cobertura', status: 'bloqueada', findings: 0, note: 'sin runner de pruebas' });
  } else {
    const driver = runTool({
      command: manifest.php.path,
      args: ['-r', "echo (extension_loaded('xdebug')||extension_loaded('pcov'))?'1':'0';"],
      timeoutMs: 15000,
    });
    if (driver.stdout.trim() !== '1') {
      checks.push({
        name: 'cobertura',
        status: 'bloqueada',
        findings: 0,
        note: 'sin driver de cobertura (Xdebug o PCOV)',
      });
    } else {
      const cloverPath = tempFile('clover', 'xml');
      const result = runTool({
        command: runner.invoke[0],
        args: [...runner.invoke.slice(1), ...configArgs, '--coverage-clover', cloverPath],
        cwd: projectRoot,
        timeoutMs,
      });
      const xml = readText(cloverPath);
      removeQuietly(cloverPath);
      const percentage = xml ? parseClover(xml) : null;
      if (percentage === null) {
        checks.push({
          name: 'cobertura',
          status: 'bloqueada',
          findings: 0,
          version: runner.version,
          note: result.timedOut ? `timeout tras ${timeoutMs} ms` : 'Clover no interpretable',
        });
      } else {
        metrics.cobertura_lineas_pct = percentage;
        checks.push({ name: 'cobertura', status: 'ejecutada', findings: 0, version: runner.version, note: `${percentage}% de líneas` });
      }
    }
  }

  if (!manifest.pint?.available) {
    checks.push({ name: 'estilo', status: 'bloqueada', findings: 0, note: manifest.pint.reason });
  } else {
    const result = runTool({
      command: manifest.pint.invoke[0],
      args: [...manifest.pint.invoke.slice(1), '--test', '--format=json'],
      cwd: projectRoot,
      timeoutMs,
    });
    const count = countPintFiles(result.stdout);
    if (count === null) {
      checks.push({
        name: 'estilo',
        status: 'bloqueada',
        findings: 0,
        version: manifest.pint.version,
        note: 'salida de Pint no interpretable',
      });
    } else {
      metrics.violaciones_estilo = count;
      if (count > 0) {
        findings.push({
          ...qualityFinding({
            title: 'Código fuera del estándar de estilo',
            severity: 'bajo',
            evidence: `${count} archivo(s) con violaciones`,
            remediation: 'Ejecutar `vendor/bin/pint` y versionar el resultado.',
            cwe: 'CWE-710',
          }),
          file: 'app/',
        });
      }
      checks.push({
        name: 'estilo',
        status: 'ejecutada',
        findings: count > 0 ? 1 : 0,
        version: manifest.pint.version,
        note: `${count} archivo(s) con violaciones`,
      });
    }
  }

  findings.splice(0, findings.length, ...enrichFindings(findings));
  findings.sort((a, b) => String(a.file).localeCompare(String(b.file)) || String(a.title).localeCompare(String(b.title)));
  findings.forEach((finding, index) => {
    finding.id = `A04-QAL-${String(index + 1).padStart(3, '0')}`;
  });

  const hallazgos = { critico: 0, alto: 0, medio: 0, bajo: 0, informativo: 0 };
  for (const finding of findings) hallazgos[finding.severity] += 1;

  const bloqueadas = checks.filter((check) => check.status === 'bloqueada').length;
  const fallidas = checks.filter((check) => check.status === 'ejecutada' && check.findings > 0).length;

  const contract = {
    subagente: 'A-QUALITY',
    fase: 'transversal,6',
    pruebas_ejecutadas: checks.length,
    pruebas_aprobadas: Math.max(0, checks.length - fallidas - bloqueadas),
    pruebas_fallidas: fallidas,
    pruebas_bloqueadas: bloqueadas,
    hallazgos,
    hallazgos_confirmados: findings.length,
    confirmados: { ...hallazgos },
    falsos_positivos: 0,
    metricas: metrics,
    ids_hallazgos: findings.map((finding) => finding.id),
    archivo_reporte: 'sectest/reports/A-04-QUALITY.md',
  };

  return { contract, findings, checks };
}

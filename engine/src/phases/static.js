import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { addCounts, emptyCounts, sumCounts } from '../domain/severity.js';
import { enrichFindings } from '../report/narrative.js';
import { composerCommand, composerFindings, parseComposerAudit } from '../tools/adapters/composer-audit.js';
import { gitleaksCommand, gitleaksFindings, parseGitleaks } from '../tools/adapters/gitleaks.js';
import { scanProject } from '../tools/adapters/grep-fallback.js';
import { npmCommand, npmFindings, parseNpmAudit } from '../tools/adapters/npm-audit.js';
import { parsePhpstan, phpstanCommand, phpstanFindings } from '../tools/adapters/phpstan.js';
import { detectTools, manifestForReport } from '../tools/manifest.js';
import { runTool, sha256 } from '../tools/runner.js';

const SKIP = new Set(['node_modules', 'vendor', '.git', 'storage', 'build', 'dist']);

function countPhpLines(directory) {
  let total = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(absolute);
        continue;
      }
      if (!entry.name.endsWith('.php')) continue;
      try {
        if (statSync(absolute).size > 1024 * 1024) continue;
        total += readFileSync(absolute, 'utf8').split(/\r?\n/).length;
      } catch {
        // archivo ilegible: no cuenta
      }
    }
  };
  walk(directory);
  return total;
}

function sortFindings(findings) {
  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule) ||
      a.evidence.localeCompare(b.evidence),
  );
}

function runExternal({ name, tool, command, cwd, timeoutMs = 120000, parse, toFindings, projectRoot }) {
  if (!command) {
    return { check: { name, status: 'bloqueada', findings: 0, note: tool?.reason ?? 'herramienta ausente' }, findings: [] };
  }
  const result = runTool({ ...command, cwd, timeoutMs });
  const parsed = parse(result.stdout || result.stderr);

  if (!parsed) {
    return {
      check: {
        name,
        status: 'bloqueada',
        findings: 0,
        version: tool?.version ?? null,
        note: result.timedOut
          ? `timeout tras ${timeoutMs} ms`
          : `salida no interpretable (exit ${result.exitCode ?? '?'})`,
      },
      findings: [],
    };
  }

  const findings = toFindings(parsed, projectRoot);
  return {
    check: {
      name,
      status: 'ejecutada',
      findings: findings.length,
      version: tool?.version ?? null,
      hash: sha256(result.stdout || result.stderr),
    },
    findings,
  };
}

export function runStaticPhase({ projectRoot, tools = null, timeoutMs = 120000 }) {
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

  const grep = scanProject(projectRoot);
  findings.push(...grep.findings);
  checks.push({
    name: 'grep-fallback',
    status: 'ejecutada',
    findings: grep.findings.length,
    version: 'motor',
    files: grep.filesScanned,
    loc: grep.loc,
    hash: sha256(JSON.stringify(grep.findings)),
  });

  const hasComposerLock = existsSync(path.join(projectRoot, 'composer.lock'));
  if (!hasComposerLock) {
    checks.push({ name: 'composer-audit', status: 'bloqueada', findings: 0, note: 'no existe composer.lock' });
  } else if (!manifest.composer.available) {
    checks.push({ name: 'composer-audit', status: 'bloqueada', findings: 0, note: manifest.composer.reason });
  } else {
    const external = runExternal({
      name: 'composer-audit',
      tool: manifest.composer,
      command: composerCommand(manifest),
      cwd: projectRoot,
      timeoutMs,
      parse: parseComposerAudit,
      toFindings: (parsed) => composerFindings(parsed),
      projectRoot,
    });
    checks.push(external.check);
    findings.push(...external.findings);
  }

  const phpstanReady =
    existsSync(path.join(projectRoot, 'vendor', 'autoload.php')) ||
    existsSync(path.join(projectRoot, 'phpstan.neon')) ||
    existsSync(path.join(projectRoot, 'phpstan.neon.dist'));

  if (!manifest.phpstan.available) {
    checks.push({ name: 'phpstan', status: 'bloqueada', findings: 0, note: manifest.phpstan.reason });
  } else if (!phpstanReady) {
    checks.push({
      name: 'phpstan',
      status: 'bloqueada',
      findings: 0,
      version: manifest.phpstan.version,
      note: 'sin vendor/autoload.php ni phpstan.neon: phpstan no puede resolver el framework',
    });
  } else {
    const result = runTool({ ...phpstanCommand(manifest, projectRoot), cwd: projectRoot, timeoutMs });
    const parsed = parsePhpstan(result.stdout || result.stderr);
    if (!parsed) {
      checks.push({
        name: 'phpstan',
        status: 'bloqueada',
        findings: 0,
        version: manifest.phpstan.version,
        note: result.timedOut
          ? `timeout tras ${timeoutMs} ms`
          : `salida no interpretable (exit ${result.exitCode ?? '?'})`,
      });
    } else {
      const phpstanResults = phpstanFindings(parsed, projectRoot);
      findings.push(...phpstanResults);
      checks.push({
        name: 'phpstan',
        status: 'ejecutada',
        findings: phpstanResults.length,
        version: manifest.phpstan.version,
        hash: sha256(result.stdout || result.stderr),
      });
      metrics.errores_estaticos = parsed.total;
      metrics.kloc_analizado =
        Math.round((countPhpLines(path.join(projectRoot, 'app')) / 1000) * 1000) / 1000;
    }
  }

  const hasPackageLock = existsSync(path.join(projectRoot, 'package-lock.json'));
  if (!hasPackageLock) {
    checks.push({ name: 'npm-audit', status: 'bloqueada', findings: 0, note: 'no existe package-lock.json' });
  } else if (!manifest.npm.available) {
    checks.push({ name: 'npm-audit', status: 'bloqueada', findings: 0, note: manifest.npm.reason });
  } else {
    const external = runExternal({
      name: 'npm-audit',
      tool: manifest.npm,
      command: npmCommand(manifest),
      cwd: projectRoot,
      timeoutMs,
      parse: parseNpmAudit,
      toFindings: (parsed) => npmFindings(parsed),
      projectRoot,
    });
    checks.push(external.check);
    findings.push(...external.findings);
  }

  if (!manifest.gitleaks.available) {
    checks.push({ name: 'gitleaks', status: 'bloqueada', findings: 0, note: manifest.gitleaks.reason });
  } else {
    const reportPath = path.join(os.tmpdir(), `sectest-gitleaks-${process.pid}-${Date.now()}.json`);
    const result = runTool({
      ...gitleaksCommand(manifest, projectRoot, reportPath),
      cwd: projectRoot,
      timeoutMs,
    });

    let parsed = null;
    try {
      parsed = parseGitleaks(readFileSync(reportPath, 'utf8'));
    } catch {
      parsed = null;
    }
    try {
      unlinkSync(reportPath);
    } catch {
      // el temporal ya no está: nada que limpiar
    }

    if (!parsed) {
      checks.push({
        name: 'gitleaks',
        status: 'bloqueada',
        findings: 0,
        version: manifest.gitleaks.version,
        note: result.timedOut
          ? `timeout tras ${timeoutMs} ms`
          : `salida no interpretable (exit ${result.exitCode ?? '?'})`,
      });
    } else {
      const gitleaksResults = gitleaksFindings(parsed);
      findings.push(...gitleaksResults);
      checks.push({
        name: 'gitleaks',
        status: 'ejecutada',
        findings: gitleaksResults.length,
        version: manifest.gitleaks.version,
        hash: sha256(JSON.stringify(parsed.items)),
      });
    }
  }

  checks.push({
    name: 'semgrep',
    status: 'bloqueada',
    findings: 0,
    note: manifest.semgrep.available
      ? 'detectada, adaptador pendiente (E2.1)'
      : manifest.semgrep.reason,
  });

  findings.splice(0, findings.length, ...enrichFindings(findings));
  sortFindings(findings);

  const hallazgos = emptyCounts();
  const confirmados = emptyCounts();
  for (const finding of findings) {
    hallazgos[finding.severity] += 1;
    if (finding.confidence === 'confirmado') confirmados[finding.severity] += 1;
  }

  const ids = findings.map(
    (finding, index) => `A01-${finding.code}-${String(index + 1).padStart(3, '0')}`,
  );
  findings.forEach((finding, index) => {
    finding.id = ids[index];
  });

  const ejecutadas = checks.length;
  const bloqueadas = checks.filter((check) => check.status === 'bloqueada').length;
  const fallidas = checks.filter((check) => check.status === 'ejecutada' && check.findings > 0).length;

  const contract = {
    subagente: 'A-STATIC',
    fase: '1',
    pruebas_ejecutadas: ejecutadas,
    pruebas_aprobadas: Math.max(0, ejecutadas - fallidas - bloqueadas),
    pruebas_fallidas: fallidas,
    pruebas_bloqueadas: bloqueadas,
    hallazgos,
    hallazgos_confirmados: sumCounts(confirmados),
    confirmados,
    falsos_positivos: 0,
    metricas: metrics,
    ids_hallazgos: ids,
    archivo_reporte: 'sectest/reports/A-01-STATIC.md',
  };

  return {
    contract,
    findings,
    checks,
    manifest,
    manifestReport: manifestForReport(manifest),
  };
}

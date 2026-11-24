import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { detectTools } from '../tools/manifest.js';
import { runTool } from '../tools/runner.js';
import { enrichFindings } from '../report/narrative.js';

const INI_KEYS = [
  'expose_php',
  'display_errors',
  'display_startup_errors',
  'allow_url_include',
  'allow_url_fopen',
  'open_basedir',
  'session.cookie_secure',
  'session.cookie_httponly',
  'session.cookie_samesite',
  'session.use_strict_mode',
];

const SERVER_FILES = [
  '.htaccess',
  'public/.htaccess',
  'nginx.conf',
  'docker/nginx.conf',
  'Caddyfile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
];

function configFinding({ code = 'INF', title, severity, evidence, remediation, cwe = 'CWE-16', owasp = 'A05:2021', iso = 'A.8.9' }) {
  return {
    code,
    rule: 'CONFIG',
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

export function analyzePhpIni(values) {
  const findings = [];
  const add = (options) => findings.push({ ...configFinding(options), file: 'php.ini' });

  if (values.allow_url_include === '1') {
    add({
      code: 'SEC',
      title: 'allow_url_include habilitado',
      severity: 'alto',
      evidence: 'allow_url_include=1',
      remediation: 'Deshabilitar `allow_url_include`. Permite inclusión remota de código.',
      cwe: 'CWE-98',
      owasp: 'A03:2021',
    });
  }
  if (values.display_errors === '1') {
    add({
      code: 'SEC',
      title: 'display_errors habilitado',
      severity: 'medio',
      evidence: 'display_errors=1',
      remediation: 'Fijar `display_errors=Off` y registrar los errores en el log.',
    });
  }
  if (values.expose_php === '1') {
    add({
      title: 'expose_php habilitado',
      severity: 'bajo',
      evidence: 'expose_php=1',
      remediation: 'Fijar `expose_php=Off` para no revelar la versión de PHP.',
    });
  }
  if (values['session.cookie_secure'] === '0' || values['session.cookie_secure'] === '') {
    add({
      title: 'Cookie de sesión sin Secure',
      severity: 'medio',
      evidence: 'session.cookie_secure=0',
      remediation: 'Fijar `session.cookie_secure=1`.',
      cwe: 'CWE-614',
      iso: 'A.8.24',
    });
  }
  if (values['session.cookie_httponly'] === '0' || values['session.cookie_httponly'] === '') {
    add({
      title: 'Cookie de sesión sin HttpOnly',
      severity: 'medio',
      evidence: 'session.cookie_httponly=0',
      remediation: 'Fijar `session.cookie_httponly=1`.',
      cwe: 'CWE-1004',
    });
  }
  if (!values['session.cookie_samesite']) {
    add({
      title: 'Cookie de sesión sin SameSite',
      severity: 'bajo',
      evidence: 'session.cookie_samesite vacío',
      remediation: 'Fijar `session.cookie_samesite=Lax` o `Strict`.',
      cwe: 'CWE-1275',
    });
  }
  if (values['session.use_strict_mode'] === '0') {
    add({
      title: 'use_strict_mode deshabilitado',
      severity: 'bajo',
      evidence: 'session.use_strict_mode=0',
      remediation: 'Fijar `session.use_strict_mode=1` para rechazar identificadores no generados por el servidor.',
      cwe: 'CWE-384',
    });
  }

  return findings;
}

export function analyzeGitignore(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const has = (entry) => lines.some((line) => line === entry || line === `/${entry}` || line === `${entry}/`);

  const findings = [];
  if (!has('.env')) {
    findings.push({
      ...configFinding({
        title: '.gitignore no excluye .env',
        severity: 'medio',
        evidence: 'falta la entrada .env',
        remediation: 'Agregar `.env` a `.gitignore` para no versionar secretos.',
        cwe: 'CWE-538',
      }),
      file: '.gitignore',
    });
  }
  if (!has('sectest/scope/credentials.conf')) {
    findings.push({
      ...configFinding({
        title: '.gitignore no excluye sectest/scope/credentials.conf',
        severity: 'medio',
        evidence: 'falta la entrada sectest/scope/credentials.conf',
        remediation: 'Agregar `sectest/scope/credentials.conf` a `.gitignore`.',
        cwe: 'CWE-538',
      }),
      file: '.gitignore',
    });
  }
  return findings;
}

export function analyzeServerConfig(text, file) {
  const findings = [];
  const push = (options) => findings.push({ ...configFinding(options), file });

  if (/Options\s+\+?Indexes/i.test(text)) {
    push({
      title: 'Listado de directorios habilitado',
      severity: 'medio',
      evidence: 'Options Indexes',
      remediation: 'Usar `Options -Indexes` y servir solo desde `public/`.',
      cwe: 'CWE-548',
    });
  }
  if (/server_tokens\s+on/i.test(text)) {
    push({
      title: 'server_tokens habilitado',
      severity: 'bajo',
      evidence: 'server_tokens on',
      remediation: 'Fijar `server_tokens off`.',
      cwe: 'CWE-200',
    });
  }
  if (/ssl_protocols[^;]*TLSv1(\.1)?\b/i.test(text)) {
    push({
      title: 'TLS 1.0/1.1 habilitado',
      severity: 'alto',
      evidence: 'ssl_protocols incluye TLSv1',
      remediation: 'Permitir solo TLS 1.2 y 1.3.',
      cwe: 'CWE-326',
      iso: 'A.8.24',
    });
  }
  if (/FROM\s+\S+:latest/i.test(text)) {
    push({
      title: 'Imagen base con tag latest',
      severity: 'bajo',
      evidence: 'FROM …:latest',
      remediation: 'Fijar una versión o un digest de la imagen base.',
      cwe: 'CWE-1104',
    });
  }
  if (/^\s*USER\s+root\s*$/im.test(text)) {
    push({
      title: 'Contenedor ejecutado como root',
      severity: 'alto',
      evidence: 'USER root',
      remediation: 'Crear un usuario sin privilegios y usar `USER app`.',
      cwe: 'CWE-250',
      iso: 'A.8.9',
    });
  }
  if (/^\s*ENV\s+\w*(PASSWORD|SECRET|TOKEN|KEY)\w*\s*[= ]/im.test(text)) {
    push({
      title: 'Secreto en variable ENV del Dockerfile',
      severity: 'alto',
      evidence: 'ENV con nombre sensible',
      remediation: 'Usar secretos de build o variables en tiempo de ejecución, no `ENV`.',
      cwe: 'CWE-798',
      iso: 'A.8.24',
    });
  }

  return findings;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function runConfigPhase({ projectRoot, tools = null }) {
  const manifest = tools ?? detectTools(projectRoot);
  const checks = [];
  const findings = [];
  const notes = [];
  const incidencias = { cookieSecure: null, cookieHttpOnly: null };

  const gitignorePath = path.join(projectRoot, '.gitignore');
  const gitignore = readText(gitignorePath);
  if (gitignore === null) {
    findings.push({
      ...configFinding({
        title: 'No existe .gitignore',
        severity: 'medio',
        evidence: 'falta .gitignore en la raíz',
        remediation: 'Crear `.gitignore` y excluir `.env`, `vendor/` y `sectest/scope/credentials.conf`.',
        cwe: 'CWE-538',
      }),
      file: '.gitignore',
    });
    checks.push({ name: 'gitignore', status: 'ejecutada', findings: 1, note: 'sin .gitignore' });
  } else {
    const produced = analyzeGitignore(gitignore);
    findings.push(...produced);
    checks.push({ name: 'gitignore', status: 'ejecutada', findings: produced.length });
  }

  let envTracked = null;
  if (!manifest.git?.available) {
    checks.push({ name: 'env-versionado', status: 'bloqueada', findings: 0, note: manifest.git?.reason ?? 'git no disponible' });
  } else {
    const result = runTool({
      command: manifest.git.path,
      args: ['ls-files', '--error-unmatch', '.env'],
      cwd: projectRoot,
      timeoutMs: 15000,
    });
    envTracked = result.ok;
    if (result.ok) {
      findings.push({
        ...configFinding({
          code: 'SEC',
          title: '.env versionado en git',
          severity: 'critico',
          evidence: 'git ls-files encuentra .env',
          remediation: 'Quitar `.env` del índice (`git rm --cached .env`), rotar los secretos y agregarlo a `.gitignore`.',
          cwe: 'CWE-538',
          iso: 'A.8.24',
        }),
        file: '.env',
      });
    }
    checks.push({
      name: 'env-versionado',
      status: 'ejecutada',
      findings: result.ok ? 1 : 0,
      note: result.ok ? 'rastreado por git' : 'no rastreado',
    });
  }

  let ini = null;
  if (!manifest.php?.available) {
    checks.push({ name: 'php-ini', status: 'bloqueada', findings: 0, note: manifest.php?.reason ?? 'php no disponible' });
  } else {
    const script = `echo json_encode([${INI_KEYS.map((key) => `'${key}'=>ini_get('${key}')`).join(',')}]);`;
    const result = runTool({ command: manifest.php.path, args: ['-r', script], timeoutMs: 15000 });
    try {
      ini = JSON.parse(result.stdout);
    } catch {
      ini = null;
    }
    if (!ini) {
      checks.push({ name: 'php-ini', status: 'bloqueada', findings: 0, note: 'no se pudo leer la configuración de PHP' });
    } else {
      const produced = analyzePhpIni(ini);
      findings.push(...produced);
      checks.push({
        name: 'php-ini',
        status: 'ejecutada',
        findings: produced.length,
        note: 'la CLI puede diferir del FPM del servidor',
      });
      incidencias.cookieSecure = ini['session.cookie_secure'] === '1';
      incidencias.cookieHttpOnly = ini['session.cookie_httponly'] === '1';
    }
  }

  const serverFindings = [];
  let serverFiles = 0;
  for (const relative of SERVER_FILES) {
    const absolute = path.join(projectRoot, relative);
    if (!existsSync(absolute)) continue;
    const text = readText(absolute);
    if (text === null) continue;
    serverFiles += 1;
    serverFindings.push(...analyzeServerConfig(text, relative));
  }
  findings.push(...serverFindings);
  checks.push({
    name: 'server-config',
    status: 'ejecutada',
    findings: serverFindings.length,
    note: serverFiles === 0 ? 'sin archivos de servidor en el repositorio' : `${serverFiles} archivo(s) revisado(s)`,
  });

  let sbomComponents = 0;
  const composerLock = readText(path.join(projectRoot, 'composer.lock'));
  if (composerLock) {
    try {
      const parsed = JSON.parse(composerLock);
      sbomComponents = (parsed.packages?.length ?? 0) + (parsed['packages-dev']?.length ?? 0);
    } catch {
      sbomComponents = 0;
    }
  }
  checks.push({
    name: 'sbom',
    status: composerLock ? 'ejecutada' : 'bloqueada',
    findings: 0,
    note: composerLock ? `${sbomComponents} componente(s) en composer.lock` : 'no existe composer.lock',
  });

  // Controles que esta fase puede verificar.
  const controls = { aplicables: 0, conformes: 0, no_probados: 0 };

  controls.aplicables += 1; // A.8.9 gestión de la configuración
  if (envTracked !== null && ini !== null) {
    if (!envTracked && findings.every((finding) => finding.severity !== 'critico')) controls.conformes += 1;
  } else {
    controls.no_probados += 1;
  }

  controls.aplicables += 1; // A.8.24 criptografía en sesión
  if (incidencias.cookieSecure === null) {
    controls.no_probados += 1;
  } else if (incidencias.cookieSecure && incidencias.cookieHttpOnly) {
    controls.conformes += 1;
  }

  if (notes.length > 0) checks.push({ name: 'notas', status: 'ejecutada', findings: 0, note: notes.join('; ') });

  findings.splice(0, findings.length, ...enrichFindings(findings));
  findings.sort(
    (a, b) => String(a.file).localeCompare(String(b.file)) || String(a.title).localeCompare(String(b.title)),
  );
  findings.forEach((finding, index) => {
    finding.id = `A02-${finding.code}-${String(index + 1).padStart(3, '0')}`;
  });

  const hallazgos = { critico: 0, alto: 0, medio: 0, bajo: 0, informativo: 0 };
  for (const finding of findings) hallazgos[finding.severity] += 1;

  const bloqueadas = checks.filter((check) => check.status === 'bloqueada').length;
  const fallidas = checks.filter((check) => check.status === 'ejecutada' && check.findings > 0).length;

  const contract = {
    subagente: 'A-CONFIG',
    fase: '2,5',
    pruebas_ejecutadas: checks.length,
    pruebas_aprobadas: Math.max(0, checks.length - fallidas - bloqueadas),
    pruebas_fallidas: fallidas,
    pruebas_bloqueadas: bloqueadas,
    hallazgos,
    hallazgos_confirmados: findings.length,
    confirmados: { ...hallazgos },
    falsos_positivos: 0,
    metricas: {
      cobertura_lineas_pct: null,
      pruebas_totales: null,
      pruebas_aprobadas_n: null,
      errores_estaticos: null,
      kloc_analizado: null,
      violaciones_estilo: null,
      controles_aplicables: controls.aplicables,
      controles_conformes: controls.conformes,
      controles_no_probados: controls.no_probados,
    },
    ids_hallazgos: findings.map((finding) => finding.id),
    archivo_reporte: 'sectest/reports/A-02-CONFIG.md',
  };

  return { contract, findings, checks };
}

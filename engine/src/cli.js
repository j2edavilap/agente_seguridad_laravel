#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { validateContract } from './domain/contract.js';
import { DEFAULT_THRESHOLDS } from './domain/scoring.js';
import { assertInsideSectest, assertInsideSectestReports as assertInsideReports } from './io/paths.js';
import { AUTHORIZATION_FILE, CANARY_FILE, CONTRACTS_DIR, PLAN_FILE, REPORTS_DIR, SCOPE_DIR } from './paths.js';
import { applyCanary, buildCanaryEntry, discoverCanary } from './phases/canary.js';
import { runConfigPhase } from './phases/config.js';
import { runPreparePhase } from './phases/harness.js';
import { runDynamicPhase } from './phases/dynamic.js';
import { runQualityPhase } from './phases/quality.js';
import { runStaticPhase } from './phases/static.js';
import {
  CREDENTIALS_FILE,
  describeCredentials,
  missingCredentials,
  parseCredentials,
} from './policy/credentials.js';
import { parseAuthorization, validateAuthorization } from './policy/authorization.js';
import { parsePlan, validatePlan } from './policy/dynamic-plan.js';
import { assertAllowedTarget } from './policy/target.js';
import {
  readArtifacts,
  writeEvidence,
  writeFindingsArtifact,
  writeReport,
} from './report/artifacts.js';
import { renderFailuresReport } from './report/failures.js';
import { renderFinalReport, renderIndex } from './report/final.js';
import { renderIndividualReport } from './report/individual.js';
import { buildResumen } from './report/resumen.js';
import { executePlan, planInstallations, pythonVersion } from './tools/installer.js';
import { detectTools, manifestLines } from './tools/manifest.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const HELP = `laravel-sec-engine — motor determinista de auditoria

Uso:
  node engine/src/cli.js check  --project <ruta> [--now <ISO8601>]
  node engine/src/cli.js run    --project <ruta> [--now <ISO8601>] [--write]
  node engine/src/cli.js static --project <ruta> [--now <ISO8601>] [--write]
  node engine/src/cli.js config --project <ruta> [--now <ISO8601>] [--write]
  node engine/src/cli.js dynamic --project <ruta> --base-url <url> [--plan <archivo>] [--now <ISO8601>] [--write]
  node engine/src/cli.js quality --project <ruta> [--now <ISO8601>] [--write]
  node engine/src/cli.js prepare --project <ruta> [--install] [--base-url <url>]
  node engine/src/cli.js canary --project <ruta> --base-url <url> --list-url <ruta> [--id-field id] [--apply <id>] [--label <texto>]
  node engine/src/cli.js tools  --project <ruta> [--install --yes] [--tool <nombre>]

check   Valida autorizacion, credenciales y contratos. No escribe nada.
run     Valida y, con --write, consolida sectest/reports/resumen.json.
static  Ejecuta la Fase 1 (SCA/SAST + escaneo determinista) y, con --write, emite
        sectest/reports/contratos/A-01-STATIC.json.
config  Ejecuta la Fase 2 (configuracion local, php.ini, servidor, SBOM) y emite
        sectest/reports/contratos/A-02-CONFIG.json.
quality Ejecuta la Fase 4 (pruebas, cobertura, estilo) y emite
        sectest/reports/contratos/A-04-QUALITY.json.
prepare Genera sectest/scope/dynamic-plan.json desde route:list y el arnes de pruebas
        en sectest/tests/. Solo con las casillas correspondientes de la seccion 6.
        --install ejecuta composer install en sectest/tools.
canary  Con la sesion de B, lista sus recursos en --list-url y propone un canario IDOR.
        Sin --apply solo descubre y escribe sectest/scope/canary.json; con --apply <id>
        agrega la entrada a crossAccess del plan.
dynamic Ejecuta la Fase 3 (solo GET sobre la lista blanca) y, con --write, emite
        sectest/reports/contratos/A-03-DYNAMIC.json, evidencia y reporte.
        Con --plan (o sectest/scope/dynamic-plan.json) agrega login, IDOR y escalada,
        y entonces habilita POST solo en las rutas del plan.
tools   Planifica e instala herramientas faltantes FUERA del proyecto auditado
        (toolchain aislada). --install exige --yes.
--now   Fija el instante de evaluacion de la ventana (corridas reproducibles).

El motor solo escribe dentro de <proyecto>/sectest/reports.
Las herramientas se instalan en %LOCALAPPDATA%\\sectest\\tools (o SECTEST_TOOLS_DIR).
Nunca se instala nada dentro del proyecto auditado.
`;

function readText(file, errors, label) {
  if (!existsSync(file)) {
    errors.push(`${label}: no existe (${file})`);
    return null;
  }
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    errors.push(`${label}: no se pudo leer (${error.message})`);
    return null;
  }
}

function loadContracts(projectRoot, errors) {
  const directory = path.join(projectRoot, CONTRACTS_DIR);
  if (!existsSync(directory)) {
    errors.push(`contratos: no existe ${CONTRACTS_DIR}/`);
    return [];
  }

  const contracts = [];
  const agents = new Set();
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
    } catch (error) {
      errors.push(`contrato ${file}: JSON invalido (${error.message})`);
      continue;
    }
    const contractErrors = validateContract(parsed);
    for (const message of contractErrors) errors.push(`contrato ${file}: ${message}`);
    if (contractErrors.length === 0) {
      if (agents.has(parsed.subagente)) errors.push(`contrato ${file}: subagente duplicado ${parsed.subagente}`);
      agents.add(parsed.subagente);
      contracts.push(parsed);
    }
  }

  return contracts;
}

function gatherGate(projectRoot, now) {
  const errors = [];
  const warnings = [];

  const authorizationText = readText(
    path.join(projectRoot, AUTHORIZATION_FILE),
    errors,
    'autorizacion',
  );
  const authorization = authorizationText ? parseAuthorization(authorizationText) : null;
  if (authorization) {
    const gate = validateAuthorization(authorization, { now });
    errors.push(...gate.errors);
    warnings.push(...gate.warnings);
  }

  const credentialsPath = path.join(projectRoot, CREDENTIALS_FILE);
  let credentials = new Map();
  let credentialsPresent = false;

  if (!existsSync(credentialsPath)) {
    warnings.push(
      `credenciales: no existe ${CREDENTIALS_FILE}; las pruebas autenticadas quedarán bloqueadas (el Paso 0 lo crea vacío)`,
    );
  } else {
    const credentialsText = readText(credentialsPath, errors, 'credenciales');
    if (credentialsText !== null) {
      credentialsPresent = true;
      credentials = parseCredentials(credentialsText);
    }
  }

  const missing = credentialsPresent ? missingCredentials(credentials) : [];

  return { errors, warnings, authorization, credentials, missing };
}

function printGate({ authorization, credentials, missing, warnings }) {
  const line = (state, message) => console.log(`  ${state}  ${message}`);

  console.log('== Autorizacion ==');
  if (authorization) {
    line(authorization.signed ? 'PASS' : 'FAIL', `proyecto: ${authorization.project ?? '(sin nombre)'}`);
    line(
      authorization.signed ? 'PASS' : 'FAIL',
      `ventana: ${authorization.window.start ?? '?'} -> ${authorization.window.end ?? '?'} (${authorization.window.timezone ?? 'sin zona'})`,
    );
    line(authorization.whitelist.length > 0 ? 'PASS' : 'FAIL', `lista blanca: ${authorization.whitelist.length} entrada(s)`);
    line(authorization.signature.approval ? 'PASS' : 'FAIL', 'firma del responsable');
  }

  console.log('== Credenciales ==');
  if (credentials) {
    for (const description of describeCredentials(credentials)) line('INFO', description);
    for (const { role, key } of missing) line('WARN', `${role}: falta ${key}`);
  }

  if (warnings.length > 0) {
    console.log('== Avisos ==');
    for (const warning of warnings) console.log(`  WARN  ${warning}`);
  }
}

function printErrors(errors) {
  if (errors.length === 0) return;
  console.log('== Errores ==');
  for (const error of errors) console.log(`  FAIL  ${error}`);
}

function runStaticCommand({ projectRoot, now, write, state }) {
  if (state.errors.length > 0) {
    printErrors(state.errors);
    console.error('\nstatic abortado: la autorizacion no es valida.');
    return EXIT_FAIL;
  }

  const phase = runStaticPhase({ projectRoot });

  console.log('\n== Manifiesto de herramientas ==');
  for (const entry of manifestLines(phase.manifest)) console.log(`  ${entry}`);

  console.log('\n== Pruebas ==');
  for (const check of phase.checks) {
    const suffix = check.note ? ` — ${check.note}` : '';
    const count = check.status === 'ejecutada' ? ` (${check.findings} hallazgo(s))` : '';
    console.log(`  ${check.status.toUpperCase().padEnd(10)} ${check.name}${count}${suffix}`);
  }

  console.log('\n== Hallazgos ==');
  if (phase.findings.length === 0) console.log('  (ninguno)');
  for (const finding of phase.findings.slice(0, 20)) {
    console.log(
      `  ${finding.severity.toUpperCase().padEnd(11)} ${finding.id}  ${finding.file}:${finding.line}  ${finding.title}`,
    );
  }
  if (phase.findings.length > 20) console.log(`  … ${phase.findings.length - 20} mas`);

  const contractErrors = validateContract(phase.contract);
  if (contractErrors.length > 0) {
    console.log('\n== Contrato invalido ==');
    for (const error of contractErrors) console.log(`  FAIL  ${error}`);
    return EXIT_FAIL;
  }

  console.log(
    `\nContrato valido: ${phase.findings.length} hallazgo(s), ${sum(phase.contract.hallazgos)} por severidad, ${phase.contract.pruebas_bloqueadas} prueba(s) bloqueada(s).`,
  );

  if (!write) {
    console.log('(no se escribio nada: usa --write para emitir sectest/reports/contratos/A-01-STATIC.json)');
    return EXIT_OK;
  }

  const written = emitPhaseArtifacts({
    projectRoot,
    now,
    state,
    phase,
    contractFile: 'A-01-STATIC.json',
    reportFile: 'A-01-STATIC.md',
    reportCode: 'A-01',
    title: 'Auditoría estática (Fase 1)',
  });
  console.log(`\nEscrito: ${written.contractTarget}`);
  console.log(`Escrito: ${written.findingsTarget}`);
  console.log(`Escrito: ${written.reportTarget}`);
  return EXIT_OK;
}

const sum = (counts) => Object.values(counts).reduce((acc, value) => acc + value, 0);

function emitPhaseArtifacts({ projectRoot, now, state, phase, contractFile, reportFile, reportCode, title }) {
  const generatedAt = now.toISOString();

  const contractsDir = path.join(projectRoot, CONTRACTS_DIR);
  mkdirSync(contractsDir, { recursive: true });
  const contractTarget = assertInsideReports(projectRoot, path.join(contractsDir, contractFile));
  writeFileSync(contractTarget, `${JSON.stringify(phase.contract, null, 2)}\n`, 'utf8');

  const findingsTarget = writeFindingsArtifact(projectRoot, {
    subagente: phase.contract.subagente,
    archivo_reporte: `${REPORTS_DIR}/${reportFile}`,
    generado: generatedAt,
    contract: phase.contract,
    checks: phase.checks,
    manifest: phase.manifestReport ?? [],
    findings: phase.findings,
    ...(phase.evidence
      ? { evidence: phase.evidence.map((entry) => ({ check: entry.check, requests: entry.requests.length })) }
      : {}),
  });

  const markdown = renderIndividualReport({
    reportCode,
    title,
    subagente: phase.contract.subagente,
    contract: phase.contract,
    findings: phase.findings,
    checks: phase.checks,
    manifest: phase.manifestReport ?? [],
    authorization: state.authorization ?? {},
    generatedAt,
  });
  const reportTarget = writeReport(projectRoot, reportFile, markdown);

  return { contractTarget, findingsTarget, reportTarget };
}

function printPhaseResult(phase) {
  console.log('\n== Pruebas ==');
  for (const check of phase.checks) {
    const suffix = check.note ? ` — ${check.note}` : '';
    const count = check.status === 'ejecutada' ? ` (${check.findings} hallazgo(s))` : '';
    console.log(`  ${check.status.toUpperCase().padEnd(10)} ${check.name}${count}${suffix}`);
  }

  console.log('\n== Hallazgos ==');
  if (phase.findings.length === 0) console.log('  (ninguno)');
  for (const finding of phase.findings) {
    console.log(
      `  ${finding.severity.toUpperCase().padEnd(11)} ${finding.id}  ${finding.file}  ${finding.title}`,
    );
  }
}

function runSimplePhaseCommand({ projectRoot, now, write, state, kind }) {
  if (state.errors.length > 0) {
    printErrors(state.errors);
    console.error(`\n${kind} abortado: la autorización no es válida.`);
    return EXIT_FAIL;
  }

  const phase = kind === 'config' ? runConfigPhase({ projectRoot }) : runQualityPhase({ projectRoot });
  const meta =
    kind === 'config'
      ? {
          contractFile: 'A-02-CONFIG.json',
          reportFile: 'A-02-CONFIG.md',
          reportCode: 'A-02',
          title: 'Configuración e infraestructura (Fases 2 y 5)',
        }
      : {
          contractFile: 'A-04-QUALITY.json',
          reportFile: 'A-04-QUALITY.md',
          reportCode: 'A-04',
          title: 'Calidad y madurez (transversal y Fase 6)',
        };

  printPhaseResult(phase);

  const errors = validateContract(phase.contract);
  if (errors.length > 0) {
    console.log('\n== Contrato invalido ==');
    for (const error of errors) console.log(`  FAIL  ${error}`);
    return EXIT_FAIL;
  }

  console.log(
    `\nContrato valido: ${phase.findings.length} hallazgo(s), ${phase.contract.pruebas_bloqueadas} prueba(s) bloqueada(s).`,
  );

  if (!write) {
    console.log('(no se escribio nada: usa --write para emitir los artefactos)');
    return EXIT_OK;
  }

  const written = emitPhaseArtifacts({ projectRoot, now, state, phase, ...meta });
  console.log(`\nEscrito: ${written.contractTarget}`);
  console.log(`Escrito: ${written.findingsTarget}`);
  console.log(`Escrito: ${written.reportTarget}`);
  return EXIT_OK;
}

function runPrepareCommand({ projectRoot, state, install, baseUrl }) {
  if (state.errors.length > 0) {
    printErrors(state.errors);
    console.error('\nprepare abortado: la autorización no es válida.');
    return EXIT_FAIL;
  }

  const tests = state.authorization.authorizedTests ?? [];
  const allows = (pattern) => tests.some((test) => pattern.test(test));
  const writePlan = allows(/plan de pruebas|rutas/i);
  const writeTests = allows(/crear pruebas|sectest\/tests/i);
  const allowsInstall = allows(/instalar herramientas/i);

  if (!writePlan && !writeTests) {
    console.error(
      'la autorización no habilita "Crear pruebas" ni "Generar plan de pruebas" en la sección 6',
    );
    return EXIT_FAIL;
  }
  if (install && !allowsInstall) {
    console.error('la autorización no habilita "Instalar herramientas de testing" en la sección 6');
    return EXIT_FAIL;
  }

  const result = runPreparePhase({ projectRoot, install, baseUrl, writePlan, writeTests });
  if (!result.ok) {
    console.error(`prepare falló: ${result.reason}`);
    return EXIT_FAIL;
  }

  console.log('\n== Rutas ==');
  console.log(
    `  total ${result.routes.total} · smoke ${result.routes.smoke} · admin ${result.routes.admin} · con parámetros ${result.routes.pending} · login ${result.routes.login ?? 'no detectado'}`,
  );

  for (const file of result.written) console.log(`  Escrito: ${file}`);
  for (const note of result.notes) console.log(`  WARN  ${note}`);
  if (install) {
    console.log(
      result.installed
        ? '  Herramientas instaladas en sectest/tools'
        : '  Herramientas NO instaladas (revisar la salida de composer)',
    );
  }

  return EXIT_OK;
}

async function runCanaryCommand({ projectRoot, values, state }) {
  if (state.errors.length > 0) {
    printErrors(state.errors);
    console.error('\ncanary abortado: la autorización no es válida.');
    return EXIT_FAIL;
  }

  const baseUrl = values['base-url'];
  const listUrl = values['list-url'];
  if (!baseUrl) {
    console.error('falta --base-url');
    return EXIT_USAGE;
  }
  if (!listUrl) {
    console.error('falta --list-url (por ejemplo /api/invoices)');
    return EXIT_USAGE;
  }

  try {
    assertAllowedTarget(baseUrl, { whitelist: state.authorization.whitelist });
  } catch (error) {
    console.error(`base-url rechazada: ${error.message}`);
    return EXIT_FAIL;
  }

  const tests = state.authorization.authorizedTests ?? [];
  const allowsSession = tests.some((test) => /autenticaci|sesi/i.test(test));
  const allowsAuthz = tests.some((test) => /autorizaci|idor|bola/i.test(test));

  if (!allowsSession) {
    console.error('la autorización no habilita "Pruebas de autenticación y sesión" en la sección 6');
    return EXIT_FAIL;
  }

  const planPath = path.join(projectRoot, PLAN_FILE);
  if (!existsSync(planPath)) {
    console.error(`falta ${PLAN_FILE}: corré "prepare" primero`);
    return EXIT_FAIL;
  }

  const parsed = parsePlan(readFileSync(planPath, 'utf8'));
  if (parsed.errors.length > 0) {
    console.error(`plan inválido: ${parsed.errors.join('; ')}`);
    return EXIT_FAIL;
  }

  if (values.apply !== undefined && values.apply !== '') {
    if (!allowsAuthz) {
      console.error('la autorización no habilita "Pruebas de autorización (IDOR/BOLA)" en la sección 6');
      return EXIT_FAIL;
    }

    const entry = buildCanaryEntry({ listUrl, id: values.apply, label: values.label });
    const updated = applyCanary(parsed.plan, entry);
    const errors = validatePlan(updated);
    if (errors.length > 0) {
      console.error(`el plan quedaría inválido: ${errors.join('; ')}`);
      return EXIT_FAIL;
    }

    const target = assertInsideSectest(projectRoot, planPath);
    writeFileSync(target, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(`Canario agregado: GET ${entry.url} (${entry.as} contra ${entry.owner})`);
    console.log(`Escrito: ${target}`);
    return EXIT_OK;
  }

  try {
    const result = await discoverCanary({
      baseUrl,
      whitelist: state.authorization.whitelist,
      plan: parsed.plan,
      credentials: state.credentials,
      listUrl,
      idField: values['id-field'] ?? 'id',
      role: values.as ?? 'userB',
    });

    mkdirSync(path.join(projectRoot, SCOPE_DIR), { recursive: true });
    const target = assertInsideSectest(projectRoot, path.join(projectRoot, CANARY_FILE));
    writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

    console.log(`\n== Recursos de ${result.role} en ${listUrl} ==`);
    for (const candidate of result.candidates) {
      console.log(`  ${candidate.id}  ${candidate.label}`);
    }
    console.log(`\nEscrito: ${target}`);
    return EXIT_OK;
  } catch (error) {
    console.error(`canary falló: ${error.message}`);
    return EXIT_FAIL;
  }
}

async function runDynamicCommand({ projectRoot, now, write, state, baseUrl, planPath }) {
  if (state.errors.length > 0) {
    printErrors(state.errors);
    console.error('\ndynamic abortado: la autorización no es válida.');
    return EXIT_FAIL;
  }
  if (!baseUrl) {
    console.error('falta --base-url <url>');
    return EXIT_USAGE;
  }

  const authorization = state.authorization;
  const allowsGet = (authorization.authorizedTests ?? []).some((test) => /GET/i.test(test));
  if (!allowsGet) {
    console.error('la autorización no habilita "Peticiones HTTP GET de reconocimiento" en la sección 6');
    return EXIT_FAIL;
  }
  const allowsEnumeration = (authorization.authorizedTests ?? []).some((test) =>
    /enumeraci/i.test(test),
  );

  try {
    assertAllowedTarget(baseUrl, { whitelist: authorization.whitelist });
  } catch (error) {
    console.error(`base-url rechazada: ${error.message}`);
    return EXIT_FAIL;
  }

  let resolvedPlanPath = planPath;
  if (!resolvedPlanPath) {
    const candidate = path.join(projectRoot, PLAN_FILE);
    if (existsSync(candidate)) resolvedPlanPath = candidate;
  }

  let plan = null;
  if (resolvedPlanPath) {
    if (!existsSync(resolvedPlanPath)) {
      console.error(`no existe el plan: ${resolvedPlanPath}`);
      return EXIT_FAIL;
    }
    const parsedPlan = parsePlan(readFileSync(resolvedPlanPath, 'utf8'));
    if (parsedPlan.errors.length > 0) {
      console.error(`plan inválido: ${resolvedPlanPath}`);
      for (const error of parsedPlan.errors) console.error(`  - ${error}`);
      return EXIT_FAIL;
    }
    const allowsAuthTests = (authorization.authorizedTests ?? []).some((test) =>
      /autenticaci|autorizaci|idor|escalada|sesi/i.test(test),
    );
    if (!allowsAuthTests) {
      console.error(
        'el plan exige la casilla "Pruebas de autenticación y sesión" marcada en la sección 6',
      );
      return EXIT_FAIL;
    }
    plan = parsedPlan.plan;
    console.log(`Plan: ${resolvedPlanPath}`);
  }

  const phase = await runDynamicPhase({
    baseUrl,
    whitelist: authorization.whitelist,
    plan,
    credentials: state.credentials,
    allowEnumeration: allowsEnumeration,
  });

  console.log('\n== Pruebas ==');
  for (const check of phase.checks) {
    const suffix = check.note ? ` — ${check.note}` : '';
    const count = check.status === 'ejecutada' ? ` (${check.findings} hallazgo(s))` : '';
    console.log(`  ${check.status.toUpperCase().padEnd(10)} ${check.name}${count}${suffix}`);
  }

  console.log('\n== Hallazgos ==');
  if (phase.findings.length === 0) console.log('  (ninguno)');
  for (const finding of phase.findings) {
    console.log(
      `  ${finding.severity.toUpperCase().padEnd(11)} ${finding.id}  ${finding.file}  ${finding.title}`,
    );
  }

  const contractErrors = validateContract(phase.contract);
  if (contractErrors.length > 0) {
    console.log('\n== Contrato invalido ==');
    for (const error of contractErrors) console.log(`  FAIL  ${error}`);
    return EXIT_FAIL;
  }

  console.log(
    `\nContrato valido: ${phase.findings.length} hallazgo(s), ${phase.contract.pruebas_bloqueadas} prueba(s) bloqueada(s).`,
  );

  if (!write) {
    console.log('(no se escribio nada: usa --write para emitir los artefactos)');
    return EXIT_OK;
  }

  const generatedAt = now.toISOString();
  const contractsDir = path.join(projectRoot, CONTRACTS_DIR);
  mkdirSync(contractsDir, { recursive: true });
  const contractTarget = assertInsideReports(projectRoot, path.join(contractsDir, 'A-03-DYNAMIC.json'));
  writeFileSync(contractTarget, `${JSON.stringify(phase.contract, null, 2)}\n`, 'utf8');
  console.log(`\nEscrito: ${contractTarget}`);

  for (const entry of phase.evidence) {
    console.log(`Escrito: ${writeEvidence(projectRoot, entry.check, entry)}`);
  }

  const findingsTarget = writeFindingsArtifact(projectRoot, {
    subagente: 'A-DYNAMIC',
    archivo_reporte: `${REPORTS_DIR}/A-03-DYNAMIC.md`,
    generado: generatedAt,
    contract: phase.contract,
    checks: phase.checks,
    manifest: [],
    findings: phase.findings,
    evidence: phase.evidence.map((entry) => ({ check: entry.check, requests: entry.requests.length })),
  });
  console.log(`Escrito: ${findingsTarget}`);

  const markdown = renderIndividualReport({
    reportCode: 'A-03',
    title: 'Pruebas dinámicas (Fase 3)',
    subagente: 'A-DYNAMIC',
    contract: phase.contract,
    findings: phase.findings,
    checks: phase.checks,
    manifest: [],
    authorization: authorization ?? {},
    generatedAt,
  });
  console.log(`Escrito: ${writeReport(projectRoot, 'A-03-DYNAMIC.md', markdown)}`);
  return EXIT_OK;
}

async function runToolsCommand({ projectRoot, values }) {
  let tools = detectTools(projectRoot);
  const python = tools.python?.available ? pythonVersion(tools.python.path) : null;

  const plans = planInstallations({
    tools,
    projectHas: {
      composerLock: existsSync(path.join(projectRoot, 'composer.lock')),
      packageLock: existsSync(path.join(projectRoot, 'package-lock.json')),
    },
    python,
  });

  console.log('\n== Plan de instalación ==');
  if (plans.length === 0) console.log('  (nada que instalar)');
  for (const plan of plans) {
    const strategy = plan.available ? plan.strategy : 'NO INSTALABLE';
    console.log(`  ${plan.tool.padEnd(15)} ${strategy.padEnd(22)} ${plan.reason}`);
  }

  if (!values.install) {
    console.log('\n(usa --install --yes para ejecutar; nunca se instala dentro del proyecto)');
    return EXIT_OK;
  }
  if (!values.yes) {
    console.error('\n--install requiere --yes: descarga e instala software en la toolchain aislada.');
    return EXIT_USAGE;
  }

  const selected = values.tool ? plans.filter((plan) => plan.tool === values.tool) : plans;
  if (values.tool && selected.length === 0) {
    console.error(`no hay plan de instalación para '${values.tool}'`);
    return EXIT_USAGE;
  }

  console.log('\n== Instalación ==');
  for (const plan of selected) {
    if (!plan.available) {
      console.log(`  SKIP  ${plan.tool}: ${plan.reason}`);
      continue;
    }
    const log = [];
    const result = await executePlan(plan, { projectRoot, log });
    for (const line of log) console.log(`        ${line}`);
    const suffix = result.path ? ` -> ${result.path}` : '';
    const reason = result.reason ? ` — ${result.reason}` : '';
    console.log(`  ${result.ok ? 'OK  ' : 'FAIL'}  ${plan.tool}${suffix}${reason}`);
  }

  tools = detectTools(projectRoot);
  console.log('\n== Estado tras instalar ==');
  for (const line of manifestLines(tools)) console.log(`  ${line}`);
  return EXIT_OK;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      now: { type: 'string' },
      write: { type: 'boolean', default: false },
      install: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      tool: { type: 'string' },
      'base-url': { type: 'string' },
      plan: { type: 'string' },
      'list-url': { type: 'string' },
      'id-field': { type: 'string' },
      as: { type: 'string' },
      apply: { type: 'string' },
      label: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const command = positionals[0] ?? 'check';
  if (values.help || command === 'help') {
    console.log(HELP);
    return EXIT_OK;
  }
  if (!['check', 'run', 'static', 'config', 'dynamic', 'quality', 'prepare', 'canary', 'tools'].includes(command)) {
    console.error(`comando desconocido: ${command}`);
    console.error(HELP);
    return EXIT_USAGE;
  }
  if (!values.project) {
    console.error('falta --project <ruta>');
    return EXIT_USAGE;
  }

  const projectRoot = path.resolve(values.project);

  if (command === 'tools') {
    return runToolsCommand({ projectRoot, values });
  }

  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`--now invalido: ${values.now}`);
    return EXIT_USAGE;
  }

  const state = gatherGate(projectRoot, now);
  console.log(`Proyecto: ${projectRoot}`);
  console.log(`Instante: ${now.toISOString()}`);
  printGate(state);

  if (command === 'static') {
    return runStaticCommand({ projectRoot, now, write: values.write, state });
  }

  if (command === 'dynamic') {
    return runDynamicCommand({
      projectRoot,
      now,
      write: values.write,
      state,
      baseUrl: values['base-url'],
      planPath: values.plan,
    });
  }

  if (command === 'config' || command === 'quality') {
    return runSimplePhaseCommand({ projectRoot, now, write: values.write, state, kind: command });
  }

  if (command === 'prepare') {
    return runPrepareCommand({
      projectRoot,
      state,
      install: values.install,
      baseUrl: values['base-url'],
    });
  }

  if (command === 'canary') {
    return runCanaryCommand({ projectRoot, values, state });
  }

  const contracts = loadContracts(projectRoot, state.errors);
  console.log('== Contratos ==');
  console.log(`  ${contracts.length > 0 ? 'PASS' : 'FAIL'}  ${contracts.length} contrato(s) valido(s)`);
  printErrors(state.errors);

  if (command === 'check') {
    return state.errors.length === 0 ? EXIT_OK : EXIT_FAIL;
  }

  if (state.errors.length > 0) {
    console.error('\nrun abortado: la autorizacion o los contratos no son validos.');
    return EXIT_FAIL;
  }

  const authorization = state.authorization;
  const thresholds = Object.fromEntries(
    Object.entries(authorization.thresholds).filter(([, value]) => Number.isFinite(value)),
  );

  const { resumen, errors, verdict } = buildResumen({
    project: authorization.project ?? '',
    version: authorization.version ?? '',
    fecha: now.toISOString(),
    ventana: {
      inicio: authorization.window.start,
      fin: authorization.window.end,
      zona: authorization.window.timezone ?? '',
    },
    contratos: contracts,
    thresholds,
  });

  console.log('\n== Cuantificacion ==');
  console.log(`  SEG ${resumen.dimensiones.seguridad ?? 'no evaluable'}`);
  console.log(`  CI  ${resumen.dimensiones.control_informacion ?? 'no evaluable'}`);
  console.log(`  CS  ${resumen.dimensiones.calidad_software ?? 'no evaluable'}`);
  console.log(`  Veredicto: ${verdict.value} (${verdict.reason})`);

  if (errors.length > 0) {
    console.log('== Resumen invalido ==');
    for (const error of errors) console.log(`  FAIL  ${error}`);
    return EXIT_FAIL;
  }

  if (!values.write) {
    console.log('\n(no se escribio nada: usa --write para emitir sectest/reports/resumen.json)');
    return EXIT_OK;
  }

  const reportsDir = path.join(projectRoot, REPORTS_DIR);
  mkdirSync(reportsDir, { recursive: true });
  const target = assertInsideReports(projectRoot, path.join(reportsDir, 'resumen.json'));
  writeFileSync(target, `${JSON.stringify(resumen, null, 2)}\n`, 'utf8');
  console.log(`\nEscrito: ${target}`);

  const artifacts = readArtifacts(projectRoot);
  if (artifacts.length === 0) {
    console.log('  WARN  sin sectest/reports/hallazgos/: el informe final no podrá listar hallazgos individuales');
  }

  const generatedAt = now.toISOString();
  const finalMarkdown = renderFinalReport({
    resumen,
    artifacts,
    thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds },
    verdict,
    generatedAt,
  });
  console.log(`Escrito: ${writeReport(projectRoot, 'INFORME_FINAL.md', finalMarkdown)}`);
  console.log(`Escrito: ${writeReport(projectRoot, 'INDICE.md', renderIndex({ artifacts }))}`);
  console.log(
    `Escrito: ${writeReport(
      projectRoot,
      'HALLAZGOS_FALLAS.md',
      renderFailuresReport({ resumen, artifacts, generatedAt }),
    )}`,
  );
  return EXIT_OK;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`error no controlado: ${error.message}`);
    process.exitCode = EXIT_FAIL;
  });

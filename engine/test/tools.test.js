import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseComposerAudit, composerFindings, mapSeverity } from '../src/tools/adapters/composer-audit.js';
import { gitleaksFindings, parseGitleaks } from '../src/tools/adapters/gitleaks.js';
import { scanProject } from '../src/tools/adapters/grep-fallback.js';
import { parseNpmAudit, npmFindings } from '../src/tools/adapters/npm-audit.js';
import { parsePhpstan, phpstanFindings } from '../src/tools/adapters/phpstan.js';
import { extractJson, runTool } from '../src/tools/runner.js';

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/tools/${name}`, import.meta.url)), 'utf8');

test('runner ejecuta sin shell y devuelve stdout', () => {
  const result = runTool({ command: process.execPath, args: ['-e', 'process.stdout.write("ok")'] });
  assert.equal(result.ok, true);
  assert.equal(result.stdout, 'ok');
  assert.equal(result.exitCode, 0);
});

test('runner conserva stdout cuando la herramienta sale con error', () => {
  const script = 'process.stdout.write(\'{"errors":1}\'); process.exit(1);';
  const result = runTool({ command: process.execPath, args: ['-e', script] });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '{"errors":1}');
});

test('runner aplica timeout', () => {
  const result = runTool({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 5000)'],
    timeoutMs: 250,
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test('extractJson tolera ruido antes del JSON', () => {
  const parsed = extractJson('aviso: algo\n{"a":1}\nfin');
  assert.deepEqual(parsed, { a: 1 });
});

test('extractJson devuelve null con basura', () => {
  assert.equal(extractJson('no hay json'), null);
});

test('parsePhpstan agrupa por identificador y cuenta el total', () => {
  const parsed = parsePhpstan(fixture('phpstan.json'));
  assert.equal(parsed.total, 3);

  const findings = phpstanFindings(parsed, 'C:\\demo');
  assert.equal(findings.length, 2);
  assert.equal(findings[0].rule, 'PHPSTAN-METHOD.NOTFOUND');
  assert.ok(findings[0].evidence.includes('2 ocurrencia(s)'));
  assert.ok(findings[0].file.endsWith('app/Foo.php'));
});

test('parseComposerAudit y severidades', () => {
  const parsed = parseComposerAudit(fixture('composer-audit.json'));
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.abandoned, ['old/pkg']);

  const findings = composerFindings(parsed);
  assert.equal(findings[0].severity, 'alto');
  assert.equal(findings[1].severity, 'medio');
  assert.equal(findings[0].file, 'composer.lock');
  assert.ok(findings[0].evidence.includes('CVE-2023-0001'));
});

test('mapSeverity mapea y cae en medio', () => {
  assert.equal(mapSeverity('critical'), 'critico');
  assert.equal(mapSeverity('moderate'), 'medio');
  assert.equal(mapSeverity(undefined), 'medio');
  assert.equal(mapSeverity('raro'), 'medio');
});

test('parseNpmAudit extrae via objeto y conserva directas', () => {
  const parsed = parseNpmAudit(fixture('npm-audit.json'));
  assert.equal(parsed.items.length, 2);

  const findings = npmFindings(parsed);
  const lodash = findings.find((finding) => finding.rule === 'NPM-LODASH');
  const minimist = findings.find((finding) => finding.rule === 'NPM-MINIMIST');
  assert.equal(lodash.severity, 'medio');
  assert.ok(lodash.evidence.includes('Prototype Pollution'));
  assert.equal(minimist.severity, 'critico');
});

test('parseGitleaks deduplica por regla, archivo y linea', () => {
  const parsed = parseGitleaks(fixture('gitleaks.json'));
  assert.equal(parsed.items.length, 2);

  const findings = gitleaksFindings(parsed);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, 'alto');
  assert.equal(findings[0].file, 'config/app.php');
  assert.ok(findings[0].rule.startsWith('GITLEAKS-'));
});

test('scanProject detecta patrones y enmascara secretos', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'grep-scan-'));
  try {
    mkdirSync(path.join(root, 'app'), { recursive: true });
    mkdirSync(path.join(root, 'config'), { recursive: true });
    writeFileSync(
      path.join(root, 'app', 'Danger.php'),
      '<?php\nsystem($cmd);\n$key = env("APP_KEY");\n',
      'utf8',
    );
    writeFileSync(
      path.join(root, 'config', 'app.php'),
      "<?php\nreturn ['debug' => true, 'password' => 'secreto-de-demo'];\n",
      'utf8',
    );
    // env() dentro de config/ no debe reportarse
    writeFileSync(path.join(root, 'config', 'db.php'), "<?php\nreturn env('DB_HOST');\n", 'utf8');

    const { findings, filesScanned } = scanProject(root);
    assert.equal(filesScanned, 3);

    const rules = findings.map((finding) => finding.rule);
    assert.ok(rules.includes('EXEC'));
    assert.ok(rules.includes('DEBUG-TRUE'));
    assert.ok(rules.includes('HARDCODED-SECRET'));

    const envFindings = findings.filter((finding) => finding.rule === 'ENV-OUTSIDE-CONFIG');
    assert.equal(envFindings.length, 1);
    assert.equal(envFindings[0].file, 'app/Danger.php');

    const secret = findings.find((finding) => finding.rule === 'HARDCODED-SECRET');
    assert.equal(secret.evidence.includes('secreto-de-demo'), false);
    assert.ok(secret.evidence.includes('se***mo'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

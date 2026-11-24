import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { assertOutsideProject, planInstallations, toolchainDir } from '../src/tools/installer.js';

const TOOLS_WITH_MISSING = {
  php: { available: true, path: 'php.exe', invoke: ['php.exe'] },
  composer: { available: true, path: 'composer.phar', invoke: ['php.exe', 'composer.phar'] },
  phpstan: { available: false, reason: 'no instalado' },
  npm: { available: true, path: 'npm-cli.js', invoke: ['node.exe', 'npm-cli.js'] },
  semgrep: { available: false, reason: 'no instalado' },
  gitleaks: { available: false, reason: 'no instalado' },
};

const planFor = (plans, tool) => plans.find((plan) => plan.tool === tool);

test('planifica phpstan, gitleaks y semgrep sin tocar el proyecto', () => {
  const plans = planInstallations({
    tools: TOOLS_WITH_MISSING,
    projectHas: { composerLock: false, packageLock: false },
    python: { major: 3, minor: 6 },
    env: { SECTEST_TOOLS_DIR: path.resolve('toolchain') },
  });

  const phpstan = planFor(plans, 'phpstan');
  assert.equal(phpstan.strategy, 'composer-global');
  assert.equal(phpstan.available, true);
  assert.ok(phpstan.reason.includes('fuera del proyecto'));
  assert.ok(phpstan.command.args.includes('global'));

  const gitleaks = planFor(plans, 'gitleaks');
  assert.equal(gitleaks.strategy, 'download-github-release');
  assert.equal(gitleaks.available, true);

  const semgrep = planFor(plans, 'semgrep');
  assert.equal(semgrep.strategy, 'pip-user');
  assert.equal(semgrep.available, false);
  assert.ok(semgrep.reason.includes('3.8'));
});

test('semgrep se habilita con Python 3.8 o superior', () => {
  const plans = planInstallations({
    tools: TOOLS_WITH_MISSING,
    projectHas: { composerLock: true, packageLock: true },
    python: { major: 3, minor: 12 },
  });
  assert.equal(planFor(plans, 'semgrep').available, true);
  assert.equal(planFor(plans, 'semgrep').strategy, 'pip-user');
});

test('los lockfiles faltantes no son instalables', () => {
  const plans = planInstallations({
    tools: TOOLS_WITH_MISSING,
    projectHas: { composerLock: false, packageLock: false },
    python: { major: 3, minor: 12 },
  });

  const composerAudit = planFor(plans, 'composer-audit');
  assert.equal(composerAudit.strategy, 'none');
  assert.equal(composerAudit.available, false);
  assert.ok(composerAudit.reason.includes('composer.lock'));

  const npmAudit = planFor(plans, 'npm-audit');
  assert.equal(npmAudit.strategy, 'none');
  assert.equal(npmAudit.available, false);
  assert.ok(npmAudit.reason.includes('package-lock.json'));
});

test('sin php o composer, phpstan no es instalable', () => {
  const plans = planInstallations({
    tools: { ...TOOLS_WITH_MISSING, composer: { available: false, reason: 'sin composer' } },
    projectHas: { composerLock: true, packageLock: true },
    python: { major: 3, minor: 12 },
  });
  assert.equal(planFor(plans, 'phpstan').available, false);
  assert.ok(planFor(plans, 'phpstan').reason.includes('requiere php y composer'));
});

test('no planifica nada que ya está instalado', () => {
  const tools = Object.fromEntries(
    Object.entries(TOOLS_WITH_MISSING).map(([name, tool]) => [
      name,
      name === 'php' || name === 'composer' ? tool : { available: true, path: `${name}.exe`, invoke: [`${name}.exe`] },
    ]),
  );
  const plans = planInstallations({
    tools,
    projectHas: { composerLock: true, packageLock: true },
    python: { major: 3, minor: 12 },
  });
  assert.deepEqual(plans, []);
});

test('toolchainDir respeta SECTEST_TOOLS_DIR', () => {
  assert.equal(toolchainDir({ SECTEST_TOOLS_DIR: path.resolve('custom') }), path.resolve('custom'));
  assert.ok(toolchainDir({}).endsWith(path.join('sectest', 'tools')));
});

test('la instalación se bloquea dentro del proyecto auditado', () => {
  const project = path.resolve('proyecto-auditado');
  assert.throws(() => assertOutsideProject(project, path.join(project, 'vendor', 'tools')));
  assert.throws(() => assertOutsideProject(project, project));
  assert.doesNotThrow(() => assertOutsideProject(project, path.join(project, '..', 'toolchain')));
});

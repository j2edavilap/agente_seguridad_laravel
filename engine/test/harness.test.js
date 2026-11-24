import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPlan,
  classifyRoutes,
  parseRoutes,
  renderSmokeTest,
  renderToolsComposerJson,
  runPreparePhase,
} from '../src/phases/harness.js';

const ROUTES = [
  { method: 'GET|HEAD', uri: '/', name: 'home', middleware: ['web'] },
  { method: 'GET|HEAD', uri: 'login', name: 'login', middleware: ['web', 'guest'] },
  { method: 'POST', uri: 'login', name: 'login.store', middleware: ['web', 'guest'] },
  { method: 'GET|HEAD', uri: 'admin/users', name: 'admin.users', middleware: ['web', 'auth'] },
  { method: 'GET|HEAD', uri: 'api/invoices/{invoice}', name: 'invoices.show', middleware: ['api'] },
  { method: 'GET|HEAD', uri: 'storage/{path}', name: null, middleware: [] },
  { method: 'GET|HEAD', uri: '_ignition/health-check', name: null, middleware: [] },
];

test('parseRoutes normaliza métodos y URIs', () => {
  const routes = parseRoutes(JSON.stringify(ROUTES));
  assert.equal(routes.length, 7);
  assert.deepEqual(routes[0].methods, ['GET', 'HEAD']);
  assert.equal(routes[0].uri, '');
});

test('classifyRoutes separa smoke, admin, login y pendientes', () => {
  const classified = classifyRoutes(parseRoutes(JSON.stringify(ROUTES)));
  assert.equal(classified.total, 7);
  assert.deepEqual(
    classified.smoke.map((route) => route.uri),
    ['', 'login', 'admin/users'],
  );
  assert.deepEqual(classified.admin.map((route) => route.uri), ['admin/users']);
  assert.equal(classified.login.uri, 'login');
  assert.deepEqual(classified.pending.map((route) => route.uri), ['api/invoices/{invoice}']);
});

test('buildPlan arma login, admin y deja los pendientes documentados', () => {
  const plan = buildPlan(classifyRoutes(parseRoutes(JSON.stringify(ROUTES))));
  assert.equal(plan.version, 1);
  assert.equal(plan.login.url, '/login');
  assert.equal(plan.login.fields.email, '{{username}}');
  assert.deepEqual(plan.adminEndpoints, [
    { name: 'admin.users', url: '/admin/users', expect: [403] },
  ]);
  assert.equal(plan.crossAccess.length, 0);
  assert.deepEqual(plan.smoke, ['/', '/login', '/admin/users']);
  assert.equal(plan.pending.length, 1);
});

test('renderSmokeTest incluye las rutas y no rompe el namespace', () => {
  const classified = classifyRoutes(parseRoutes(JSON.stringify(ROUTES)));
  const php = renderSmokeTest(classified.smoke);
  assert.ok(php.includes("namespace Sectest\\Tests\\Feature;"));
  assert.ok(php.includes("'/admin/users',"));
  assert.ok(php.includes('assertLessThan(500'));
});

test('el composer.json aislado declara las herramientas de testing', () => {
  const manifest = JSON.parse(renderToolsComposerJson());
  assert.equal(manifest.name, 'sectest/tools');
  assert.ok(manifest['require-dev']['phpunit/phpunit']);
  assert.ok(manifest['require-dev']['phpstan/phpstan']);
});

test('prepare genera plan y arnés desde route:list', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-prepare-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const payload = JSON.stringify(ROUTES);
  writeFileSync(path.join(root, 'artisan'), `<?php echo '${payload}';`, 'utf8');

  const result = runPreparePhase({ projectRoot: root, install: false });
  assert.equal(result.ok, true, result.reason);

  for (const file of [
    'sectest/scope/dynamic-plan.json',
    'sectest/tests/phpunit.xml',
    'sectest/tests/TestCase.php',
    'sectest/tests/Feature/RouteSmokeTest.php',
    'sectest/tools/composer.json',
    'sectest/README.md',
  ]) {
    assert.equal(existsSync(path.join(root, file)), true, `falta ${file}`);
  }

  const plan = JSON.parse(readFileSync(path.join(root, 'sectest/scope/dynamic-plan.json'), 'utf8'));
  assert.equal(plan.login.url, '/login');
  assert.equal(plan.adminEndpoints[0].url, '/admin/users');
  assert.deepEqual(plan.smoke, ['/', '/login', '/admin/users']);

  const smoke = readFileSync(path.join(root, 'sectest/tests/Feature/RouteSmokeTest.php'), 'utf8');
  assert.ok(smoke.includes("'/admin/users',"));
});

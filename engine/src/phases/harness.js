import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { assertInsideSectest } from '../io/paths.js';
import { PLAN_FILE, SECTEST_DIR, TESTS_DIR, TOOLS_DIR } from '../paths.js';
import { detectTools } from '../tools/manifest.js';
import { runTool } from '../tools/runner.js';

const MAX_SMOKE_ROUTES = 30;
const IGNORED_PREFIXES = ['_', 'storage/', 'telescope', 'horizon', 'livewire', 'sanctum/csrf-cookie'];

export function parseRoutes(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return null;
    return data
      .filter((route) => route && typeof route === 'object')
      .map((route) => ({
        methods: String(route.method ?? '')
          .split('|')
          .map((method) => method.trim().toUpperCase())
          .filter(Boolean),
        uri: String(route.uri ?? '').replace(/^\//, ''),
        name: route.name ? String(route.name) : null,
        middleware: Array.isArray(route.middleware) ? route.middleware.map(String) : [],
      }));
  } catch {
    return null;
  }
}

export function classifyRoutes(routes) {
  const usable = routes.filter(
    (route) => !IGNORED_PREFIXES.some((prefix) => route.uri.startsWith(prefix)),
  );

  const smoke = usable
    .filter((route) => route.methods.includes('GET') && !route.uri.includes('{'))
    .slice(0, MAX_SMOKE_ROUTES);

  const admin = usable.filter(
    (route) =>
      route.methods.includes('GET') &&
      !route.uri.includes('{') &&
      /(^|\/)(admin)(\/|$)/i.test(route.uri),
  );

  const login = usable.find(
    (route) => route.methods.includes('POST') && /(^|\/)login$/i.test(route.uri),
  );

  const pending = usable.filter(
    (route) => route.methods.includes('GET') && route.uri.includes('{'),
  );

  return { smoke, admin, login, pending, total: routes.length };
}

export function buildPlan(classified) {
  const plan = { version: 1 };

  if (classified.login) {
    plan.login = {
      url: `/${classified.login.uri}`,
      contentType: 'form',
      fields: { email: '{{username}}', password: '{{password}}' },
      successStatus: [200, 302],
    };
  }

  plan.adminEndpoints = classified.admin.map((route) => ({
    name: route.name ?? `GET /${route.uri}`,
    url: `/${route.uri}`,
    expect: [403],
  }));

  plan.crossAccess = [];
  plan.enumerate = [];
  plan.smoke = classified.smoke.map((route) => `/${route.uri}`);
  plan.pending = classified.pending.map((route) => ({
    name: route.name ?? route.uri,
    uri: `/${route.uri}`,
    note: 'requiere un ID real de otro usuario para probar IDOR/BOLA',
  }));

  return plan;
}

export function renderSmokeTest(routes) {
  const list = routes.map((route) => `            '/${route.uri}',`).join('\n');
  return `<?php

namespace Sectest\\Tests\\Feature;

use Sectest\\Tests\\TestCase;

/**
 * Generado por laravel-sec-engine. No editar a mano: se regenera con \`prepare\`.
 */
class RouteSmokeTest extends TestCase
{
    public function test_las_rutas_get_no_devuelven_500(): void
    {
        $rutas = [
${list}
        ];

        foreach ($rutas as $ruta) {
            $response = $this->get($ruta);
            $this->assertLessThan(500, $response->getStatusCode(), "GET {$ruta}");
        }
    }
}
`;
}

export function renderAuthenticatedSmokeTest(routes) {
  const list = routes.map((route) => `            '/${route.uri}',`).join('\n');
  return `<?php

namespace Sectest\\Tests\\Feature;

use App\\Models\\User;
use Sectest\\Tests\\TestCase;

/**
 * Generado por laravel-sec-engine. No editar a mano: se regenera con \`prepare\`.
 */
class AuthenticatedSmokeTest extends TestCase
{
    public function test_las_rutas_get_autenticadas_no_devuelven_500(): void
    {
        $user = User::factory()->create();
        $rutas = [
${list}
        ];

        foreach ($rutas as $ruta) {
            $response = $this->actingAs($user)->get($ruta);
            $this->assertLessThan(500, $response->getStatusCode(), "GET {$ruta} autenticado");
        }
    }
}
`;
}

export function renderTestCase() {
  return `<?php

namespace Sectest\\Tests;

use Illuminate\\Contracts\\Console\\Kernel;
use Illuminate\\Foundation\\Testing\\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = require __DIR__ . '/../../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }
}
`;
}

export function renderPhpunitXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         bootstrap="../../vendor/autoload.php"
         colors="false"
         cacheDirectory="../.phpunit.cache"
         failOnWarning="false">
    <testsuites>
        <testsuite name="sectest">
            <directory suffix="Test.php">.</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="DB_CONNECTION" value="sqlite"/>
        <env name="DB_DATABASE" value=":memory:"/>
        <env name="CACHE_STORE" value="array"/>
        <env name="SESSION_DRIVER" value="array"/>
        <env name="QUEUE_CONNECTION" value="sync"/>
    </php>
</phpunit>
`;
}

export function renderToolsComposerJson() {
  return `${JSON.stringify(
    {
      name: 'sectest/tools',
      description: 'Herramientas de testing aisladas de la auditoria. No modifica el composer.json del proyecto.',
      'require-dev': {
        'phpunit/phpunit': '^11.0 || ^12.0',
        'phpstan/phpstan': '^2.0',
        'laravel/pint': '^1.0',
      },
      config: { 'sort-packages': true },
    },
    null,
    2,
  )}\n`;
}

export function renderReadme() {
  return `# sectest/

Todo lo que crea el agente vive acá. Nada de esto se escribe en el resto del proyecto.

| Carpeta | Contenido |
|---|---|
| \`scope/\` | \`authorization.md\` (la firma el humano), \`credentials.conf\`, \`dynamic-plan.json\` |
| \`reports/\` | Informes, contratos, hallazgos y evidencia |
| \`tests/\` | Pruebas creadas por el agente (\`phpunit.xml\` propio) |
| \`tools/\` | \`composer.json\` + \`vendor/\` con PHPUnit, PHPStan y Pint |

## Ejecutar las pruebas creadas

\`\`\`bash
sectest/tools/vendor/bin/phpunit -c sectest/tests/phpunit.xml
\`\`\`

## Regenerar

\`\`\`bash
node engine/src/cli.js prepare --project . --install
\`\`\`

No edites \`tests/\` a mano: se regenera.
`;
}

function writeFile(projectRoot, relativePath, content) {
  const target = assertInsideSectest(projectRoot, path.join(projectRoot, relativePath));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return target;
}

export function runPreparePhase({
  projectRoot,
  tools = null,
  install = false,
  baseUrl = null,
  writePlan = true,
  writeTests = true,
}) {
  const manifest = tools ?? detectTools(projectRoot);
  const written = [];
  const notes = [];

  if (!manifest.php?.available) {
    return { ok: false, reason: manifest.php?.reason ?? 'php no disponible', written, notes, routes: null };
  }

  const routeList = runTool({
    command: manifest.php.path,
    args: ['artisan', 'route:list', '--json'],
    cwd: projectRoot,
    timeoutMs: 60000,
  });

  const routes = parseRoutes(routeList.stdout);
  if (!routes) {
    return {
      ok: false,
      reason: `no se pudo leer route:list (exit ${routeList.exitCode ?? '?'})`,
      written,
      notes,
      routes: null,
    };
  }

  const classified = classifyRoutes(routes);
  const plan = buildPlan(classified);

  if (writePlan) {
    written.push(writeFile(projectRoot, PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`));
  }

  if (writeTests) {
    written.push(writeFile(projectRoot, `${TOOLS_DIR}/composer.json`, renderToolsComposerJson()));
    written.push(writeFile(projectRoot, `${TESTS_DIR}/phpunit.xml`, renderPhpunitXml()));
    written.push(writeFile(projectRoot, `${TESTS_DIR}/TestCase.php`, renderTestCase()));
    written.push(
      writeFile(projectRoot, `${TESTS_DIR}/Feature/RouteSmokeTest.php`, renderSmokeTest(classified.smoke)),
    );

    const hasUserModel = existsSync(path.join(projectRoot, 'app', 'Models', 'User.php'));
    const hasUserFactory = existsSync(path.join(projectRoot, 'database', 'factories', 'UserFactory.php'));
    if (hasUserModel && hasUserFactory) {
      written.push(
        writeFile(
          projectRoot,
          `${TESTS_DIR}/Feature/AuthenticatedSmokeTest.php`,
          renderAuthenticatedSmokeTest(classified.smoke),
        ),
      );
    } else {
      notes.push('sin app/Models/User.php y UserFactory: no se generó el smoke autenticado');
    }
  }

  written.push(writeFile(projectRoot, `${SECTEST_DIR}/README.md`, renderReadme()));

  if (classified.total === 0) notes.push('route:list no devolvió rutas');
  if (classified.smoke.length === 0) notes.push('no hay rutas GET sin parámetros para smoke tests');
  if (classified.pending.length > 0) {
    notes.push(`${classified.pending.length} ruta(s) con parámetros quedan en plan.pending: requieren IDs reales`);
  }

  let installed = false;
  if (install) {
    if (!manifest.composer?.available) {
      notes.push(`no se pudo instalar: ${manifest.composer?.reason ?? 'composer no disponible'}`);
    } else {
      const result = runTool({
        command: manifest.composer.invoke[0],
        args: [
          ...manifest.composer.invoke.slice(1),
          'install',
          '--working-dir',
          TOOLS_DIR,
          '--no-interaction',
          '--no-progress',
        ],
        cwd: projectRoot,
        timeoutMs: 600000,
      });
      installed = result.ok;
      if (!result.ok) {
        notes.push(`composer install falló: ${`${result.stdout}${result.stderr}`.trim().split(/\r?\n/).pop()}`);
      }
    }
  }

  return {
    ok: true,
    reason: null,
    written,
    notes,
    installed,
    plan,
    routes: {
      total: classified.total,
      smoke: classified.smoke.length,
      admin: classified.admin.length,
      pending: classified.pending.length,
      login: classified.login ? classified.login.uri : null,
    },
  };
}

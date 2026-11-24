import { existsSync } from 'node:fs';
import path from 'node:path';

import { composerHome, toolchainDir } from './installer.js';
import { runTool } from './runner.js';

const IS_WINDOWS = process.platform === 'win32';

const DEFAULT_PHP_CANDIDATES = [
  process.env.SECTEST_PHP,
  'E:\\laragon_8\\bin\\php\\php-8.5.12-1-nts-Win32-vs17-x64\\php.exe',
  IS_WINDOWS ? null : '/usr/bin/php',
].filter(Boolean);

const DEFAULT_COMPOSER_CANDIDATES = [
  process.env.SECTEST_COMPOSER,
  'E:\\laragon_8\\bin\\composer\\composer.phar',
].filter(Boolean);

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function findOnPath(names) {
  const directories = String(process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function probe(invoke, args, { timeoutMs = 20000 } = {}) {
  if (!invoke || invoke.length === 0 || !existsSync(invoke[0])) {
    return { version: null, ok: false };
  }
  const result = runTool({ command: invoke[0], args: [...invoke.slice(1), ...args], timeoutMs });
  const text = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/)[0] ?? '';
  return { version: text || null, ok: result.ok || text.length > 0 };
}

function entry({ available, path: toolPath, version, invoke, reason }) {
  return { available, path: toolPath, version: version ?? null, invoke: invoke ?? null, reason: reason ?? null };
}

function detectPhp() {
  const phpPath =
    firstExisting(DEFAULT_PHP_CANDIDATES) ?? findOnPath(IS_WINDOWS ? ['php.exe'] : ['php']);
  if (!phpPath) {
    return entry({ available: false, reason: 'php no está en PATH ni en las rutas de Laragon' });
  }
  const { version } = probe([phpPath], ['-v']);
  return entry({ available: true, path: phpPath, version, invoke: [phpPath] });
}

function detectComposer(php) {
  const phar = firstExisting(DEFAULT_COMPOSER_CANDIDATES);
  if (phar && php.available) {
    const { version } = probe([php.path, phar], ['--version', '--no-interaction']);
    return entry({ available: true, path: phar, version, invoke: [php.path, phar] });
  }
  const direct = findOnPath(IS_WINDOWS ? ['composer.phar', 'composer.exe'] : ['composer']);
  if (direct && direct.endsWith('.phar') && php.available) {
    const { version } = probe([php.path, direct], ['--version', '--no-interaction']);
    return entry({ available: true, path: direct, version, invoke: [php.path, direct] });
  }
  return entry({
    available: false,
    reason: 'composer.phar no encontrado (ni en Laragon ni en PATH ejecutable sin shell)',
  });
}

function detectPhpstan(projectRoot, php) {
  const candidates = [
    path.join(projectRoot, 'vendor', 'phpstan', 'phpstan', 'phpstan.phar'),
    path.join(projectRoot, 'sectest', 'tools', 'vendor', 'phpstan', 'phpstan', 'phpstan.phar'),
    path.join(toolchainDir(), 'phpstan', 'phpstan.phar'),
    path.join(composerHome(), 'vendor', 'phpstan', 'phpstan', 'phpstan.phar'),
    path.join(projectRoot, 'vendor', 'bin', 'phpstan'),
  ];
  const phar = firstExisting(candidates);
  if (!phar || !php.available) {
    return entry({ available: false, reason: 'phpstan no está instalado en vendor/ ni en la toolchain' });
  }
  const { version } = probe([php.path, phar], ['--version']);
  return entry({ available: true, path: phar, version, invoke: [php.path, phar] });
}

function findNpmCli() {
  const nodeDirectory = path.dirname(process.execPath);
  const candidates = [
    process.env.SECTEST_NPM_CLI,
    path.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(process.env.LOCALAPPDATA ?? '', 'pi-node', 'current', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  return firstExisting(candidates);
}

function detectNpm() {
  const cli = findNpmCli();
  if (!cli) {
    return entry({ available: false, reason: 'npm-cli.js no encontrado; npm.cmd no se ejecuta sin shell' });
  }
  const { version } = probe([process.execPath, cli], ['--version']);
  return entry({ available: true, path: cli, version, invoke: [process.execPath, cli] });
}

function detectBinary(name, executableNames, extraCandidates = []) {
  const found = firstExisting(extraCandidates) ?? findOnPath(executableNames);
  if (!found) return entry({ available: false, reason: `${name} no está instalado` });
  const { version } = probe([found], ['--version']);
  return entry({ available: true, path: found, version, invoke: [found] });
}

function detectProjectBinary(projectRoot, php, name, relativePaths) {
  const candidates = (Array.isArray(relativePaths) ? relativePaths : [relativePaths]).map((relativePath) =>
    path.join(projectRoot, relativePath),
  );
  const target = firstExisting(candidates);
  if (!php.available) {
    return entry({ available: false, reason: `requiere php para ejecutar ${name}` });
  }
  if (!target) {
    return entry({ available: false, reason: `${name} no está instalado en ${candidates.join(' ni ')}` });
  }
  const { version } = probe([php.path, target], ['--version']);
  return entry({ available: true, path: target, version, invoke: [php.path, target] });
}

function detectPython() {
  const python = findOnPath(IS_WINDOWS ? ['python.exe'] : ['python', 'python3']);
  if (!python) return entry({ available: false, reason: 'python no está en PATH' });
  const { version } = probe([python], ['--version']);
  return entry({ available: true, path: python, version, invoke: [python] });
}

export function detectTools(projectRoot) {
  const php = detectPhp();
  return {
    php,
    composer: detectComposer(php),
    phpstan: detectPhpstan(projectRoot, php),
    npm: detectNpm(),
    semgrep: detectBinary('semgrep', IS_WINDOWS ? ['semgrep.exe'] : ['semgrep']),
    gitleaks: detectBinary(
      'gitleaks',
      IS_WINDOWS ? ['gitleaks.exe'] : ['gitleaks'],
      [path.join(toolchainDir(), 'gitleaks', 'gitleaks.exe'), path.join(toolchainDir(), 'gitleaks', 'gitleaks')],
    ),
    python: detectPython(),
    git: detectBinary('git', IS_WINDOWS ? ['git.exe'] : ['git']),
    phpunit: detectProjectBinary(projectRoot, php, 'phpunit', [
      path.join('sectest', 'tools', 'vendor', 'bin', 'phpunit'),
      path.join('vendor', 'bin', 'phpunit'),
    ]),
    pest: detectProjectBinary(projectRoot, php, 'pest', [
      path.join('sectest', 'tools', 'vendor', 'bin', 'pest'),
      path.join('vendor', 'bin', 'pest'),
    ]),
    pint: detectProjectBinary(projectRoot, php, 'pint', [
      path.join('sectest', 'tools', 'vendor', 'bin', 'pint'),
      path.join('vendor', 'bin', 'pint'),
    ]),
  };
}

export function manifestLines(tools) {
  return Object.entries(tools).map(([name, tool]) =>
    tool.available
      ? `${name}: ${tool.version ?? '(sin versión)'} — ${tool.path}`
      : `${name}: BLOQUEADA — ${tool.reason}`,
  );
}

/** Manifiesto serializable para el informe (nombre, versión, ruta). */
export function manifestForReport(tools) {
  return Object.entries(tools).map(([name, tool]) => ({
    nombre: name,
    version: tool.available ? tool.version ?? '' : '',
    ruta: tool.available ? tool.path ?? '' : '',
  }));
}

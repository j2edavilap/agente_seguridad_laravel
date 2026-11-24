import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runTool } from './runner.js';

/**
 * Toolchain aislada: todo lo que el motor instale vive acá, nunca dentro del proyecto auditado.
 */
export function toolchainDir(env = process.env) {
  if (env.SECTEST_TOOLS_DIR) return env.SECTEST_TOOLS_DIR;
  const base = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'sectest', 'tools');
}

export function composerHome(env = process.env) {
  return env.COMPOSER_HOME || path.join(env.APPDATA || os.homedir(), 'Composer');
}

export function assertOutsideProject(projectRoot, target) {
  const project = path.resolve(projectRoot);
  const resolved = path.resolve(target);
  const relative = path.relative(project, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error(`instalación bloqueada dentro del proyecto auditado: ${resolved}`);
  }
  return resolved;
}

const PYTHON_MIN = { major: 3, minor: 8 };

export function pythonVersion(pythonPath) {
  if (!pythonPath) return null;
  const result = runTool({ command: pythonPath, args: ['--version'], timeoutMs: 10000 });
  const match = `${result.stdout}${result.stderr}`.match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function pythonSupported(version) {
  if (!version) return false;
  if (version.major > PYTHON_MIN.major) return true;
  return version.major === PYTHON_MIN.major && version.minor >= PYTHON_MIN.minor;
}

/**
 * Plan de instalación por herramienta. Función pura: no ejecuta nada.
 * `available` indica si existe una estrategia viable en esta máquina.
 */
export function planInstallations({
  tools,
  projectHas = { composerLock: false, packageLock: false },
  python = null,
  env = process.env,
}) {
  const plans = [];

  if (!tools.composer?.available) {
    plans.push({
      tool: 'composer-audit',
      strategy: 'none',
      available: false,
      reason: projectHas.composerLock
        ? 'composer no está disponible; no se puede analizar el lockfile'
        : 'no es una herramienta: falta composer.lock en el proyecto',
    });
  } else if (!projectHas.composerLock) {
    plans.push({
      tool: 'composer-audit',
      strategy: 'none',
      available: false,
      reason:
        'no es una herramienta: falta composer.lock. Generarlo con `composer update --lock` modifica el proyecto auditado y requiere decisión humana.',
    });
  }

  if (!tools.phpstan?.available) {
    const usable = Boolean(tools.php?.available && tools.composer?.available);
    plans.push({
      tool: 'phpstan',
      strategy: 'composer-global',
      available: usable,
      reason: usable
        ? 'se instala en COMPOSER_HOME, fuera del proyecto auditado'
        : 'requiere php y composer detectados',
      command: usable
        ? {
            command: tools.composer.invoke[0],
            args: [
              ...tools.composer.invoke.slice(1),
              'global',
              'require',
              'phpstan/phpstan',
              '--no-interaction',
              '--no-progress',
            ],
            cwd: toolchainDir(env),
          }
        : null,
    });
  }

  if (!tools.npm?.available || !projectHas.packageLock) {
    plans.push({
      tool: 'npm-audit',
      strategy: 'none',
      available: false,
      reason: projectHas.packageLock
        ? 'npm no está disponible en una forma ejecutable sin shell'
        : 'no es una herramienta: falta package-lock.json. Generarlo con `npm install --package-lock-only` modifica el proyecto y requiere decisión humana.',
    });
  }

  if (!tools.gitleaks?.available) {
    plans.push({
      tool: 'gitleaks',
      strategy: 'download-github-release',
      available: true,
      reason: 'descarga el binario oficial a la toolchain aislada; no toca el proyecto',
    });
  }

  if (!tools.semgrep?.available) {
    const usable = pythonSupported(python);
    plans.push({
      tool: 'semgrep',
      strategy: 'pip-user',
      available: usable,
      reason: usable
        ? `pip install --user semgrep (Python ${python.major}.${python.minor})`
        : `requiere Python >= ${PYTHON_MIN.major}.${PYTHON_MIN.minor}; en esta máquina hay ${python ? `${python.major}.${python.minor}` : 'ninguno'}. Alternativa: contenedor`,
    });
  }

  return plans;
}

function sha256Bytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function findExe(names) {
  const directories = String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findFileRecursive(directory, fileName) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(absolute, fileName);
      if (found) return found;
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return absolute;
    }
  }
  return null;
}

async function installGitleaks(toolchain, log) {
  const response = await fetch('https://api.github.com/repos/gitleaks/gitleaks/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'laravel-sec-engine' },
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status} al buscar la release`);
  const release = await response.json();

  const asset = (release.assets ?? []).find((candidate) =>
    /gitleaks_.*_windows_x64\.zip$/i.test(candidate.name ?? ''),
  );
  if (!asset) throw new Error('la release no trae un binario windows_x64.zip');

  const download = await fetch(asset.browser_download_url, { redirect: 'follow' });
  if (!download.ok) throw new Error(`descarga falló con ${download.status}`);
  const buffer = Buffer.from(await download.arrayBuffer());

  const destination = path.join(toolchain, 'gitleaks');
  mkdirSync(destination, { recursive: true });
  const archive = path.join(destination, asset.name);
  writeFileSync(archive, buffer);
  log.push(`descargado ${asset.name} (${buffer.length} bytes, sha256 ${sha256Bytes(buffer)})`);

  const tar = findExe(['tar.exe', 'tar']);
  if (!tar) throw new Error('no se encontró tar para extraer el zip');
  const extraction = runTool({ command: tar, args: ['-xf', archive, '-C', destination], timeoutMs: 60000 });
  if (!extraction.ok) throw new Error(`tar falló: ${extraction.stderr.split(/\r?\n/)[0]}`);

  const binary = findFileRecursive(destination, 'gitleaks.exe') ?? findFileRecursive(destination, 'gitleaks');
  if (!binary) throw new Error('no se encontró el ejecutable de gitleaks tras extraer');

  log.push(`gitleaks en ${binary}`);
  return { version: release.tag_name ?? null, path: binary };
}

function verifyPhpstan(env) {
  const phar = path.join(composerHome(env), 'vendor', 'phpstan', 'phpstan', 'phpstan.phar');
  return existsSync(phar) ? { path: phar } : null;
}

/**
 * Ejecuta un plan. Solo escribe en la toolchain; aborta si el destino cae dentro del proyecto.
 */
export async function executePlan(plan, { projectRoot, env = process.env, log = [] } = {}) {
  const toolchain = assertOutsideProject(projectRoot, toolchainDir(env));

  if (!plan.available || plan.strategy === 'none') {
    return { ok: false, tool: plan.tool, reason: plan.reason, log };
  }

  mkdirSync(toolchain, { recursive: true });

  if (plan.strategy === 'composer-global') {
    const result = runTool({ ...plan.command, timeoutMs: 300000 });
    const firstLine = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/)[0] ?? '';
    log.push(`composer global require: ${firstLine || `exit ${result.exitCode}`}`);
    if (!result.ok) {
      return { ok: false, tool: plan.tool, reason: `composer falló: ${firstLine}`, log };
    }
    const verified = verifyPhpstan(env);
    if (!verified) {
      return { ok: false, tool: plan.tool, reason: 'composer terminó pero no se encontró phpstan.phar', log };
    }
    return { ok: true, tool: plan.tool, path: verified.path, log };
  }

  if (plan.strategy === 'download-github-release' && plan.tool === 'gitleaks') {
    try {
      const installed = await installGitleaks(toolchain, log);
      return { ok: true, tool: plan.tool, path: installed.path, version: installed.version, log };
    } catch (error) {
      return { ok: false, tool: plan.tool, reason: error.message, log };
    }
  }

  if (plan.strategy === 'pip-user') {
    const python = findExe(['python.exe', 'python']);
    if (!python) return { ok: false, tool: plan.tool, reason: 'python no está en PATH', log };
    const result = runTool({
      command: python,
      args: ['-m', 'pip', 'install', '--user', 'semgrep'],
      timeoutMs: 600000,
    });
    log.push(`pip install --user semgrep: exit ${result.exitCode}`);
    if (!result.ok) {
      const firstLine = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/).pop() ?? '';
      return { ok: false, tool: plan.tool, reason: `pip falló: ${firstLine}`, log };
    }
    return { ok: true, tool: plan.tool, path: 'PATH (puede requerir reiniciar la consola)', log };
  }

  return { ok: false, tool: plan.tool, reason: `estrategia no soportada: ${plan.strategy}`, log };
}

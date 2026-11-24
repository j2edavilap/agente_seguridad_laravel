import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/**
 * Ejecuta una herramienta sin shell y sin heredar nada raro.
 * `shell: false` es obligatorio: impide inyección por argumentos y bloquea `.cmd`/`.bat`.
 */
export function runTool({ command, args = [], cwd, timeoutMs = 120000, env = {} }) {
  const started = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
      shell: false,
    });
    return {
      ok: true,
      exitCode: 0,
      stdout,
      stderr: '',
      durationMs: Date.now() - started,
      timedOut: false,
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: typeof error.status === 'number' ? error.status : null,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error.message ?? ''),
      durationMs: Date.now() - started,
      timedOut: error.killed === true || error.signal === 'SIGTERM' || error.signal === 'SIGKILL',
    };
  }
}

export function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

/** Primer intento de parseo JSON; devuelve null sin lanzar. */
export function tryParseJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Algunas herramientas imprimen avisos antes del JSON. Recorta desde el primer
 * '{' o '[' balanceado hasta el final lógico.
 */
export function extractJson(text) {
  const direct = tryParseJson(text);
  if (direct !== null) return direct;

  const source = String(text ?? '');
  for (const opener of ['{', '[']) {
    const start = source.indexOf(opener);
    if (start < 0) continue;
    const closer = opener === '{' ? '}' : ']';
    const end = source.lastIndexOf(closer);
    if (end > start) {
      const candidate = source.slice(start, end + 1);
      const parsed = tryParseJson(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

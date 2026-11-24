import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_DIRECTORIES = ['app', 'config', 'routes', 'database', 'resources'];
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'vendor',
  '.git',
  'storage',
  'build',
  'dist',
  'coverage',
]);
const SOURCE_EXTENSIONS = new Set(['.php', '.blade.php', '.json', '.yml', '.yaml']);
const MAX_FILE_BYTES = 1024 * 1024;

export const GREP_RULES = Object.freeze([
  {
    code: 'SEC',
    rule: 'EXEC',
    title: 'Ejecución de comandos del sistema',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-78',
    owasp: 'A03:2021',
    iso: 'A.8.28',
    pattern: /\b(?:exec|shell_exec|system|passthru|popen|proc_open|pcntl_exec)\s*\(/,
  },
  {
    code: 'SEC',
    rule: 'EVAL',
    title: 'Ejecución dinámica de código',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-95',
    owasp: 'A03:2021',
    iso: 'A.8.28',
    pattern: /\b(?:eval|assert|create_function)\s*\(/,
  },
  {
    code: 'SEC',
    rule: 'DESERIALIZE',
    title: 'Deserialización de datos no confiables',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-502',
    owasp: 'A08:2021',
    iso: 'A.8.28',
    pattern: /\b(?:unserialize|igbinary_unserialize)\s*\(/,
  },
  {
    code: 'SEC',
    rule: 'SQLRAW',
    title: 'Consulta SQL construida con concatenación',
    severity: 'medio',
    confidence: 'probable',
    cwe: 'CWE-89',
    owasp: 'A03:2021',
    iso: 'A.8.28',
    pattern: /\b(?:DB::raw|whereRaw|selectRaw|orderByRaw|havingRaw)\s*\(/,
  },
  {
    code: 'SEC',
    rule: 'WEAKCRYPTO',
    title: 'Criptografía débil o generador inseguro',
    severity: 'medio',
    confidence: 'probable',
    cwe: 'CWE-328',
    owasp: 'A02:2021',
    iso: 'A.8.24',
    pattern: /\b(?:md5|sha1|mt_rand|uniqid)\s*\(/,
  },
  {
    code: 'SEC',
    rule: 'CSRF-DISABLED',
    title: 'CSRF desactivado en middleware',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-352',
    owasp: 'A01:2021',
    iso: 'A.8.26',
    pattern: /withoutMiddleware\s*\(\s*\[?\s*PreventRequestForgery/,
  },
  {
    code: 'SEC',
    rule: 'HARDCODED-SECRET',
    title: 'Secreto embebido en el código',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-798',
    owasp: 'A07:2021',
    iso: 'A.8.24',
    mask: true,
    pattern: /(?:password|passwd|secret|api[_-]?key|token)['"]?\s*(?:=>|=)\s*['"][^'"]{6,}['"]/i,
  },
  {
    code: 'SEC',
    rule: 'PRIVATE-KEY',
    title: 'Clave privada en el repositorio',
    severity: 'critico',
    confidence: 'confirmado',
    cwe: 'CWE-321',
    owasp: 'A02:2021',
    iso: 'A.8.24',
    mask: true,
    pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  },
  {
    code: 'SEC',
    rule: 'DEBUG',
    title: 'Salida de depuración en el código',
    severity: 'bajo',
    confidence: 'confirmado',
    cwe: 'CWE-489',
    owasp: 'A05:2021',
    iso: 'A.8.9',
    pattern: /\b(?:dd|dump|var_dump|print_r|ray)\s*\(/,
  },
  {
    code: 'INF',
    rule: 'DEBUG-TRUE',
    title: 'Depuración activada en configuración',
    severity: 'alto',
    confidence: 'confirmado',
    cwe: 'CWE-489',
    owasp: 'A05:2021',
    iso: 'A.8.9',
    pattern: /['"]debug['"]\s*=>\s*true/i,
  },
  {
    code: 'INF',
    rule: 'ENV-OUTSIDE-CONFIG',
    title: 'Uso de env() fuera de config/',
    severity: 'bajo',
    confidence: 'probable',
    cwe: 'CWE-526',
    owasp: 'A05:2021',
    iso: 'A.8.9',
    pattern: /\benv\s*\(/,
    exclude: (relativePath) => relativePath.startsWith('config/'),
  },
]);

const REMEDIATION = Object.freeze({
  EXEC: 'Evitar el intérprete de shell: usar APIs específicas, escapar argumentos y validar contra lista blanca. Ejecutar con el mínimo privilegio.',
  EVAL: 'Eliminar la evaluación dinámica. Si el caso de uso es legítimo, reemplazarlo por un despachador explícito sobre valores permitidos.',
  DESERIALIZE: 'No deserializar entrada no confiable. Usar JSON (`json_decode`) y validar el esquema antes de consumir los datos.',
  SQLRAW: 'Usar bindings de parámetros (`where("col", $valor)`, `whereRaw("col = ?", [$valor])`). Nunca concatenar entrada del usuario.',
  WEAKCRYPTO: 'Usar `password_hash`/`Hash::make` para contraseñas, `random_bytes` o `Str::random` para tokens, y un hash moderno para integridad.',
  'CSRF-DISABLED': 'Quitar el `withoutMiddleware` sobre `PreventRequestForgery` en rutas que mutan estado; exceptuar solo webhooks con firma verificada.',
  'HARDCODED-SECRET': 'Rotar el secreto, moverlo a `sectest/scope/credentials.conf` o a un gestor de secretos y leerlo por configuración, nunca del código.',
  'PRIVATE-KEY': 'Rotar la clave inmediatamente, eliminarla del historial del repositorio y almacenarla fuera de línea con permisos restringidos.',
  DEBUG: 'Quitar la salida de depuración del código. Usar el logger con niveles y sin datos personales.',
  'DEBUG-TRUE': 'Fijar `debug => false` y controlarlo por variable de entorno. `APP_DEBUG=true` en producción expone stack traces y configuración.',
  'ENV-OUTSIDE-CONFIG': 'Acceder por `config("archivo.clave")` y declarar el valor en `config/`. `env()` devuelve null cuando la configuración está cacheada.',
});

function ruleRemediation(ruleName) {
  return REMEDIATION[ruleName] ?? 'Revisar el hallazgo y aplicar la corrección indicada por la regla.';
}

function isSourceFile(name) {
  if (name === '.env' || name.startsWith('.env.')) return true;
  return [...SOURCE_EXTENSIONS].some((extension) => name.endsWith(extension));
}

function walk(directory, root, files) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(absolute, root, files);
      continue;
    }
    if (!entry.isFile() || !isSourceFile(entry.name)) continue;
    try {
      const stats = statSync(absolute);
      if (stats.size > MAX_FILE_BYTES) continue;
    } catch {
      continue;
    }
    files.push(absolute);
  }
}

function maskQuoted(line) {
  return line.replace(/(['"])([^'"]{6,})\1/g, (match, quote, value) => `${quote}${value.slice(0, 2)}***${value.slice(-2)}${quote}`);
}

function trimEvidence(line) {
  const compact = line.replace(/\s+/g, ' ').trim();
  return compact.length > 240 ? `${compact.slice(0, 240)}…` : compact;
}

export function scanProject(projectRoot) {
  const files = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const absolute = path.join(projectRoot, directory);
    try {
      if (statSync(absolute).isDirectory()) walk(absolute, projectRoot, files);
    } catch {
      // directorio ausente: no es un error, el proyecto puede no tenerlo
    }
  }

  const findings = [];
  const seen = new Set();
  let loc = 0;

  for (const file of files) {
    const relative = path.relative(projectRoot, file).split(path.sep).join('/');
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    loc += lines.length;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      for (const rule of GREP_RULES) {
        if (rule.exclude && rule.exclude(relative)) continue;
        if (!rule.pattern.test(line)) continue;

        const key = `${rule.rule}|${relative}|${index + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          code: rule.code,
          rule: rule.rule,
          title: rule.title,
          severity: rule.severity,
          confidence: rule.confidence,
          cwe: rule.cwe,
          owasp: rule.owasp,
          iso: rule.iso,
          file: relative,
          line: index + 1,
          evidence: trimEvidence(rule.mask ? maskQuoted(line) : line),
          remediation: ruleRemediation(rule.rule),
        });
      }
    }
  }

  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule),
  );

  return { findings, filesScanned: files.length, loc };
}

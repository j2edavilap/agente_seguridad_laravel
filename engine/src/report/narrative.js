const BY_RULE = {
  EXEC: {
    description:
      'Llamada a una función que ejecuta comandos del sistema con datos que pueden ser controlados por el usuario.',
    impact:
      'Permite ejecución de comandos arbitrarios en el servidor con los privilegios del proceso PHP.',
    reproduction:
      'Localizar la llamada en el archivo indicado y repetir la petición que alimenta el parámetro.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  EVAL: {
    description: 'Evaluación dinámica de código con entrada que puede ser controlada por el usuario.',
    impact: 'Permite ejecutar código arbitrario dentro del proceso de la aplicación.',
    reproduction: 'Enviar el valor que llega a la función y observar si se interpreta como código.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  DESERIALIZE: {
    description: 'Deserialización de datos no confiables.',
    impact: 'Puede permitir ejecución de código o manipulación de objetos internos.',
    reproduction: 'Enviar un valor serializado controlado al punto indicado y observar el comportamiento.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  SQLRAW: {
    description: 'Consulta SQL construida con concatenación de datos.',
    impact: 'Permite alterar la consulta y acceder a datos fuera del alcance previsto.',
    reproduction: 'Enviar un valor con comillas o booleanos al parámetro y comparar la respuesta.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  WEAKCRYPTO: {
    description: 'Uso de criptografía débil o generador inseguro.',
    impact: 'Los valores derivados pueden predecirse o revertirse con relativa facilidad.',
    reproduction: 'Identificar el uso en el archivo y verificar el algoritmo o la fuente de aleatoriedad.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  'CSRF-DISABLED': {
    description: 'Middleware de protección CSRF desactivado en una ruta que muta estado.',
    impact: 'Un sitio externo puede forzar acciones autenticadas en nombre del usuario.',
    reproduction: 'Enviar una petición de cambio de estado sin token desde otro origen.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  'HARDCODED-SECRET': {
    description: 'Secreto embebido en el código fuente.',
    impact: 'Quien lea el repositorio obtiene la credencial y puede usarla.',
    reproduction: 'Localizar la línea indicada y confirmar que el valor es una credencial real.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  'PRIVATE-KEY': {
    description: 'Clave privada presente en el repositorio.',
    impact: 'Permite suplantar la identidad asociada a la clave.',
    reproduction: 'Localizar el archivo y verificar que la clave es privada y está versionada.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  DEBUG: {
    description: 'Salida de depuración en el código.',
    impact: 'Puede exponer datos internos o personales en respuestas y logs.',
    reproduction: 'Ejecutar la ruta que contiene la llamada y revisar la salida.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  'DEBUG-TRUE': {
    description: 'Modo de depuración activado en configuración.',
    impact: 'Expone trazas, rutas y configuración cuando ocurre un error.',
    reproduction: 'Provocar un error controlado y observar la respuesta.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
  'ENV-OUTSIDE-CONFIG': {
    description: 'Uso de env() fuera de config/.',
    impact: 'Devuelve null cuando la configuración está cacheada y puede romper el flujo.',
    reproduction: 'Ejecutar con `config:cache` y revisar el valor que recibe la función.',
    source: 'Fase 1 · escaneo estático (grep-fallback)',
  },
};

const BY_PREFIX = {
  COMPOSER: {
    description: 'Dependencia de Composer con un aviso de seguridad conocido.',
    impact: 'La versión instalada contiene una vulnerabilidad publicada.',
    reproduction: 'Ejecutar `composer audit --format=json` y filtrar por el paquete indicado.',
    source: 'Fase 1 · composer audit',
  },
  NPM: {
    description: 'Dependencia de npm con una vulnerabilidad conocida.',
    impact: 'La versión instalada contiene una vulnerabilidad publicada.',
    reproduction: 'Ejecutar `npm audit --json` y filtrar por el paquete indicado.',
    source: 'Fase 1 · npm audit',
  },
  PHPSTAN: {
    description: 'Error reportado por el análisis estático.',
    impact: 'Puede indicar un fallo lógico, un tipo incorrecto o una ruta no cubierta.',
    reproduction: 'Ejecutar `phpstan analyse --error-format=json` sobre el archivo indicado.',
    source: 'Fase 1 · phpstan',
  },
  GITLEAKS: {
    description: 'Secreto detectado por gitleaks.',
    impact: 'El valor permite autenticarse contra el servicio asociado.',
    reproduction: 'Ejecutar `gitleaks detect --no-git --redact` sobre el archivo indicado.',
    source: 'Fase 1 · gitleaks',
  },
};

const BY_TITLE = {
  'HSTS ausente': {
    description: 'La respuesta no incluye Strict-Transport-Security.',
    impact: 'Permite degradar la conexión a HTTP y facilitar la intercepción.',
    reproduction: 'Solicitar la URL base y revisar las cabeceras de respuesta.',
  },
  'Content-Security-Policy ausente': {
    description: 'La respuesta no define Content-Security-Policy.',
    impact: 'El navegador no tiene una política que limite scripts y orígenes.',
    reproduction: 'Solicitar la URL base y revisar las cabeceras de respuesta.',
  },
  'Cookie sin Secure': {
    description: 'La cookie de sesión no declara el atributo Secure.',
    impact: 'Puede viajar por HTTP y ser interceptada.',
    reproduction: 'Iniciar sesión y revisar el Set-Cookie de la respuesta.',
  },
  'Cookie sin HttpOnly': {
    description: 'La cookie de sesión no declara HttpOnly.',
    impact: 'Un script inyectado puede leerla.',
    reproduction: 'Iniciar sesión y revisar el Set-Cookie de la respuesta.',
  },
  'Cookie sin SameSite': {
    description: 'La cookie de sesión no declara SameSite.',
    impact: 'Puede enviarse en peticiones cruzadas y habilitar CSRF.',
    reproduction: 'Iniciar sesión y revisar el Set-Cookie de la respuesta.',
  },
  'CORS refleja cualquier origen': {
    description: 'La respuesta refleja el origen recibido en Access-Control-Allow-Origin.',
    impact: 'Cualquier sitio puede leer respuestas autenticadas.',
    reproduction: 'Enviar `Origin: https://evil.example` y revisar la cabecera.',
  },
  'HTTP sirve contenido sin redirigir a HTTPS': {
    description: 'La URL HTTP responde contenido en lugar de redirigir a HTTPS.',
    impact: 'Permite tráfico en claro y manipulación en tránsito.',
    reproduction: 'Solicitar la URL con http:// y revisar el código de estado.',
  },
  'Archivo .env expuesto': {
    description: 'El servidor entrega el archivo .env por HTTP.',
    impact: 'Expone credenciales, claves y configuración completa.',
    reproduction: 'Solicitar `/.env` y verificar que responde 200.',
  },
  'Metadatos de git expuestos': {
    description: 'El servidor entrega `.git/config`.',
    impact: 'Permite reconstruir el repositorio y obtener su historial.',
    reproduction: 'Solicitar `/.git/config` y verificar que responde 200.',
  },
  'La sesión sobrevive al logout': {
    description: 'La cookie de sesión sigue siendo válida después del cierre.',
    impact: 'Un token robado permanece utilizable.',
    reproduction: 'Cerrar sesión con la cookie actual y reutilizarla en una ruta protegida.',
  },
  'Error 5xx con sesión autenticada': {
    description: 'Una ruta GET devuelve 5xx con sesión válida.',
    impact: 'Indica un fallo no controlado que puede filtrar trazas o romper el flujo.',
    reproduction: 'Repetir la petición con la sesión indicada y revisar el log del servidor.',
  },
  'Pruebas automatizadas fallidas': {
    description: 'La suite reporta pruebas fallidas.',
    impact: 'El contrato que la prueba verificaba no se cumple.',
    reproduction: 'Ejecutar `sectest/tools/vendor/bin/phpunit -c sectest/tests/phpunit.xml`.',
    source: 'Fase 4 · calidad',
  },
  'Código fuera del estándar de estilo': {
    description: 'Pint detecta archivos fuera del estándar.',
    impact: 'Aumenta la deuda y dificulta la revisión.',
    reproduction: 'Ejecutar `vendor/bin/pint --test`.',
    source: 'Fase 4 · calidad',
  },
};

function generic(finding) {
  const location = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
  return {
    description: finding.title,
    impact:
      'Debilita un control de seguridad, configuración o calidad y requiere revisión manual.',
    reproduction: `Revisar ${location} y repetir la comprobación con la herramienta que lo detectó.`,
    source: 'Auditoría',
  };
}

export function narrativeFor(finding) {
  const rule = String(finding.rule ?? '');
  const prefix = Object.keys(BY_PREFIX).find((key) => rule.startsWith(key));
  const byTitle = BY_TITLE[finding.title] ?? null;

  const base = BY_RULE[rule] ?? (prefix ? BY_PREFIX[prefix] : null) ?? byTitle ?? generic(finding);

  return {
    description: base.description ?? finding.title,
    impact: base.impact,
    reproduction:
      base.reproduction ??
      `Revisar ${finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file} y repetir la comprobación.`,
    source: base.source ?? finding.source ?? 'Auditoría',
  };
}

/** Completa los campos narrativos y elimina cualquier propuesta de solución. */
export function enrichFindings(findings = []) {
  return findings.map((finding) => {
    const narrative = narrativeFor(finding);
    const { remediation, ...rest } = finding;
    return {
      ...rest,
      description: finding.description ?? narrative.description,
      impact: finding.impact ?? narrative.impact,
      reproduction: finding.reproduction ?? narrative.reproduction,
      source: finding.source ?? narrative.source,
    };
  });
}

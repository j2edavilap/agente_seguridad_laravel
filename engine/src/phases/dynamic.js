import { createClient } from '../http/client.js';
import { isConfigured, withSecret } from '../policy/credentials.js';
import { loginAs, planUrl } from '../policy/session.js';
import { assertAllowedTarget } from '../policy/target.js';
import { enrichFindings } from '../report/narrative.js';

const HEADER_RULES = [
  {
    header: 'strict-transport-security',
    severity: 'medio',
    title: 'HSTS ausente',
    cwe: 'CWE-319',
    owasp: 'A02:2021',
    remediation: 'Enviar `Strict-Transport-Security: max-age=31536000; includeSubDomains` en HTTPS.',
  },
  {
    header: 'content-security-policy',
    severity: 'medio',
    title: 'Content-Security-Policy ausente',
    cwe: 'CWE-693',
    owasp: 'A05:2021',
    remediation: "Definir `Content-Security-Policy` con `default-src 'self'` y sin `unsafe-inline` ni `unsafe-eval`.",
  },
  {
    header: 'x-content-type-options',
    severity: 'bajo',
    title: 'X-Content-Type-Options ausente o incorrecto',
    cwe: 'CWE-693',
    owasp: 'A05:2021',
    expected: 'nosniff',
    remediation: 'Enviar `X-Content-Type-Options: nosniff`.',
  },
  {
    header: 'x-frame-options',
    severity: 'medio',
    title: 'Protección contra framing ausente',
    cwe: 'CWE-1021',
    owasp: 'A05:2021',
    satisfiedByCsp: true,
    remediation: 'Enviar `X-Frame-Options: DENY` o `Content-Security-Policy: frame-ancestors ...`.',
  },
  {
    header: 'referrer-policy',
    severity: 'bajo',
    title: 'Referrer-Policy ausente',
    cwe: 'CWE-200',
    owasp: 'A01:2021',
    remediation: 'Enviar `Referrer-Policy: no-referrer` o `strict-origin-when-cross-origin`.',
  },
  {
    header: 'permissions-policy',
    severity: 'bajo',
    title: 'Permissions-Policy ausente',
    cwe: 'CWE-693',
    owasp: 'A05:2021',
    remediation: 'Enviar `Permissions-Policy` limitando cámara, micrófono y geolocalización.',
  },
];

const EXPOSED_PATHS = [
  { path: '/.env', severity: 'critico', title: 'Archivo .env expuesto' },
  { path: '/.env.backup', severity: 'critico', title: 'Copia de .env expuesta' },
  { path: '/.git/config', severity: 'critico', title: 'Metadatos de git expuestos' },
  { path: '/storage/logs/laravel.log', severity: 'alto', title: 'Log de aplicación expuesto' },
  { path: '/phpinfo.php', severity: 'alto', title: 'phpinfo expuesto' },
  { path: '/backup.sql', severity: 'alto', title: 'Volcado SQL expuesto' },
  { path: '/backup.zip', severity: 'alto', title: 'Archivo comprimido de respaldo expuesto' },
  { path: '/server-status', severity: 'medio', title: 'Estado del servidor expuesto' },
  { path: '/composer.json', severity: 'bajo', title: 'composer.json expuesto' },
  { path: '/composer.lock', severity: 'bajo', title: 'composer.lock expuesto' },
  { path: '/.DS_Store', severity: 'bajo', title: '.DS_Store expuesto' },
  { path: '/vendor/', severity: 'medio', title: 'Directorio vendor expuesto' },
];

const CORS_ORIGIN = 'https://evil.example';

function makeFinding({ title, severity, cwe, owasp, iso = 'A.8.26', file, evidence, remediation, confidence = 'confirmado' }) {
  return {
    code: 'SEC',
    rule: 'DYNAMIC',
    title,
    severity,
    confidence,
    cwe,
    owasp,
    iso,
    file,
    line: 0,
    evidence,
    remediation,
  };
}

function headerRules(headers) {
  const findings = [];
  for (const rule of HEADER_RULES) {
    const value = headers[rule.header];

    if (rule.satisfiedByCsp && !value && headers['content-security-policy']?.includes('frame-ancestors')) {
      continue;
    }
    if (rule.header === 'x-frame-options' && value) continue;

    if (!value) {
      findings.push(
        makeFinding({
          title: rule.title,
          severity: rule.severity,
          cwe: rule.cwe,
          owasp: rule.owasp,
          file: 'GET /',
          evidence: `cabecera ${rule.header} ausente`,
          remediation: rule.remediation,
        }),
      );
      continue;
    }

    if (rule.expected && value.trim().toLowerCase() !== rule.expected) {
      findings.push(
        makeFinding({
          title: rule.title,
          severity: rule.severity,
          cwe: rule.cwe,
          owasp: rule.owasp,
          file: 'GET /',
          evidence: `${rule.header}: ${value}`,
          remediation: rule.remediation,
        }),
      );
    }
  }

  for (const leak of ['server', 'x-powered-by']) {
    if (headers[leak]) {
      findings.push(
        makeFinding({
          title: `Cabecera que revela tecnología: ${leak}`,
          severity: 'informativo',
          cwe: 'CWE-200',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: `${leak}: ${headers[leak]}`,
          remediation: 'Ocultar las cabeceras `Server` y `X-Powered-By` en el servidor.',
        }),
      );
    }
  }

  return findings;
}

function cookieFindings(setCookies) {
  const findings = [];
  for (const cookie of setCookies) {
    const name = String(cookie).split('=')[0].trim();
    const lower = String(cookie).toLowerCase();
    if (!/;\s*secure\b/.test(lower)) {
      findings.push(
        makeFinding({
          title: 'Cookie sin Secure',
          severity: 'medio',
          cwe: 'CWE-614',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: `cookie ${name}`,
          remediation: 'Marcar las cookies de sesión con `Secure`.',
        }),
      );
    }
    if (!/;\s*httponly\b/.test(lower)) {
      findings.push(
        makeFinding({
          title: 'Cookie sin HttpOnly',
          severity: 'medio',
          cwe: 'CWE-1004',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: `cookie ${name}`,
          remediation: 'Marcar las cookies de sesión con `HttpOnly`.',
        }),
      );
    }
    if (!/;\s*samesite\b/.test(lower)) {
      findings.push(
        makeFinding({
          title: 'Cookie sin SameSite',
          severity: 'bajo',
          cwe: 'CWE-1275',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: `cookie ${name}`,
          remediation: 'Marcar las cookies de sesión con `SameSite=Lax` o `Strict`.',
        }),
      );
    }
  }
  return findings;
}

export async function runDynamicPhase({
  baseUrl,
  whitelist = [],
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
  maxRequests = 40,
  plan = null,
  credentials = new Map(),
  allowEnumeration = false,
}) {
  assertAllowedTarget(baseUrl, { whitelist });

  const smokeBudget = plan?.smoke?.length ?? 0;
  const enumerationBudget = allowEnumeration
    ? (plan?.enumerate ?? []).reduce(
        (acc, item) => acc + Math.min(item.to - item.from + 1, 100),
        0,
      )
    : 0;

  const client = createClient({
    whitelist,
    timeoutMs,
    fetchImpl,
    maxRequests: Math.min(300, maxRequests + smokeBudget + enumerationBudget),
    allowedMethods: plan?.login || plan?.logout ? ['GET', 'POST'] : ['GET'],
  });
  const checks = [];
  const findings = [];
  const evidence = [];

  async function runCheck(name, fn) {
    const start = client.transcripts.length;
    try {
      const result = await fn();
      const produced = result?.findings ?? [];
      findings.push(...produced);
      checks.push({
        name,
        status: result?.status ?? 'ejecutada',
        findings: produced.length,
        note: result?.note ?? null,
        hash: null,
      });
    } catch (error) {
      checks.push({
        name,
        status: 'bloqueada',
        findings: 0,
        note: error.message,
        hash: null,
      });
    } finally {
      evidence.push({ check: name, requests: client.transcripts.slice(start) });
    }
  }

  let baseResponse = null;

  await runCheck('security-headers', async () => {
    baseResponse = await client.request(baseUrl);
    return { findings: headerRules(baseResponse.response_headers) };
  });

  await runCheck('cookie-flags', async () => {
    const cookies = baseResponse?.set_cookie ?? [];
    if (cookies.length === 0) return { findings: [], note: 'sin Set-Cookie en la respuesta base' };
    return { findings: cookieFindings(cookies) };
  });

  await runCheck('cors', async () => {
    const response = await client.request(baseUrl, { headers: { Origin: CORS_ORIGIN } });
    const allowOrigin = response.response_headers['access-control-allow-origin'];
    const allowCredentials = response.response_headers['access-control-allow-credentials'];
    const produced = [];

    if (allowOrigin === CORS_ORIGIN) {
      produced.push(
        makeFinding({
          title: 'CORS refleja cualquier origen',
          severity: 'alto',
          cwe: 'CWE-942',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: `Access-Control-Allow-Origin: ${allowOrigin}`,
          remediation: 'No reflejar el origen recibido. Usar una lista blanca explícita.',
        }),
      );
    } else if (allowOrigin === '*' && allowCredentials === 'true') {
      produced.push(
        makeFinding({
          title: 'CORS comodín con credenciales',
          severity: 'alto',
          cwe: 'CWE-942',
          owasp: 'A05:2021',
          file: 'GET /',
          evidence: 'Access-Control-Allow-Origin: * + Access-Control-Allow-Credentials: true',
          remediation: 'No combinar `*` con credenciales; usar una lista blanca explícita.',
        }),
      );
    }

    return { findings: produced };
  });

  await runCheck('https-redirect', async () => {
    if (!/^https:/i.test(baseUrl)) {
      return { status: 'bloqueada', findings: [], note: 'la URL base no es https' };
    }
    const httpUrl = baseUrl.replace(/^https:/i, 'http:');
    const response = await client.request(httpUrl, { followRedirects: false });

    if (response.status >= 300 && response.status < 400 && /^https:/i.test(response.location ?? '')) {
      return { findings: [] };
    }
    if (response.status >= 200 && response.status < 300) {
      return {
        findings: [
          makeFinding({
            title: 'HTTP sirve contenido sin redirigir a HTTPS',
            severity: 'alto',
            cwe: 'CWE-319',
            owasp: 'A02:2021',
            file: 'GET http://…',
            evidence: `HTTP respondió ${response.status}`,
            remediation: 'Redirigir 301/308 de HTTP a HTTPS y no servir contenido por HTTP.',
          }),
        ],
      };
    }
    return { findings: [], note: `HTTP respondió ${response.status}` };
  });

  await runCheck('exposed-files', async () => {
    const produced = [];
    const skipped = [];

    for (const target of EXPOSED_PATHS) {
      const url = new URL(target.path, baseUrl).toString();
      try {
        const response = await client.request(url, { followRedirects: false });
        if (response.status >= 200 && response.status < 300) {
          produced.push(
            makeFinding({
              title: target.title,
              severity: target.severity,
              cwe: 'CWE-538',
              owasp: 'A05:2021',
              file: `GET ${target.path}`,
              evidence: `HTTP ${response.status}, ${response.body.length} bytes (primeras líneas omitidas)`,
              remediation: 'Bloquear la ruta en el servidor y mover el archivo fuera de `public/`.',
            }),
          );
        }
      } catch (error) {
        if (/presupuesto/.test(error.message)) throw error;
        skipped.push(`${target.path}: ${error.message}`);
      }
    }

    return {
      findings: produced,
      note: skipped.length > 0 ? `${skipped.length} ruta(s) no evaluada(s)` : null,
    };
  });

  const sessions = {};
  const ROLE_KEYS = { user: 'USER', userB: 'USER_B', admin: 'ADMIN' };

  if (plan?.login) {
    await runCheck('auth-login', async () => {
      const notes = [];
      for (const role of ['user', 'userB', 'admin']) {
        const prefix = ROLE_KEYS[role];
        const username = credentials.get(`SECTEST_${prefix}_USERNAME`);
        if (!username || !isConfigured(credentials, `SECTEST_${prefix}_PASSWORD`)) {
          notes.push(`${role}: sin credenciales`);
          continue;
        }
        try {
          const password = await withSecret(credentials, `SECTEST_${prefix}_PASSWORD`, (secret) => secret);
          sessions[role] = await loginAs({ client, baseUrl, login: plan.login, username, password });
        } catch (error) {
          notes.push(`${role}: ${error.message}`);
        }
      }
      if (Object.keys(sessions).length === 0) {
        throw new Error(`ningún rol pudo iniciar sesión (${notes.join('; ')})`);
      }
      return { findings: [], note: notes.length > 0 ? notes.join('; ') : null };
    });
  }

  if (plan?.adminEndpoints?.length) {
    await runCheck('authz-admin', async () => {
      if (!sessions.user) {
        return { status: 'bloqueada', findings: [], note: 'sin sesión de usuario normal' };
      }
      const produced = [];
      for (const endpoint of plan.adminEndpoints) {
        const response = await client.request(planUrl(baseUrl, endpoint.url), {
          headers: { cookie: sessions.user.cookie },
        });
        const expected = endpoint.expect ?? [403];
        if (response.status >= 200 && response.status < 300 && !expected.includes(response.status)) {
          produced.push(
            makeFinding({
              title: 'Escalada vertical: usuario normal accede a endpoint administrativo',
              severity: 'alto',
              cwe: 'CWE-285',
              owasp: 'A01:2021',
              file: `GET ${endpoint.url}`,
              evidence: `${endpoint.name}: HTTP ${response.status}`,
              remediation:
                'Aplicar autorización por rol en el endpoint, no solo ocultar el enlace en la interfaz.',
            }),
          );
        }
      }
      return { findings: produced };
    });
  }

  if (plan?.crossAccess?.length) {
    await runCheck('authz-idor', async () => {
      const produced = [];
      let evaluated = 0;

      for (const item of plan.crossAccess) {
        const actor = item.as ?? 'user';
        const actorSession = sessions[actor];
        if (!actorSession) continue;

        const response = await client.request(planUrl(baseUrl, item.url), {
          headers: { cookie: actorSession.cookie },
        });
        const expected = item.expect ?? [403, 404];
        const accessible = response.status >= 200 && response.status < 300;
        if (!accessible || expected.includes(response.status)) continue;

        let confirmed = false;
        let evidence = `HTTP ${response.status} como ${actor}`;
        const owner = item.owner;

        if (owner && owner !== actor && sessions[owner]) {
          const control = await client.request(planUrl(baseUrl, item.url), {
            headers: { cookie: sessions[owner].cookie },
          });
          confirmed = control.status >= 200 && control.status < 300;
          evidence += `; control como ${owner}: HTTP ${control.status}`;
        } else {
          evidence += '; sin control positivo (falta owner o su sesión)';
        }

        evaluated += 1;
        produced.push(
          makeFinding({
            title: `Acceso a recurso ajeno: ${item.name}`,
            severity: confirmed ? 'alto' : 'medio',
            confidence: confirmed ? 'confirmado' : 'probable',
            cwe: 'CWE-639',
            owasp: 'A01:2021',
            file: `GET ${item.url}`,
            evidence,
            remediation:
              'Verificar la propiedad del recurso en la policy o form request, no solo la autenticación.',
          }),
        );
      }

      return { findings: produced, note: `${evaluated} recurso(s) evaluado(s)` };
    });
  }

  if (plan?.logout) {
    await runCheck('auth-logout', async () => {
      if (!sessions.user) {
        return { status: 'bloqueada', findings: [], note: 'sin sesión de usuario normal' };
      }
      await client.request(planUrl(baseUrl, plan.logout.url), {
        method: 'POST',
        headers: { cookie: sessions.user.cookie },
        body: '',
      });
      const after = await client.request(planUrl(baseUrl, plan.logout.protectedUrl), {
        headers: { cookie: sessions.user.cookie },
      });
      const produced = [];
      if (after.status >= 200 && after.status < 300) {
        produced.push(
          makeFinding({
            title: 'La sesión sobrevive al logout',
            severity: 'medio',
            cwe: 'CWE-613',
            owasp: 'A07:2021',
            file: `GET ${plan.logout.protectedUrl}`,
            evidence: `reutilizando la cookie tras el logout: HTTP ${after.status}`,
            remediation:
              'Invalidar la sesión en el servidor y regenerar el identificador al cerrar sesión.',
          }),
        );
      }
      return { findings: produced };
    });
  }

  if (plan?.smoke?.length) {
    await runCheck('auth-smoke', async () => {
      if (!sessions.user) {
        return { status: 'bloqueada', findings: [], note: 'sin sesión de usuario normal' };
      }

      const produced = [];
      for (const path of plan.smoke.slice(0, 50)) {
        const response = await client.request(planUrl(baseUrl, path), {
          headers: { cookie: sessions.user.cookie },
        });
        if (response.status >= 500) {
          produced.push(
            makeFinding({
              title: 'Error 5xx con sesión autenticada',
              severity: 'medio',
              cwe: 'CWE-755',
              owasp: 'A05:2021',
              file: `GET ${path}`,
              evidence: `HTTP ${response.status} autenticado`,
              remediation:
                'Revisar el log del servidor para esa ruta: un 5xx con sesión indica un fallo no controlado.',
            }),
          );
        }
      }

      return {
        findings: produced,
        note: `${Math.min(plan.smoke.length, 50)} ruta(s) recorrida(s) con sesión`,
      };
    });
  }

  if (plan?.enumerate?.length && !allowEnumeration) {
    checks.push({
      name: 'authz-enumerate',
      status: 'bloqueada',
      findings: 0,
      note: 'falta la casilla "Enumeración controlada de IDs" en la sección 6',
    });
  } else if (allowEnumeration && plan?.enumerate?.length) {
    await runCheck('authz-enumerate', async () => {
      const actorSession = sessions.user ?? sessions.userB ?? sessions.admin;
      if (!actorSession) {
        return { status: 'bloqueada', findings: [], note: 'sin sesión para enumerar' };
      }

      const produced = [];
      let tested = 0;

      for (const item of plan.enumerate) {
        const session = sessions[item.as ?? 'user'] ?? actorSession;
        const limit = Math.min(item.to, item.from + 99);

        for (let id = item.from; id <= limit; id += 1) {
          const path = item.urlTemplate.replace('{id}', String(id));
          const response = await client.request(planUrl(baseUrl, path), {
            headers: { cookie: session.cookie },
          });
          tested += 1;

          const expected = item.expect ?? [403, 404];
          const accessible = response.status >= 200 && response.status < 300;
          if (accessible && !expected.includes(response.status)) {
            produced.push(
              makeFinding({
                title: `ID enumerado accesible: ${item.name}`,
                severity: 'medio',
                confidence: 'probable',
                cwe: 'CWE-639',
                owasp: 'A01:2021',
                file: `GET ${path}`,
                evidence: `ID ${id} respondió HTTP ${response.status} (sin control positivo del dueño)`,
                remediation:
                  'Verificar la propiedad del recurso. La enumeración autorizada no confirma el dueño: validar con dos usuarios.',
              }),
            );
            if (produced.length >= 5) break;
          }
        }

        if (produced.length >= 5) break;
      }

      return { findings: produced, note: `${tested} ID(s) probado(s), ${produced.length} accesible(s)` };
    });
  }

  findings.splice(0, findings.length, ...enrichFindings(findings));
  findings.sort(
    (a, b) =>
      String(a.file).localeCompare(String(b.file)) ||
      String(a.title).localeCompare(String(b.title)) ||
      String(a.evidence).localeCompare(String(b.evidence)),
  );
  findings.forEach((finding, index) => {
    finding.id = `A03-${finding.code}-${String(index + 1).padStart(3, '0')}`;
  });

  const hallazgos = { critico: 0, alto: 0, medio: 0, bajo: 0, informativo: 0 };
  const confirmados = { critico: 0, alto: 0, medio: 0, bajo: 0, informativo: 0 };
  for (const finding of findings) {
    hallazgos[finding.severity] += 1;
    if (finding.confidence === 'confirmado') confirmados[finding.severity] += 1;
  }

  const bloqueadas = checks.filter((check) => check.status === 'bloqueada').length;
  const fallidas = checks.filter((check) => check.status === 'ejecutada' && check.findings > 0).length;

  const contract = {
    subagente: 'A-DYNAMIC',
    fase: '3',
    pruebas_ejecutadas: checks.length,
    pruebas_aprobadas: Math.max(0, checks.length - fallidas - bloqueadas),
    pruebas_fallidas: fallidas,
    pruebas_bloqueadas: bloqueadas,
    hallazgos,
    hallazgos_confirmados: Object.values(confirmados).reduce((acc, value) => acc + value, 0),
    confirmados,
    falsos_positivos: 0,
    metricas: {
      cobertura_lineas_pct: null,
      pruebas_totales: null,
      pruebas_aprobadas_n: null,
      errores_estaticos: null,
      kloc_analizado: null,
      violaciones_estilo: null,
      controles_aplicables: null,
      controles_conformes: null,
      controles_no_probados: null,
    },
    ids_hallazgos: findings.map((finding) => finding.id),
    archivo_reporte: 'sectest/reports/A-03-DYNAMIC.md',
  };

  return { contract, findings, checks, evidence };
}

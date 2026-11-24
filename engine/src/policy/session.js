export function planUrl(baseUrl, target) {
  return new URL(target, baseUrl).toString();
}

/**
 * Autentica un rol y devuelve la cookie de sesión. No registra la contraseña:
 * el cuerpo del request queda como hash en la evidencia.
 */
export async function loginAs({ client, baseUrl, login, username, password }) {
  let csrfToken = null;
  if (login.csrf) {
    const page = await client.request(planUrl(baseUrl, login.csrf.url ?? login.url));
    const match = page.body.match(new RegExp(login.csrf.pattern));
    if (!match) throw new Error('no se pudo extraer el token CSRF');
    csrfToken = match[1];
  }

  const fields = {};
  for (const [key, value] of Object.entries(login.fields)) {
    fields[key] = value === '{{username}}' ? username : value === '{{password}}' ? password : value;
  }
  if (csrfToken && login.csrf?.field) fields[login.csrf.field] = csrfToken;

  const isJson = (login.contentType ?? 'form') === 'json';
  const body = isJson ? JSON.stringify(fields) : new URLSearchParams(fields).toString();

  const response = await client.request(planUrl(baseUrl, login.url), {
    method: login.method ?? 'POST',
    headers: { 'content-type': isJson ? 'application/json' : 'application/x-www-form-urlencoded' },
    body,
    followRedirects: false,
  });

  const allowed = login.successStatus ?? [200, 301, 302, 303];
  if (!allowed.includes(response.status)) {
    throw new Error(`el login respondió ${response.status}`);
  }

  const cookie = response.rawSetCookie
    .map((value) => String(value).split(';')[0])
    .join('; ');
  if (!cookie) throw new Error('el login no devolvió cookie de sesión');
  return { cookie };
}

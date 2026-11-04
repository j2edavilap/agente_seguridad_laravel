# 05 — Checklist de controles para Laravel 13 / PHP 8.5

Checklist operativa. Cada fila es una prueba con resultado esperado y su referencia normativa.
El agente marca `aprobada`, `fallida` o `bloqueada`; nunca deja una fila sin estado.

## A. Estático (sec-static)

| # | Control | Esperado | Ref |
|---|---|---|---|
| S1 | `composer audit` sin avisos críticos/altos | 0 críticos, 0 altos | A.8.8 |
| S2 | `npm audit` (si hay frontend) | 0 críticos | A.8.8 |
| S3 | Sin paquetes abandonados | 0 | A.8.8 |
| S4 | Sin secretos versionados (`.env`, claves, tokens) | 0 | A.8.28 |
| S5 | `APP_DEBUG=false` y `APP_ENV=production` en config de despliegue | true | A.8.9 |
| S6 | Sin `dd`/`dump`/`var_dump`/`print_r` en `app/` | 0 | 25010 |
| S7 | Sin `eval`, `exec`, `shell_exec`, `system`, `passthru`, `popen` con entrada de usuario | 0 | CWE-78 |
| S8 | Sin `unserialize()` sobre entrada de usuario | 0 | CWE-502 |
| S9 | Sin SQL crudo concatenado (`DB::raw`, `whereRaw` con variables) | 0 | CWE-89 |
| S10 | `$hidden` cubre `password`, `remember_token`, tokens y datos sensibles | completo | A.8.11 |
| S11 | `$fillable`/`$guarded` evita mass assignment de `role`, `is_admin` | protegido | CWE-915 |
| S12 | `Hash` driver `bcrypt`/`argon2id`; sin `md5`/`sha1` para contraseñas | correcto | A.8.24 |
| S13 | `Crypt` para datos sensibles; `APP_KEY` presente y no versionada | correcto | A.8.24 |
| S14 | `FormRequest::authorize()` no devuelve `true` fijo | policy aplicada | A.8.3 |
| S15 | Políticas/Gates registradas para recursos personales | completo | A.5.15 |
| S16 | `env()` solo dentro de `config/` | 0 usos fuera | A.8.9 |
| S17 | Jobs con `#[Tries]`, `#[Timeout]`, `ShouldQueue` | presente | A.8.15 |
| S18 | `config/logging.php` no registra PII/tokens | correcto | A.8.12 |
| S19 | `route:list` sin rutas sensibles sin middleware | 0 | A.8.3 |
| S20 | Sin archivos `*.sql`, `*.bak`, `*.pem`, `id_rsa*` versionados | 0 | A.8.12 |
| S21 | Hash::needsRehash() en login para subir el work factor | presente | A.8.24 |
| S22 | Logout: Auth::logout() + session()->invalidate() + regenerateToken() | correcto | CWE-384 / A.8.5 |
| S23 | APP_PREVIOUS_KEYS definido si se rota APP_KEY | presente si aplica | A.8.24 |

## B. Configuración e infraestructura (sec-config)

| # | Control | Esperado | Ref |
|---|---|---|---|
| C1 | HSTS presente con `max-age` ≥ 1 año | presente | A.8.24 |
| C2 | CSP presente y sin `unsafe-inline`/`unsafe-eval` | presente | A.8.26 |
| C3 | `X-Content-Type-Options: nosniff` | presente | A.8.26 |
| C4 | `X-Frame-Options` o `frame-ancestors` | presente | A.8.26 |
| C5 | `Referrer-Policy` | presente | A.8.24 |
| C6 | `Permissions-Policy` | presente | A.8.24 |
| C7 | TLS 1.2+; TLS 1.0/1.1 deshabilitado | correcto | A.8.24 |
| C8 | HTTP redirige a HTTPS | 301/308 | A.8.24 |
| C9 | `/.env` no accesible | 403/404 | A.8.9 |
| C10 | `/.git/config` no accesible | 403/404 | A.8.12 |
| C11 | `/storage/logs/laravel.log` no accesible | 403/404 | A.8.12 |
| C12 | `/composer.lock`, `/vendor/` no accesibles | 403/404 | A.8.12 |
| C13 | Sin listado de directorios | 403/404 | A.8.9 |
| C14 | `display_errors` off; `expose_php` off | correcto | A.8.9 |
| C15 | `allow_url_include` off | correcto | A.8.9 |
| C16 | Cookies `Secure`, `HttpOnly`, `SameSite` | correcto | A.8.5 |
| C17 | `DocumentRoot` apunta a `public/` | correcto | A.8.9 |
| C18 | Sin `X-Powered-By`/`Server` con versión | ausente | A.8.9 |
| C19 | SBOM generado desde `composer.lock` | presente | A.5.19 |
| C20 | Proveedores terceros identificados | documentado | A.5.19–A.5.22 |

## C. Dinámico (sec-dynamic)

| # | Control | Esperado | Ref |
|---|---|---|---|
| D1 | IDOR: usuario A no accede a recurso de B | 403/404 | A.8.3 / CWE-639 |
| D2 | Escalada vertical: usuario normal no accede a admin | 403 | A.5.15 |
| D3 | Mass assignment: campos protegidos no se aplican | ignorados | CWE-915 |
| D4 | Login no enumera usuarios | respuesta uniforme | CWE-204 |
| D5 | Rate limit/lockout en login | presente | A.5.17 |
| D6 | Token de reset de un solo uso y expira | correcto | CWE-640 |
| D7 | Sesión se regenera al iniciar | correcto | CWE-384 |
| D8 | Logout invalida sesión/token | correcto | A.8.5 |
| D9 | MFA/Passkey obligatorio para roles sensibles | presente | A.5.17 |
| D10 | SQLi mínima: `'` y booleano sin error/diferencia | sin inyección | CWE-89 |
| D11 | XSS reflejado/almacenado codificado | sin ejecución | CWE-79 |
| D12 | SSTI: `{{7*7}}` no se evalúa | literal | CWE-1336 |
| D13 | Command injection: marcador no se ejecuta | sin ejecución | CWE-78 |
| D14 | Subida: `.php`/doble extensión rechazada | rechazo | CWE-434 |
| D15 | Path traversal rechazado | rechazo | CWE-22 |
| D16 | CSRF: cambio de estado sin token rechazado | 419/403 | CWE-352 |
| D17 | CORS no refleja orígenes arbitrarios con credenciales | no refleja | CWE-942 |
| D18 | SSRF: URL interna bloqueada | bloqueo | CWE-918 |
| D19 | Open redirect validado | bloqueo | CWE-601 |
| D20 | Precio/cantidad manipulados rechazados | validación | 25010 |
| D21 | Salto de flujo rechazado | bloqueo | 29119-4 |
| D22 | Errores no exponen stack trace | genérico | A.8.12 |
| D23 | API no filtra campos (`password`, `remember_token`, email ajeno) | sin fuga | A.8.11 |
| D24 | BOLA/BOPLA: objetos/funciones por rol | 403 | OWASP API |
| D25 | Rate limit en endpoints de API costosos | presente | OWASP API |

## D. Calidad y proceso (sec-quality)

| # | Control | Esperado | Ref |
|---|---|---|---|
| Q1 | Suite de tests ejecuta sin tocar producción | aislada | 29119-3 |
| Q2 | Cobertura de líneas ≥ 70 % | ≥ 70 | 25023 |
| Q3 | Cobertura de ramas ≥ 60 % | ≥ 60 | 25023 |
| Q4 | `pint --test` sin diferencias | 0 | A.8.28 |
| Q5 | PHPStan nivel ≥ 6 sin errores críticos | 0 | A.8.28 |
| Q6 | Complejidad ciclomática razonable | sin outliers | 25010 |
| Q7 | Sin duplicación crítica | sin outliers | 25010 |
| Q8 | Manejo de errores y timeouts probado | presente | 25010 |
| Q9 | Reintentos/backoff en colas | presente | 25010 |
| Q10 | Procesos SPICE evaluados con evidencia | 8 procesos | 15504 |



## E. Velocidad y rendimiento

| # | Control | Esperado | Ref |
|---|---|---|---|
| V1 | Driver de caché rápido en producción (Redis o Memcached, no `file`/`database`) | presente | 25010 |
| V2 | Cache::remember() / rememberForever() en lecturas frecuentes | presente | 25010 |
| V3 | config:cache, route:cache, view:cache, event:cache en despliegue | presente | 25010 |
| V4 | APP_DEBUG=false en entorno de producción | true | A.8.9 |
| V5 | Consultas grandes usan chunkById() / lazyById() (no cargan todo en memoria) | presente | 25010 |
| V6 | Sin DB::raw / whereRaw con interpolación directa de input de usuario (usar bindings) | 0 | CWE-89 |
| V7 | Rate limiting en login y endpoints de API costosos | presente | A.5.17 / 25010 |
| V8 | Octane (FrankenPHP / RoadRunner / Swoole) si se requiere alto rendimiento | presente si aplica | 25010 |
| V9 | Octane: --workers y --max-requests configurados | presente | 25010 |
| V10 | Sesión con driver adecuado a la carga (Redis/Memcached para alta carga) | presente | 25010 |

## F. Trazabilidad mínima por hallazgo

Todo hallazgo debe declarar: ID, título, severidad CVSS, estado, OWASP/CWE, ubicación exacta, evidencia enmascarada, reproducción, remediación, ISO 27001, ISO 25010, ISO 29119-4, esfuerzo, responsable.

## G. Nuevos vectores de ataque y defensas requeridas

Los siguientes controles se agregan para cubrir ataques no incluidos en las secciones anteriores. Cada uno debe evaluarse explícitamente cuando exista un login de administración o una capa de API expuesta.

| # | Control | Esperado | Ref |
|---|---|---|---|
| G1 | Rate limiter global por IP en login (independiente del usuario) | presente | A.5.17 / CWE-307 |
| G2 | Rate limiter por usuario objetivo en login (independiente de IP) | presente | A.5.17 / CWE-307 |
| G3 | Bloqueo progresivo exponencial tras N fallos de login | presente | A.5.17 / CWE-307 |
| G4 | CAPTCHA (Turnstile / reCAPTCHA v3) en login tras umbral de fallos | presente si aplica | A.5.17 / CWE-307 |
| G5 | Mensaje genérico de error en login (no revela si usuario existe) | presente | A.5.17 / CWE-203 |
| G6 | Cabecera Retry-After en respuestas 429 de login | presente si aplica | A.5.17 / CWE-307 |
| G7 | Endpoints de login en API con throttle:api o middleware personalizado | presente | A.5.17 / API1:2023 |
| G8 | Endpoints de API autenticados con Sanctum o Passport (no solo sesión) | presente si aplica | API1:2023 / API2:2023 |
| G9 | CSRF no desactivado en endpoints API que mutan estado (POST/PUT/DELETE) | presente | CWE-352 / API3:2023 |
| G10 | Límite de intentos de validación OTP/PIN (máximo 3-5) antes de destruir token | presente si aplica | A.5.17 / CWE-307 |
| G11 | OTP con expiración corta (5-10 minutos) | presente si aplica | A.5.17 / CWE-307 |
| G12 | Rate limiter por usuario|otp y ip|otp | presente si aplica | A.5.17 / CWE-307 |
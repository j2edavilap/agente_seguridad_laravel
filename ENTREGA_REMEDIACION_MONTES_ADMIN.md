# Entrega de Remediación — montes_admin_laravel

**Proyecto:** montes_admin_laravel  
**Ruta audited:** `E:\laragon_8\www\montes_admin_laravel`  
**Commit auditado:** `259d282`  
**Laravel:** 13.39.0 | **PHP:** 8.5.12  
**Fecha de generación:** 2026-11-04  
**Estado de la auditoría previa:** CONDICIONADO (SEG 74, CI 81, CS 79)  
**Archivo de destino:** Este `.md` se entrega a otro agente para que evalúe los fallos y aplique las soluciones.  
**Regla cero:** Este documento no modifica el proyecto auditado. Solo informa.

---

## 1. Contexto y estado actual

La auditoría ejecutó dos de cuatro subagentes. Los subagentes de análisis estático (A-01-STATIC) y pruebas dinámicas (A-03-DYNAMIC) quedaron **bloqueados** y no entregaron informe ni JSON. Por tanto, no hay evidencia real de:

- Pruebas de fuerza bruta contra `/cms/login`.
- Pruebas de credential stuffing.
- Pruebas contra endpoints de API (`/api/*`).
- Pruebas de fuerza bruta a OTP/PIN (no existe implementación de OTP/PIN, pero se debe evaluar si se agrega en el futuro).

Los informes existentes son:
- `reports/2026-11-03_2249/A-02-CONFIG.md` (configuración e infraestructura)
- `reports/2026-11-03_2249/A-04-QUALITY.md` (calidad y SPICE)
- `reports/2026-11-03_2249/INFORME_FINAL.md` (consolidado)
- `reports/2026-11-03_2249/resumen.json`

---

## 2. Fallos existentes con soluciones mejoradas

A continuación se listan los hallazgos confirmados del informe final, con sus soluciones **mejoradas** (más detalladas y accionables que las originales).

### 2.1 Seguridad (SEG)

| ID | Título | Severidad | Solución mejorada (detallada) | Esfuerzo estimado |
|----|--------|-----------|-------------------------------|-------------------|
| INF-01 | `X-Powered-By` revela versión de PHP | Bajo | En `php.ini`: `expose_php = Off`. Además, agregar middleware de Laravel que elimine cualquier cabecera `X-Powered-By` residual en la respuesta. Verificar con `curl -I`. | 0.5 h |
| INF-02 | `Server` revela versión de Apache/OpenSSL | Bajo | En configuración del servidor (Nginx/Apache): `server_tokens off;` y `Header unset Server` o `ServerTokens Prod`. Verificar que no se filtre versión en cabeceras de respuesta. | 0.5 h |
| INF-03 | `display_errors` y `display_startup_errors` habilitados en php.ini | Medio | `php.ini`: `display_errors = Off`, `display_startup_errors = Off`, `log_errors = On`, `error_log` a archivo fuera de `public/`. En Laravel: `config/app.php` `'debug' => env('APP_DEBUG', false)`. Nunca `true` en producción. | 1 h |
| INF-04 | `open_basedir` sin definir y `disable_functions` vacío | Medio | `php.ini`: `open_basedir` restringido a directorios necesarios (`/var/www/montes_admin_laravel:/tmp`). `disable_functions`: `exec,passthru,shell_exec,system,proc_open,popen,curly_file_get_contents` según sea aplicable. | 2 h |
| INF-05 | `session.use_strict_mode = 0` | Bajo | `php.ini`: `session.use_strict_mode = 1`. En Laravel: `config/session.php` `'strict' => true`. Evita fijación de sesión con ID predecible. | 0.5 h |
| INF-06 | Cookie de sesión sin atributo `Secure` (sobre HTTP) | Medio | `config/session.php`: `'secure' => env('SESSION_SECURE_COOKIE', false)`. En producción (HTTPS): `SESSION_SECURE_COOKIE=true`. Verificar que la cookie de sesión solo se envíe sobre HTTPS. | 1 h |
| INF-07 | `upload_max_filesize = 2G` y `post_max_size = 2G` | Bajo | `php.ini`: reducir a valores razonables (ej. `upload_max_filesize = 10M`, `post_max_size = 12M`). En Laravel validar tamaño de archivo subido en el controlador con reglas de validación `max:10240`. | 1 h |
| INF-08 | `max_execution_time = 36000` (10 horas) | Bajo | `php.ini`: `max_execution_time = 30` o `60`. En Laravel, no confiar en este valor para procesos largos; usar colas (jobs) con timeout propio. | 1 h |
| INF-09 | Ausencia de cabeceras de seguridad (CSP, HSTS, etc.) | Informativo | Crear middleware `SecurityHeaders` que agregue: `X-Frame-Options: DENY` o `SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy` con `default-src 'self'`, `Strict-Transport-Security: max-age=31536000; includeSubDomains` (solo HTTPS). | 4 h |
| INF-10 | No hay forzado de HTTPS (HTTP → HTTPS) | Informativo | Middleware `ForceHttps` o redirección 301/308 en el vhost del servidor web. En Laravel: `URL::forceScheme('https')` en `AppServiceProvider::boot()` si el entorno lo permite, o middleware global. | 3 h |
| INF-11 | Valores por defecto de credenciales de BD (`root`/vacío) | Medio | `config/database.php`: eliminar valores hardcodeados. Usar `env('DB_USERNAME')` y `env('DB_PASSWORD')` sin defaults inseguros. Crear usuario de BD con privilegios mínimos (solo `SELECT, INSERT, UPDATE, DELETE` sobre la base de datos necesaria, sin `DROP, GRANT, FILE`). | 2 h |

### 2.2 Calidad de software (CS)

| ID | Título | Severidad | Solución mejorada (detallada) | Esfuerzo estimado |
|----|--------|-----------|-------------------------------|-------------------|
| QAL-001 | Cobertura de pruebas no medible (sin Xdebug/PCOV) | Medio | Instalar Xdebug o PCOV. Configurar `phpunit.xml` con cobertura. Medir cobertura de líneas y ramas. Umbral mínimo: 70% líneas, 60% ramas. Agregar paso en CI que falle si baja del umbral. | 4 h |
| QAL-002 | Ausencia de análisis estático (PHPStan, php-cs-fixer, phploc) | Medio | Instalar PHPStan (nivel 6 mínimo), php-cs-fixer, phploc. Agregar a `composer.json` como dependencias de desarrollo. Ejecutar en CI: `phpstan analyse`, `pint --test`, `php-cs-fixer fix --dry-run --diff`. Fallar CI si hay errores. | 8 h |
| QAL-003 | Cookie de sesión sin bandera `secure` forzada | Medio | Misma solución que INF-06. Asegurar que `SESSION_SECURE_COOKIE=true` en `.env` de producción y que el middleware de Laravel respete el valor. | 1 h |
| QAL-004 | Sin evidencia de rate limiting ni cabeceras de seguridad | Bajo | Misma solución que INF-09. Además, verificar que `/cms/login` tenga rate limiting robusto (ver sección 4 de este documento). | 1 h |
| QAL-005 | Proceso QA no formalmente definido (SPICE SUPP nivel 1) | Informativo | Definir proceso QA documentado: plan de pruebas, casos de prueba, entornos, criterios de aceptación, gestión de defectos. Elevar SPICE SUPP a nivel 2. | 16 h |

---

## 3. Nuevos tipos de ataque identificados y defensas requeridas

Estos ataques **no fueron probados** en la auditoría previa (subagentes dinámico y estático bloqueados). Se identifican como riesgos reales basados en la estructura del proyecto (login en `/cms/login`, API expuesta en `/api/*`, sin OTP/PIN).

### 3.1 Fuerza Bruta Inversa

| Campo | Valor |
|-------|-------|
| **Qué busca el atacante** | Evadir el bloqueo de una cuenta probando una contraseña común (ej. `123456`, `password`) contra muchos usuarios diferentes, en lugar de muchas contraseñas contra un solo usuario. |
| **Por qué aplica aquí** | El rate limiter actual del `LoginController` usa la clave `login|ip` (usuario + IP). Si el atacante prueba una misma contraseña contra muchos usuarios desde diferentes IPs (o incluso desde una misma IP con diferentes usuarios), cada combinación `usuario|ip` es un contador independiente. No hay bloqueo global por contraseña ni por IP sola. |
| **Defensa que se debe exigir en Laravel** | 1. Rate limiter **global por IP** independiente del usuario: `RateLimiter::for('login_ip', ...)` con límite más estricto (ej. 10 intentos por IP por minuto).<br>2. Rate limiter por **usuario objetivo** (independiente de IP) para detectar cuando muchos intentos fallidos apuntan al mismo `login`.<br>3. Bloqueo progresivo: después de N fallos, aumentar el tiempo de espera exponencialmente.<br>4. Al bloquear, no revelar si el usuario existe (mensaje genérico "Usuario o clave incorrectos" ya se cumple, pero mantenerlo).<br>5. Agregar cabecera `Retry-After` en respuestas 429. |
| **Referencia** | OWASP A07:2021 – Identificación y autenticación fallidas |

### 3.2 Credential Stuffing Distribuido

| Campo | Valor |
|-------|-------|
| **Qué busca el atacante** | Usar miles de direcciones IP diferentes para que el limitador de tasa por IP no sospeche, probando pares usuario/contraseña filtrados de otras brechas. |
| **Por qué aplica aquí** | El rate limiter actual es por `login|ip`. Con miles de IPs, el atacante puede probar miles de pares sin activar el bloqueo de ninguna IP individual. No hay CAPTCHA ni análisis de comportamiento. |
| **Defensa que se debe exigir en Laravel** | 1. Implementar **Cloudflare Turnstile** o **reCAPTCHA v3** en el formulario de login `/cms/login`. Validar el token en el servidor antes de autenticar.<br>2. Análisis de comportamiento: detectar patrones anómalos (muchos intentos fallidos de diferentes IPs en corto tiempo, user-agents inusuales, navegadores sin cookies).<br>3. Bloqueo temporal de IP por ventanas cortas (ej. 5 fallos en 1 minuto = bloqueo 15 min).<br>4. Monitoreo de intentos fallidos por IP y alerta si supera umbral. |
| **Referencia** | OWASP A07:2021 – Identificación y autenticación fallidas |

### 3.3 Ataque a Endpoints de API

| Campo | Valor |
|-------|-------|
| **Qué busca el atacante** | Encontrar un Login desprotegido en la capa de API móvil o SPA, o endpoints que expongan datos sin autenticación adecuada. |
| **Por qué aplica aquí** | Las rutas en `routes/web.php` bajo `Route::prefix('api')` usan `throttle:120,1` y **desactivan sesión, cookies y CSRF** (`withoutMiddleware([EncryptCookies, AddQueuedCookiesToResponse, StartSession, ShareErrorsFromSession, PreventRequestForgery])`). Son solo lectura (GET), pero si en el futuro se agregan endpoints POST/PUT/DELETE de autenticación (login, reset de clave, etc.) sin protección, estarían expuestos. Además, no hay un `routes/api.php` separado con middleware `throttle:api` ni autenticación por token (Sanctum/Passport) configurada para estos endpoints. |
| **Defensa que se debe exigir en Laravel** | 1. Si se agregan endpoints de login en API, usar `throttle:api` o middleware personalizado con límites más estrictos (ej. 5 intentos por minuto).<br>2. Autenticar endpoints de API con **Laravel Sanctum** (tokens) o **Passport** (OAuth2), nunca solo por sesión.<br>3. No desactivar CSRF en endpoints que mutan estado (POST/PUT/DELETE). Si se desactiva para API REST, usar autenticación por token y validar `Origin`/`Referer`.<br>4. Aplicar `abort(403)` o `401` en endpoints que requieran autenticación y no la tengan.<br>5. Registrar acceso a endpoints API en `AuditLogger` (ya existe en el proyecto). |
| **Referencia** | OWASP API Top 10:2023 – API1:2023 Broken Object Level Authorization, API7:2023 Server Side Request Forgery |

### 3.4 Fuerza Bruta a OTP / PIN

| Campo | Valor |
|-------|-------|
| **Qué busca el atacante** | Adivinar el código de verificación (OTP/PIN) de 4-6 dígitos para saltarse la contraseña o la autenticación de dos factores. |
| **Por qué aplica aquí** | El proyecto **no tiene implementado OTP/PIN** actualmente. Sin embargo, si se agrega en el futuro (recomendado por MFA para roles sensibles), debe protegerse desde el diseño. Sin límite de intentos, un atacante puede probar 10,000 combinaciones (4 dígitos) o 1,000,000 (6 dígitos) en corto tiempo. |
| **Defensa que se debe exigir en Laravel** | 1. Limitar los intentos de validación del código a **máximo 3 o 5 intentos** antes de destruir el token OTP y obligar a solicitar uno nuevo.<br>2. El OTP debe expirar en tiempo corto (ej. 5-10 minutos).<br>3. Rate limiter por `usuario|otp` y por `ip|otp`.<br>4. Después de N fallos, invalidar el OTP y requerir autenticación completa nuevamente.<br>5. No revelar si el OTP es correcto o no hasta agotar intentos (mensaje genérico). |
| **Referencia** | OWASP A07:2021 – Identificación y autenticación fallidas |

---

## 4. Pruebas que deben ejecutarse (pendientes)

El subagente A-03-DYNAMIC quedó bloqueado. El otro agente debe ejecutar (o documentar por qué no se puede):

| # | Prueba | Tipo de ataque | URL / Endpoint | Método | Resultado esperado | Estado |
|---|--------|----------------|----------------|--------|--------------------|--------|
| 1 | Fuerza bruta simple contra `/cms/login` | Fuerza bruta | `POST /cms/login` | POST | Bloqueo tras 5 fallos con misma IP+usuario | Pendiente |
| 2 | Fuerza bruta inversa (una clave, muchos usuarios) | Fuerza Bruta Inversa | `POST /cms/login` | POST | Debe detectarse y bloquearse por IP global o por contraseña común | Pendiente |
| 3 | Credential stuffing distribuido (simulado) | Credential Stuffing | `POST /cms/login` | POST | Debe activarse CAPTCHA o bloqueo por comportamiento anomal | Pendiente |
| 4 | Endpoint API sin autenticación | Ataque a Endpoints de API | `GET /api/*` | GET | Debe devolver 401/403 si requiere autenticación y no la tiene | Pendiente |
| 5 | Fuerza bruta a OTP/PIN (si se implementa) | Fuerza Bruta a OTP | Endpoint de validación OTP | POST | Bloqueo tras 3-5 fallos, destrucción del token | Pendiente (no existe OTP aún) |
| 6 | Login sin CAPTCHA tras múltiples fallos | Credential Stuffing | `POST /cms/login` | POST | Debe aparecer Turnstile/reCAPTCHA tras N fallos | Pendiente |

---

## 5. Plan de remediación priorizado (actualizado)

### 0–7 días (inmediato)

| # | Acción | Relacionado con | Esfuerzo | Hallazgos |
|---|--------|-----------------|----------|-----------|
| 1 | Agregar rate limiter global por IP en `/cms/login` (independiente del usuario) | Fuerza Bruta Inversa | 2 h | Nuevo ataque 3.1 |
| 2 | Agregar mensaje genérico sin revelar existencia de usuario (ya implementado, verificar) | Fuerza Bruta Inversa | 0.5 h | Nuevo ataque 3.1 |
| 3 | Integrar Cloudflare Turnstile o reCAPTCHA v3 en `/cms/login` | Credential Stuffing Distribuido | 4 h | Nuevo ataque 3.2 |
| 4 | Revisar endpoints `/api/*` y aplicar `throttle:api` o middleware de autenticación | Ataque a Endpoints de API | 3 h | Nuevo ataque 3.3 |
| 5 | `php.ini`: `expose_php = Off`, `display_errors = Off` | Seguridad existente | 1 h | INF-01, INF-03 |
| 6 | `config/session.php`: `secure => true` por defecto | Seguridad existente | 1 h | INF-06, QAL-003 |

### 8–30 días (corto plazo)

| # | Acción | Relacionado con | Esfuerzo | Hallazgos |
|---|--------|-----------------|----------|-----------|
| 7 | Bloqueo progresivo exponencial en login (1 min, 15 min, 1 h, 24 h) | Fuerza Bruta Inversa | 3 h | Nuevo ataque 3.1 |
| 8 | `php.ini`: `open_basedir`, `disable_functions`, reducir `upload_max_filesize`, `post_max_size`, `max_execution_time` | Seguridad existente | 2 h | INF-04, INF-07, INF-08 |
| 9 | Middleware de cabeceras de seguridad (CSP, HSTS, X-Frame-Options, etc.) | Seguridad existente | 4 h | INF-09, QAL-004 |
| 10 | Forzar HTTPS (middleware `ForceHttps` o redirección 301/308) | Seguridad existente | 3 h | INF-10 |
| 11 | Eliminar defaults de credenciales de BD; usuario con privilegios mínimos | Seguridad existente | 2 h | INF-11 |
| 12 | Generar `package-lock.json`; ejecutar `npm audit` en CI | Calidad existente | 2 h | INF-12 |
| 13 | Ejecutar `config:cache`, `route:cache`, `view:cache`, `event:cache` en despliegue | Calidad existente | 1 h | INF-14 |

### 31–90 días (medio plazo)

| # | Acción | Relacionado con | Esfuerzo | Hallazgos |
|---|--------|-----------------|----------|-----------|
| 14 | Instalar Xdebug o PCOV y medir cobertura | Calidad existente | 4 h | QAL-001 |
| 15 | Instalar PHPStan y ejecutar análisis estático en CI | Calidad existente | 8 h | QAL-002 |
| 16 | Definir proceso QA formal (SPICE SUPP → nivel 2) | Calidad existente | 16 h | QAL-005 |
| 17 | Implementar MFA/OTP con límite de 3-5 intentos y expiración corta | Fuerza Bruta a OTP | 8 h | Nuevo ataque 3.4 (si se requiere) |
| 18 | Documentar requisitos y diseño con trazabilidad a pruebas (SPICE ENG → nivel 3) | Calidad existente | 24 h | — |

---

## 6. Instrucciones para el otro agente

1. **No subir nada a GitHub** hasta que el usuario lo pida explícitamente.
2. **Leer los informes existentes** en `E:\laragon_8\www\montes_admin_laravel\reports\2026-11-03_2249/` para tener el contexto completo.
3. **Ejecutar las pruebas pendientes** de la sección 4 de este documento contra el staging autorizado (`http://montes_admin_laravel.test/` y `/cms`).
4. **Aplicar las soluciones** de la sección 2 y 5, empezando por las de 0–7 días.
5. **Documentar cada cambio** con commit en el repositorio del proyecto auditado (no en este repositorio de agente).
6. **Actualizar este archivo `.md`** marcando qué soluciones se aplicaron y cuáles quedaron pendientes.
7. **Respetar la regla cero:** el agente auditor no modifica el proyecto auditado, solo informa. El otro agente (remediación) sí puede aplicar parches si está autorizado.

---

## 7. Firmas y control de cambios

| Fecha | Cambio | Autor |
|-------|--------|-------|
| 2026-11-04 | Emisión inicial de este documento de entrega | Orquestador de auditoría (agente) |

---

**Fin del documento de entrega.** Este archivo es de solo lectura para el agente remediador; sirve como insumo para aplicar las soluciones y no debe ser modificado por el agente auditor original.

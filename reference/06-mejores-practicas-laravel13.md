# 06 — Mejores prácticas de Laravel 13: seguridad y velocidad

Referencia consolidada de la documentación oficial de Laravel 13 (rama `13.x` de `laravel/docs`) y del marco normativo ISO 27001 / 25010 / 29119 usada por este agente. Sirve de base para completar el checklist (`05-checklist-laravel13.md`) y las evaluaciones del auditor.

Está dividida en dos bloques: **Seguridad** y **Velocidad / Rendimiento**. Cada práctica cita su origen (docs Laravel o norma) y el subagente responsable.

---

## 1. Seguridad

### 1.1 Autenticación (A-AUTH)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Login throttling | Aplicar límite de intentos de login por usuario/IP (starter kits ya lo traen). | docs: authentication | A.5.17 |
| Regenerar sesión tras login | `$request->session()->regenerate()` después de `Auth::attempt()` para evitar session fixation. | docs: authentication | CWE-384 |
| Invalidar sesión al logout | `Auth::logout()` + `$request->session()->invalidate()` + `regenerateToken()`. | docs: authentication | A.8.5 |
| Contraseñas seguras | Usar `Hash::make()` (bcrypt/argon2id). Nunca md5/sha1 para contraseñas. Columna `password` ≥ 60 caracteres. | docs: hashing / authentication | A.8.24 |
| Rehash automático | `Hash::needsRehash()` en login para subir el work factor cuando cambie. | docs: hashing | A.8.24 |
| Confirmación de contraseña | Acciones sensibles requieren `password.confirm` middleware (tiempo configurable `password_timeout`). | docs: authentication | A.5.17 |
| Cerrar sesiones de otros dispositivos | `Auth::logoutOtherDevices($password)` al cambiar contraseña. | docs: authentication | A.8.5 |
| `once` para peticiones únicas | `Auth::once()` autentica solo para la request actual, sin sesión ni cookie. | docs: authentication | A.8.5 |
| HTTP Basic stateless | `Auth::onceBasic()` para APIs sin cookie de sesión. | docs: authentication | A.8.5 |

### 1.2 Autorización (A-ACCESO)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Gates para acciones sin modelo | `Gate::define()` closures en `AppServiceProvider@boot`. | docs: authorization | A.5.15 |
| Policies para modelos | `php artisan make:policy --model=Model`, registrar con `Gate::policy()` o atributo `#[UsePolicy]`. | docs: authorization | A.5.15 |
| Middleware `can` | `Route::put(...)->middleware('can:update,post')` o atributo `#[Authorize]`. | docs: authorization | A.8.3 |
| `abort(403)` / `Gate::authorize()` | Nunca devolver `true` fijo en `FormRequest::authorize()` ni en policies. | docs: authorization | A.8.3 / CWE-915 |
| `before` en policies | Administradores autorizan todo; devolver `null` para no anular. | docs: authorization | A.5.15 |
| Respuestas detalladas | Usar `Response::allow()` / `Response::deny('msg')` y `Gate::inspect()` para mensajes. | docs: authorization | A.5.15 |
| Guest users | Type-hint `?User` o `null` default si se quiere que pases por políticas sin autenticar. | docs: authorization | A.5.15 |

### 1.3 Cifrado y secretos (A-CONFIG, A-DATOS)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| `APP_KEY` | Generar con `php artisan key:generate` (bytes criptográficos seguros). Nunca versionar `.env`. | docs: encryption | A.8.24 |
| Rotación de claves | `APP_PREVIOUS_KEYS` con claves anteriores separadas por coma para descifrado gradual. | docs: encryption | A.8.24 |
| `Crypt` para datos sensibles | `Crypt::encryptString()` / `decryptString()` (AES-256-CBC + MAC). | docs: encryption | A.8.24 |
| `Hash` para contraseñas | Nunca usar `Crypt` para contraseñas; usar `Hash`. | docs: hashing | A.8.24 |
| `APP_DEBUG=false` en producción | Nunca `true` en producción (expone configuración sensible). | docs: deployment | A.8.9 |
| `env()` solo en `config/` | Nunca llamar `env()` fuera de archivos de configuración (especialmente tras `config:cache`). | docs: deployment | A.8.9 |

### 1.4 CSRF y peticiones (A-WEB)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| CSRF por defecto | Middleware `PreventRequestForgery` en grupo `web`; incluir `@csrf` en formularios POST/PUT/PATCH/DELETE. | docs: csrf | CWE-352 |
| `X-CSRF-TOKEN` / `X-XSRF-TOKEN` | Cabecera para AJAX / SPA. Cookie `XSRF-TOKEN` cifrada enviada con cada respuesta. | docs: csrf | CWE-352 |
| Origen verificado (`Sec-Fetch-Site`) | Laravel usa `Sec-Fetch-Site` primero; fallback a token. Solo funciona sobre HTTPS. | docs: csrf | CWE-352 |
| `originOnly: true` | Si se desea solo verificación de origen (deshabilita fallback a token). | docs: csrf | CWE-352 |
| Excluir URIs de CSRF | Webhooks (Stripe, etc.) fuera del grupo `web` o en `except: [...]`. | docs: csrf | CWE-352 |

### 1.5 Sesiones (A-DATOS, A-AUTH)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Driver adecuado | `file`, `cookie` (cifrado), `database`, `memcached`/`redis`, `dynamodb`. No `cookie` con session blocking. | docs: session | A.8.5 |
| `SESSION_CONNECTION` | Para Redis, especificar conexión en `config/session.php` o env. | docs: session | A.8.5 |
| Session blocking | `Route::post(...)->block($lockSeconds, $waitSeconds)` para evitar pérdida de datos en peticiones concurrentes con misma sesión. | docs: session | 25010 |
| Session cache | `$request->session()->cache()->get()/put()` para datos efímeros por sesión. | docs: session | 25010 |

### 1.6 Despliegue y servidor (A-CONFIG, A-INFRA)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| PHP ≥ 8.3 | Extensiones requeridas: Ctype, cURL, DOM, Fileinfo, Filter, Hash, Mbstring, OpenSSL, PCRE, PDO, Session, Tokenizer, XML. | docs: deployment | A.8.9 |
| `DocumentRoot` = `public/` | Nunca servir desde la raíz del proyecto (expone `.env`, `composer.json`, etc.). | docs: deployment | A.8.9 |
| Cabeceras de seguridad Nginx | `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `fastcgi_hide_header X-Powered-By`, `server_tokens off`. | docs: deployment | A.8.26 |
| Denegar archivos ocultos | `location ~ /\.(?!well-known).* { deny all; }` | docs: deployment | A.8.12 |
| PHP 404 para `.php` sueltos | `location ~ \.php$ { return 404; }` | docs: deployment | A.8.12 |
| Caché de despliegue | `config:cache`, `route:cache`, `view:cache`, `event:cache` en el pipeline de despliegue. | docs: deployment | 25010 |
| `php artisan optimize` | Ejecutar como parte del despliegue. | docs: deployment | 25010 |
| `reload` tras despliegue | Reiniciar workers long-running (queues, Reverb, Octane). | docs: deployment | 25010 |
| Ruta de salud | `/up` (configurable en `bootstrap/app.php`); devuelve 200 si arrancó sin excepciones. | docs: deployment | A.8.15 |
| `.env` y `.git` no accesibles | 403/404 en servidor web. | docs: deployment | A.8.9 / A.8.12 |

### 1.7 Código seguro (A-SAST, A-INYECCION)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Query builder + bindings | PDO parameter binding protege contra SQLi. Nunca dejar que el usuario elija nombres de columna (`order by`). | docs: queries | CWE-89 |
| `whereRaw` con bindings | Pasar array de bindings como segundo argumento; nunca interpolar strings. | docs: queries | CWE-89 |
| No `DB::raw` con input de usuario | Las expresiones crudas se inyectan tal cual. | docs: queries | CWE-89 |
| No `eval`/`exec`/`shell_exec`/`system`/`passthru` con input de usuario | CWE-78. | checklist existente | CWE-78 |
| No `unserialize()` con input de usuario | CWE-502. | checklist existente | CWE-502 |
| Mass assignment protegido | `$fillable`/`$guarded` para evitar asignar `role`, `is_admin`, etc. | checklist existente | CWE-915 |
| `$hidden` completo | Cubrir `password`, `remember_token`, tokens y datos sensibles. | checklist existente | A.8.11 |
| Archivos sensibles no versionados | `*.sql`, `*.bak`, `*.pem`, `id_rsa*`, `.env`. | checklist existente | A.8.12 |

---

## 2. Velocidad / Rendimiento

### 2.1 Caché (25010 Eficiencia de desempeño)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Driver rápido en producción | Redis o Memcached (no `file`/`database` en alta carga). | docs: cache | 25010 |
| `Cache::remember()` | Almacenar en caché y ejecutar cierre solo si falta. | docs: cache | 25010 |
| `Cache::rememberForever()` | Para datos estáticos de larga vida; borrar manualmente con `forget()`. | docs: cache | 25010 |
| `Cache::flexible([fresh, stale])` | Patrón stale-while-revalidate: servir dato obsoleto mientras se recalcula en segundo plano. | docs: cache | 25010 |
| `Cache::memo()` | Memoizar dentro de una request/job para evitar hits repetidos al almacén. | docs: cache | 25010 |
| Etiquetas (`Cache::tags`) | Agrupar y vaciar relacionados (no soportado en `file`/`database`/`dynamodb`/`storage`). | docs: cache | 25010 |
| Bloques atómicos (`Cache::lock`) | Evitar condiciones de carrera; `withoutOverlapping()` y `funnel()->limit(N)`. | docs: cache | 25010 |
| Caché con failover | `failover` driver con lista de tiendas para alta disponibilidad. | docs: cache | 25010 |
| Deshabilitar eventos de caché | `'events' => false` en tiendas de caché de producción para ganar velocidad. | docs: cache | 25010 |

### 2.2 Octane — velocidad máxima (25010)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| Servidor de aplicación | FrankenPHP (recomendado), RoadRunner o Swoole. Arranca la app una vez y la mantiene en memoria. | docs: octane | 25010 |
| Workers | `--workers=N` (uno por núcleo por defecto). | docs: octane | 25010 |
| Max requests | `--max-requests=N` para reiniciar workers y evitar fugas de memoria (default 500). | docs: octane | 25010 |
| Max execution time | `config/octane.php` `max_execution_time` (default 30s). | docs: octane | 25010 |
| No inyectar contenedor/request/config como singleton | Usar closures resolutores (`Container::getInstance()`, `request()`, `config()`) para evitar estado enmohecido entre requests. | docs: octane | 25010 |
| No arrays estáticos crecientes | Fugan memoria entre requests (Octane no reinicia la app). | docs: octane | 25010 |
| Tareas concurrentes | `Octane::concurrently([...])` con Swoole (task workers). | docs: octane | 25010 |
| Caché Octane | `Cache::store('octane')` hasta 2M ops/seg (Swoole tables); se vacía al reiniciar. | docs: octane | 25010 |
| Nginx frente a Octane | Servir assets estáticos y terminar SSL en Nginx; proxy al puerto de Octane. | docs: octane | 25010 |

### 2.3 Consultas y base de datos (25010)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| `chunkById()` / `lazyById()` | Para miles de registros; paginan por clave primaria para evitar saltos al actualizar/eliminar. | docs: queries | 25010 |
| `lazy()` | `LazyCollection` para procesar resultados como flujo sin cargar todo en memoria. | docs: queries | 25010 |
| `select()` con columnas específicas | No traer `*` innecesario. | docs: queries | 25010 |
| `exists()` / `doesntExist()` | Mejor que `count()` para verificar existencia. | docs: queries | 25010 |
| Bloqueo pesimista | `sharedLock()` / `lockForUpdate()` cuando sea necesario. | docs: queries | 25010 |
| `upsert()` / `updateOrInsert()` | Evitar consultas de lectura+escritura separadas. | docs: queries | 25010 |

### 2.4 Rate limiting (25010)

| Práctica | Qué hacer | Origen | Ref |
|---|---|---|---|
| `RateLimiter::attempt()` | Limitar acciones por clave (usuario/IP) con ventana de tiempo. | docs: rate-limiting | 25010 |
| `RateLimiter::increment()` atómico | Usar con tiendas Redis/memcached/database para conteo correcto bajo concurrencia. | docs: rate-limiting | 25010 |
| Rate limiting en rutas | Middlewate de rate limiting (ver routing) para endpoints costosos y login. | docs: rate-limiting | A.5.17 |

---

## 3. Cómo el agente aplica esto

- `sec-static` verifica controles estáticos (hash, cifrado, secretos, mass assignment, SQL crudo, dependencias).
- `sec-config` verifica cabeceras, TLS, `APP_DEBUG`, `DocumentRoot`, exposición de archivos, SBOM.
- `sec-dynamic` verifica IDOR, rate limiting, CSRF, SQLi, XSS, subida de archivos, SSRF, BOLA contra staging autorizado.
- `sec-quality` verifica cobertura, mantenibilidad (`pint`, PHPStan), SPICE.

Cada control del checklist (`05-checklist-laravel13.md`) debe tener: resultado esperado, referencia normativa (ISO 27001 Anexo A / CWE / OWASP) y origen de la práctica.

# Agente auditor de seguridad Laravel

**Qué es.** Repositorio de documentación y fuente de verdad del agente de auditoría de seguridad para
proyectos **Laravel 13 / PHP 8.5**. Desde aquí se edita y se despliega a **OpenCode**, **Claude Code** y
**Codex CLI**.

**Para qué está hecho.** Evalúa un proyecto Laravel (seguridad, control de información y calidad de
software) y escribe informes en `reports/` **sin modificar el código del proyecto auditado**. Es una
herramienta de diagnóstico, no de reparación: describe los problemas en los informes; nunca aplica
parches ni correcciones.

**Por qué lo hace así.**

- **Un orquestador + cuatro subagentes** en lugar de dieciocho: mantiene el paralelismo útil con un
  mantenimiento razonable.
- **Una fuente de verdad (`agents/*.md`):** cada runtime genera sus variantes automáticamente; no hay
  prompts duplicados que se desincronicen.
- **Autorización humana obligatoria (Paso 0):** el agente no ejecuta nada hasta que el responsable del
  proyecto firme y guarde `scope/authorization.md`. El agente solo escribe el borrador
  (`scope/authorization.draft.md`); el rename y la firma los hace un humano.
- **Solo lectura sobre el proyecto auditado:** `git`, pruebas y comandos destructivos están restringidos;
  nunca se modifican archivos ni se instalan dependencias.

**Cómo funciona.** El orquestador `laravel-sec-auditor` ejecuta la entrevista de autorización y luego
delega en cuatro subagentes: `sec-static` (Fase 1: SCA, SAST y Laravel estático), `sec-config` (Fases 2 y
5: configuración e infraestructura), `sec-dynamic` (Fase 3: pruebas dinámicas contra staging autorizado)
y `sec-quality` (calidad y SPICE). Cada subagente escribe su propio informe y devuelve solo JSON; el
orquestador consolida y genera `reports/INFORME_FINAL.md` y `reports/resumen.json`.

**Cómo empezar.**

```powershell
# 1. Despliega en los tres runtimes
powershell -ExecutionPolicy Bypass -File .\deploy.ps1

# 2. Reinicia OpenCode (o instala en Claude Code / Codex CLI)
```

En el proyecto Laravel a auditar: selecciona el agente `laravel-sec-auditor`, responde la entrevista de
autorización, firma y guarda `scope/authorization.md`, y pídele: *"evalúa este proyecto"*.

## Qué evalúa el auditor en Laravel 13

El auditor verifica controles de **seguridad** y **velocidad** basados en la documentación oficial de Laravel 13
(rama `13.x` de `laravel/docs`) y el marco ISO 27001 / 25010 / 29119.

**Seguridad (sec-static, sec-config, sec-dynamic)**

- Autenticación: login throttling, regeneración de sesión tras login, `Hash::needsRehash()` (bcrypt/argon2id), logout con `invalidate()` + `regenerateToken()`, confirmación de contraseña, MFA/Passkeys para roles sensibles.
- Autorización: Gates y Policies, middleware `can`, nunca `authorize()` que devuelva `true` fijo, `403` por defecto.
- Cifrado y secretos: `APP_KEY` via `key:generate`, `APP_PREVIOUS_KEYS` en rotación, `Crypt::encryptString()` para datos sensibles, `APP_DEBUG=false` en producción, `env()` solo en `config/`.
- CSRF y peticiones: `@csrf`, `X-CSRF-TOKEN`, verificación de origen (`Sec-Fetch-Site`), nunca contra producción.
- Servidor y despliegue: `DocumentRoot` = `public/`, cabeceras de seguridad (HSTS, CSP, `nosniff`, `frame-ancestors`), TLS 1.2+, redirección HTTP→HTTPS, `.env`/`.git` no expuestos, `X-Powered-By` oculto.

**Velocidad / rendimiento (sec-config, sec-quality)**

- Caché: driver rápido (Redis/Memcached), `Cache::remember()`/`rememberForever()`, `flexible()` (stale-while-revalidate), `config:cache`/`route:cache`/`view:cache` en despliegue.
- Octane (opcional): FrankenPHP/RoadRunner/Swoole, `--workers`, `--max-requests`, `max_execution_time`, sin fugas de memoria por estado enmohecido.
- Consultas: `chunkById()`/`lazyById()` para grandes volúmenes, `whereRaw` con bindings (nunca interpolar), `upsert()`.
- Rate limiting en login y endpoints costosos; sesión con driver adecuado a la carga.

Cada control tiene resultado esperado y referencia normativa en `reference/05-checklist-laravel13.md` y `reference/06-mejores-practicas-laravel13.md`.

## Estructura

```
agents/                         # FUENTE ÚNICA DE VERDAD (frontmatter OpenCode + prompt)
  laravel-sec-auditor.md        # orquestador (mode: primary)
  sec-static.md                 # subagente Fase 1  (SCA + SAST + Laravel estático)
  sec-config.md                 # subagente Fases 2 y 5 (configuración + infraestructura)
  sec-dynamic.md                # subagente Fase 3  (dinámico web/API)
  sec-quality.md                # subagente transversal + Fase 6 (calidad + SPICE)
reference/                      # documentación humana de mantenimiento
  01-reglas-y-flujo.md
  02-formato-informes.md
  03-cuantificacion-y-normas.md
  04-herramientas-y-degradacion.md
  05-checklist-laravel13.md
  06-mejores-practicas-laravel13.md   # seguridad y velocidad de Laravel 13
templates/
  scope-authorization.md        # plantilla de autorización
  reports-README.md             # estructura de salida
claude/
  settings.template.json        # barrera de escritura para el proyecto auditado
codex/
  project-kit/.codex/           # perfil de permisos + reglas para el proyecto auditado
tools/
  build-variants.ps1            # genera dist/ (Claude Code y Codex) desde agents/
dist/                           # GENERADO — no editar a mano
deploy.ps1                      # genera e instala en los tres runtimes
```

`agents/*.md` es lo único que se edita a mano. `dist/` se regenera en cada despliegue; cualquier cambio
manual allí se pierde.

## Instalación

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

| Runtime | Destino | Qué se instala |
|---|---|---|
| OpenCode | `%USERPROFILE%\.config\opencode\agent\` | `agents\*.md` copiados tal cual |
| Claude Code | `%USERPROFILE%\.claude\agents\` | `dist\claude\agents\*.md` (5) |
| Codex CLI | `%USERPROFILE%\.codex\agents\` | `dist\codex\agents\*.toml` (4 subagentes) |

Los archivos existentes se respaldan como `<nombre>.bak_<yyyyMMdd_HHmmss>`. El script sale con código
distinto de cero si algo no valida.

El **kit de proyecto de Codex no se instala globalmente**: queda en `dist\codex\project-kit\` para
copiarlo dentro del proyecto auditado (ver más abajo). Es deliberado: `~/.codex/AGENTS.md` se concatena
en *todas* las sesiones de Codex de la máquina y secuestraría trabajo ajeno.

Solo la variante de OpenCode se instala por copia directa, así que se puede desplegar por separado:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -SkipVariants
```

## Uso

### OpenCode

1. Abre OpenCode **dentro del proyecto Laravel a auditar**.
2. Selecciona el agente `laravel-sec-auditor` (no es el agente por defecto) y reinicia OpenCode si acabas
   de desplegar; la configuración no se recarga en caliente.
3. Pídele: *"evalúa este proyecto"*.

### Claude Code

```powershell
claude --agent laravel-sec-auditor
```

`--agent` lo convierte en el hilo principal y le permite delegar con la herramienta `Agent`, limitada a
`sec-static`, `sec-config`, `sec-dynamic` y `sec-quality`.

### Codex CLI

Copia el kit en la raíz del proyecto auditado:

```powershell
Copy-Item .\dist\codex\project-kit\AGENTS.md <proyecto>\AGENTS.md
Copy-Item .\dist\codex\project-kit\.codex  <proyecto>\.codex -Recurse
```

Codex carga `.codex/config.toml`, que activa el perfil de permisos `laravel-audit`: workspace en solo
lectura salvo `reports/` y `scope/authorization.draft.md`. Las reglas de `.codex/rules/` solo se cargan
si la capa `.codex/` del proyecto está marcada como confiable.

Si el proyecto ya tiene un `AGENTS.md`, añade el contenido en lugar de sobrescribirlo.

### Salida

```
<proyecto>/reports/
├── INDICE.md
├── INFORME_FINAL.md
├── resumen.json
├── A-01-STATIC.md
├── A-02-CONFIG.md
├── A-03-DYNAMIC.md
└── A-04-QUALITY.md
```

## Modelo de seguridad por runtime

La REGLA CERO del prompt es común a los tres. Lo que cambia es qué barrera técnica la acompaña.

**OpenCode**

1. `permission.edit`: solo `reports/**` y `scope/authorization.draft.md`. El archivo real `scope/authorization.md` queda fuera: lo crea el humano al firmar.
2. `permission.bash`: 34 reglas de denegación (`rm`, `del`, `Remove-Item`, escrituras de `git`,
   `composer require/update`, migraciones y cachés de Laravel), de las cuales 10 son comodines que
   cubren la forma con ruta absoluta al intérprete, más `*authorization.md*`, que bloquea cualquier
   comando que mencione la autorización firmada.
3. REGLA CERO en el prompt.

**Límite honesto de OpenCode**: sus permisos filtran el nombre del comando, no son un sandbox. Un
intérprete puede construir la ruta por partes (`python -c` con una concatenación, por ejemplo) y escribir
el archivo que la lista no ve. La garantía real en OpenCode es la puerta de firma: sin sección 9 completa
y sin el aviso de borrador borrado, el agente no ejecuta ninguna fase. Por eso el borrador y el archivo
firmado son archivos distintos y el rename lo hace un humano.

**Claude Code**

1. `tools:` en el frontmatter de cada agente: lista de permitidos, sin MCP.
2. `claude/settings.template.json` → `<proyecto>\.claude\settings.json`: reglas `Edit(...)` por ruta
   (99 reglas `deny`, 2 `allow`) y reglas `Bash(...)`/`PowerShell(...)`.
3. REGLA CERO en el prompt.

Dos detalles importan y no son obvios:

- Claude Code **acepta pero nunca aplica** reglas `Write(ruta)`, `Glob(ruta)` o `NotebookEdit(ruta)`. Hay
  que usar `Edit(ruta)`, que cubre todas las herramientas de edición.
- Un prefijo `/ruta` en `~/.claude/settings.json` se ancla en `~/.claude/ruta`, **no** en el proyecto. Por
  eso la barrera de rutas vive en el proyecto auditado y no en la configuración global.

El archivo `settings.json` afecta a **todas** las sesiones de Claude Code en ese proyecto mientras exista.
Úsalo en un clon o en el entorno de auditoría, no en un árbol donde alguien esté desarrollando.

**Codex CLI**

1. Perfil de permisos `laravel-audit` (`.codex/config.toml`), que extiende `:read-only` y reabre
   escritura solo en `reports/` y `scope/authorization.draft.md`. Es la barrera real: la aplica el
   sandbox del sistema operativo.
2. `.codex/rules/laravel-audit.rules`: cuatro `prefix_rule` con decisión `forbidden`.
3. REGLA CERO en `AGENTS.md`.

## Limitaciones conocidas

- **Codex CLI no está instalado en esta máquina.** Las variantes de Codex se generan y se validan
  estructuralmente (TOML parseado, claves requeridas presentes, delimitadores correctos), pero **nunca se
  han ejecutado**. No hay evidencia de comportamiento en runtime.
- Los perfiles de permisos de Codex son **beta**. No se pueden combinar con `sandbox_mode`: si aparece
  `sandbox_mode` en cualquier capa de configuración, Codex usa el sandbox antiguo e ignora el perfil.
- Las reglas `.rules` de Codex comparan la lista de argumentos **desde `argv[0]`**. No cubren una ruta
  absoluta al intérprete (`E:\laragon_8\bin\php\php.exe artisan migrate`) ni scripts con redirecciones o
  variables. El sandbox, no las reglas, es lo que impide escribir.
- Las reglas de permiso de Claude Code y de Codex **no son un sandbox**: `Bash(curl ...)` o `Bash(rm ...)`
  no detienen `/usr/bin/rm` ni `sh -c 'rm ...'`. Solo el sandbox de Codex y el sandbox de Bash de Claude
  ofrecen garantía a nivel de proceso.
- Sin `docker`/ZAP no hay escaneo dinámico automatizado; las pruebas dinámicas son manuales con `curl`.
- El análisis dinámico exige staging real, credenciales por rol y lista blanca firmada.
- Python 3.6 local es demasiado antiguo para `semgrep` (requiere ≥ 3.9).
- La CLI de PHP puede diferir del FPM del servidor; se declara como limitación.

## Herramientas

Se detectan en tiempo de ejecución; las ausentes **no se inventan**: la prueba queda `bloqueada`.
En esta máquina no están instalados `semgrep`, `gitleaks`, `trivy`, `phpstan`, `psalm`, `zap`,
`testssl.sh` ni `docker`. PHP 8.5 y Composer están en Laragon pero **no en PATH**.
Ver `reference/04-herramientas-y-degradacion.md` para rutas y comandos de instalación.

## Cómo mejorar el agente

1. Edita los archivos en `agents/` (fuente de verdad).
2. Actualiza la documentación en `reference/` si cambia el comportamiento.
3. Registra el cambio en `CHANGELOG.md`.
4. Ejecuta la regresión: `powershell -ExecutionPolicy Bypass -File .\tools\tests\verify-variants.ps1`.
5. Ejecuta `deploy.ps1` (regenera `dist/` y reinstala en los tres runtimes).

Nunca edites `dist/`: se borra y se regenera en cada despliegue.

Los `.ps1` se guardan en **UTF-8 con BOM**; los `.md`, sin BOM. Windows PowerShell 5.1 lee un `.ps1` sin
BOM como ANSI y corrompe los literales acentuados. El generador lo detecta y se detiene antes de escribir
nada, y la regresión compara las variantes contra `dist/` para pillarlo igualmente.

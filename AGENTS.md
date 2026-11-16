# AGENTS.md — agente_seguridad_laravel

## Qué es este repo
Fuente de verdad y documentación del **agente auditor de seguridad para Laravel 13 / PHP 8.5**.
Aquí se editan los agentes; desde aquí se despliegan a OpenCode, Claude Code y Codex CLI.

**No es un proyecto Laravel.** No hay `composer.json` ni código de aplicación Laravel.
Sí hay código propio: el motor en `engine/` (Node 22, sin dependencias) y sus tests.
Los specs de compliance (Ley 21.719 + GDPR) viven aparte en `E:\seguridad_laravel\*.md`.

## Estructura
- `agents/*.md` — **fuente única de verdad**. Frontmatter YAML + prompt.
  - `laravel-sec-auditor` (primary), `sec-static`, `sec-config`, `sec-dynamic`, `sec-quality` (subagentes).
- `tools/build-variants.ps1` — genera `dist/` desde `agents/*.md`. No dupliques prompts a mano.
- `dist/` — **generado**, se borra y regenera en cada despliegue. Nunca se edita.
  - `dist/claude/agents/` — variantes de Claude Code.
  - `dist/codex/agents/` — subagentes de Codex en TOML.
  - `dist/codex/project-kit/` — `AGENTS.md` + `.codex/` para copiar en el proyecto auditado.
- `claude/settings.template.json` — barrera de escritura para `<proyecto>/.claude/settings.json`.
- `codex/project-kit/.codex/` — plantillas de perfil de permisos y reglas de Codex.
- `reference/*.md` — documentación humana de mantenimiento (reglas, formato, scoring, herramientas, checklist).
- `schemas/*.schema.json` — contratos formales de subagente y de `resumen.json`.
- `tools/validate-reports.ps1` — validador de contratos sin dependencias (PS 5.1 no trae `Test-Json`).
- `engine/` — motor determinista en Node 22 **sin dependencias**: gate de autorización, contrato,
  scoring y `resumen.json`. No es el agente; es el sistema que el agente consulta.
- `desktop/Sectest.App` — app de escritorio WPF (net8.0-windows) sobre el CLI del motor.
  `desktop/winui/` es la variante WinUI 3, bloqueada por falta de Visual Studio Build Tools.
- `desktop/README.md` — uso de la app, publicación del `.exe` y variables de entorno.
- `templates/` — plantillas de autorización, credenciales y estructura de `sectest/reports/`.
- `deploy.ps1` — generación e instalación global en los tres runtimes.

## Comandos
```powershell
# Regenerar variantes + instalar en OpenCode, Claude Code y Codex
powershell -ExecutionPolicy Bypass -File .\deploy.ps1

# Solo OpenCode (no regenera dist/)
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -SkipVariants

# Regenerar dist/ sin instalar nada
powershell -ExecutionPolicy Bypass -File .\tools\build-variants.ps1

# Regresión del generador (genera en temporal y valida todos los contratos)
powershell -ExecutionPolicy Bypass -File .\tools\tests\verify-variants.ps1

# Motor: tests deterministas (sin red ni herramientas externas)
cd engine; node --test

# Motor: validar un proyecto auditado sin escribir nada
node engine/src/cli.js check --project <proyecto> --now 2026-11-06T15:00:00-03:00

# Motor: consolidar y emitir resumen.json + INFORME_FINAL.md + INDICE.md
node engine/src/cli.js run --project <proyecto> --now 2026-11-06T15:00:00-03:00 --write

# Motor: ejecutar la Fase 1 y emitir contrato + hallazgos + informe individual
node engine/src/cli.js static --project <proyecto> --now 2026-11-06T15:00:00-03:00 --write

# Motor: Fase 2 (configuracion local, php.ini, servidor, SBOM)
node engine/src/cli.js config --project <proyecto> --now 2026-11-06T15:00:00-03:00 --write

# Motor: Fase 4 (pruebas, cobertura, estilo)
node engine/src/cli.js quality --project <proyecto> --now 2026-11-06T15:00:00-03:00 --write

# Motor: generar plan desde rutas + arnes de pruebas (y opcionalmente instalar herramientas)
node engine/src/cli.js prepare --project <proyecto>
node engine/src/cli.js prepare --project <proyecto> --install

# Motor: canario IDOR con la sesion de B (descubrir y aplicar)
node engine/src/cli.js canary --project <proyecto> --base-url https://staging... --list-url /api/invoices
node engine/src/cli.js canary --project <proyecto> --base-url https://staging... --list-url /api/invoices --apply 5002

# Motor: ejecutar la Fase 3 (solo GET) contra staging autorizado
node engine/src/cli.js dynamic --project <proyecto> --base-url https://staging... --now 2026-11-06T15:00:00-03:00 --write

# Motor: Fase 3 autenticada con plan declarativo (login, IDOR, escalada, logout)
node engine/src/cli.js dynamic --project <proyecto> --base-url https://staging... --plan sectest\scope\dynamic-plan.json --now 2026-11-06T15:00:00-03:00 --write

# Motor: planificar e instalar herramientas faltantes fuera del proyecto
node engine/src/cli.js tools --project <proyecto>
node engine/src/cli.js tools --project <proyecto> --install --yes --tool gitleaks

# Escritorio: compilar y abrir (resuelve el SDK en %LOCALAPPDATA%)
powershell -ExecutionPolicy Bypass -File .\desktop\build.ps1
powershell -ExecutionPolicy Bypass -File .\desktop\run.ps1

# Escritorio: publicar .exe autocontenido en desktop\dist
powershell -ExecutionPolicy Bypass -File .\desktop\publish.ps1

# Verificar que un frontmatter abre correctamente
Get-Content .\agents\laravel-sec-auditor.md -TotalCount 1   # debe ser ---
```
Tras desplegar hay que **reiniciar OpenCode**: la config no se recarga en caliente.
Claude Code detecta agentes nuevos en `~/.claude/agents/` en caliente salvo que el directorio
no existiera al arrancar la sesión.

## Reglas del agente (no romperlas al editar)
- **Escritura confinada a `sectest/`.** OpenCode: `permission.edit` permite `sectest/**` y deniega
  `sectest/scope/authorization.md`, que firma el responsable humano. El código de la aplicación,
  `.env`, `composer.json`, `composer.lock` y `tests/` del proyecto siguen fuera de la superficie.
- **Excepciones acotadas, con casilla en la autorización:** crear pruebas en `sectest/tests/`,
  instalar herramientas de testing en `sectest/tools/` (composer.json propio +
  `composer install --working-dir sectest/tools`), generar `sectest/scope/dynamic-plan.json` desde las
  rutas y ejecutar la suite. Sin la casilla marcada, la acción no se ejecuta.
- **Credenciales en `sectest/scope/credentials.conf`**, nunca en el chat ni en la autorización. El agente crea el
  archivo vacío y solo agrega claves faltantes; los valores los carga el humano. El agente no lo abre con la
  herramienta de lectura: resuelve el valor dentro del shell y lo pasa a `curl` con `--netrc-file`. `curl -u`
  está prohibido porque expone el secreto en la lista de procesos.
- **La app no se parchea.** Las pruebas pueden revelar un bug; la corrección se describe en el informe.
- **Bash restringido** (OpenCode): se deniegan `rm`/`del`/`Remove-Item`, `git commit|push|checkout|reset|clean|stash|apply|merge|rebase`,
  `composer require|update`, y `php artisan migrate|db:*|key:generate|*:cache|optimize|storage:link`,
  incluida la forma con ruta absoluta (`*artisan migrate*`) porque `php artisan …*` no la cubre.
  La última regla, `*authorization.md*`, bloquea cualquier comando que mencione la autorización firmada.
  No es un sandbox: un intérprete puede construir esa ruta por partes y esquivarlo. La garantía real es
  la puerta de firma, no la lista de comandos.
- **REGLA CERO** en los 7 prompts: el agente nunca aplica parches ni mejoras, solo informa.
- Herramienta ausente ⇒ prueba `bloqueada`, nunca `aprobada`. No inventar CVEs ni resultados.
- Informes en **español neutro**; claves JSON en **inglés**.
- Los 6 subagentes tienen `task: deny` (no pueden lanzar otros agentes).

## Entorno (verificado, no asumir otra cosa)
- PHP 8.5.12 y Composer están en Laragon pero **NO en PATH**:
  - `E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64`
  - `E:\laragon_8\bin\composer\composer.phar`
- Node, npm, Git y Python 3.6 presentes.
- **SDK de .NET 8 instalado en modo usuario** en `%LOCALAPPDATA%\Microsoft\dotnet` (no está en PATH).
  `desktop\build.ps1` lo resuelve.
- **Visual Studio Build Tools NO está instalado**: por eso WinUI 3 no compila y la app activa es WPF.
- **NO instalados**: `semgrep`, `gitleaks`, `trivy`, `phpstan`, `psalm`, `zap`, `testssl.sh`, `docker`.
- **Codex CLI no está instalado**: `~/.codex/` no existía antes del despliegue. Las variantes de Codex
  están validadas solo de forma estructural; no hay evidencia de ejecución.
- Ver `reference/04-herramientas-y-degradacion.md` para rutas y comandos.

## Dónde se escriben los resultados
En el **proyecto auditado**, no aquí: `<proyecto>/sectest/reports/{INDICE,INFORME_FINAL,resumen.json,A-01-STATIC,A-02-CONFIG,A-03-DYNAMIC,A-04-QUALITY}`.
Si `sectest/reports/` ya existía, el agente crea `sectest/reports/<fecha>/` y no borra lo anterior.

## Gotchas
- Los agentes son **autocontenidos**: no deben leer archivos de este repo en tiempo de ejecución.
  Si cambias el comportamiento, edita el `.md` del agente, no solo `reference/`.
- **Genera, no dupliques.** Toda variante sale de `agents/*.md`. Si editas `dist/`, el próximo
  despliegue lo borra.
- El cuerpo del prompt se copia tal cual a cada runtime. Lo único que el generador sustituye son dos
  nombres de herramienta que no existen fuera de OpenCode: `` `task` `` y `` `webfetch` ``.
- `laravel-sec-auditor` no es el agente por defecto de OpenCode (lo es `gentle-orchestrator`); hay que seleccionarlo.
- En OpenCode, `edit` cubre escritura y edición; no existe una clave `write` separada en `permission`.
- Los patrones de permiso usan orden: regla amplia primero, específica al final; gana la última coincidencia.
- Si un subagente devuelve JSON inválido, el orquestador reintenta una vez y luego lo marca `bloqueado`.
- **Claude Code ignora reglas `Write(ruta)`/`Glob(ruta)`/`NotebookEdit(ruta)`**: acepta la regla y nunca
  la aplica. Usa `Edit(ruta)`.
- **Un prefijo `/ruta` en `~/.claude/settings.json` se ancla en `~/.claude/ruta`**, no en el proyecto.
  Por eso la barrera de rutas va en `<proyecto>/.claude/settings.json`.
- **`disallowedTools` con especificador elimina la herramienta completa** en Claude Code. Para bloquear
  comandos concretos, la regla `Bash(...)` va en `permissions.deny`.
- **No pongas el protocolo de auditoría en `~/.codex/AGENTS.md`**: se concatena en todas las sesiones de
  Codex de la máquina. Va en la raíz del proyecto auditado.
- **Encoding**: los `.md` de entrada y los artefactos de `dist/` son UTF-8 **sin** BOM. Los `.ps1`
  (`tools/build-variants.ps1`, `deploy.ps1`, `tools/tests/verify-variants.ps1`) son UTF-8 **con** BOM:
  Windows PowerShell 5.1 lee un `.ps1` sin BOM como ANSI y corrompe sus literales acentuados antes de
  ejecutarlos. El generador se niega a correr si contiene bytes no ASCII y le falta el BOM.
- No uses `Get-Content` para leer contenido: usa `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`.
  `Set-Content`/`Out-File` solo con `-Encoding UTF8`.
- Una consola Windows con codepage `ibm850` muestra los acentos corruptos aunque el archivo esté correcto.
  Verifica el archivo, no la consola.
- Los comentarios de `.codex/config.toml` son `#`. `//` no es TOML válido.
- La config global de OpenCode (y la de Claude) deniega editar `*.env*`. Por eso el almacén de
  credenciales es `sectest/scope/credentials.conf`: renombrarlo a `.env` rompería la creación automática de
  claves. No debilites esa denegación para acomodar el nombre.

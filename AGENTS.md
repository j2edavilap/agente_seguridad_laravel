# AGENTS.md — agente_seguridad_laravel

## Qué es este repo
Fuente de verdad y documentación del **agente auditor de seguridad para Laravel 13 / PHP 8.5**.
Aquí se editan los agentes; desde aquí se despliegan a OpenCode, Claude Code y Codex CLI.

**No es un proyecto Laravel.** No hay `composer.json`, ni tests, ni código de aplicación.
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
- `templates/` — plantilla de autorización y estructura de `reports/`.
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

# Verificar que un frontmatter abre correctamente
Get-Content .\agents\laravel-sec-auditor.md -TotalCount 1   # debe ser ---
```
Tras desplegar hay que **reiniciar OpenCode**: la config no se recarga en caliente.
Claude Code detecta agentes nuevos en `~/.claude/agents/` en caliente salvo que el directorio
no existiera al arrancar la sesión.

## Reglas del agente (no romperlas al editar)
- **Solo lectura sobre el proyecto auditado.** OpenCode: `permission.edit` permite únicamente `reports/**` y
  `scope/authorization.draft.md`. `scope/authorization.md` está fuera del permiso a propósito: lo firma y
  lo nombra el responsable humano, y el agente no puede autorizarse a sí mismo. No lo amplíes sin justificarlo.
- **EXCEPCIÓN — Creación de pruebas de PHPUnit:** si el proyecto no tiene pruebas y el usuario lo pide
  explícitamente, el agente sec-quality puede crear archivos nuevos en `tests/Feature/` y `tests/Unit/`
  (solo crear, nunca editar código existente). Es la única excepción a la regla de solo lectura y requiere
  autorización explícita del usuario para el proyecto específico.
- **EXCEPCIÓN — Instalación y ejecución de herramientas de análisis estático (phpstan/psalm):** si el proyecto no tiene estas herramientas y el usuario lo pide explícitamente, el agente sec-quality puede instalarlas con `composer require --dev` y ejecutar el análisis estático sobre el proyecto. Es una excepción a la regla de solo lectura y requiere autorización explícita del usuario para el proyecto específico.
- **Bash restringido** (OpenCode): se deniegan `rm`/`del`/`Remove-Item`, `git commit|push|checkout|reset|clean|stash|apply|merge|rebase`,
  `composer require|update`, y `php artisan migrate|db:*|key:generate|*:cache|optimize|storage:link`,
  incluida la forma con ruta absoluta (`*artisan migrate*`) porque `php artisan …*` no la cubre.
  La última regla, `*authorization.md*`, bloquea cualquier comando que mencione la autorización firmada.
  No es un sandbox: un intérprete puede construir esa ruta por partes y esquivarlo. La garantía real es
  la puerta de firma, no la lista de comandos.
- **REGLA CERO** en los 5 prompts: el agente nunca aplica parches ni mejoras, solo informa.
- Herramienta ausente ⇒ prueba `bloqueada`, nunca `aprobada`. No inventar CVEs ni resultados.
- Informes en **español neutro**; claves JSON en **inglés**.
- Los 4 subagentes tienen `task: deny` (no pueden lanzar otros agentes).

## Entorno (verificado, no asumir otra cosa)
- PHP 8.5.12 y Composer están en Laragon pero **NO en PATH**:
  - `E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64`
  - `E:\laragon_8\bin\composer\composer.phar`
- Node, npm, Git y Python 3.6 presentes.
- **NO instalados**: `semgrep`, `gitleaks`, `trivy`, `phpstan`, `psalm`, `zap`, `testssl.sh`, `docker`.
- **Codex CLI no está instalado**: `~/.codex/` no existía antes del despliegue. Las variantes de Codex
  están validadas solo de forma estructural; no hay evidencia de ejecución.
- Ver `reference/04-herramientas-y-degradacion.md` para rutas y comandos.

## Dónde se escriben los resultados
En el **proyecto auditado**, no aquí: `<proyecto>/reports/{INDICE,INFORME_FINAL,resumen.json,A-01-STATIC,A-02-CONFIG,A-03-DYNAMIC,A-04-QUALITY}`.
Si `reports/` ya existía, el agente crea `reports/<fecha>/` y no borra lo anterior.

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

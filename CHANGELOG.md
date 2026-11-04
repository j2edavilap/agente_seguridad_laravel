# Changelog

## [0.3.0] — 2026-11-03

### Añadido

- **Paso 0 — Entrevista de autorización.** El orquestador ya no se limita a detenerse cuando falta
  `scope/authorization.md`: su primer acto es pedir, en un único mensaje, los once campos necesarios
  (proyecto, versión, responsable, staging, lista blanca, ventana, credenciales por rol, pruebas
  autorizadas, datos `SECTEST_`, umbrales y tipo de aplicación) y escribir
  `scope/authorization.draft.md` con el esqueleto completo rellenado. Incluye el esqueleto del archivo
  dentro del prompt, porque los agentes son autocontenidos.
- Reglas de relleno: dato ausente → `PENDIENTE`; producción → siempre `Nunca`; firma siempre vacía;
  una casilla solo se marca si el humano la autorizó de forma explícita.

### Cambiado

- **La autorización la firma un humano, no el agente.** El borrador es `scope/authorization.draft.md`;
  el responsable lo revisa, firma y lo guarda como `scope/authorization.md`. El rename es el acto de
  consentimiento. Si el agente pudiera escribir el archivo que luego valida, podría autorizarse solo.
- Superficie de escritura actualizada en los tres runtimes: OpenCode permite `scope/authorization.draft.md`
  (y no el archivo real), `claude/settings.template.json` pasa a 2 `allow` y 99 `deny` con
  `Edit(./scope/authorization.md)` denegado, y el perfil de Codex reabre escritura solo en el borrador.
- La puerta de activación exige ahora, además de los 5 campos, que el archivo no diga
  `Estado: BORRADOR` y que la sección de firma esté completa.
- `templates/scope-authorization.md` y `reference/01-reglas-y-flujo.md` describen el flujo borrador → firma → rename.

### Documentación

- `reference/06-mejores-practicas-laravel13.md`: mejores prácticas oficiales de Laravel 13 (docs.git rama `13.x`) de seguridad y velocidad, citando origen y norma ISO 27001 / CWE.
- `reference/05-checklist-laravel13.md`: controles S21–S23 (rehash de contraseña, logout seguro, rotación de `APP_KEY`) y nueva sección E de velocidad y rendimiento (V1–V10: caché, despliegue, consultas, rate limiting, Octane, sesión).
- `README.md`: sección "Qué evalúa el auditor en Laravel 13" con controles de seguridad y velocidad, y estructura actualizada con `reference/06`.

## [0.2.0] — 2026-11-03

### Añadido

- Soporte multi-runtime: el mismo auditor para OpenCode, Claude Code y Codex CLI desde una única fuente.
- `tools/build-variants.ps1`, generador que produce `dist/` desde `agents/*.md`:
  - `dist/claude/agents/*.md` con frontmatter `name`, `description`, `tools` y `model`.
  - `dist/codex/agents/*.toml` con `name`, `description` y `developer_instructions` como cadena
    literal TOML (respeta las barras invertidas de las rutas de Windows).
  - `dist/codex/project-kit/` con `AGENTS.md` y `.codex/`.
- Variantes de Claude Code: orquestador con `Agent(sec-static, sec-config, sec-dynamic, sec-quality)` y
  subagentes con lista de herramientas en solo lectura más `Edit`/`Write` acotados por permisos.
- `claude/settings.template.json`: 2 reglas `allow` y 98 `deny` para `<proyecto>/.claude/settings.json`.
- Kit de proyecto de Codex: perfil de permisos `laravel-audit` en `.codex/config.toml` y cuatro
  `prefix_rule` `forbidden` en `.codex/rules/laravel-audit.rules`.
- `deploy.ps1` instala en los tres runtimes, crea directorios ausentes, respalda lo reemplazado y sale
  con código distinto de cero si la validación falla. Nuevo modificador `-SkipVariants`.
- `odd/tasks/multi-runtime-port.md` con el registro de decisiones del port.

### Corregido

- **Mojibake en los artefactos de Codex**: `tools/build-variants.ps1` estaba en UTF-8 sin BOM y Windows
  PowerShell 5.1 lo leía como ANSI, corrompiendo los literales acentuados antes de escribirlos. Afectaba a
  `AGENTS.md` del kit (`auditoría`, `raíz`, `están`, `—`) y a la primera línea de cada `.toml`. Los
  scripts `.ps1` pasan a UTF-8 con BOM y el generador se niega a ejecutarse si detecta bytes no ASCII sin
  BOM.
- `deploy.ps1` usaba `Get-Content` (ANSI por defecto) para validar el frontmatter; ahora lee con
  `[System.IO.File]::ReadAllText(..., UTF8)`.
- `deploy.ps1` valida ahora el contenido del kit de Codex (`default_permissions`, `extends`, permiso de
  escritura en `reports`, ausencia de `sandbox_mode`, número de `prefix_rule`), detecta mojibake en
  `AGENTS.md` y comprueba `claude/settings.template.json`.
- Corregido el conteo documentado de reglas `bash` de OpenCode: son 33 (más 1 regla `edit` deny = 34
  líneas `deny` en total).

### Añadido (verificación)

- `tools/tests/verify-variants.ps1`: regresión del generador. Genera en un directorio temporal y valida
  encoding (sin BOM, sin U+FFFD, sin mojibake), frontmatter de Claude Code, ausencia de claves de OpenCode,
  delimitadores TOML, perfil de permisos y reglas de Codex, contrato de `deploy.ps1` y paridad con `dist/`.
  Sale con código 1 si algo falla.

### Cambiado

- `README.md` y `AGENTS.md` documentan la matriz de runtimes y las limitaciones reales de cada uno.

### Limitaciones declaradas

- Codex CLI no está instalado en esta máquina: las variantes están validadas estructuralmente (TOML
  parseado, claves y delimitadores verificados), sin evidencia de ejecución.
- Los perfiles de permisos de Codex son beta y no se combinan con `sandbox_mode`.

## [0.1.0] — 2026-11-03

### Añadido

- Agente orquestador `laravel-sec-auditor` (mode: primary) para Laravel 13 / PHP 8.5.
- Cuatro subagentes agrupados por fase:
  - `sec-static` (Fase 1: SCA + SAST + Laravel estático)
  - `sec-config` (Fases 2 y 5: configuración + infraestructura)
  - `sec-dynamic` (Fase 3: acceso, auth, inyección, archivos, web, lógica, datos, API)
  - `sec-quality` (transversal + Fase 6: calidad ISO 25010/29119 + SPICE)
- Permisos que restringen la escritura a `reports/**` y `scope/authorization.template.md`.
- Bloqueo de comandos destructivos y de escritura de git/migraciones/caché.
- `deploy.ps1` para instalar los agentes en `~/.config/opencode/agent/`.
- Documentación de referencia: reglas/flujo, formato de informes, cuantificación y normas,
  herramientas y degradación, checklist Laravel 13.
- Plantillas de autorización y de estructura de `reports/`.

### Decisiones

- Arquitectura híbrida 1 orquestador + 4 subagentes (en lugar de 18 subagentes reales):
  mantiene el paralelismo útil con un mantenimiento razonable.
- Informes en español neutro; claves JSON en inglés.
- Los agentes son autocontenidos: no dependen de archivos del repo en tiempo de ejecución.
- Herramienta ausente ⇒ prueba `bloqueada`, nunca `aprobada`.

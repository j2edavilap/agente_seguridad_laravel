# Changelog

## [0.19.0] — 2026-11-11

### Cambiado

- **Informes sin soluciones.** Se elimina remediación, esfuerzo, responsable y plan de plazos del
  informe individual y del final. El auditor describe y prioriza; la corrección es de otro agente.
- **Fallos agrupados por prioridad** (crítico, alto, medio, bajo, informativo) con ID, título,
  descripción, ubicación, evidencia, por qué es un problema, OWASP/CWE y control ISO.
- **Nuevo `sectest/reports/HALLAZGOS_FALLAS.md`:** solo fallos, con cómo se encontró y cómo se replica,
  pensado para que otra IA evalúe y corrija. Sin solución, sin esfuerzo y sin responsables.
- Narrativa determinista por regla y adaptador (`report/narrative.js`): descripción, impacto y
  reproducción. Los artefactos dejan de incluir `remediation`.
- Escritorio: botón **Abrir fallos**.
- `reference/01`, `reference/02`, `reference/05`, prompts y plantilla actualizados.

## [0.18.0] — 2026-11-10

### Añadido

- **Enumeración controlada autorizada.** Nueva casilla `Enumeración controlada de IDs`. El plan admite
  `enumerate` con tope de 100 IDs, corte a los 5 hallazgos, evidencia de ID + estado y resultado
  `probable` (sin control del dueño).
- **Canario IDOR asistido.** Comando `canary`: con la sesión de B lista sus recursos y propone un
  canario. El escritorio suma los campos **Lista de B** y **Campo ID** más un selector modal; al
  confirmar, escribe `crossAccess` con `as: user`, `owner: userB`.
- **Subagentes con NVIDIA Nemotron:** `sec-idor` (canario, control positivo, enumeración) y `sec-tests`
  (arnés y ejecución), con `model: nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b` en OpenCode.
- `session.js` compartido: el login de `dynamic` y `canary` ya no se duplica.

### Cambiado

- `reference/07-idor-bola.md`: la enumeración deja de ser una prohibición absoluta y pasa a ser una
  prueba autorizada con condiciones (staging, ≤100, sin extracción, corte temprano).
- Prompts, plantilla de autorización, README, AGENTS y app de escritorio actualizados.
- 6 tests nuevos (110): enumeración autorizada y bloqueada, y canario (extracción, URL, dedupe, login B).

## [0.17.0] — 2026-11-10

### Añadido

- **Revisión rápida previa del Paso 0.** El agente detecta ruta, nombre (`.env`/`composer.json`),
  versión (git), zona horaria, stack y tipo de aplicación antes de preguntar. Lo detectado se escribe
  con la marca `(detectado)` y solo se pregunta lo que falte.
- **Ventana automática:** ahora → ahora + 24 h en la zona del proyecto.
- **Datos de prueba y BD de test premarcados** con aviso explícito: se crean datos `SECTEST_` y se
  ejecuta la suite sobre la BD de test; no se toca producción. También quedan premarcados el arnés, la
  instalación aislada, el plan y la ejecución.
- **Segundo usuario normal (B)** en credenciales y en la autorización, para IDOR horizontal.
- **IDOR/BOLA con control positivo:** `crossAccess` acepta `as` y `owner`; el motor repite la petición
  con el dueño. Si el dueño tampoco accede, el hallazgo baja de `confirmado` a `probable`.
- `reference/07-idor-bola.md`: especificación completa (requisitos, datos, plan, procedimiento,
  severidad, evidencia, casos especiales y defensa en Laravel).

### Cambiado

- El plan generado por `prepare` incluye `smoke` con las rutas GET sin parámetros.
- La fase dinámica agrega `auth-smoke`: recorre esas rutas con la sesión de A y reporta 5xx.
- `prepare` genera `AuthenticatedSmokeTest.php` si existen `app/Models/User.php` y `UserFactory`.

## [0.16.0] — 2026-11-10

### Añadido

- **Plan automático desde el agente.** Si la casilla `Generar plan de pruebas desde las rutas` está
  marcada, el orquestador genera `sectest/scope/dynamic-plan.json` en el mismo turno, sin pedirle al
  humano que lo escriba.
- El plan incluye `smoke` (rutas GET sin parámetros). La fase dinámica agrega el check `auth-smoke`:
  recorre esas rutas con la sesión del usuario normal y reporta cualquier 5xx.
- `prepare` genera `AuthenticatedSmokeTest.php` cuando existen `app/Models/User.php` y
  `database/factories/UserFactory.php`; usa `User::factory()->create()` + `actingAs`.
- Escritorio: botón **Ejecutar todo** (prepare --install → estática → configuración → calidad →
  dinámica si hay staging → consolidar). Toma el plan generado automáticamente y no se detiene si un
  paso falla.

### Notas

- El barrido autenticado no adivina IDs: recorre solo rutas sin parámetros. IDOR sigue requiriendo
  `crossAccess` con IDs reales en el plan.

## [0.15.0] — 2026-11-10

### Cambiado

- **Una sola carpeta de salida: `sectest/`.** `scope/` y `reports/` se migraron a `sectest/scope/` y
  `sectest/reports/`, y se agregaron `sectest/tests/` y `sectest/tools/`. Actualizados motor, esquemas,
  prompts, permisos de los tres runtimes, plantillas, app de escritorio y validadores.
- **Política de escritura ampliada y acotada.** El agente puede crear pruebas e instalar herramientas
  de testing, siempre dentro de `sectest/` y solo con la casilla correspondiente en la sección 6.
  El código de la aplicación sigue siendo de solo lectura y `sectest/scope/authorization.md` sigue
  siendo exclusivamente humano.
- `credentials.conf` ausente es advertencia, no bloqueo: las fases 1/2/4 corren igual.

### Añadido

- Comando `prepare`: lee `route:list --json`, genera `sectest/scope/dynamic-plan.json` (login,
  `adminEndpoints` y rutas pendientes con parámetros) y el arnés `sectest/tests/` con `phpunit.xml`,
  `TestCase.php` y smoke tests `< 500` por ruta GET. `--install` ejecuta `composer install` en
  `sectest/tools/`.
- `sectest/tools/composer.json` aislado con PHPUnit, PHPStan y Pint: **no** toca el `composer.json`
  del proyecto.
- Cuatro casillas nuevas en la autorización: crear pruebas, instalar herramientas, generar plan y
  ejecutar la suite.
- `assertInsideSectest` para el arnés; los informes siguen confinados a `sectest/reports/`.
- App de escritorio: botones **Generar plan** y **Preparar pruebas**, panel de estado y reportes sobre
  `sectest/`.
- 6 tests nuevos (104): clasificación de rutas, plan, smoke tests, composer aislado y `prepare` de punta
  a punta con un `artisan` de prueba.

## [0.14.0] — 2026-11-07

### Añadido

- Formulario de escritorio con **ejemplos en cada campo** (placeholder) e **iconos de información** con
  el detalle de qué se espera y qué pasa si falta.
- **Panel de estado del proyecto**: verifica `scope/authorization.md` (firmada, borrador, firma
  incompleta, no existe) y `scope/credentials.conf` (claves cargadas, vacías, no existe) al salir del
  campo y después de cada fase.
- Controles reutilizables `HintTextBox` e `InfoIcon`.

### Cambiado

- **`credentials.conf` ausente ya no bloquea el gate**: pasa a advertencia. Las fases 1, 2 y 4 corren
  sin credenciales; las pruebas autenticadas quedan bloqueadas. `authorization.md` sigue siendo
  bloqueante: sin firma no hay auditoría.
- Nuevo test: `check` sin `credentials.conf` sale 0 y emite la advertencia.

### Publicado

- `desktop/dist/Sectest.App.exe` — 68.3 MB, sha256 `3F1B6AF993CD359C78FE4F56B44B43AE28BE1DBE56A943DBF6BE0BB86991E40F`.

## [0.13.0] — 2026-11-07

### Añadido

- **Publicación del `.exe`** (`desktop/publish.ps1`): Release, `win-x64`, self-contained, single-file y
  comprimido. Genera `desktop/dist/Sectest.App.exe` (~68 MB) junto con `engine/` y `schemas/`, e imprime
  tamaño y SHA-256.
- El `.exe` no requiere el SDK de .NET en el equipo destino; sí Node 20+ para ejecutar el motor.

### Corregido

- El empaquetado necesitaba `schemas/` al lado de `engine/`: el motor los resuelve con
  `../../../schemas` desde `src/domain`, así que sin esa carpeta el CLI empaquetado fallaba al cargar.

## [0.12.0] — 2026-11-07

### Añadido

- **App de escritorio WPF** (`desktop/Sectest.App`, net8.0-windows): selecciona el proyecto, verifica
  la autorización, ejecuta las fases 1/2/3/4, consolida y abre `reports/`. La UI no calcula nada:
  invoca el CLI del motor y lee `resumen.json` y `hallazgos/*.json`.
- Descubrimiento del motor por `SECTEST_ENGINE_CLI` o búsqueda ascendente desde el `.exe`;
  `SECTEST_NODE` y `SECTEST_PROJECT` como overrides.
- `desktop/build.ps1` y `desktop/run.ps1`, que resuelven el SDK desde PATH o desde
  `%LOCALAPPDATA%\Microsoft\dotnet`.
- Variante **WinUI 3** en `desktop/winui/`, con README del bloqueo y cómo revivirla.

### Notas

- **WinUI 3 no compila en esta máquina**: el payload requiere tareas MSBuild de Appx
  (`Microsoft.Build.Packaging.Pri.Tasks.dll`, `Microsoft.Build.AppxPackage.dll`) que solo instala
  Visual Studio Build Tools. WPF se eligió para entregar una app funcional con el SDK de .NET 8.
- SDK de .NET **8.0.427** instalado en modo usuario; no se agregó a PATH.

## [0.11.0] — 2026-11-07

### Añadido

- **Fase 2 en el motor** (`config`): `.gitignore`, `.env` rastreado por git, `php.ini`
  (`allow_url_include`, `display_errors`, cookies de sesión, `use_strict_mode`), archivos de servidor y
  contenedor (`Options Indexes`, `server_tokens`, TLS 1.0/1.1, `FROM :latest`, `USER root`, secretos en
  `ENV`) e inventario de `composer.lock`.
- **Fase 4 en el motor** (`quality`): pruebas con `--log-junit`, cobertura con `--coverage-clover` (solo
  con Xdebug/PCOV) y estilo con Pint `--test`. Guarda: no ejecuta la suite si no puede confirmar una base
  de test aislada.
- Los controles del Anexo A se **suman** entre informes. Antes solo A-CONFIG los reportaba y CI quedaba
  `null` sin esa fase; ahora cada fase aporta los que verificó.
- `emitPhaseArtifacts` unifica la salida de contrato, hallazgos e informe para las fases locales.
- 10 tests nuevos (97 en total): parsers de php.ini/gitignore/servidor, JUnit, Clover, Pint, contrato de
  configuración y end-to-end de `config --write`.

### Cambiado

- El veredicto deja de ser `no_evaluable` en cuanto hay fase 2: con SEG y CI calculados, el motor emite
  `aprobado`, `condicionado` o `rechazado`. En el ejemplo, `rechazado` con SEG 50 y CI 50.

## [0.10.0] — 2026-11-07

### Añadido

- **E5.1 — fase dinámica autenticada con plan declarativo.** El motor no adivina rutas: ejecuta
  `scope/dynamic-plan.json` (o `--plan <archivo>`), validado antes de correr.
  - `login`: form o JSON, con extracción de token CSRF por patrón, `successStatus` y captura de la
    cookie de sesión por rol.
  - `adminEndpoints`: escalada vertical (usuario normal contra endpoints administrativos).
  - `crossAccess`: IDOR/BOLA (recurso declarado como ajeno).
  - `logout` + `protectedUrl`: sesión que sobrevive al cierre.
- Gate: el plan exige la casilla `Pruebas de autenticación y sesión` en la sección 6, además de la
  autorización firmada y la lista blanca.
- `POST` habilitado solo cuando existe plan, y solo hacia las URLs del plan. El resto sigue en GET.
- La evidencia nunca contiene contraseñas ni cookies: el cuerpo del request se registra como
  `body_sha256` y las cabeceras se enmascaran.
- 5 tests nuevos (87 en total): login con CSRF, IDOR, escalada, logout, enmascarado de evidencia y
  rechazo de planes inválidos o sin autorización.

### Notas

- Un intento de login por rol. No hay fuerza bruta ni credenciales de relleno.
- Si un rol no puede autenticarse, los checks dependientes quedan `bloqueada`, nunca `aprobada`.

## [0.9.0] — 2026-11-07

### Añadido

- **E5 — fase dinámica GET.** Comando `dynamic --project … --base-url … [--write]`.
  - Gate en código: autorización firmada, casilla `Peticiones HTTP GET de reconocimiento` marcada en la
    sección 6 y `--base-url` dentro de la lista blanca.
  - Cliente HTTP con lista blanca validada **en cada salto**, redirects acotados a 3, presupuesto de 40
    peticiones, timeout de 10 s, cuerpo máximo de 512 KB y enmascarado de cookies y `Authorization`.
  - Checks: cabeceras de seguridad, flags de cookies, CORS reflejado, redirección HTTP→HTTPS y
    exposición de archivos (`.env`, `.git/config`, logs, respaldos, `phpinfo`, `vendor/`).
  - Evidencia por check en `reports/evidencia/A-03-<check>.json`, contrato `A-03-DYNAMIC.json` e informe
    `A-03-DYNAMIC.md`.
- 9 tests nuevos (82 en total), con servidor HTTP local: escape por redirect fuera de la lista blanca,
  presupuesto agotado, evidencia enmascarada, gate de la autorización y end-to-end del CLI.

### Notas

- Solo `GET`. `POST`/`PUT`/`DELETE` no están implementados a propósito.
- IDOR/BOLA, autenticación y lógica de negocio quedan para E5.1: requieren credenciales por rol y mapa
  de rutas.

## [0.8.0] — 2026-11-07

### Añadido

- **E4 — reportes entregables.** `static --write` emite además `reports/A-01-STATIC.md` y
  `reports/hallazgos/A-STATIC.json`; `run --write` emite `reports/INFORME_FINAL.md` y
  `reports/INDICE.md`.
- Remediación determinista por regla y por adaptador: el informe no inventa prosa, usa la guía asociada
  al hallazgo (CWE/OWASP/ISO ya venían del escaneo).
- `reports/hallazgos/*.json` como almacén de evidencia: hallazgos, checks y manifiesto de herramientas.
- Formato markdown con escapado de pipes y orden estable por severidad → ubicación → ID.
- 6 tests nuevos (73 en total): secciones, escapado, determinismo del informe y end-to-end de los seis
  artefactos.

### Notas

- `INFORME_FINAL.md` declara `no_evaluable` cuando faltan dimensiones. Con solo la Fase 1, CI y CS no se
  pueden calcular: el veredicto lo dice en lugar de inventar un número.
- Los reportes de ejemplo están en `.gitignore`: se regeneran con `--write`.

## [0.7.0] — 2026-11-06

### Añadido

- **Instalación de herramientas en toolchain aislada** (`engine/src/tools/installer.js`):
  `tools --project … [--install --yes] [--tool <nombre>]`. Planifica por herramienta y solo ejecuta
  estrategias que no tocan el proyecto auditado: `composer global require` (phpstan), release oficial
  de GitHub + `tar` (gitleaks) y `pip install --user` (semgrep, solo Python ≥ 3.8).
  `assertOutsideProject` bloquea cualquier destino dentro del proyecto.
- **gitleaks conectado** a la Fase 1: `detect --no-git --redact --exit-code 0`, reporte en un temporal
  fuera del proyecto, parser y dedupe por regla/archivo/línea.
- `phpstan` se ejecuta apuntando a `app/` y solo si existe `vendor/autoload.php`, `phpstan.neon` o
  `phpstan.neon.dist`. Sin eso queda bloqueado con el motivo, en vez de inventar errores de clases.
- Detección de `python` en el manifiesto.

### Corregido

- `phpstan` se busca también en `COMPOSER_HOME` y en la toolchain, no solo en `vendor/`.

### Notas

- Verificado en esta máquina: phpstan 2.3.5 en `COMPOSER_HOME` y gitleaks 8.30.1 en la toolchain.
  `semgrep` sigue bloqueado: Python 3.6 < 3.8.
- Los lockfiles faltantes **no** se consideran instalables: generarlos modifica el proyecto auditado.

## [0.6.0] — 2026-11-06

### Añadido

- **E2 — adaptadores de la Fase 1** en `engine/src/tools/`:
  - `runner`: `execFile` con `shell: false`, timeout, captura de stdout aunque la salida sea distinta
    de cero y hash SHA-256 de la evidencia.
  - `manifest`: detección de `php`, `composer`, `phpstan`, `npm`, `semgrep` y `gitleaks` sin asumir
    PATH, con rutas de Laragon y `npm-cli.js` (nunca `.cmd`, que exige shell).
  - `grep-fallback`: 11 reglas deterministas con enmascarado de secretos.
  - Parsers puros de `composer audit`, `phpstan` (agrupado por `identifier`) y `npm audit`.
- CLI `static --project … [--write]`: ejecuta la Fase 1 y emite `reports/contratos/A-01-STATIC.json`
  validado contra el esquema.
- `engine/examples/vulnerable-app` como fixture ejecutable: 7 hallazgos esperados.
- 14 tests nuevos (59 en total): runner, parsers, escaneo, fase y determinismo.

### Notas

- Herramienta ausente ⇒ check `bloqueada` con el motivo, nunca `aprobada`.
- `semgrep` y `gitleaks` se detectan pero el adaptador queda para E2.1.

## [0.5.0] — 2026-11-06

### Añadido

- **Motor determinista `engine/`** (Node 22, cero dependencias; la máquina no tiene SDK de .NET).
  Cubre E0–E1: gate de autorización con ventana ISO 8601 y lista blanca (host exacto, comodín y CIDR
  IPv4), lectura de credenciales, validación de contratos, scoring SEG/CI/CS con veredicto y emisión
  de `reports/resumen.json` con desglose `calculos`. CLI `check` (no escribe) y `run --write`.
- 45 tests con `node --test`, incluidos end-to-end sobre un proyecto temporal: ventana vencida,
  contrato inválido y determinismo byte a byte del resumen.
- `engine/README.md` con las decisiones que no conviene revertir y las limitaciones conocidas.

### Cambiado

- El contrato de subagente incorpora `confirmados` por severidad. SEG se calcula sobre ese objeto y el
  validador exige que su suma coincida con `hallazgos_confirmados`.
- `hallazgos` cuenta hallazgos **no descartados** (confirmados + probables); `falsos_positivos` queda
  fuera como contador informativo. Así `probable = hallazgos − confirmados` es exacto y el veredicto
  no depende de una interpretación.
- La mantenibilidad la aporta A-STATIC: el motor fusiona métricas por dueño antes de calcular CS.

## [0.4.0] — 2026-11-06

### Corregido

- **Ambiguiedad en las credenciales.** La pregunta 7 pedía "usuario y cómo obtener el secreto" sin
  definir cómo se resuelve, y el rol anónimo aparecía con usuario. Ahora hay un almacén único,
  el rol anónimo no pide credenciales y la resolución está definida.
- **Contradicción de permisos (bloqueante).** Los prompts ordenaban `composer require --dev` y crear
  pruebas en `tests/`, pero los tres runtimes deniegan `Edit(./tests/**)`, `Edit(./composer.json)` y
  todo `composer require`. Las dos "excepciones" eran inejecutables. Se eliminan: la carencia se
  registra como hallazgo y la instalación se recomienda en el informe.
- **Cuantificación no determinista.** Los subagentes ya no devuelven `dimensiones`: devuelven métricas
  crudas en `metricas`. El orquestador aplica fórmulas fijas (bandas de mantenibilidad y estándares,
  re-normalización de pesos, `null` para no medible) y publica el desglose en `resumen.json.calculos`.
- **IDs con colisión.** Los hallazgos pasan a `A01-SEC-###`, `A02-INF-###`, `A03-API-###`,
  `A04-QAL-###`, con regla de dedupe por informe de origen.
- **Ventana de autorización sin verificar.** El orquestador compara ahora la hora con `Inicio`/`Fin`/
  `Zona horaria` y se detiene fuera de la ventana.
- **Numeración duplicada** en `sec-quality` (la sección 2.4 aparecía dos veces).
- **Lectura de la autorización por bash** fallaba por diseño (`*authorization.md*`); se documenta que
  se lee con la herramienta de lectura de archivos.

### Añadido

- **`scope/credentials.conf`**: almacén único de credenciales. El agente lo crea con las claves
  vacías, el humano carga los valores y el agente los resuelve dentro del shell con `--netrc-file`.
  Nunca lo lee con la herramienta de lectura y nunca pasa el secreto por argumentos (`curl -u`
  prohibido). `templates/credentials.conf.example` es la plantilla. Se usa `.conf` y no `.env`
  porque las configuraciones de OpenCode y Claude deniegan editar `*.env*`.
- `schemas/subagent-summary.schema.json` y `schemas/resumen.schema.json`.
- `tools/validate-reports.ps1`: validador sin dependencias (Windows PowerShell 5.1 no trae `Test-Json`)
  con chequeos semánticos: coherencia de `hallazgos_confirmados`, namespace de IDs, `archivo_reporte`
  y `dimensiones` contra `calculos`.
- `tools/tests/fixtures/valid|invalid` y las comprobaciones S11–S14 en `verify-variants.ps1`.
- El bloque bash es idéntico en los 5 agentes (incluye `*authorization.md*`), con test que falla si
  vuelve a divergir.
- En `sec-dynamic`: evidencia obligatoria en `reports/evidencia/` por hallazgo; sin registro, el
  hallazgo baja a `probable`.

### Notas de actualización

- Reiniciar OpenCode después de desplegar: la configuración de agentes no se recarga en caliente.

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

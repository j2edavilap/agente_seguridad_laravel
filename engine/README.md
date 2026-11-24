# Motor de auditoría (`engine/`)

Núcleo determinista del sistema. No es el agente: es lo que el agente (y mañana la app de
escritorio) consulta para decidir si puede auditar, cuánto vale lo auditado y qué se escribe.

Node 22, **cero dependencias**. No hay `npm install`.

## Uso

```powershell
cd engine
node --test                      # 104 tests, sin red externa

node src/cli.js check  --project C:\ruta\proyecto --now 2026-11-06T15:00:00-03:00
node src/cli.js prepare --project C:\ruta\proyecto --install
node src/cli.js canary  --project C:\ruta\proyecto --base-url https://staging.demo.local --list-url /api/invoices --id-field id
node src/cli.js canary  --project C:\ruta\proyecto --base-url https://staging.demo.local --list-url /api/invoices --apply 5002
node src/cli.js static --project C:\ruta\proyecto --now 2026-11-06T15:00:00-03:00 --write
node src/cli.js config --project C:\ruta\proyecto --now 2026-11-06T15:00:00-03:00 --write
node src/cli.js quality --project C:\ruta\proyecto --now 2026-11-06T15:00:00-03:00 --write
node src/cli.js dynamic --project C:\ruta\proyecto --base-url https://staging.demo.local --now 2026-11-06T15:00:00-03:00 --write
node src/cli.js run    --project C:\ruta\proyecto --now 2026-11-06T15:00:00-03:00 --write
node src/cli.js tools  --project C:\ruta\proyecto
node src/cli.js tools  --project C:\ruta\proyecto --install --yes --tool gitleaks
```

- `check`: valida autorización, credenciales y contratos. **No escribe nada.**
- `prepare`: lee `route:list`, genera `sectest/scope/dynamic-plan.json` y el arnés en `sectest/tests/`.
  Con `--install`, ejecuta `composer install` en `sectest/tools/`.
- `canary`: con la sesión de B, lista sus recursos y propone un canario IDOR. Sin `--apply` escribe
  `sectest/scope/canary.json`; con `--apply <id>` agrega la entrada a `crossAccess`.
- `static`, `config`, `quality`, `dynamic`: ejecutan cada fase y escriben contrato, hallazgos y reporte.
- `run`: consolida y emite `resumen.json`, `INFORME_FINAL.md` e `INDICE.md`.
- `tools`: planifica e instala herramientas fuera del proyecto (toolchain global).
- `--now` fija el instante de evaluación de la ventana. Sin él usa el reloj; con él, la corrida es
  reproducible.

## Estructura de salida

Todo lo que produce el agente vive en una sola carpeta del proyecto auditado:

```text
sectest/
  scope/     authorization.md (humano) · authorization.draft.md · credentials.conf · dynamic-plan.json
  reports/   informes, resumen.json, contratos, hallazgos, evidencia
  tests/     phpunit.xml, TestCase.php y smoke tests generados
  tools/     composer.json + vendor de PHPUnit, PHPStan y Pint
```

Sale con `0` si todo valida, `1` si hay errores, `2` si el uso es incorrecto.

## Qué está implementado (E0–E1)

| Pieza | Estado |
|---|---|
| Contratos JSON Schema | `schemas/`, validados en JS y en PowerShell |
| Gate de autorización (borrador, firma, ventana, lista blanca) | ✅ |
| Ventana temporal con ISO 8601 + offset y CIDR IPv4 | ✅ |
| Credenciales (`scope/credentials.conf`, `env:`, `file:`, `op://`) | ✅ |
| Scoring SEG / CI / CS / veredicto | ✅ |
| `reports/resumen.json` con desglose `calculos` | ✅ |
| Escritura confinada a `reports/` | ✅ |
| Escaneo determinista (11 reglas) | ✅ E2 |
| `composer audit`, `phpstan`, `npm audit` | ✅ E2 |
| `gitleaks` | ✅ E2 |
| `semgrep` | ⏳ E2.1 (requiere Python ≥ 3.8) |
| Instalación en toolchain aislada | ✅ E2.1 |
| Fase 2 — Configuración (php.ini, servidor, SBOM, controles Anexo A) | ✅ E6 |
| Fase 4 — Calidad (pruebas, cobertura, estilo) | ✅ E6 |
| Reportes markdown (individual, final, índice) | ✅ E4 |
| Fase dinámica GET (cabeceras, CORS, exposición, cookies, redirect HTTPS) | ✅ E5 |
| Plan autenticado (login, IDOR/BOLA, escalada vertical, logout) | ✅ E5.1 |
| Shell de escritorio | ⏳ E7 |

## Fase dinámica

Puerta de entrada, en este orden:

1. Autorización firmada y vigente.
2. Casilla `Peticiones HTTP GET de reconocimiento` marcada en la sección 6.
3. `--base-url` dentro de la lista blanca.

Garantías del cliente HTTP:

| Control | Valor |
|---|---|
| Método | solo `GET` |
| Lista blanca | validada en **cada salto**, incluidos los redirects |
| Redirects | máximo 3; si el destino sale de la whitelist, aborta |
| Presupuesto | 40 peticiones por corrida |
| Timeout | 10 s por petición |
| Cuerpo | 512 KB máximo |
| Secretos | cookies, `Authorization` y tokens enmascarados en la evidencia |

Checks: cabeceras de seguridad, flags de cookies, CORS reflejado, redirección HTTP→HTTPS, exposición
de archivos (`.env`, `.git/config`, logs, respaldos, `phpinfo`) y, si el plan trae `smoke`,
`auth-smoke`: recorre esas rutas con la sesión del usuario normal y reporta 5xx. La evidencia queda en
`sectest/reports/evidencia/A-03-<check>.json`.

### Plan autenticado (E5.1)

El motor **no adivina rutas**. Ejecuta un plan declarativo que genera `prepare` desde `route:list` o
que escribe el humano
(`sectest/scope/dynamic-plan.json`, o `--plan <archivo>`). Solo toca lo que está en el plan.

```json
{
  "version": 1,
  "login": {
    "url": "/login",
    "contentType": "form",
    "fields": { "email": "{{username}}", "password": "{{password}}" },
    "csrf": { "url": "/login", "field": "_token", "pattern": "name=\"_token\" value=\"([^\"]+)\"" },
    "successStatus": [302]
  },
  "adminEndpoints": [{ "name": "panel", "url": "/admin/users", "expect": [403] }],
  "crossAccess": [
    { "name": "factura de B", "url": "/api/invoices/5002", "as": "user", "owner": "userB", "expect": [403, 404] }
  ],
  "smoke": ["/", "/login"],
  "logout": { "url": "/logout", "protectedUrl": "/api/me" }
}
```

Reglas:

- Exige la casilla `Pruebas de autenticación y sesión` en la sección 6.
- **POST solo hacia las URLs del plan** (login/logout); el resto sigue siendo GET.
- Un intento de login por rol. Sin fuerza bruta.
- Las credenciales se leen de `sectest/scope/credentials.conf` y nunca llegan a la evidencia: el cuerpo
  del request se guarda solo como `body_sha256`.
- Si un rol no puede iniciar sesión, los checks dependientes quedan `bloqueada`, nunca `aprobada`.
- **IDOR/BOLA**: `as` indica quién ataca y `owner` quién es el dueño. El motor hace el control positivo
  con la sesión del dueño; si el dueño tampoco accede, el hallazgo baja a `probable`. Detalle completo
  en `reference/07-idor-bola.md`.

Checks que agrega: `auth-login`, `authz-admin` (escalada vertical), `authz-idor` (recurso ajeno),
`auth-logout` (sesión que sobrevive al cierre), `auth-smoke` (barrido autenticado) y `authz-enumerate`
(solo con la casilla de enumeración).

### Enumeración autorizada

Requiere la casilla `Enumeración controlada de IDs`. Se declara aparte de `crossAccess`:

```json
"enumerate": [
  { "name": "facturas secuenciales", "urlTemplate": "/api/invoices/{id}", "from": 5000, "to": 5030, "as": "user", "expect": [403, 404] }
]
```

- Tope duro: 100 IDs por entrada.
- Se detiene a los 5 hallazgos.
- Evidencia: ID y código de estado. Nunca cuerpos.
- El resultado es `probable`, porque no hay control positivo del dueño.

### Fases locales (2 y 4)

`config` revisa el entorno sin salir a la red: `.gitignore`, `.env` rastreado por git, `php.ini`,
archivos de servidor y contenedor, e inventario de `composer.lock`. Publica los controles del Anexo A
que efectivamente evaluó (A.8.9 y A.8.24), que es lo que alimenta CI.

`quality` ejecuta la suite y el estilo, con dos guardas:

- No corre pruebas si no puede confirmar una base de test aislada (`phpunit.xml` con `sqlite` o
  `:memory:`, o `.env.testing`). Si no, queda `bloqueada`.
- La cobertura solo se mide si hay Xdebug o PCOV.

Métricas que publica: `cobertura_lineas_pct`, `pruebas_totales`, `pruebas_aprobadas_n` y
`violaciones_estilo`. La mantenibilidad la sigue aportando A-STATIC.

Los controles del Anexo A se **suman** entre informes: cada fase reporta los que verificó y el
orquestador no inventa los que faltan.

## Reportes que genera

| Archivo | Origen | Contenido |
|---|---|---|
| `sectest/reports/A-01-STATIC.md` | `static --write` | Fallos con severidad, descripción, impacto, ubicación, evidencia, CWE/OWASP/ISO |
| `sectest/reports/hallazgos/A-STATIC.json` | `static --write` | Hallazgos completos, checks y manifiesto de herramientas |
| `sectest/reports/contratos/A-01-STATIC.json` | `static --write` | Contrato validado contra el esquema |
| `sectest/reports/resumen.json` | `run --write` | Consolidado con `calculos` |
| `sectest/reports/INFORME_FINAL.md` | `run --write` | Veredicto, puntuaciones, riesgos principales, bloqueos y limitaciones |
| `sectest/reports/INDICE.md` | `run --write` | Índice de artefactos |

Todo es determinista: mismo proyecto, mismo `--now`, mismos bytes.

## Instalación de herramientas

Hay dos destinos distintos:

| Destino | Comando | Para qué |
|---|---|---|
| Toolchain global (`%LOCALAPPDATA%\sectest\tools`) | `tools --install --yes` | phpstan, gitleaks, semgrep: sirven para cualquier proyecto |
| `sectest/tools/` del proyecto | `prepare --install` | PHPUnit, PHPStan y Pint para las pruebas creadas, con `composer.json` propio |

`sectest/tools/` **no toca** el `composer.json` del proyecto. Se instala con
`composer install --working-dir sectest/tools`.

| Herramienta | Estrategia | Destino |
|---|---|---|
| `phpstan` | `composer global require` | `COMPOSER_HOME/vendor` |
| `gitleaks` | release oficial de GitHub + `tar` | `toolchain/gitleaks` |
| `semgrep` | `pip install --user` (solo Python ≥ 3.8) | PATH del usuario |

Lo que **no** es instalable, y por qué:

- `composer-audit` sin `composer.lock`, y `npm-audit` sin `package-lock.json`. No falta una
  herramienta: falta estado del proyecto. Generarlo (`composer update --lock`,
  `npm install --package-lock-only`) **modifica el proyecto auditado** y requiere decisión humana.
- `semgrep` con Python 3.6: la versión instalada no lo soporta. Alternativas: Python 3.8+ o un
  contenedor.

Cada descarga registra su `sha256` en el log. La instalación exige `--yes`: no hay descargas
silenciosas.

## Reglas del escaneo determinista

Siempre corre, no depende de herramientas externas, y es la red de seguridad cuando falta todo lo
demás: ejecución de comandos, `eval`, deserialización, SQL crudo, criptografía débil, CSRF
desactivado, secretos embebidos, claves privadas, `dd`/`dump`, `debug => true` y `env()` fuera de
`config/`.

- Los secretos se enmascaran en la evidencia (`'se***mo'`).
- Un archivo ilegible no se inventa: se saltea.
- Herramienta ausente ⇒ check `bloqueada` con el motivo, nunca `aprobada`.
- `phpstan` se agrupa por `identifier` para no emitir cien hallazgos del mismo patrón.

## Decisiones que no conviene revertir

1. **`null` significa "no medible", nunca cero.** Si falta un dato, la dimensión queda `null` y se
   declara `no_evaluable`. Convertirla en 0 inventa un resultado.
2. **Los subagentes no puntúan.** Devuelven métricas crudas; el motor aplica las fórmulas. Por eso
   dos corridas con las mismas entradas dan el mismo número.
3. **`confirmados` por severidad es la única entrada de SEG.** Si la suma no coincide con
   `hallazgos_confirmados`, o supera a `hallazgos`, el contrato es inválido.
4. **La mantenibilidad la mide A-STATIC, no A-QUALITY.** El motor fusiona métricas por dueño antes
   de calcular CS.
5. **El motor nunca escribe fuera de `reports/`.** `assertInsideReports` lanza si se intenta.
6. **Las credenciales no se leen para mostrarlas.** `withSecret` entrega el valor solo al callback
   que arma la petición; los errores nombran la clave, nunca el valor.

## Limitaciones conocidas

- CI pondera uniforme porque el contrato solo trae conteos. La ponderación por criticidad de activo
  necesita que A-CONFIG reporte pesos; queda para E2.
- `vault://` no está soportado: usa `env:` o `file:`.
- No hay sandbox de proceso todavía: el motor confina rutas, no syscalls. E3.

# 01 — Reglas operativas y flujo de orquestación

Este documento es la referencia humana del comportamiento del agente `laravel-sec-auditor`.
Los agentes en `agents/` son autocontenidos; este archivo explica el porqué y sirve para mantenerlos.

## Las 8 reglas (resumen y razón)

| # | Regla | Razón |
|---|---|---|
| 1 | Autorización escrita antes de cualquier prueba | Sin alcance firmado no hay base legal ni responsabilidad delimitada |
| 2 | Solo lista blanca de staging | Evita impactar producción y terceros |
| 3 | No destructivo; datos `SECTEST_` | Las pruebas no deben alterar el negocio |
| 4 | Sin explotación; prueba mínima | Evidencia suficiente sin extraer datos ni persistir |
| 5 | Enmascarar secretos y PII | Los informes circulan; no deben filtrar nada |
| 6 | Trazabilidad ID + ISO + ubicación | Permite remediar y auditar |
| 7 | Solo herramientas instaladas, con versión | Resultados reproducibles y honestos |
| 8 | Confirmado / probable / falso positivo | Evita ruido y falsas alarmas |

## Flujo

```
Paso 0 (si falta autorización)
  └─ entrevista en un solo mensaje → escribe sectest/scope/authorization.draft.md → DETENTE
       └─ el responsable revisa, firma y lo guarda como sectest/scope/authorization.md

Preflight (solo con autorización firmada)
  ├─ localizar proyecto (git rev-parse --show-toplevel || pwd)
  ├─ validar sectest/scope/authorization.md (5 campos + firma, sin "Estado: BORRADOR")
  ├─ detectar stack y herramientas
  ├─ pedir entradas faltantes (una sola vez)
  └─ crear sectest/reports/ (o sectest/reports/<fecha>/ si ya existe)
        │
        ├─ OLA A (paralelo, no depende de staging)
        │    ├─ sec-static   (Fase 1)
        │    ├─ sec-config   (Fase 2 + 5)
        │    └─ sec-quality  (transversal + 6)
        │
        ├─ OLA B (dependiente)
        │    └─ sec-dynamic  (Fase 3)  ← solo si staging es accesible y está autorizado
        │
        ├─ consolidación (dedupe, contradicciones)
        ├─ cuantificación (SEG / CI / CS + SPICE)
        └─ sectest/reports/INFORME_FINAL.md + sectest/reports/resumen.json
```

## Preflight: criterios de parada

Detente y pide información si:

- No existe `sectest/scope/authorization.md`.
- Falta cualquiera de: proyecto, URL de staging, IPs permitidas, ventana de tiempo, firma.
- El archivo dice `Estado: BORRADOR` o su sección de firma está vacía.
- No hay credenciales por rol y el alcance autoriza pruebas autenticadas.
- El stack real no es Laravel 13 / PHP 8.5 (registra la desviación; no asumas que puede continuar igual).

Nunca continúes "con lo que haya" en estos casos.

## Paso 0: la entrevista de autorización

Es el primer acto del agente, antes de mirar el código. En un único mensaje pide los once campos
(proyecto, versión, responsable, staging, lista blanca, ventana, credenciales, pruebas autorizadas,
datos `SECTEST_`/suite, umbrales y tipo de aplicación), rellena el esqueleto y escribe
`sectest/scope/authorization.draft.md`.

- Dato que falta → `PENDIENTE`, nunca inventado.
- Producción → siempre `Nunca`.
- La firma se queda vacía.
- Una casilla solo se marca si el humano la autorizó.

Después se detiene y pide tres acciones humanas: revisar, firmar y guardar como
`sectest/scope/authorization.md`. El rename es el acto de consentimiento: el agente escribe el borrador pero
nunca el archivo que después valida, así que no puede autorizarse a sí mismo.

## Entradas que se solicitan una sola vez

1. Lista de proyectos (ruta local o repositorio) y versión.
2. URL base de staging y credenciales de prueba por rol.
3. Tipo de aplicación: web, API, SPA, multi-tenant, pagos, subida de archivos.
4. Herramientas disponibles fuera de las detectadas.
5. Umbrales de aceptación, si la organización los definió.

## Paralelismo y límites

- Ola A: hasta 3 subagentes en paralelo.
- Ola B: máximo 3 peticiones concurrentes contra staging.
- Un subagente nunca lanza otro subagente.
- Si un subagente devuelve JSON inválido: un reintento; si vuelve a fallar, se marca `bloqueado`.

## Escritura acotada a `sectest/`

Una sola carpeta concentra todo lo que produce el agente:

```text
sectest/
  scope/     authorization.md (humano) · authorization.draft.md · credentials.conf · dynamic-plan.json
  reports/   informes, contratos, hallazgos, evidencia
  tests/     pruebas creadas por el agente
  tools/     composer.json + vendor de herramientas de testing
```

Se aplica en tres capas:

1. **Permisos de OpenCode**: `edit` permite `sectest/**` y deniega `sectest/scope/authorization.md`.
   En `bash`, la regla `*authorization.md*` bloquea cualquier comando que lo mencione.
2. **Bash**: se deniegan comandos destructivos y de escritura de git/migraciones/caché.
3. **Prompt**: REGLA CERO explícita en los 5 agentes.

Ninguna de las tres capas es un sandbox en OpenCode: filtran nombres y rutas declaradas. La garantía
funcional es la puerta de firma — sin sección 9 completa y sin el aviso de borrador eliminado, no hay
fase. En Claude Code y en Codex la barrera de rutas y el sandbox de Codex sí se aplican a nivel de
proceso.

**Excepciones permitidas, con casilla en la sección 6:**

| Acción | Casilla | Escritura |
|---|---|---|
| Crear pruebas | `Crear pruebas en sectest/tests/` | `sectest/tests/**` |
| Instalar herramientas | `Instalar herramientas de testing` | `sectest/tools/**` |
| Ejecutar la suite | `Ejecución de la suite de tests del proyecto` | — |
| Generar plan desde rutas | `Generar plan de pruebas desde las rutas` | `sectest/scope/dynamic-plan.json` |

Las herramientas se instalan con un `composer.json` propio en `sectest/tools/` y
`composer install --working-dir sectest/tools`. **Nunca** se ejecuta `composer require` en la raíz del
proyecto ni se edita su `composer.json`. Las pruebas nuevas van a `sectest/tests/` con su propio
`phpunit.xml`; nunca a `tests/`.

Sin casilla, la acción va a `bloqueada`. La aplicación no se parchea: un fallo es un hallazgo.

## Vigencia de la autorización

La ventana de tiempo no es decorativa: el agente la compara con el reloj antes de ejecutar cualquier
fase.

- Lee `Inicio`, `Fin` y `Zona horaria` de la sección 4 de `sectest/scope/authorization.md`.
- Fuera de la ventana (antes del inicio o después del fin) no se ejecuta ninguna fase: se informa la
  ventana, la hora observada y la zona usada, y se termina el turno.
- La ventana no se extiende, no se interpreta y no se redondea. Vencida ⇒ autorización nueva.
- Sin zona horaria, o con fechas que no son ISO 8601 con offset, la autorización está incompleta.
- La autorización se lee con la herramienta de lectura de archivos, nunca con bash: la regla
  `*authorization.md*` bloquea cualquier comando que mencione ese nombre, incluido un `cat` de solo lectura.

## Credenciales: `sectest/scope/credentials.conf`

Los secretos no van en el chat ni en la autorización: van en `sectest/scope/credentials.conf`, dentro del
proyecto auditado.

- **Lo llena el humano.** El agente lo crea si no existe, con todas las claves vacías, y solo puede
  **añadir al final** las claves que falten. Nunca escribe un valor, nunca sobrescribe una línea y
  nunca lo abre con la herramienta de lectura (eso copiaría los secretos al contexto).
- **El agente lo resuelve dentro del shell** y lo pasa a `curl` por archivo (`--netrc-file` o
  `--config`). `curl -u usuario:clave` está prohibido: expone el secreto en la lista de procesos.
- **Se borra el temporal** al terminar cada fase, incluso si falla.
- **Se enmascara en la evidencia**: `Authorization`, cookies, tokens y cualquier campo que refleje
  la credencial.
- **Si falta un acceso**, el agente agrega al final la clave vacía `SECTEST_<FAMILIA>_<CAMPO>`, avisa
  cuál hace falta y para qué prueba, y marca esa prueba `bloqueada` hasta que esté cargada.

**Por qué `.conf` y no `.env`.** Las configuraciones de OpenCode y Claude deniegan editar `*.env*`,
que es una defensa útil para el `.env` real del proyecto. Un archivo `.env` no se podría crear de
forma automática, así que el almacén usa otra extensión y queda fuera de esa regla.

Superficie de escritura por runtime:

| Runtime | Permiso |
|---|---|
| OpenCode | orquestador: `"sectest/**": allow` + `"sectest/scope/authorization.md": deny`; subagentes acotados a `sectest/reports/**` (y `sectest/tests/**` en `sec-quality`) |
| Claude Code | `Edit(./sectest/**)` en `allow`; `Edit(./sectest/scope/authorization.md)` en `deny` |
| Codex | `"sectest" = "write"` y `"sectest/scope/authorization.md" = "read"` |

`sectest/scope/authorization.md` queda fuera de la superficie de escritura en los tres runtimes.

## IDs y dedupe

Cada hallazgo lleva el prefijo del informe que lo origina, para que consolidar cuatro informes no
produzca colisiones:

| Informe | Namespace |
|---|---|
| `A-01-STATIC.md` | `A01-SEC-###`, `A01-INF-###`, `A01-QAL-###` |
| `A-02-CONFIG.md` | `A02-INF-###`, `A02-SEC-###` |
| `A-03-DYNAMIC.md` | `A03-SEC-###`, `A03-API-###` |
| `A-04-QUALITY.md` | `A04-QAL-###` |

Al consolidar: un mismo CVE o el mismo defecto en la misma ubicación cuenta una vez, y el hallazgo
pertenece al informe con el número más bajo (A01 < A02 < A03 < A04). Los demás lo referencian como
"ver también" sin crear un ID nuevo. Si dos informes discrepan en severidad, prevalece la más alta y se
declara quién la reportó.

## Flujo de entrega a otro agente

Al consolidar, el orquestador escribe `sectest/reports/HALLAZGOS_FALLAS.md` con **solo los fallos**,
agrupados por prioridad. Por cada uno: ID, título, descripción, ubicación, evidencia, por qué es un
problema, OWASP/CWE, ISO 27001, cómo se encontró y cómo se replica.

No incluye solución, parche, esfuerzo, responsable ni plazos. El auditor describe y prioriza; otra IA
especializada evalúa y corrige. Separar ambos roles evita que quien detecta el fallo condicione la
revisión con su propia solución.

El archivo vive en `sectest/reports/` del proyecto auditado y se regenera en cada consolidación.

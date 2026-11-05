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
  └─ entrevista en un solo mensaje → escribe scope/authorization.draft.md → DETENTE
       └─ el responsable revisa, firma y lo guarda como scope/authorization.md

Preflight (solo con autorización firmada)
  ├─ localizar proyecto (git rev-parse --show-toplevel || pwd)
  ├─ validar scope/authorization.md (5 campos + firma, sin "Estado: BORRADOR")
  ├─ detectar stack y herramientas
  ├─ pedir entradas faltantes (una sola vez)
  └─ crear reports/ (o reports/<fecha>/ si ya existe)
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
        └─ reports/INFORME_FINAL.md + reports/resumen.json
```

## Preflight: criterios de parada

Detente y pide información si:

- No existe `scope/authorization.md`.
- Falta cualquiera de: proyecto, URL de staging, IPs permitidas, ventana de tiempo, firma.
- El archivo dice `Estado: BORRADOR` o su sección de firma está vacía.
- No hay credenciales por rol y el alcance autoriza pruebas autenticadas.
- El stack real no es Laravel 13 / PHP 8.5 (registra la desviación; no asumas que puede continuar igual).

Nunca continúes "con lo que haya" en estos casos.

## Paso 0: la entrevista de autorización

Es el primer acto del agente, antes de mirar el código. En un único mensaje pide los once campos
(proyecto, versión, responsable, staging, lista blanca, ventana, credenciales, pruebas autorizadas,
datos `SECTEST_`/suite, umbrales y tipo de aplicación), rellena el esqueleto y escribe
`scope/authorization.draft.md`.

- Dato que falta → `PENDIENTE`, nunca inventado.
- Producción → siempre `Nunca`.
- La firma se queda vacía.
- Una casilla solo se marca si el humano la autorizó.

Después se detiene y pide tres acciones humanas: revisar, firmar y guardar como
`scope/authorization.md`. El rename es el acto de consentimiento: el agente escribe el borrador pero
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

## Prohibición de modificar el proyecto

Se aplica en tres capas:

1. **Permisos de OpenCode**: `edit` solo permite `reports/**` y `scope/authorization.draft.md`.
   `scope/authorization.md` no está permitido: lo crea el humano al renombrar el borrador firmado.
   En `bash`, la regla `*authorization.md*` bloquea cualquier comando que lo mencione.
2. **Bash**: se deniegan comandos destructivos y de escritura de git/migraciones/caché.
3. **Prompt**: REGLA CERO explícita en los 5 agentes.

Ninguna de las tres capas es un sandbox en OpenCode: filtran nombres y rutas declaradas. La garantía
funcional es la puerta de firma — sin sección 9 completa y sin el aviso de borrador eliminado, no hay
fase. En Claude Code y en Codex la barrera de rutas y el sandbox de Codex sí se aplican a nivel de
proceso.

**Excepción a la REGLA CERO — Creación de pruebas de PHPUnit:**
Si el proyecto auditado no tiene pruebas de PHPUnit/Pest y el usuario lo pide explícitamente, el
subagente sec-quality puede crear archivos nuevos en `tests/Feature/` y `tests/Unit/` (solo crear,
nunca editar código existente del proyecto). Esta es la única excepción a la regla de solo lectura y
requiere autorización explícita del usuario para el proyecto específico.

**Excepción a la REGLA CERO — Instalación y ejecución de herramientas de análisis estático (phpstan/psalm):**
Si el proyecto auditado no tiene herramientas de análisis estático y el usuario lo pide explícitamente, el subagente sec-quality puede instalarlas con `composer require --dev` y ejecutar el análisis estático sobre el proyecto. Es una excepción a la regla de solo lectura y requiere autorización explícita del usuario para el proyecto específico.

Si necesitas ampliar lo que el agente puede hacer, edita los permisos en `agents/*.md` y vuelve a desplegar.

## Flujo de entrega de remediación

Cuando la auditoría finalice y quede trabajo por corregir en el proyecto auditado, el orquestador entrega un documento de remediación (`ENTREGA_REMEDIACION_*.md`) en la raíz del repositorio del agente auditor (no en el proyecto auditado). Ese documento contiene:

- Contexto y estado actual del proyecto auditado.
- Fallos existentes con soluciones mejoradas.
- Nuevos tipos de ataque identificados y defensas requeridas.
- Pruebas que deben ejecutarse (pendientes).
- Plan de remediación priorizado (0–7 días, 8–30 días, 31–90 días).
- Instrucciones para el otro agente que aplicará las soluciones.

El agente auditor no modifica el proyecto auditado. El otro agente (remediador) es el encargado de aplicar los parches si está autorizado, y debe reportar avances sin modificar este repositorio de agente.

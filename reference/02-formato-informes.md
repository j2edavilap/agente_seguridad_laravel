# 02 — Formato de informes y contrato JSON

## Informe individual (`sectest/reports/A-XX-*.md`)

```markdown
# A-XX — <nombre de la fase>

## 1. Resumen ejecutivo
- Propósito:
- Alcance:
- Herramientas y versiones:
- Fecha:
- Entorno:

## 2. Fallos

### A01-SEC-001 — <título>
- **Severidad:** Alta — CVSS v3.1 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **Estado:** confirmado | probable | falso positivo
- **Descripción:** qué es el fallo, en lenguaje claro.
- **Ubicación:** `app/Http/Controllers/X.php:42` · `GET /api/orders/{id}`
- **Evidencia:** request/response con datos enmascarados.
- **Por qué es un problema:** impacto concreto.
- **OWASP:** A01:2021 · **CWE:** CWE-639 · **ISO 27001:** A.8.3

> Sin solución, sin esfuerzo y sin responsable. El informe describe y prioriza; la corrección es de
> otro agente.

## 3. Controles verificados sin fallos
- ...

## 4. Métricas
| Ejecutadas | Aprobadas | Fallidas | Bloqueadas | No aplicables |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 |
```

## Contrato JSON de subagente (exacto)

Los subagentes devuelven **métricas crudas**, no puntuaciones. La clave `dimensiones` no existe en su
respuesta: la calcula el orquestador con las fórmulas de `reference/03`.

```json
{
  "subagente": "A-STATIC",
  "fase": "1",
  "pruebas_ejecutadas": 0,
  "pruebas_aprobadas": 0,
  "pruebas_fallidas": 0,
  "pruebas_bloqueadas": 0,
  "hallazgos": { "critico": 0, "alto": 0, "medio": 0, "bajo": 0, "informativo": 0 },
  "hallazgos_confirmados": 0,
  "confirmados": { "critico": 0, "alto": 0, "medio": 0, "bajo": 0, "informativo": 0 },
  "falsos_positivos": 0,
  "metricas": {
    "cobertura_lineas_pct": null,
    "pruebas_totales": null,
    "pruebas_aprobadas_n": null,
    "errores_estaticos": null,
    "kloc_analizado": null,
    "violaciones_estilo": null,
    "controles_aplicables": null,
    "controles_conformes": null,
    "controles_no_probados": null
  },
  "ids_hallazgos": [],
  "archivo_reporte": "sectest/reports/A-01-STATIC.md"
}
```

Reglas del contrato:

- Sin texto adicional alrededor del JSON.
- **No existe `dimensiones`** en la respuesta de un subagente.
- En `metricas`, cada clave no medible va en `null`. `null` es "no medible"; `0` es "se midió y no había nada".
- `metricas.controles_*`: cada informe completa los controles del Anexo A que **evaluó**; el orquestador los suma. Los que no evalúa van en `null`.
- `hallazgos` cuenta los hallazgos **no descartados** (confirmados + probables). Los falsos positivos no se incluyen.
- `confirmados` es el subconjunto confirmado por severidad; su suma debe ser exactamente `hallazgos_confirmados` y nunca supera a `hallazgos`. Es la única entrada de SEG.
- `hallazgos_confirmados` ≤ suma de `hallazgos`.
- `falsos_positivos` es informativo de lo descartado: no entra en `hallazgos` ni se resta.
- `falsos_positivos` se descuenta del total al consolidar.
- Si un dato no se puede verificar, no se inventa: la prueba va a `pruebas_bloqueadas`.

El esquema formal está en `schemas/subagent-summary.schema.json` y se valida con
`tools/validate-reports.ps1`.

## Informe final (`sectest/reports/INFORME_FINAL.md`)

1. Resumen ejecutivo (1 página): veredicto, SEG/CI/CS, 5 riesgos principales.
2. Alcance y metodología: proyectos, entornos, normas, herramientas y versiones.
3. Cuantificación: tabla SEG/CI/CS, desglose por subagente, gráfico Mermaid.
4. Fallos agrupados por prioridad: ID, título, descripción, ubicación, evidencia, por qué es un
   problema, OWASP/CWE y control ISO.
5. Análisis por dimensión.
6. Madurez SPICE por proceso.
7. Pruebas no ejecutadas y motivo.
8. Limitaciones.
9. Anexos: informes individuales, `resumen.json` y `HALLAZGOS_FALLAS.md`.

No existe sección de remediación: el auditor no propone soluciones, no estima esfuerzo y no asigna
responsables.

## `sectest/reports/HALLAZGOS_FALLAS.md`

Solo fallos, agrupados por prioridad. Por cada uno:

```markdown
### A01-SEC-001 — <título>
- **Prioridad:** alta · **Estado:** confirmado
- **Descripción:** ...
- **Ubicación:** `...`
- **Evidencia:** `...`
- **Por qué es un problema:** ...
- **OWASP:** ... · **CWE:** ... · **ISO 27001:** ...
- **Cómo se encontró:** Fase 1 · grep-fallback — regla `EXEC`
- **Cómo se replica:** ...
```

Sin solución, sin esfuerzo, sin responsable y sin plazos. Es el insumo para otra IA especializada.

## `sectest/reports/resumen.json`

```json
{
  "proyecto": "",
  "version": "",
  "fecha": "",
  "ventana_autorizada": { "inicio": "", "fin": "", "zona": "" },
  "herramientas": [],
  "por_subagente": [],
  "hallazgos": { "critico": 0, "alto": 0, "medio": 0, "bajo": 0, "informativo": 0 },
  "dimensiones": { "seguridad": null, "control_informacion": null, "calidad_software": null },
  "no_evaluable": { "seguridad": false, "control_informacion": false, "calidad_software": false },
  "calculos": {
    "seguridad": { "formula": "", "entradas": {}, "resultado": null },
    "control_informacion": { "formula": "", "entradas": {}, "resultado": null },
    "calidad_software": { "formula": "", "entradas": {}, "componentes": {}, "resultado": null }
  },
  "veredicto": "aprobado | condicionado | rechazado | no_evaluable",
  "spice": [],
  "bloqueos": [],
  "archivo_informe": "sectest/reports/INFORME_FINAL.md"
}
```

El bloque `calculos` es obligatorio: permite que un tercero recompruebe SEG/CI/CS con una calculadora y
obtenga el mismo número. Esquema: `schemas/resumen.schema.json`.

## Diagrama Mermaid sugerido

```mermaid
barChart
    title Puntuaciones por dimensión
    x-axis [SEG, CI, CS]
    y-axis 0 --> 100
    bar [0, 0, 0]
```

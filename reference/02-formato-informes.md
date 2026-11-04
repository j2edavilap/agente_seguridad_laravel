# 02 — Formato de informes y contrato JSON

## Informe individual (`reports/A-XX-*.md`)

```markdown
# A-XX — <nombre de la fase>

## 1. Resumen ejecutivo
- Propósito:
- Alcance:
- Herramientas y versiones:
- Fecha:
- Entorno:

## 2. Hallazgos

### SEC-001 — <título>
- **Severidad:** Alta — CVSS v3.1 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **Estado:** confirmado | probable | falso positivo
- **Categoría:** OWASP A01:2021 / CWE-639
- **Ubicación:** `app/Http/Controllers/X.php:42` · `GET /api/orders/{id}`
- **Riesgo:** descripción en lenguaje claro.
- **Evidencia:** request/response con datos enmascarados.
- **Reproducción:** pasos mínimos y seguros.
- **Impacto de negocio:** ...
- **Remediación:**
  - Inmediata: ...
  - Definitiva: código antes/después (Laravel 13 / PHP 8.5)
  - Alternativas: pros y contras
  - Prueba anti-regresión: Pest/PHPUnit
  - ISO: 27001 A.8.3 · 25010 Seguridad · 29119-4 Técnica X
- **Esfuerzo:** 4 h · **Responsable sugerido:** backend

## 3. Controles verificados sin hallazgos
- ...

## 4. Métricas
| Ejecutadas | Aprobadas | Fallidas | Bloqueadas | No aplicables |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 |
```

## Contrato JSON (exacto)

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
  "falsos_positivos": 0,
  "dimensiones": {
    "seguridad": 0,
    "control_informacion": 0,
    "calidad_software": 0
  },
  "ids_hallazgos": [],
  "archivo_reporte": "reports/A-01-STATIC.md"
}
```

Reglas del contrato:

- Sin texto adicional alrededor del JSON.
- `hallazgos` cuenta **todos** los hallazgos por severidad, confirmados o no.
- `hallazgos_confirmados` ≤ suma de `hallazgos`.
- `falsos_positivos` se descuenta del total al consolidar.
- Si un dato no se puede verificar, no se inventa: la prueba va a `pruebas_bloqueadas`.

## Informe final (`reports/INFORME_FINAL.md`)

1. Resumen ejecutivo (1 página): veredicto, SEG/CI/CS, 5 riesgos principales.
2. Alcance y metodología: proyectos, entornos, normas, herramientas y versiones.
3. Cuantificación: tabla SEG/CI/CS, desglose por subagente, gráfico Mermaid.
4. Resumen de hallazgos: ID, título, severidad, estado, control ISO, remediación.
5. Análisis por dimensión.
6. Plan de remediación: 0–7, 8–30, 31–90 días.
7. Madurez SPICE por proceso.
8. Pruebas no ejecutadas y motivo.
9. Limitaciones.
10. Anexos: índice y JSON consolidado.

## `reports/resumen.json`

```json
{
  "proyecto": "",
  "version": "",
  "fecha": "",
  "veredicto": "aprobado | condicionado | rechazado",
  "dimensiones": { "seguridad": 0, "control_informacion": 0, "calidad_software": 0 },
  "hallazgos": { "critico": 0, "alto": 0, "medio": 0, "bajo": 0, "informativo": 0 },
  "por_subagente": [],
  "spice": [],
  "bloqueos": [],
  "archivo_informe": "reports/INFORME_FINAL.md"
}
```

## Diagrama Mermaid sugerido

```mermaid
barChart
    title Puntuaciones por dimensión
    x-axis [SEG, CI, CS]
    y-axis 0 --> 100
    bar [0, 0, 0]
```

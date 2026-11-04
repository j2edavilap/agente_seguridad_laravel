# reports/ — Estructura de salida de la auditoría

El agente crea esta estructura **dentro del proyecto auditado**. Nada más se escribe allí.

```
reports/
├── INDICE.md              # índice de informes
├── INFORME_FINAL.md       # informe consolidado (10 secciones)
├── resumen.json           # datos consolidados para automatización
├── A-01-STATIC.md         # sec-static
├── A-02-CONFIG.md         # sec-config
├── A-03-DYNAMIC.md        # sec-dynamic
└── A-04-QUALITY.md        # sec-quality
```

Si `reports/` ya existía con resultados previos, el agente no los borra:
crea `reports/<YYYY-MM-DD_HHmm>/` y escribe allí.

## Reglas

- Los informes **no contienen secretos reales**: valores enmascarados (`ab***9f`).
- Cada hallazgo tiene ID único (`SEC-###`, `INF-###`, `QAL-###`).
- Los informes están en **español neutro profesional**; las claves de `resumen.json` en inglés.
- El agente **no** escribe fuera de `reports/` (salvo `scope/authorization.draft.md`).

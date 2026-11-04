# 03 — Cuantificación y marco normativo

## 1. Puntuaciones (0–100)

### SEG — Seguridad

```
SEG = 100
      − Σ penalización(hallazgo confirmado)
      − penalización(controles aplicables no probados)
```

Penalización por hallazgo confirmado:

| Severidad | Penalización |
|---|---|
| Crítico | 25 |
| Alto | 10 |
| Medio | 4 |
| Bajo | 1 |
| Informativo | 0 |

Los `falsos positivos` y los `probables` no penalizan como confirmados; los probables se listan como riesgo residual.

`penalización(no probados) = min(10, 0.5 × controles_aplicables_no_probados)` — valor por defecto documentado; ajustable en `scope/authorization.md`.

Límite inferior: 0.

### CI — Control de información

```
CI = Σ (peso_activo × cumple_control) / Σ peso_activo × 100
```

- Se evalúan solo controles del **Anexo A de ISO 27001** aplicables al proyecto.
- `peso_activo`: criticidad del activo afectado (alto 3, medio 2, bajo 1).
- Un control no probado cuenta como `cumple = 0` y se declara en `bloqueos`.
- Los controles no aplicables se excluyen del denominador y se listan.

### CS — Calidad de software

```
CS = 0.25 × cobertura_pruebas
   + 0.25 × mantenibilidad
   + 0.25 × fiabilidad
   + 0.25 × estándares_código
```

Cada componente se normaliza a 0–100 con la evidencia del subagente `sec-quality` (ISO 25010 / 29119-3).

## 2. Ejemplo trabajado

Hallazgos confirmados: 0 críticos, 1 alto, 2 medios, 3 bajos.
Controles aplicables no probados: 4.

```
penalización = (1×10) + (2×4) + (3×1) = 21
no probados  = min(10, 0.5×4) = 2
SEG = 100 − 21 − 2 = 77
```

Con umbral SEG ≥ 80 → **condicionado** (si CI y CS cumplen y no hay críticos).

## 3. Veredicto

| Veredicto | Condición |
|---|---|
| Aprobado | SEG ≥ 80, CI ≥ 85, CS ≥ 75 y 0 críticos abiertos |
| Condicionado | alguna dimensión entre 60 y su umbral, sin críticos |
| Rechazado | cualquier dimensión < 60 **o** cualquier crítico confirmado |

Los umbrales de la organización prevalecen si están en la autorización.

## 4. Madurez SPICE (ISO/IEC 15504 / 33000)

| Nivel | Nombre | Evidencia mínima |
|---|---|---|
| 0 | Incompleto | El proceso no se ejecuta o no produce salidas |
| 1 | Ejecutado | Produce salidas útiles, sin planificación |
| 2 | Gestionado | Planificado, monitoreado, con responsables |
| 3 | Establecido | Proceso definido y aplicado de forma consistente |
| 4 | Predecible | Medido y controlado con datos |
| 5 | Optimizante | Mejora continua basada en métricas |

Procesos a evaluar: requisitos, desarrollo, verificación, validación, riesgos, configuración, incidentes, mejora.

## 5. Mapa normativo

### ISO/IEC 27001:2022 — Anexo A (controles citados)

| Control | Tema | Área del agente |
|---|---|---|
| A.5.15 | Control de acceso | A-ACCESO |
| A.5.17 | Autenticación | A-AUTH |
| A.5.19–A.5.22 | Proveedores y cadena de suministro | A-INFRA |
| A.8.3 | Restricción de acceso a la información | A-ACCESO |
| A.8.5 | Autenticación segura | A-AUTH |
| A.8.8 | Gestión de vulnerabilidades técnicas | A-SCA |
| A.8.9 | Gestión de la configuración | A-CONFIG, A-ARCHIVOS |
| A.8.11 | Enmascaramiento de datos | A-DATOS |
| A.8.12 | Prevención de fuga de datos | A-DATOS |
| A.8.15 | Registro de eventos | A-LARAVEL, A-DATOS |
| A.8.24 | Criptografía | A-CONFIG |
| A.8.26 | Seguridad de aplicaciones | A-WEB, A-API |
| A.8.28 | Codificación segura | A-SAST, A-INYECCION |

### ISO/IEC 25010 — Características de calidad

Adecuación funcional, eficiencia de desempeño, compatibilidad, usabilidad/interacción, fiabilidad, seguridad, mantenibilidad, portabilidad/flexibilidad (los nombres exactos dependen de la edición 2011/2023; se declara la usada).

### ISO/IEC/IEEE 29119-3 / 29119-4 — Pruebas

- 29119-3: documentación de pruebas (plan, diseño, casos, resultados).
- 29119-4: técnicas — partición de equivalencia, valores límite, tabla de decisión, transición de estados, casos de uso, escenarios, aleatoria, metamórfica, combinatoria.

### ISO/IEC 25000 (SQuaRE)

Marco de calidad de producto; 25010 (calidad), 25023 (métricas), 25040 (evaluación).

### ISO 9001:2015

Cláusula 9 (evaluación del desempeño) y 10 (mejora): el informe final actúa como evidencia de revisión.

## 6. Regla de honestidad

- Herramienta ausente ⇒ prueba `bloqueada`.
- Control no verificable ⇒ no suma a CI y se declara.
- Nunca se redondea "hacia aprobado" para complacer.

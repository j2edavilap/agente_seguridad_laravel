# Autorización de pruebas de seguridad

> Estado: firmada por el responsable. Documento de ejemplo para el motor.

## 1. Proyecto

- **Nombre del proyecto:** vulnerable-app
- **Ruta local / repositorio:** `engine/examples/vulnerable-app`
- **Versión / commit auditado:** demo
- **Responsable técnico del proyecto:** Ana Pérez

## 2. Entornos autorizados

| Entorno | URL base | ¿Autorizado? |
|---|---|---|
| Staging | https://staging.demo.local | Sí |
| Producción | — | **Nunca** |

## 3. Lista blanca de hosts e IPs

- `https://staging.demo.local`

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-01-01T00:00:00-03:00
- **Fin (ISO 8601):** 2027-01-01T00:00:00-03:00
- **Zona horaria:** America/Santiago

## 5. Credenciales de prueba

Los secretos van en `sectest/scope/credentials.conf`.

## 6. Pruebas autorizadas

- [x] Análisis estático (SCA/SAST) local
- [x] Revisión de configuración local

## 7. Prohibiciones explícitas

- [x] No explotar vulnerabilidades ni extraer datos
- [x] No modificar código ni configuración

## 8. Umbrales de aceptación (opcional)

- Seguridad (SEG) ≥ 80

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-01-01
- **Firma / aprobación:** firmado digitalmente (ejemplo)

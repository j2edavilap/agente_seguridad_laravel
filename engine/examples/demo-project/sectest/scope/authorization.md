# Autorización de pruebas de seguridad

> Estado: firmada por el responsable. Documento de ejemplo, no autoriza nada real.

## 1. Proyecto

- **Nombre del proyecto:** demo-laravel
- **Ruta local / repositorio:** `C:\demo\laravel`
- **Versión / commit auditado:** abc1234
- **Responsable técnico del proyecto:** Ana Pérez

## 2. Entornos autorizados

| Entorno | URL base | ¿Autorizado? |
|---|---|---|
| Staging | https://staging.demo.local | Sí |
| Producción | — | **Nunca** |

## 3. Lista blanca de hosts e IPs

- `https://staging.demo.local`
- IP/CIDR: 10.0.0.0/24

## 4. Ventana de tiempo

- **Inicio (ISO 8601):** 2026-11-06T08:00:00-03:00
- **Fin (ISO 8601):** 2026-11-06T18:00:00-03:00
- **Zona horaria:** America/Santiago

## 5. Credenciales de prueba

Los secretos van en `sectest/scope/credentials.conf`.

| Rol | ¿Disponible? | Claves |
|---|---|---|
| Sin autenticar | Sí (anónimo) | — |
| Usuario normal | Sí | `SECTEST_USER_USERNAME`, `SECTEST_USER_PASSWORD` |
| Administrador | Sí | `SECTEST_ADMIN_USERNAME`, `SECTEST_ADMIN_PASSWORD` |

## 6. Pruebas autorizadas

- [x] Análisis estático (SCA/SAST) local
- [x] Revisión de configuración local
- [x] Peticiones HTTP GET de reconocimiento

## 7. Prohibiciones explícitas

- [x] No explotar vulnerabilidades ni extraer datos
- [x] No modificar código ni configuración

## 8. Umbrales de aceptación (opcional)

- Seguridad (SEG) ≥ 80
- Control de información (CI) ≥ 85
- Calidad de software (CS) ≥ 75

## 9. Firma del responsable

- **Nombre:** Ana Pérez
- **Cargo:** CTO
- **Fecha:** 2026-11-06
- **Firma / aprobación:** firmado digitalmente (ejemplo)

# Autorización de pruebas de seguridad

> Estado: BORRADOR generado por el agente. No autoriza nada hasta que el responsable lo revise,
> lo firme y lo guarde como `scope/authorization.md`.
>
> Flujo: el agente entrevista al responsable y escribe `scope/authorization.draft.md`. El responsable
> lo revisa, completa la firma y lo guarda como `scope/authorization.md`. El agente nunca escribe ese
> archivo y no ejecuta ninguna fase mientras no exista firmado y sin este aviso de borrador.

## 1. Proyecto

- **Nombre del proyecto:**
- **Ruta local / repositorio:**
- **Versión / commit auditado:**
- **Responsable técnico del proyecto:**

## 2. Entornos autorizados

| Entorno | URL base | ¿Autorizado? |
|---|---|---|
| Staging | | Sí / No |
| Producción | | **Nunca** |

## 3. Lista blanca de hosts e IPs

Solo estas URLs/IPs pueden recibir peticiones dinámicas:

- `https://`
- IP/CIDR:

## 4. Ventana de tiempo

- **Inicio (ISO 8601):**
- **Fin (ISO 8601):**
- **Zona horaria:** America/Santiago

## 5. Credenciales de prueba (enmascaradas en informes)

| Rol | Usuario | Secreto | Notas |
|---|---|---|---|
| Sin autenticar | — | — | |
| Usuario normal | | | |
| Administrador | | | |

> No incluyas secretos reales en este archivo si se versiona. Usa referencias a un gestor de secretos.

## 6. Pruebas autorizadas

Marca lo que aplica:

- [ ] Análisis estático (SCA/SAST) local
- [ ] Revisión de configuración local
- [ ] Peticiones HTTP GET de reconocimiento
- [ ] Pruebas de autorización (IDOR/BOLA, escalada)
- [ ] Pruebas de autenticación y sesión
- [ ] Pruebas de inyección (mínimas, sin extracción)
- [ ] Pruebas de subida de archivos (archivos `SECTEST_` inofensivos)
- [ ] Pruebas CSRF/CORS/SSRF
- [ ] Pruebas de lógica de negocio
- [ ] Pruebas de concurrencia/carga
- [ ] Creación de datos de prueba con prefijo `SECTEST_`
- [ ] Ejecución de la suite de tests del proyecto

## 7. Prohibiciones explícitas

- [ ] No explotar vulnerabilidades ni extraer datos
- [ ] No modificar código ni configuración
- [ ] No borrar ni alterar registros reales
- [ ] No pruebas de denegación de servicio

## 8. Umbrales de aceptación (opcional)

Si la organización los definió, prevaleen sobre los valores por defecto:

- Seguridad (SEG) ≥
- Control de información (CI) ≥
- Calidad de software (CS) ≥

## 9. Firma del responsable

- **Nombre:**
- **Cargo:**
- **Fecha:**
- **Firma / aprobación:**

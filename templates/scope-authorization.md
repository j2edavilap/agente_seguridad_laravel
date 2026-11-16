# Autorización de pruebas de seguridad

> Estado: BORRADOR generado por el agente. No autoriza nada hasta que el responsable lo revise,
> lo firme y lo guarde como `sectest/scope/authorization.md`.
>
> Flujo: el agente entrevista al responsable y escribe `sectest/scope/authorization.draft.md`. El responsable
> lo revisa, completa la firma y lo guarda como `sectest/scope/authorization.md`. El agente nunca escribe ese
> archivo y no ejecuta ninguna fase mientras no exista firmado y sin este aviso de borrador.

## 0. Detecciones automáticas

| Dato | Valor | Fuente |
|---|---|---|
| Ruta | | `git rev-parse --show-toplevel` o `pwd` |
| Nombre | | `.env` (`APP_NAME`) o `composer.json` |
| Versión | | `git rev-parse --short HEAD` |
| Zona horaria | | `APP_TIMEZONE` o `config/app.php` |
| Stack | | `php -v`, `composer.json` |
| Tipo de aplicación | | `composer.json` |
| Ventana | | ahora → ahora + 24 h |

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

- **Inicio (ISO 8601):** (automático: ahora)
- **Fin (ISO 8601):** (automático: ahora + 24 h)
- **Zona horaria:** America/Santiago (detectada del proyecto)

## 5. Credenciales de prueba

Los secretos no van en este archivo: se versiona y se comparte. Se cargan en `sectest/scope/credentials.conf`,
que el agente crea vacío y el responsable rellena. Aquí solo se declara qué roles están disponibles:

| Rol | ¿Disponible? | Claves en `sectest/scope/credentials.conf` |
|---|---|---|
| Sin autenticar | Sí (anónimo) | — |
| Usuario normal A | Sí / No | `SECTEST_USER_USERNAME`, `SECTEST_USER_PASSWORD` |
| Usuario normal B (IDOR) | Sí / No | `SECTEST_USER_B_USERNAME`, `SECTEST_USER_B_PASSWORD` |
| Administrador | Sí / No | `SECTEST_ADMIN_USERNAME`, `SECTEST_ADMIN_PASSWORD` |

> Agrega `sectest/scope/credentials.conf` a `.gitignore`. Al terminar la auditoría, vacía los valores o
> borra el archivo. El agente nunca lee ese archivo con la herramienta de lectura: resuelve los
> valores dentro del shell y los pasa a `curl` por archivo (`--netrc-file`), nunca por argumento.

## 6. Pruebas autorizadas

Marca lo que aplica:

- [x] Análisis estático (SCA/SAST) local
- [x] Revisión de configuración local
- [x] Peticiones HTTP GET de reconocimiento
- [ ] Pruebas de autorización (IDOR/BOLA, escalada)
- [ ] Enumeración controlada de IDs (tope 100, sin extraer datos)
- [ ] Pruebas de autenticación y sesión
- [ ] Pruebas de inyección (mínimas, sin extracción)
- [ ] Pruebas de subida de archivos (archivos `SECTEST_` inofensivos)
- [ ] Pruebas CSRF/CORS/SSRF
- [ ] Pruebas de lógica de negocio
- [ ] Pruebas de concurrencia/carga
- [x] Creación de datos de prueba con prefijo `SECTEST_`
- [x] Pruebas sobre la base de datos de test
- [x] Ejecución de la suite de tests del proyecto
- [x] Crear pruebas en `sectest/tests/`
- [x] Instalar herramientas de testing en `sectest/tools/`
- [x] Generar plan de pruebas desde las rutas

> Las casillas marcadas son seguras y reversibles: datos `SECTEST_`, BD de test, arnés en `sectest/`,
> plan y lectura. Las riesgosas requieren un sí explícito antes de firmar.

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

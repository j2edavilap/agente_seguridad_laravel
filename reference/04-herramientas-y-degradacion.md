# 04 — Herramientas, detección y degradación

## Estado verificado en esta máquina (Windows)

| Herramienta | Estado | Ruta / versión |
|---|---|---|
| PHP | ✅ instalado, **no en PATH** | `E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64` |
| Composer | ✅ instalado, **no en PATH** | `E:\laragon_8\bin\composer\composer.phar` |
| Node | ✅ | `C:\Program Files\nodejs\node.exe` |
| npm | ✅ | `C:\Users\Johan\AppData\Local\pi-node\current\npm.ps1` |
| Git | ✅ | `C:\Program Files\Git\cmd\git.exe` |
| Python | ✅ (3.6, **antiguo**) | `C:\Program Files\Python36\python.exe` |
| semgrep | ❌ | — |
| gitleaks | ❌ | — |
| trivy | ❌ | — |
| phpstan | ❌ | — |
| psalm | ❌ | — |
| ZAP | ❌ | — |
| testssl.sh | ❌ | — |
| Docker | ❌ | — |

Nota: `E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64` es la versión más cercana al objetivo PHP 8.5.
También existen `E:\laragon_84\bin\php\php-8.3.16...` y `E:\laragon\bin\php\php-7.3.2...` (no usar para Laravel 13).

## Detección (PowerShell)

```powershell
$tools = @('php','composer','node','npm','git','semgrep','gitleaks','trivy','phpstan','psalm','zap','testssl.sh','docker','openssl')
foreach ($t in $tools) {
  $c = Get-Command $t -ErrorAction SilentlyContinue
  if ($c) { "{0} => {1}" -f $t, $c.Source } else { "{0} => NOT FOUND" -f $t }
}
```

Si `php`/`composer` no aparecen, probar:

```powershell
& 'E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64\php.exe' -v
& 'E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64\php.exe' 'E:\laragon_8\bin\composer\composer.phar' --version
```

No agregues rutas al PATH del proyecto auditado: úsalas explícitamente en los comandos.

## Matriz de degradación

| Falta | Sustituto | Límite que se declara |
|---|---|---|
| `composer audit` | revisión manual de `composer.lock` | sin base CVE local; puede no detectar todo |
| `gitleaks` | grep de patrones de secretos | sin entropía ni reglas amplias |
| `semgrep` | grep de funciones peligrosas | sin análisis de flujo de datos |
| `phpstan` / `psalm` | revisión manual + `php -l` | sin taint analysis |
| `trivy` | SBOM desde `composer.lock` | sin escaneo de imagen/SO |
| `zap` | `curl.exe` / `Invoke-WebRequest` manual | sin crawler ni fuzzing |
| `testssl.sh` | `curl.exe -vI` / `openssl s_client` | sin matriz completa de cifrados |
| `docker` | análisis sobre el código | sin runtime aislado |

## Instalación sugerida (no la ejecuta el agente)

El agente **no instala nada**. Estas son recomendaciones para el humano:

```powershell
# PHPStan y Psalm (global)
& 'E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64\php.exe' 'E:\laragon_8\bin\composer\composer.phar' global require phpstan/phpstan
& 'E:\laragon_8\bin\php\php-8.5.12-1-nts-Win32-vs17-x64\php.exe' 'E:\laragon_8\bin\composer\composer.phar' global require vimeo/psalm

# Gitleaks / Trivy (winget)
winget install gitleaks
winget install AquaSecurity.Trivy

# Semgrep: requiere Python >= 3.9 (el actual es 3.6)
#   instalar Python moderno y luego: pip install semgrep

# OWASP ZAP: instalador de escritorio o imagen Docker
# testssl.sh: Git Bash + openssl (script)
```

Registra en el informe qué herramientas estaban disponibles y con qué versión.

## Reglas de uso

- Una herramienta ausente **nunca** convierte una prueba en `aprobada`: va a `bloqueada`.
- No inventar CVEs, hallazgos ni versiones.
- No ejecutar `docker`, `npm install`, `composer require` ni instalaciones dentro del proyecto auditado.
- Registrar comando exacto y versión de cada herramienta usada.

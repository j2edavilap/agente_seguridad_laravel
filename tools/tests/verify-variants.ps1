#Requires -Version 5.1
<#
.SYNOPSIS
    Regresión del generador de variantes (Claude Code / Codex CLI).

.DESCRIPTION
    Genera las variantes en un directorio temporal y verifica los contratos que importan:

      S1  fuente única: la salida es determinista y coincide con dist\ (si existe)
      S3  frontmatter de Claude Code válido y sin claves de OpenCode
      S4  plantilla de permisos de Claude sin reglas que nunca se aplican
      S5  TOML de Codex con delimitadores correctos y rutas de una sola barra
      S6  AGENTS.md del kit con rutas absolutas y sin subagentes globales perdidos
      S7  perfil de permisos de Codex y reglas Starlark presentes
      S8  deploy.ps1 conserva respaldo, exit 1 y -SkipVariants
      S10 encoding: sin BOM, sin U+FFFD y sin mojibake en ningún artefacto

    Uso:  powershell -ExecutionPolicy Bypass -File .\tools\tests\verify-variants.ps1
    Sale con código 1 si alguna comprobación falla.
#>

[CmdletBinding()]
param(
    [switch]$KeepOutput
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir   = Join-Path ([System.IO.Path]::GetTempPath()) ('verify-variants-' + [guid]::NewGuid().ToString('N'))
$failures = 0

function Check {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Output "  PASS  $Message"
    }
    else {
        $script:failures++
        Write-Output "  FAIL  $Message"
    }
}

function Read-Utf8Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

try {
    Write-Output "== Generando en $outDir =="
    & (Join-Path $repoRoot 'tools\build-variants.ps1') -RepoRoot $repoRoot -OutDir $outDir | Out-Null
    Check ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) 'el generador termina sin error'

    $generated = @(Get-ChildItem -LiteralPath $outDir -Recurse -File)
    Check ($generated.Count -eq 12) "12 artefactos generados (encontrados: $($generated.Count))"

    # --- S10: encoding -------------------------------------------------------
    Write-Output '== S10 encoding =='
    foreach ($file in $generated) {
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
        $text = Read-Utf8Text -Path $file.FullName
        Check (-not $hasBom) "sin BOM: $($file.Name)"
        Check (-not $text.Contains([char]0xFFFD)) "sin U+FFFD: $($file.Name)"
        Check ($text -notmatch '\u00C3[\u0080-\u00BF]' -and $text -notmatch '\u00E2\u20AC') "sin mojibake: $($file.Name)"
    }

    # --- S6: kit de Codex ----------------------------------------------------
    Write-Output '== S6 kit de Codex =='
    $agentsMd = Read-Utf8Text -Path (Join-Path $outDir 'codex\project-kit\AGENTS.md')
    Check ($agentsMd -match 'auditor\u00EDa') 'AGENTS.md conserva los acentos'
    Check ($agentsMd -match 'E:\\laragon_8\\bin\\php') 'AGENTS.md conserva la ruta literal de PHP'
    Check ($agentsMd -notmatch 'E:\\\\laragon_8') 'AGENTS.md no duplica las barras invertidas'
    Check ($agentsMd -notmatch '`task`') 'AGENTS.md no delega con la herramienta de OpenCode'
    Check (-not (Test-Path -LiteralPath (Join-Path $outDir 'codex\agents\laravel-sec-auditor.toml'))) 'el orquestador no se genera como subagente de Codex'

    # --- S3: variantes de Claude Code ---------------------------------------
    Write-Output '== S3 y S4 Claude Code =='
    $claudeFiles = @(Get-ChildItem -LiteralPath (Join-Path $outDir 'claude\agents') -Filter '*.md' -File)
    Check ($claudeFiles.Count -eq 5) "5 variantes de Claude (encontradas: $($claudeFiles.Count))"
    foreach ($file in $claudeFiles) {
        $text = Read-Utf8Text -Path $file.FullName
        $closeIdx = $text.IndexOf("`n---`n", 3)
        $frontmatter = if ($closeIdx -gt 0) { $text.Substring(4, $closeIdx - 4) } else { '' }
        Check ($text.StartsWith('---')) "frontmatter abierto: $($file.Name)"
        Check ($frontmatter -match '(?m)^name: \S') "name presente: $($file.Name)"
        Check ($frontmatter -match '(?m)^description: "') "description presente: $($file.Name)"
        Check ($frontmatter -match '(?m)^tools: \S') "tools presente: $($file.Name)"
        Check ($frontmatter -match '(?m)^model: ') "model presente: $($file.Name)"
        Check ($frontmatter -notmatch '(?m)^(mode|permission|temperature):') "sin claves de OpenCode: $($file.Name)"
        Check ($text -cnotmatch '`task`' -and $text -cnotmatch '`webfetch`') "herramientas traducidas: $($file.Name)"
    }

    $orchestrator = Read-Utf8Text -Path (Join-Path $outDir 'claude\agents\laravel-sec-auditor.md')
    Check ($orchestrator -match 'tools: Agent\(sec-static, sec-config, sec-dynamic, sec-quality\)') 'el orquestador limita la delegación a los 4 subagentes'

    $template = Read-Utf8Text -Path (Join-Path $repoRoot 'claude\settings.template.json')
    $settings = $template | ConvertFrom-Json
    $denyRules = @($settings.permissions.deny)
    $allowRules = @($settings.permissions.allow)
    Check ($denyRules.Count -eq 99) "99 reglas deny (encontradas: $($denyRules.Count))"
    Check ($allowRules.Count -eq 2) "2 reglas allow (encontradas: $($allowRules.Count))"
    Check (@($allowRules | Where-Object { $_ -like '*authorization.draft.md*' }).Count -eq 1) 'allow incluye el borrador de autorización'
    Check (@($denyRules | Where-Object { $_ -eq 'Edit(./scope/authorization.md)' }).Count -eq 1) 'deny bloquea la autorización firmada'
    $deadRules = @($denyRules | Where-Object { $_ -match '^(Write|Glob|NotebookEdit|MultiEdit)\(' })
    Check ($deadRules.Count -eq 0) 'ninguna regla de ruta que Claude Code ignore'

    # --- S5 y S7: Codex ------------------------------------------------------
    Write-Output '== S5 y S7 Codex =='
    $tomlFiles = @(Get-ChildItem -LiteralPath (Join-Path $outDir 'codex\agents') -Filter '*.toml' -File)
    Check ($tomlFiles.Count -eq 4) "4 subagentes TOML (encontrados: $($tomlFiles.Count))"
    foreach ($file in $tomlFiles) {
        $text = Read-Utf8Text -Path $file.FullName
        Check ($text -match '(?m)^name = "') "name TOML: $($file.Name)"
        Check ($text -match '(?m)^description = "') "description TOML: $($file.Name)"
        Check ($text -match "developer_instructions = '''") "apertura literal TOML: $($file.Name)"
        $closers = ([regex]::Matches($text, "(?m)^'''$")).Count
        Check ($closers -eq 1) "cierre literal único: $($file.Name)"
    }

    $configToml = Read-Utf8Text -Path (Join-Path $outDir 'codex\project-kit\.codex\config.toml')
    Check ($configToml -match '(?m)^default_permissions = "laravel-audit"') 'perfil por defecto laravel-audit'
    Check ($configToml -match '(?m)^extends = ":read-only"') 'el perfil parte de :read-only'
    Check ($configToml -match '(?m)^"reports" = "write"') 'escritura permitida en reports'
    Check ($configToml -match '(?m)^"scope/authorization.draft.md" = "write"') 'escritura permitida en el borrador'
    Check ($configToml -notmatch '(?m)^"scope/authorization\.md" = "write"') 'la autorización firmada sigue en solo lectura'
    Check ($configToml -notmatch '(?m)^\s*sandbox_mode\s*=') 'no mezcla sandbox_mode con perfiles'
    Check ($configToml -notmatch '//') 'usa comentarios # y no //'

    $rulesFile = Read-Utf8Text -Path (Join-Path $outDir 'codex\project-kit\.codex\rules\laravel-audit.rules')
    $ruleCount = ([regex]::Matches($rulesFile, 'prefix_rule\(')).Count
    Check ($ruleCount -eq 4) "4 bloques prefix_rule (encontrados: $ruleCount)"
    Check (([regex]::Matches($rulesFile, 'decision = "forbidden"')).Count -ge 4) 'todos los bloques son forbidden'

    # --- OpenCode: superficie de escritura y Paso 0 ---------------------------
    Write-Output '== OpenCode write surface =='
    $opencode = Read-Utf8Text -Path (Join-Path $repoRoot 'agents\laravel-sec-auditor.md')
    $ocClose = $opencode.IndexOf("`n---`n", 3)
    $ocFront = if ($ocClose -gt 0) { $opencode.Substring(4, $ocClose - 4) } else { '' }
    Check ($ocFront -match 'scope/authorization\.draft\.md') 'OpenCode permite escribir el borrador'
    Check ($ocFront -cnotmatch 'scope/authorization\.md"') 'OpenCode no permite escribir la autorización firmada'
    Check ($opencode -match 'Paso 0') 'el prompt define el Paso 0'
    Check ($opencode -match 'authorization\.draft\.md') 'el Paso 0 escribe el borrador, no la autorización'
    Check ($opencode -cnotmatch 'authorization\.template\.md') 'no queda ninguna referencia a la plantilla antigua'
    Check ($ocFront -match '\*authorization\.md\*') 'bash bloquea cualquier comando que mencione la autorización firmada'
    Check ($opencode -notmatch '\| Staging \| PENDIENTE \| Sí \|') 'el esqueleto no afirma que staging esté autorizado'
    Check ($opencode -match 'Seguridad \(SEG\) ≥ PENDIENTE') 'el esqueleto deja los umbrales en PENDIENTE'

    # --- S8: deploy.ps1 ------------------------------------------------------
    Write-Output '== S8 deploy.ps1 =='
    $deploy = Read-Utf8Text -Path (Join-Path $repoRoot 'deploy.ps1')
    Check ($deploy -match 'exit 1') 'sale con código 1 si la validación falla'
    Check ($deploy -match '\.bak_\$stamp') 'respalda lo que reemplaza'
    Check ($deploy -match 'SkipVariants') 'expone -SkipVariants'
    Check ($deploy -notmatch 'Get-Content\s+-(Literal)?Path') 'no lee con Get-Content (ANSI en PowerShell 5.1)'

    # --- S1: paridad con dist\ ----------------------------------------------
    $distDir = Join-Path $repoRoot 'dist'
    if (Test-Path -LiteralPath $distDir) {
        Write-Output '== S1 paridad con dist\ =='
        foreach ($file in $generated) {
            $relative = $file.FullName.Substring($outDir.Length + 1)
            $distPath = Join-Path $distDir $relative
            if (-not (Test-Path -LiteralPath $distPath)) {
                Check $false "existe en dist: $relative"
                continue
            }
            $same = (Get-FileHash -LiteralPath $file.FullName).Hash -eq (Get-FileHash -LiteralPath $distPath).Hash
            Check $same "dist al día: $relative"
        }
    }
}
finally {
    if ($KeepOutput) {
        Write-Output "Salida conservada en: $outDir"
    }
    elseif (Test-Path -LiteralPath $outDir) {
        Remove-Item -LiteralPath $outDir -Recurse -Force
    }
}

Write-Output ''
if ($failures -gt 0) {
    Write-Output "FALLOS: $failures"
    exit 1
}
Write-Output 'TODO CORRECTO'
exit 0

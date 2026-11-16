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
    Check ($generated.Count -eq 16) "16 artefactos generados (encontrados: $($generated.Count))"

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
    Check ($claudeFiles.Count -eq 7) "7 variantes de Claude (encontradas: $($claudeFiles.Count))"
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
    Check ($orchestrator -match 'tools: Agent\(sec-static, sec-config, sec-dynamic, sec-quality, sec-idor, sec-tests\)') 'el orquestador limita la delegación a los 6 subagentes'

    $template = Read-Utf8Text -Path (Join-Path $repoRoot 'claude\settings.template.json')
    $settings = $template | ConvertFrom-Json
    $denyRules = @($settings.permissions.deny)
    $allowRules = @($settings.permissions.allow)
    Check ($denyRules.Count -eq 100) "100 reglas deny (encontradas: $($denyRules.Count))"
    Check ($allowRules.Count -eq 1) "1 regla allow (encontrada: $($allowRules.Count))"
    Check (@($allowRules | Where-Object { $_ -eq 'Edit(./sectest/**)' }).Count -eq 1) 'allow confina la escritura a sectest/'
    Check (@($denyRules | Where-Object { $_ -eq 'Edit(./sectest/scope/authorization.md)' }).Count -eq 1) 'deny bloquea la autorización firmada'
    Check (@($denyRules | Where-Object { $_ -eq 'Edit(./sectest/tools/composer.lock)' }).Count -eq 1) 'deny protege el lock de herramientas'
    $deadRules = @($denyRules | Where-Object { $_ -match '^(Write|Glob|NotebookEdit|MultiEdit)\(' })
    Check ($deadRules.Count -eq 0) 'ninguna regla de ruta que Claude Code ignore'

    # --- S5 y S7: Codex ------------------------------------------------------
    Write-Output '== S5 y S7 Codex =='
    $tomlFiles = @(Get-ChildItem -LiteralPath (Join-Path $outDir 'codex\agents') -Filter '*.toml' -File)
    Check ($tomlFiles.Count -eq 6) "6 subagentes TOML (encontrados: $($tomlFiles.Count))"
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
    Check ($configToml -match '(?m)^"sectest" = "write"') 'Codex permite escribir en sectest/'
    Check ($configToml -match '(?m)^"sectest/scope/authorization.md" = "read"') 'Codex deja la autorización firmada en solo lectura'
    Check ($configToml -notmatch '(?m)^"reports" = "write"') 'Codex ya no escribe en reports/ de la raíz'
    Check ($configToml -notmatch '(?m)^\s*sandbox_mode\s*=') 'no mezcla sandbox_mode con perfiles'
    Check ($configToml -notmatch '//') 'usa comentarios # y no //'
    Check ($configToml -match '(?m)^"sectest" = "write"') 'Codex permite crear claves de credenciales en sectest/'

    $rulesFile = Read-Utf8Text -Path (Join-Path $outDir 'codex\project-kit\.codex\rules\laravel-audit.rules')
    $ruleCount = ([regex]::Matches($rulesFile, 'prefix_rule\(')).Count
    Check ($ruleCount -eq 4) "4 bloques prefix_rule (encontrados: $ruleCount)"
    Check (([regex]::Matches($rulesFile, 'decision = "forbidden"')).Count -ge 4) 'todos los bloques son forbidden'

    # --- OpenCode: superficie de escritura y Paso 0 ---------------------------
    Write-Output '== OpenCode write surface =='
    $opencode = Read-Utf8Text -Path (Join-Path $repoRoot 'agents\laravel-sec-auditor.md')
    $ocClose = $opencode.IndexOf("`n---`n", 3)
    $ocFront = if ($ocClose -gt 0) { $opencode.Substring(4, $ocClose - 4) } else { '' }
    Check ($ocFront -match '"sectest/\*\*": allow') 'OpenCode confina la escritura a sectest/'
    Check ($ocFront -match '"sectest/scope/authorization\.md": deny') 'OpenCode deniega la autorización firmada'
    Check ($opencode -match 'Paso 0') 'el prompt define el Paso 0'
    Check ($opencode -match 'sectest/scope/authorization\.draft\.md') 'el Paso 0 escribe el borrador, no la autorización'
    Check ($opencode -cnotmatch 'authorization\.template\.md') 'no queda ninguna referencia a la plantilla antigua'
    Check ($ocFront -match '\*authorization\.md\*') 'bash bloquea cualquier comando que mencione la autorización firmada'
    Check ($opencode -notmatch '\| Staging \| PENDIENTE \| Sí \|') 'el esqueleto no afirma que staging esté autorizado'
    Check ($opencode -match 'Seguridad \(SEG\) ≥ PENDIENTE') 'el esqueleto deja los umbrales en PENDIENTE'

    # --- S11/S12/S13: coherencia entre permisos y texto ----------------------
    Write-Output '== S11 coherencia de permisos =='
    $agentFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'agents') -Filter '*.md' -File | Sort-Object Name)
    Check ($agentFiles.Count -eq 7) "7 agentes en agents\ (encontrados: $($agentFiles.Count))"

    $bashBlocks = @{}
    $bodies = @{}
    foreach ($agentFile in $agentFiles) {
        $raw = (Read-Utf8Text -Path $agentFile.FullName).Replace("`r`n", "`n")
        $close = $raw.IndexOf("`n---`n", 3)
        $front = if ($close -gt 0) { $raw.Substring(4, $close - 4) } else { throw "Frontmatter sin cierre: $($agentFile.Name)" }
        $body = if ($close -gt 0) { $raw.Substring($close + 5) } else { '' }
        $bodies[$agentFile.BaseName] = $body

        $bashMatch = [regex]::Match($front, '(?m)^  bash:\n(.*?)(?=^  \S|\z)', 'Singleline')
        if (-not $bashMatch.Success) { throw "Sin bloque bash en $($agentFile.Name)" }
        $bashBlocks[$agentFile.BaseName] = ($bashMatch.Groups[1].Value -replace '\s+', ' ').Trim()
    }

    $distinctBash = @($bashBlocks.Values | Sort-Object -Unique)
    Check ($distinctBash.Count -eq 1) "el bloque bash es identico en los 7 agentes (variantes: $($distinctBash.Count))"

    Write-Output '== S12 texto no promete lo que el permiso niega =='
    foreach ($name in $bodies.Keys) {
        $body = $bodies[$name]
        Check ($body -notmatch 'composer require --dev') "sin orden de instalar con composer require: $name"
        Check ($body -match 'sectest/') "acota la escritura a sectest/: $name"
    }

    Write-Output '== S13 contrato con metricas crudas =='
    $orchestratorBody = $bodies['laravel-sec-auditor']
    $contractSection = [regex]::Match($orchestratorBody, '(?s)## 5\. Contrato de resumen.*?(?=### 5\.1)').Value
    Check ($contractSection.Length -gt 0) 'la seccion 5 del contrato existe'
    Check ($contractSection -match '"metricas"') 'el contrato incluye metricas crudas'
    Check ($contractSection -notmatch '"dimensiones"') 'el contrato de subagente no incluye dimensiones'
    Check ($orchestratorBody -match 'Comprueba la vigencia contra el reloj') 'el orquestador valida la ventana temporal'
    Check ($orchestratorBody -match 'A01-SEC-###') 'el orquestador define el namespace de IDs'
    foreach ($sub in @('sec-static', 'sec-config', 'sec-dynamic', 'sec-quality')) {
        Check ($bodies[$sub] -match '`metricas`') "el subagente reporta metricas: $sub"
        Check ($bodies[$sub] -notmatch 'dimensiones\{') "el subagente no define claves de dimensiones: $sub"
    }

    Write-Output '== S14 validador de contratos =='
    $schemaDir = Join-Path $repoRoot 'schemas'
    Check (Test-Path -LiteralPath (Join-Path $schemaDir 'subagent-summary.schema.json')) 'existe el esquema de subagente'
    Check (Test-Path -LiteralPath (Join-Path $schemaDir 'resumen.schema.json')) 'existe el esquema de resumen'
    foreach ($schemaFile in @(Get-ChildItem -LiteralPath $schemaDir -Filter '*.json' -File)) {
        $parsed = $null
        try { $parsed = Read-Utf8Text -Path $schemaFile.FullName | ConvertFrom-Json } catch { }
        Check ($null -ne $parsed) "el esquema es JSON valido: $($schemaFile.Name)"
    }

    $validator = Join-Path $repoRoot 'tools\validate-reports.ps1'
    Check (Test-Path -LiteralPath $validator) 'existe tools\validate-reports.ps1'
    $validDir = Join-Path $repoRoot 'tools\tests\fixtures\valid'
    $invalidDir = Join-Path $repoRoot 'tools\tests\fixtures\invalid'
    & $validator -ReportsDir $validDir | Out-Null
    Check ($LASTEXITCODE -eq 0) 'el validador acepta las fixtures validas'
    & $validator -ReportsDir $invalidDir | Out-Null
    Check ($LASTEXITCODE -eq 1) 'el validador rechaza las fixtures invalidas'

    Write-Output '== S15 almacen de credenciales =='
    $credTemplate = Join-Path $repoRoot 'templates\credentials.conf.example'
    Check (Test-Path -LiteralPath $credTemplate) 'existe templates\credentials.conf.example'
    if (Test-Path -LiteralPath $credTemplate) {
        $credText = Read-Utf8Text -Path $credTemplate
        foreach ($key in @('SECTEST_ANON_ENABLED', 'SECTEST_USER_USERNAME', 'SECTEST_USER_PASSWORD', 'SECTEST_ADMIN_USERNAME', 'SECTEST_ADMIN_PASSWORD', 'SECTEST_USER_PASSWORD_REF', 'SECTEST_ADMIN_PASSWORD_REF')) {
            Check ($credText -match ('(?m)^' + $key + '=')) "la plantilla define $key"
        }
        Check ($credText -notmatch '(?m)^SECTEST_(USER|ADMIN)_PASSWORD=.+') 'la plantilla no trae valores cargados'
        Check ($credText -match 'credentials\.conf') 'la plantilla se documenta como scope/credentials.conf'
    }

    $orchCred = $bodies['laravel-sec-auditor']
    Check ($orchCred -match 'scope/credentials\.conf') 'el orquestador usa scope/credentials.conf'
    foreach ($key in @('SECTEST_USER_USERNAME', 'SECTEST_USER_PASSWORD', 'SECTEST_ADMIN_USERNAME', 'SECTEST_ADMIN_PASSWORD')) {
        Check ($orchCred -match $key) "el esqueleto embebido incluye $key"
    }
    Check ($orchCred -match '--netrc-file') 'el orquestador resuelve el secreto por archivo'
    Check ($orchCred -match 'curl -u') 'el orquestador nombra y prohibe curl -u'
    Check ($orchCred -match 'no la usas') 'el orquestador rechaza secretos pegados en el chat'
    Check ($orchCred -match 'SECTEST_<FAMILIA>_<CAMPO>') 'el orquestador crea claves nuevas con convencion'

    $dynCred = $bodies['sec-dynamic']
    Check ($dynCred -match '--netrc-file') 'sec-dynamic resuelve el secreto por archivo'
    Check ($dynCred -match 'SECTEST_<FAMILIA>_<CAMPO>') 'sec-dynamic sabe crear claves faltantes'

    $ocOrch = Read-Utf8Text -Path (Join-Path $repoRoot 'agents\laravel-sec-auditor.md')
    $ocOrchClose = $ocOrch.IndexOf("`n---`n", 3)
    $ocOrchFront = if ($ocOrchClose -gt 0) { $ocOrch.Substring(4, $ocOrchClose - 4) } else { '' }
    Check ($ocOrchFront -match '"sectest/\*\*": allow') 'OpenCode permite crear claves de credenciales dentro de sectest/'

    foreach ($sub in @('sec-static', 'sec-config', 'sec-quality', 'sec-idor', 'sec-tests')) {
        $subRaw = Read-Utf8Text -Path (Join-Path $repoRoot "agents\$sub.md")
        $subClose = $subRaw.IndexOf("`n---`n", 3)
        $subFront = if ($subClose -gt 0) { $subRaw.Substring(4, $subClose - 4) } else { '' }
        Check ($subFront -cnotmatch 'credentials\.conf') "sin permiso de credenciales innecesario: $sub"
    }

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

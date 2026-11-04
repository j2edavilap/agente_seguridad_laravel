# deploy.ps1 — Instala el agente auditor de seguridad Laravel en la configuración global.
# Uso:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1
#
# Fuente única de verdad: .\agents\*.md
#   OpenCode  -> %USERPROFILE%\.config\opencode\agent\      (copia directa)
#   Claude    -> %USERPROFILE%\.claude\agents\              (variante generada)
#   Codex     -> %USERPROFILE%\.codex\agents\               (variante generada)
#
# El kit de proyecto de Codex NO se instala globalmente: queda en
# .\dist\codex\project-kit\ para copiarlo en la raíz del proyecto auditado.

[CmdletBinding()]
param(
    [switch]$SkipVariants
)

$ErrorActionPreference = 'Stop'

$repoRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Join-Path $repoRoot 'agents'
$distDir   = Join-Path $repoRoot 'dist'
$stamp     = Get-Date -Format 'yyyyMMdd_HHmmss'
$Utf8      = [System.Text.Encoding]::UTF8

$required = @(
    'laravel-sec-auditor',
    'sec-static',
    'sec-config',
    'sec-dynamic',
    'sec-quality'
)

function Read-Utf8Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Install-AgentFiles {
    param(
        [string]$Source,
        [string]$Pattern,
        [string]$Target,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        throw "No se encontró la carpeta de origen para ${Label}: $Source"
    }

    $files = @(Get-ChildItem -LiteralPath $Source -Filter $Pattern -File)
    if ($files.Count -eq 0) {
        throw "No hay archivos '$Pattern' para ${Label} en $Source"
    }

    if (-not (Test-Path -LiteralPath $Target)) {
        New-Item -ItemType Directory -Path $Target -Force | Out-Null
        Write-Output "Creado: $Target"
    }

    foreach ($file in $files) {
        $dest = Join-Path $Target $file.Name
        if (Test-Path -LiteralPath $dest) {
            Copy-Item -LiteralPath $dest -Destination "$dest.bak_$stamp" -Force
            Write-Output "  Backup: $($file.Name).bak_$stamp"
        }
        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
        Write-Output "  Instalado ($Label): $($file.Name)"
    }
}

# --- Validación de la fuente -------------------------------------------------

if (-not (Test-Path -LiteralPath $sourceDir)) {
    throw "No se encontró el directorio de agentes: $sourceDir"
}

$sourceFiles = @(Get-ChildItem -LiteralPath $sourceDir -Filter '*.md' -File)
if ($sourceFiles.Count -eq 0) {
    throw "No hay archivos .md en $sourceDir"
}

$found = @($sourceFiles.BaseName)
$missing = @($required | Where-Object { $found -notcontains $_ })
if ($missing.Count -gt 0) {
    throw ('Faltan agentes requeridos: ' + ($missing -join ', '))
}

foreach ($file in $sourceFiles) {
    # Get-Content lee ANSI por defecto en Windows PowerShell 5.1 y corrompería los acentos.
    $head = Read-Utf8Text -Path $file.FullName
    if (-not $head.StartsWith('---')) {
        throw "Frontmatter inválido (falta '---' inicial): $($file.Name)"
    }
}

# --- 1. OpenCode -------------------------------------------------------------

Write-Output ''
Write-Output '== OpenCode =='
Install-AgentFiles -Source $sourceDir -Pattern '*.md' `
    -Target (Join-Path $env:USERPROFILE '.config\opencode\agent') -Label 'opencode'

# --- 2. Variantes para Claude Code y Codex CLI -------------------------------

if (-not $SkipVariants) {
    Write-Output ''
    Write-Output '== Generando variantes (Claude Code / Codex CLI) =='
    $generator = Join-Path $repoRoot 'tools\build-variants.ps1'
    if (-not (Test-Path -LiteralPath $generator)) {
        throw "No se encontró el generador: $generator"
    }
    & $generator -RepoRoot $repoRoot -OutDir $distDir | Out-Host
}
elseif (-not (Test-Path -LiteralPath $distDir)) {
    throw "Se pidió -SkipVariants pero no existe $distDir"
}

# --- 3. Claude Code ----------------------------------------------------------

Write-Output ''
Write-Output '== Claude Code =='
Install-AgentFiles -Source (Join-Path $distDir 'claude\agents') -Pattern '*.md' `
    -Target (Join-Path $env:USERPROFILE '.claude\agents') -Label 'claude'

# --- 4. Codex CLI ------------------------------------------------------------

Write-Output ''
Write-Output '== Codex CLI =='
Install-AgentFiles -Source (Join-Path $distDir 'codex\agents') -Pattern '*.toml' `
    -Target (Join-Path $env:USERPROFILE '.codex\agents') -Label 'codex'

# --- 5. Validación de lo instalado ------------------------------------------

Write-Output ''
Write-Output '== Validación =='

$errors = New-Object System.Collections.Generic.List[string]

$opencodeTarget = Join-Path $env:USERPROFILE '.config\opencode\agent'
foreach ($name in $required) {
    $p = Join-Path $opencodeTarget "$name.md"
    if (-not (Test-Path -LiteralPath $p)) { $errors.Add("OpenCode: falta $name.md") }
}

$claudeTarget = Join-Path $env:USERPROFILE '.claude\agents'
foreach ($name in $required) {
    $p = Join-Path $claudeTarget "$name.md"
    if (-not (Test-Path -LiteralPath $p)) { $errors.Add("Claude: falta $name.md"); continue }
    $text = Read-Utf8Text -Path $p
    if (-not $text.StartsWith("---`n")) { $errors.Add("Claude: frontmatter inválido en $name.md") }
    if ($text -notmatch '(?m)^name: \S') { $errors.Add("Claude: falta 'name' en $name.md") }
    if ($text -notmatch '(?m)^description: "') { $errors.Add("Claude: falta 'description' en $name.md") }
    if ($text -notmatch '(?m)^tools: \S') { $errors.Add("Claude: falta 'tools' en $name.md") }
}

$codexTarget = Join-Path $env:USERPROFILE '.codex\agents'
foreach ($name in @('sec-static', 'sec-config', 'sec-dynamic', 'sec-quality')) {
    $p = Join-Path $codexTarget "$name.toml"
    if (-not (Test-Path -LiteralPath $p)) { $errors.Add("Codex: falta $name.toml"); continue }
    $text = Read-Utf8Text -Path $p
    if ($text -notmatch '(?m)^name = "') { $errors.Add("Codex: falta 'name' en $name.toml") }
    if ($text -notmatch '(?m)^description = "') { $errors.Add("Codex: falta 'description' en $name.toml") }
    if ($text -notmatch "developer_instructions = '''") { $errors.Add("Codex: falta developer_instructions en $name.toml") }
}

$kitDir = Join-Path $distDir 'codex\project-kit'
if (-not (Test-Path -LiteralPath (Join-Path $kitDir 'AGENTS.md'))) { $errors.Add('Codex: falta project-kit\AGENTS.md') }
if (-not (Test-Path -LiteralPath (Join-Path $kitDir '.codex\config.toml'))) { $errors.Add('Codex: falta project-kit\.codex\config.toml') }
if (-not (Test-Path -LiteralPath (Join-Path $kitDir '.codex\rules\laravel-audit.rules'))) { $errors.Add('Codex: falta project-kit\.codex\rules\laravel-audit.rules') }

# --- 6. Validación del kit de proyecto y de la plantilla de Claude -----------

$agentsMd = Join-Path $kitDir 'AGENTS.md'
if (Test-Path -LiteralPath $agentsMd) {
    $kitText = Read-Utf8Text -Path $agentsMd
    # 'Ã' seguido de byte de continuación, o el prefijo de U+2014 mal decodificado.
    if ($kitText -match '\u00C3[\u0080-\u00BF]' -or $kitText -match '\u00E2\u20AC') {
        $errors.Add('Codex: AGENTS.md contiene mojibake; revisa el BOM de tools\build-variants.ps1')
    }
    if ($kitText -notmatch [regex]::Escape('E:\laragon_8')) {
        $errors.Add('Codex: AGENTS.md perdió la ruta literal de PHP')
    }
}

$configToml = Join-Path $kitDir '.codex\config.toml'
if (Test-Path -LiteralPath $configToml) {
    $toml = Read-Utf8Text -Path $configToml
    if ($toml -notmatch '(?m)^default_permissions\s*=\s*"laravel-audit"') {
        $errors.Add('Codex: config.toml sin default_permissions = "laravel-audit"')
    }
    if ($toml -notmatch '(?m)^extends\s*=\s*":read-only"') {
        $errors.Add('Codex: config.toml sin extends = ":read-only"')
    }
    if ($toml -notmatch '(?m)^"reports"\s*=\s*"write"') {
        $errors.Add('Codex: config.toml no permite escribir en reports')
    }
    if ($toml -match '(?m)^\s*sandbox_mode\s*=' -or $toml -match '(?m)^\s*sandbox_workspace_write\s*=') {
        $errors.Add('Codex: config.toml mezcla sandbox_mode con perfiles de permisos y el perfil se ignora')
    }
}

$rulesFile = Join-Path $kitDir '.codex\rules\laravel-audit.rules'
if (Test-Path -LiteralPath $rulesFile) {
    $ruleText = Read-Utf8Text -Path $rulesFile
    $ruleCount = ([regex]::Matches($ruleText, 'prefix_rule\(')).Count
    if ($ruleCount -ne 4) { $errors.Add("Codex: laravel-audit.rules tiene $ruleCount prefix_rule (se esperan 4)") }
}

$claudeTemplate = Join-Path $repoRoot 'claude\settings.template.json'
if (Test-Path -LiteralPath $claudeTemplate) {
    try {
        $settings = (Read-Utf8Text -Path $claudeTemplate) | ConvertFrom-Json
        $denyRules = @($settings.permissions.deny)
        $allowRules = @($settings.permissions.allow)
        if ($denyRules.Count -eq 0) { $errors.Add('Claude: settings.template.json sin reglas deny') }
        if ($allowRules.Count -eq 0) { $errors.Add('Claude: settings.template.json sin reglas allow') }
        foreach ($rule in $denyRules) {
            if ($rule -match '^(Write|Glob|NotebookEdit|MultiEdit)\(') {
                $errors.Add("Claude: regla que Claude Code nunca aplica: $rule")
                break
            }
        }
    }
    catch {
        $errors.Add("Claude: settings.template.json no es JSON válido: $($_.Exception.Message)")
    }
}

if ($errors.Count -gt 0) {
    Write-Output 'ERRORES:'
    foreach ($e in $errors) { Write-Output "  - $e" }
    exit 1
}

Write-Output 'OK: OpenCode, Claude Code y Codex validados.'

Write-Output ''
Write-Output 'Siguiente paso por runtime:'
Write-Output '  OpenCode  : reinicia OpenCode y selecciona el agente laravel-sec-auditor.'
Write-Output '  Claude    : claude --agent laravel-sec-auditor'
Write-Output '  Codex     : copia dist\codex\project-kit\AGENTS.md y dist\codex\project-kit\.codex\'
Write-Output '              en la raíz del proyecto auditado y ejecuta Codex allí.'
Write-Output ''
Write-Output 'Barrera de escritura de Claude Code (opcional, recomendada):'
Write-Output '  copia claude\settings.template.json en <proyecto-auditado>\.claude\settings.json'
Write-Output '  Afecta a TODAS las sesiones de Claude Code en ese proyecto mientras exista.'

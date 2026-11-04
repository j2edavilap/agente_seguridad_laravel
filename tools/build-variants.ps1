#Requires -Version 5.1
<#
.SYNOPSIS
    Genera las variantes de agente para Claude Code y Codex CLI a partir de agents\*.md.

.DESCRIPTION
    Fuente única de verdad: .\agents\*.md (frontmatter OpenCode + prompt).

    Salidas generadas (no editar a mano):
      dist\claude\agents\<nombre>.md    frontmatter Claude Code (name/description/tools) + prompt
      dist\codex\agents\<nombre>.toml   agentes personalizados de Codex (solo subagentes)
      dist\codex\project-kit\AGENTS.md  protocolo del orquestador, para el proyecto auditado
      dist\codex\project-kit\.codex\    perfil de permisos + reglas del proyecto auditado

    Los archivos se escriben en UTF-8 sin BOM. Windows PowerShell 5.1 lee por defecto ANSI,
    así que aquí siempre se usa [System.IO.File] con [System.Text.Encoding]::UTF8.

.PARAMETER RepoRoot
    Raíz del repositorio. Por defecto, el directorio padre de este script.

.PARAMETER OutDir
    Directorio de salida. Por defecto, <RepoRoot>\dist.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'

# --- Guarda de encoding -----------------------------------------------------
# Windows PowerShell 5.1 decodifica este script como ANSI cuando no tiene BOM. Si el archivo
# contiene literales no ASCII (tildes, guiones largos) y le falta el BOM, esos literales ya
# están corruptos en memoria antes de llegar aquí y se propagarían a las variantes generadas.
# Este archivo DEBE guardarse en UTF-8 con BOM.

$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath -and (Test-Path -LiteralPath $scriptPath)) {
    $selfBytes = [System.IO.File]::ReadAllBytes($scriptPath)
    $selfHasBom = ($selfBytes.Length -ge 3 -and
        $selfBytes[0] -eq 0xEF -and $selfBytes[1] -eq 0xBB -and $selfBytes[2] -eq 0xBF)
    $selfNonAscii = $false
    foreach ($byte in $selfBytes) {
        if ($byte -gt 0x7F) { $selfNonAscii = $true; break }
    }
    if ($selfNonAscii -and -not $selfHasBom) {
        throw ('Este script contiene caracteres no ASCII y no tiene BOM UTF-8. ' +
            'Windows PowerShell 5.1 lo lee como ANSI y corrompe los literales acentuados. ' +
            'Guárdalo de nuevo en UTF-8 con BOM.')
    }
}

if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
if (-not $OutDir)   { $OutDir   = Join-Path $RepoRoot 'dist' }

$SourceDir = Join-Path $RepoRoot 'agents'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# --- Utilidades -------------------------------------------------------------

function Read-Utf8Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text {
    param([string]$Path, [string]$Text)
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Split-AgentFile {
    param([string]$Text, [string]$Name)

    $t = $Text.Replace("`r`n", "`n")
    if (-not $t.StartsWith("---`n")) {
        throw "Frontmatter inválido en ${Name}: la primera línea debe ser '---'."
    }

    $rest = $t.Substring(4)
    $closeIdx = $rest.IndexOf("`n---`n")
    if ($closeIdx -lt 0) {
        # El archivo puede terminar justo después del cierre del frontmatter.
        $closeIdx = $rest.IndexOf("`n---")
        if ($closeIdx -lt 0) { throw "Frontmatter sin cierre en ${Name}." }
        $frontmatter = $rest.Substring(0, $closeIdx)
        $body = ''
    }
    else {
        $frontmatter = $rest.Substring(0, $closeIdx)
        $body = $rest.Substring($closeIdx + 5)
    }

    return [pscustomobject]@{
        Frontmatter = $frontmatter
        Body        = $body.TrimStart("`n")
    }
}

function Get-FrontmatterValue {
    param([string]$Frontmatter, [string]$Key)
    $m = [regex]::Match($Frontmatter, '(?m)^' + [regex]::Escape($Key) + ':\s*(.+)$')
    if (-not $m.Success) { return $null }
    return $m.Groups[1].Value.Trim()
}

function ConvertTo-YamlDoubleQuoted {
    param([string]$Value)
    $v = $Value.Replace('\', '\\').Replace('"', '\"')
    return '"' + $v + '"'
}

function ConvertTo-TomlBasicString {
    param([string]$Value)
    $v = $Value.Replace('\', '\\').Replace('"', '\"')
    return '"' + $v + '"'
}

function Invoke-Replacements {
    param([string]$Text, [object[]]$Table)
    foreach ($pair in $Table) {
        $Text = $Text.Replace($pair[0], $pair[1])
    }
    return $Text
}

# --- Tabla de herramientas Claude Code por agente ---------------------------
# Nombres canónicos verificados en la referencia oficial de subagentes de Claude Code.
# 'Agent(tipo, ...)' solo se aplica al agente que corre como hilo principal con `claude --agent`.

$readOnlyTools   = 'Read, Grep, Glob, Bash, PowerShell, Edit, Write, TodoWrite'
$orchestratorTools = 'Agent(sec-static, sec-config, sec-dynamic, sec-quality), Read, Grep, Glob, Bash, PowerShell, Edit, Write, TodoWrite, WebFetch'

$agentConfig = @{
    'laravel-sec-auditor' = @{ ClaudeTools = $orchestratorTools; CodexSubagent = $false }
    'sec-static'          = @{ ClaudeTools = $readOnlyTools;     CodexSubagent = $true }
    'sec-config'          = @{ ClaudeTools = $readOnlyTools;     CodexSubagent = $true }
    'sec-dynamic'         = @{ ClaudeTools = $readOnlyTools;     CodexSubagent = $true }
    'sec-quality'         = @{ ClaudeTools = $readOnlyTools;     CodexSubagent = $true }
}

# --- Sustituciones por runtime ---------------------------------------------
# Solo se adaptan nombres de herramientas que no existen en el runtime destino.

$claudeSubs = @(
    @('`task`', '`Agent`'),
    @('`webfetch`', '`WebFetch`')
)

$codexSubs = @(
    @('delegas con la herramienta `task` usando estos `subagent_type`',
      'delegas a los subagentes de Codex por nombre —`sec-static`, `sec-config`, `sec-dynamic`, `sec-quality`— definidos en `~/.codex/agents/`'),
    @('`webfetch`', 'la herramienta de fetch web del cliente')
)

# --- Validación de entrada --------------------------------------------------

if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "No se encontró el directorio de agentes: $SourceDir"
}

$files = @(Get-ChildItem -LiteralPath $SourceDir -Filter '*.md' -File | Sort-Object Name)
if ($files.Count -eq 0) { throw "No hay archivos .md en $SourceDir" }

$required = @('laravel-sec-auditor', 'sec-static', 'sec-config', 'sec-dynamic', 'sec-quality')
$found = @($files.BaseName)
$missing = @($required | Where-Object { $found -notcontains $_ })
if ($missing.Count -gt 0) {
    throw ('Faltan agentes requeridos: ' + ($missing -join ', '))
}

# --- Limpieza de salidas generadas -----------------------------------------

foreach ($sub in @('claude', 'codex')) {
    $path = Join-Path $OutDir $sub
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}

# --- Generación -------------------------------------------------------------

$summary = New-Object System.Collections.Generic.List[string]

foreach ($file in $files) {
    $name = $file.BaseName
    $cfg  = $agentConfig[$name]
    if (-not $cfg) { throw "Agente sin configuración de runtime: $name" }

    $split = Split-AgentFile -Text (Read-Utf8Text -Path $file.FullName) -Name $file.Name
    $description = Get-FrontmatterValue -Frontmatter $split.Frontmatter -Key 'description'
    if (-not $description) { throw "Falta 'description' en $($file.Name)" }

    # ---------- Claude Code ----------
    $claudeBody = Invoke-Replacements -Text $split.Body -Table $claudeSubs
    $claudeLines = @(
        '---'
        ('name: ' + $name)
        ('description: ' + (ConvertTo-YamlDoubleQuoted -Value $description))
        ('tools: ' + $cfg.ClaudeTools)
        'model: inherit'
        '---'
        ''
    ) -join "`n"

    $claudePath = Join-Path $OutDir ("claude\agents\$name.md")
    Write-Utf8Text -Path $claudePath -Text ($claudeLines + $claudeBody)
    $summary.Add("claude  $name.md")

    # ---------- Codex CLI ----------
    if ($cfg.CodexSubagent) {
        $codexBody = Invoke-Replacements -Text $split.Body -Table $codexSubs
        if ($codexBody.Contains("'''")) {
            throw "El cuerpo de $name contiene ''' y no puede serializarse como cadena literal TOML."
        }
        $toml = @(
            '# Generado desde agents/' + $name + '.md — no editar a mano.'
            ('name = ' + (ConvertTo-TomlBasicString -Value $name))
            ('description = ' + (ConvertTo-TomlBasicString -Value $description))
            "developer_instructions = '''"
            $codexBody.TrimEnd("`n")
            "'''"
            ''
        ) -join "`n"

        $tomlPath = Join-Path $OutDir ("codex\agents\$name.toml")
        Write-Utf8Text -Path $tomlPath -Text $toml
        $summary.Add("codex   $name.toml")
    }
    else {
        # El orquestador de Codex va al AGENTS.md del proyecto auditado.
        $header = @(
            '<!-- Generado desde agents/laravel-sec-auditor.md (tools/build-variants.ps1). No editar esta copia. -->'
            ''
            '# Protocolo de auditoría de seguridad — Laravel 13 / PHP 8.5'
            ''
            'Este archivo se copia en la **raíz del proyecto auditado**. Codex lo carga como instrucciones'
            'del proyecto. Los subagentes `sec-static`, `sec-config`, `sec-dynamic` y `sec-quality` están'
            'definidos globalmente en `~/.codex/agents/`.'
            ''
            'El perfil de permisos `laravel-audit` de `.codex/config.toml` es la barrera real de solo'
            'lectura. Las reglas de `.codex/rules/laravel-audit.rules` son una segunda capa y solo cubren'
            'prefijos de argv que coinciden literalmente. Ninguna de las dos sustituye a la REGLA CERO.'
            ''
            '---'
            ''
            ''
        ) -join "`n"
        $codexOrchestrator = Invoke-Replacements -Text $split.Body -Table $codexSubs
        $agentsPath = Join-Path $OutDir 'codex\project-kit\AGENTS.md'
        Write-Utf8Text -Path $agentsPath -Text ($header + $codexOrchestrator)
        $summary.Add('codex   project-kit\AGENTS.md')
    }
}

# --- Kit de proyecto para Codex --------------------------------------------

$kitSource = Join-Path $RepoRoot 'codex\project-kit\.codex'
if (-not (Test-Path -LiteralPath $kitSource)) {
    throw "No se encontró la plantilla de Codex: $kitSource"
}

$kitTarget = Join-Path $OutDir 'codex\project-kit\.codex'
Copy-Item -LiteralPath $kitSource -Destination $kitTarget -Recurse -Force
$summary.Add('codex   project-kit\.codex\config.toml')
$summary.Add('codex   project-kit\.codex\rules\laravel-audit.rules')

# --- Validación de la salida ------------------------------------------------

$errors = New-Object System.Collections.Generic.List[string]

foreach ($md in @(Get-ChildItem -LiteralPath (Join-Path $OutDir 'claude\agents') -Filter '*.md' -File)) {
    $text = Read-Utf8Text -Path $md.FullName
    if (-not $text.StartsWith("---`n")) { $errors.Add("Sin frontmatter: $($md.Name)") }
    if ($text -notmatch '(?m)^name: \S') { $errors.Add("Sin 'name': $($md.Name)") }
    if ($text -notmatch '(?m)^description: "') { $errors.Add("Sin 'description': $($md.Name)") }
    if ($text -notmatch '(?m)^tools: \S') { $errors.Add("Sin 'tools': $($md.Name)") }
    if ($text -match '(?m)^\s*mode: ') { $errors.Add("Frontmatter OpenCode filtrado: $($md.Name)") }
}

foreach ($toml in @(Get-ChildItem -LiteralPath (Join-Path $OutDir 'codex\agents') -Filter '*.toml' -File)) {
    $text = Read-Utf8Text -Path $toml.FullName
    if ($text -notmatch '(?m)^name = "') { $errors.Add("Sin 'name' TOML: $($toml.Name)") }
    if ($text -notmatch '(?m)^description = "') { $errors.Add("Sin 'description' TOML: $($toml.Name)") }
    $open = ([regex]::Matches($text, "developer_instructions = '''")).Count
    $close = ([regex]::Matches($text, "(?m)^'''$")).Count
    if ($open -ne 1 -or $close -ne 1) { $errors.Add("Delimitadores TOML incorrectos: $($toml.Name)") }
}

if (-not (Test-Path -LiteralPath (Join-Path $OutDir 'codex\project-kit\AGENTS.md'))) {
    $errors.Add('Falta project-kit\AGENTS.md')
}
if (-not (Test-Path -LiteralPath (Join-Path $OutDir 'codex\project-kit\.codex\config.toml'))) {
    $errors.Add('Falta project-kit\.codex\config.toml')
}

if ($errors.Count -gt 0) {
    throw ("Validación fallida:`n  - " + ($errors -join "`n  - "))
}

Write-Output "Variantes generadas en: $OutDir"
foreach ($line in $summary) { Write-Output "  $line" }
Write-Output ''
Write-Output 'OpenCode se instala directamente desde agents\*.md (sin generación).'

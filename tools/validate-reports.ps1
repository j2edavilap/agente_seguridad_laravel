#Requires -Version 5.1
<#
.SYNOPSIS
    Valida los JSON de una auditoria contra los esquemas de schemas/.

.DESCRIPTION
    Windows PowerShell 5.1 no trae Test-Json, asi que este validador implementa el
    subconjunto de JSON Schema que usan nuestros contratos:
    type, required, properties, additionalProperties, enum, minimum, maximum,
    items, minItems, pattern.

    Ademas aplica comprobaciones semanticas que un esquema no puede expresar:
      - hallazgos_confirmados <= suma de hallazgos
      - ids_hallazgos sin duplicados y con el prefijo del subagente
      - archivo_reporte coherente con el subagente
      - cada dimension coincide con el resultado declarado en calculos
      - una dimension nula exige no_evaluable = true

.PARAMETER ReportsDir
    Directorio reports/ del proyecto auditado. Se validan resumen.json y contratos\A-*.json.

.PARAMETER SchemaDir
    Directorio de esquemas. Por defecto, <repo>\schemas.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\tools\validate-reports.ps1 -ReportsDir C:\proj\reports

.NOTES
    Sale con 0 si todo valida y con 1 si hay errores.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ReportsDir,
    [string]$SchemaDir
)

$ErrorActionPreference = 'Stop'

if (-not $SchemaDir) {
    $SchemaDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'schemas'
}

function Read-JsonFile {
    param([string]$Path)
    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    return ($text | ConvertFrom-Json)
}

function Get-JsonType {
    param($Value)
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [bool]) { return 'boolean' }
    if ($Value -is [string]) { return 'string' }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [int16] -or $Value -is [byte]) { return 'integer' }
    if ($Value -is [double] -or $Value -is [decimal] -or $Value -is [single]) {
        if ([double]$Value -eq [math]::Truncate([double]$Value)) { return 'integer' }
        return 'number'
    }
    if ($Value -is [System.Array]) { return 'array' }
    return 'object'
}

function Test-TypeMatch {
    param($Value, $Expected)
    $actual = Get-JsonType -Value $Value
    if ($Expected -is [System.Array]) {
        foreach ($t in $Expected) {
            if (Test-TypeMatch -Value $Value -Expected $t) { return $true }
        }
        return $false
    }
    if ($Expected -eq 'number') { return ($actual -eq 'number' -or $actual -eq 'integer') }
    return ($actual -eq [string]$Expected)
}

function Test-SchemaNode {
    param(
        $Value,
        $Schema,
        [string]$Path,
        [System.Collections.Generic.List[string]]$Errors
    )

    if ($null -eq $Schema) { return }

    if ($null -ne $Schema.type) {
        if (-not (Test-TypeMatch -Value $Value -Expected $Schema.type)) {
            $expected = if ($Schema.type -is [System.Array]) { ($Schema.type -join '|') } else { [string]$Schema.type }
            $Errors.Add("${Path}: se esperaba '$expected' y llego '$(Get-JsonType -Value $Value)'")
            return
        }
    }

    if ($null -eq $Value) { return }

    if ($null -ne $Schema.enum) {
        $ok = $false
        foreach ($candidate in $Schema.enum) {
            if ([string]$candidate -eq [string]$Value) { $ok = $true; break }
        }
        if (-not $ok) {
            $Errors.Add("${Path}: '$Value' no esta en el enum [$(@($Schema.enum) -join ', ')]")
        }
    }

    $actualType = Get-JsonType -Value $Value

    if ($actualType -eq 'integer' -or $actualType -eq 'number') {
        $number = [double]$Value
        if ($null -ne $Schema.minimum -and $number -lt [double]$Schema.minimum) {
            $Errors.Add("${Path}: $number < minimo $($Schema.minimum)")
        }
        if ($null -ne $Schema.maximum -and $number -gt [double]$Schema.maximum) {
            $Errors.Add("${Path}: $number > maximo $($Schema.maximum)")
        }
    }

    if ($actualType -eq 'string' -and $null -ne $Schema.pattern) {
        if (-not [regex]::IsMatch([string]$Value, [string]$Schema.pattern)) {
            $Errors.Add("${Path}: '$Value' no cumple el patron $($Schema.pattern)")
        }
    }

    if ($actualType -eq 'array') {
        $items = @($Value)
        if ($null -ne $Schema.minItems -and $items.Count -lt [int]$Schema.minItems) {
            $Errors.Add("${Path}: $($items.Count) elementos < minItems $($Schema.minItems)")
        }
        if ($null -ne $Schema.items) {
            for ($i = 0; $i -lt $items.Count; $i++) {
                Test-SchemaNode -Value $items[$i] -Schema $Schema.items -Path "${Path}[$i]" -Errors $Errors
            }
        }
    }

    if ($actualType -eq 'object') {
        $present = @($Value.PSObject.Properties.Name)
        if ($null -ne $Schema.required) {
            foreach ($name in @($Schema.required)) {
                if ($present -notcontains [string]$name) {
                    $Errors.Add("${Path}.${name}: falta una clave obligatoria")
                }
            }
        }
        foreach ($name in $present) {
            $propSchema = $null
            if ($null -ne $Schema.properties) {
                $known = @($Schema.properties.PSObject.Properties.Name)
                if ($known -contains $name) {
                    $propSchema = $Schema.properties.$name
                }
            }
            if ($null -eq $propSchema) {
                if ($null -ne $Schema.additionalProperties -and $Schema.additionalProperties -eq $false) {
                    $Errors.Add("${Path}.${name}: clave no permitida")
                }
                continue
            }
            Test-SchemaNode -Value $Value.$name -Schema $propSchema -Path "${Path}.${name}" -Errors $Errors
        }
    }
}

function Test-ContractSemantics {
    param($Obj, [string]$Path, [System.Collections.Generic.List[string]]$Errors)

    $sumHints = 0
    if ($null -ne $Obj.hallazgos) {
        foreach ($sev in @('critico', 'alto', 'medio', 'bajo', 'informativo')) {
            $sumHints += [int]$Obj.hallazgos.$sev
        }
    }

    $sumConfirmed = 0
    if ($null -ne $Obj.confirmados) {
        foreach ($sev in @('critico', 'alto', 'medio', 'bajo', 'informativo')) {
            $confirmed = [int]$Obj.confirmados.$sev
            $sumConfirmed += $confirmed
            if ($null -ne $Obj.hallazgos -and $confirmed -gt [int]$Obj.hallazgos.$sev) {
                $Errors.Add("${Path}.confirmados.$sev ($confirmed) > hallazgos.$sev ($($Obj.hallazgos.$sev))")
            }
        }
    }

    if ($null -ne $Obj.hallazgos_confirmados -and [int]$Obj.hallazgos_confirmados -gt $sumHints) {
        $Errors.Add("${Path}: hallazgos_confirmados ($($Obj.hallazgos_confirmados)) > suma de hallazgos ($sumHints)")
    }
    if ($null -ne $Obj.hallazgos_confirmados -and [int]$Obj.hallazgos_confirmados -ne $sumConfirmed) {
        $Errors.Add("${Path}: hallazgos_confirmados ($($Obj.hallazgos_confirmados)) != suma de confirmados ($sumConfirmed)")
    }

    $prefixByAgent = @{
        'A-STATIC'  = 'A01-'
        'A-CONFIG'  = 'A02-'
        'A-DYNAMIC' = 'A03-'
        'A-QUALITY' = 'A04-'
    }
    $prefix = $prefixByAgent[[string]$Obj.subagente]
    if ($prefix -and $null -ne $Obj.ids_hallazgos) {
        $seen = @{}
        foreach ($id in @($Obj.ids_hallazgos)) {
            if (-not ([string]$id).StartsWith($prefix)) {
                $Errors.Add("${Path}: id '$id' no pertenece al namespace $prefix")
            }
            if ($seen.ContainsKey([string]$id)) {
                $Errors.Add("${Path}: id duplicado '$id'")
            }
            $seen[[string]$id] = $true
        }
    }

    $fileByAgent = @{
        'A-STATIC'  = 'sectest/reports/A-01-STATIC.md'
        'A-CONFIG'  = 'sectest/reports/A-02-CONFIG.md'
        'A-DYNAMIC' = 'sectest/reports/A-03-DYNAMIC.md'
        'A-QUALITY' = 'sectest/reports/A-04-QUALITY.md'
    }
    $expected = $fileByAgent[[string]$Obj.subagente]
    if ($expected -and [string]$Obj.archivo_reporte -ne $expected) {
        $Errors.Add("${Path}: archivo_reporte '$($Obj.archivo_reporte)' no corresponde a $($Obj.subagente)")
    }
}

function Test-ResumenSemantics {
    param($Obj, [string]$Path, [System.Collections.Generic.List[string]]$Errors)

    $dims = @('seguridad', 'control_informacion', 'calidad_software')
    $nullCount = 0

    foreach ($dim in $dims) {
        $value = $Obj.dimensiones.$dim
        $flagged = [bool]$Obj.no_evaluable.$dim
        $calc = $Obj.calculos.$dim.resultado

        if ($null -eq $value) {
            $nullCount++
            if (-not $flagged) {
                $Errors.Add("${Path}: dimensiones.$dim es null pero no_evaluable.$dim es false")
            }
            if ($null -ne $calc) {
                $Errors.Add("${Path}: dimensiones.$dim es null y calculos.$dim.resultado es $calc")
            }
        }
        else {
            if ($flagged) {
                $Errors.Add("${Path}: dimensiones.$dim tiene valor y no_evaluable.$dim es true")
            }
            if ($null -ne $calc -and [math]::Abs([double]$value - [double]$calc) -gt 0.05) {
                $Errors.Add("${Path}: dimensiones.$dim ($value) no coincide con calculos.$dim.resultado ($calc)")
            }
        }
    }

    if ([string]$Obj.veredicto -eq 'aprobado' -and $nullCount -gt 0) {
        $Errors.Add("${Path}: veredicto 'aprobado' con $nullCount dimension(es) sin evaluar")
    }
    if ([string]$Obj.veredicto -eq 'no_evaluable' -and $nullCount -lt 2) {
        $Errors.Add("${Path}: veredicto 'no_evaluable' exige al menos 2 dimensiones nulas (hay $nullCount)")
    }
}

# --- Carga de esquemas -------------------------------------------------------

$subSchemaPath = Join-Path $SchemaDir 'subagent-summary.schema.json'
$resSchemaPath = Join-Path $SchemaDir 'resumen.schema.json'
foreach ($schemaPath in @($subSchemaPath, $resSchemaPath)) {
    if (-not (Test-Path -LiteralPath $schemaPath)) {
        throw "Falta el esquema: $schemaPath"
    }
}
$subSchema = Read-JsonFile -Path $subSchemaPath
$resSchema = Read-JsonFile -Path $resSchemaPath

# --- Objetivos ---------------------------------------------------------------

if (-not (Test-Path -LiteralPath $ReportsDir)) {
    throw "No existe el directorio de informes: $ReportsDir"
}

$targets = New-Object System.Collections.Generic.List[object]

$resumenPath = Join-Path $ReportsDir 'resumen.json'
if (Test-Path -LiteralPath $resumenPath) {
    $targets.Add([pscustomobject]@{ Path = $resumenPath; Schema = $resSchema; Kind = 'resumen' })
}

$contratosDir = Join-Path $ReportsDir 'contratos'
if (Test-Path -LiteralPath $contratosDir) {
    foreach ($file in @(Get-ChildItem -LiteralPath $contratosDir -Filter '*.json' -File | Sort-Object Name)) {
        $targets.Add([pscustomobject]@{ Path = $file.FullName; Schema = $subSchema; Kind = 'contrato' })
    }
}

if ($targets.Count -eq 0) {
    throw "No se encontro resumen.json ni contratos\*.json en $ReportsDir"
}

# --- Validacion --------------------------------------------------------------

$errors = New-Object System.Collections.Generic.List[string]

foreach ($target in $targets) {
    $label = Split-Path -Leaf $target.Path
    try {
        $obj = Read-JsonFile -Path $target.Path
    }
    catch {
        $errors.Add("${label}: JSON invalido ($($_.Exception.Message))")
        continue
    }

    $before = $errors.Count
    Test-SchemaNode -Value $obj -Schema $target.Schema -Path $label -Errors $errors

    if ($target.Kind -eq 'contrato') {
        Test-ContractSemantics -Obj $obj -Path $label -Errors $errors
    }
    else {
        Test-ResumenSemantics -Obj $obj -Path $label -Errors $errors
    }

    if ($errors.Count -eq $before) {
        Write-Output "  PASS  $label"
    }
}

Write-Output ''
if ($errors.Count -gt 0) {
    Write-Output "ERRORES: $($errors.Count)"
    foreach ($errorItem in $errors) { Write-Output "  - $errorItem" }
    exit 1
}

Write-Output 'TODOS LOS CONTRATOS VALIDAN'
exit 0

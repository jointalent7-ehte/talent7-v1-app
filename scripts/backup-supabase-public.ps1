[CmdletBinding()]
param(
  [string]$DatabaseHost = "aws-1-ap-south-1.pooler.supabase.com",
  [int]$DatabasePort = 5432,
  [string]$DatabaseName = "postgres",
  [string]$DatabaseUser = "postgres.szhgxfvydjtvcbuhnnnc"
)

$ErrorActionPreference = "Stop"

function Find-PgDump {
  $command = Get-Command "pg_dump.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $postgresRoot = Join-Path $env:ProgramFiles "PostgreSQL"
  if (Test-Path -LiteralPath $postgresRoot) {
    $candidate = Get-ChildItem -LiteralPath $postgresRoot -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1

    if ($candidate) {
      return $candidate
    }
  }

  throw "pg_dump.exe was not found. Install PostgreSQL Command Line Tools, then run this script again."
}

function Invoke-PgDump {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  Write-Host "Creating $Description..."
  & $script:PgDumpPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed while creating $Description (exit code $LASTEXITCODE)."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDirectory = Join-Path $backupRoot "supabase-$timestamp"
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($outputDirectory)

if (-not $resolvedOutputDirectory.StartsWith(
    $resolvedProjectRoot + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Refusing to write outside the Talent7 project directory."
}

if (Test-Path -LiteralPath $resolvedOutputDirectory) {
  throw "Backup directory already exists: $resolvedOutputDirectory"
}

$script:PgDumpPath = Find-PgDump
New-Item -ItemType Directory -Path $resolvedOutputDirectory | Out-Null

$securePassword = Read-Host "Enter the Supabase database password (it will not be displayed)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PGSSLMODE = "require"

  $commonArguments = @(
    "--host=$DatabaseHost",
    "--port=$DatabasePort",
    "--username=$DatabaseUser",
    "--dbname=$DatabaseName",
    "--schema=public",
    "--no-owner",
    "--no-privileges"
  )

  $fullBackup = Join-Path $resolvedOutputDirectory "public-full.dump"
  $schemaBackup = Join-Path $resolvedOutputDirectory "public-schema.sql"
  $dataBackup = Join-Path $resolvedOutputDirectory "public-data.sql"

  Invoke-PgDump -Description "full restorable public-schema backup" -Arguments ($commonArguments + @(
      "--format=custom",
      "--file=$fullBackup"
    ))

  Invoke-PgDump -Description "readable public schema backup" -Arguments ($commonArguments + @(
      "--schema-only",
      "--file=$schemaBackup"
    ))

  Invoke-PgDump -Description "readable public data backup" -Arguments ($commonArguments + @(
      "--data-only",
      "--inserts",
      "--file=$dataBackup"
    ))

  $backupFiles = Get-Item -LiteralPath $fullBackup, $schemaBackup, $dataBackup
  foreach ($backupFile in $backupFiles) {
    if ($backupFile.Length -le 0) {
      throw "Backup file is empty: $($backupFile.FullName)"
    }
  }

  Write-Host ""
  Write-Host "Backup completed successfully:" -ForegroundColor Green
  Write-Host $resolvedOutputDirectory
  $backupFiles | Select-Object Name, Length | Format-Table -AutoSize
  Write-Host "This backup covers Talent7's public schema and public data. It does not contain R2 media files or users' login passwords."
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

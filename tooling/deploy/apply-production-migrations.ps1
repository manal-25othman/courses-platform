<#
.SYNOPSIS
  Applies the migrations to the production database, on Windows, without the
  connection string ever being written down.

.DESCRIPTION
  Asks for the Supabase connection string, holds it in this PowerShell process
  only, and hands it to the deploy script through the environment. Nothing is
  echoed to the screen, saved to a file, or written to PSReadLine history, and
  closing the window is all it takes to be rid of it.

  Deliberately not `setx`, and deliberately not a .env file: either would leave
  the production database password on the machine for every later process to
  read.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tooling\deploy\apply-production-migrations.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tooling\deploy\apply-production-migrations.ps1 -Check
  Reads only: reports which database it reaches and what is still pending.
#>
[CmdletBinding()]
param(
  # Report the database's state and stop, without applying anything.
  [switch] $Check
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script   = Join-Path $repoRoot 'tooling\deploy\production-database.mjs'

if (-not (Test-Path $script)) {
  Write-Host "Could not find $script." -ForegroundColor Red
  Write-Host "Run this from inside the courses-platform repository."
  exit 1
}

$exitCode = 1
$mode = if ($Check) { 'check' } else { 'apply' }

Write-Host ''
Write-Host '  Smart Shift - production database' -ForegroundColor Cyan
Write-Host '  ---------------------------------'
Write-Host ''
Write-Host '  Paste the Supabase connection string. It will not be shown as you type,'
Write-Host '  and it is not saved anywhere. Right-click or Ctrl+V pastes.'
Write-Host ''

$secure = Read-Host '  Connection string' -AsSecureString

if ($secure.Length -eq 0) {
  Write-Host ''
  Write-Host '  Nothing entered. Stopping.' -ForegroundColor Yellow
  exit 1
}

# SecureString to plain text, for the length of this process only. The value is
# put straight into the child's environment and never into a variable that
# outlives the try block.
$plain = [System.Net.NetworkCredential]::new('', $secure).Password

try {
  $env:DIRECT_URL   = $plain
  $env:DATABASE_URL = $plain

  Write-Host ''
  & node $script $mode
  $exitCode = $LASTEXITCODE
}
finally {
  # Cleared whether the run succeeded, failed, or was interrupted.
  Remove-Item Env:\DIRECT_URL   -ErrorAction SilentlyContinue
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
  $plain  = $null
  $secure = $null
  [System.GC]::Collect()
}

Write-Host ''

if ($exitCode -eq 0) {
  Write-Host '  Done. The connection string has been cleared from this window.' -ForegroundColor Green
} else {
  Write-Host '  Stopped without completing. Nothing further was attempted.' -ForegroundColor Yellow
  Write-Host '  The connection string has been cleared from this window.'
}

exit $exitCode

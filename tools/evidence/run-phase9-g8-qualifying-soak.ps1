param(
  [string]$OutputDirectory = 'evidence/2026-07-27/phase-9-g8-runtime-instrumentation/high-sol-detached-30m-v2'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$resolvedOutputDirectory = Join-Path $repositoryRoot $OutputDirectory
$statePath = Join-Path $resolvedOutputDirectory 'launch-state.json'
$serverStdoutPath = Join-Path $resolvedOutputDirectory 'vite.stdout.log'
$serverStderrPath = Join-Path $resolvedOutputDirectory 'vite.stderr.log'
$captureStdoutPath = Join-Path $resolvedOutputDirectory 'capture.stdout.log'
$captureStderrPath = Join-Path $resolvedOutputDirectory 'capture.stderr.log'
$script:serverProcess = $null
$script:captureProcess = $null
$startedAt = [DateTimeOffset]::UtcNow

New-Item -ItemType Directory -Force -Path $resolvedOutputDirectory | Out-Null

function Write-LaunchState {
  param(
    [Parameter(Mandatory)]
    [string]$Phase,
    [Nullable[int]]$ExitCode = $null,
    [string]$ErrorMessage = $null
  )

  $state = [ordered]@{
    schemaVersion = 1
    phase = $Phase
    taskName = 'KYX-G8-Qualifying-Soak-20260727-v2'
    wrapperPid = $PID
    vitePid = if ($null -ne $script:serverProcess) { $script:serverProcess.Id } else { $null }
    capturePid = if ($null -ne $script:captureProcess) { $script:captureProcess.Id } else { $null }
    startedAt = $startedAt.ToString('o')
    updatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    outputDirectory = $resolvedOutputDirectory
    requestedWarmupMs = 60000
    requestedCaptureMs = 1800000
    exitCode = $ExitCode
    error = $ErrorMessage
  }
  $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
}

Write-LaunchState -Phase 'wrapper_started'

try {
  $viteArguments = @(
    'node_modules/vite/bin/vite.js',
    '--host', '127.0.0.1',
    '--port', '5173',
    '--strictPort'
  )
  $script:serverProcess = Start-Process `
    -FilePath $node `
    -ArgumentList $viteArguments `
    -WorkingDirectory $repositoryRoot `
    -RedirectStandardOutput $serverStdoutPath `
    -RedirectStandardError $serverStderrPath `
    -WindowStyle Hidden `
    -PassThru
  Write-LaunchState -Phase 'vite_starting'

  $serverReady = $false
  $serverDeadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
  while ([DateTimeOffset]::UtcNow -lt $serverDeadline) {
    if ($script:serverProcess.HasExited) {
      throw "Vite exited before it became ready (exit $($script:serverProcess.ExitCode))."
    }
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $serverReady = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $serverReady) {
    throw 'Vite did not become ready on http://127.0.0.1:5173/ within 30 seconds.'
  }
  Write-LaunchState -Phase 'vite_ready'

  $captureArguments = @(
    'tools/evidence/capture-phase9-g8-runtime-instrumentation.mjs',
    '--base-url=http://127.0.0.1:5173/',
    '--qualifying-candidate',
    '--headed',
    '--final-integrated-build',
    '--duration-ms=1800000',
    '--warmup-ms=60000',
    '--sample-interval-ms=1000',
    '--tier=high',
    '--quality=high',
    '--width=2560',
    '--height=1440',
    '--display-refresh-hz=540',
    '--machine-id=sol',
    '--gpu-driver=NVIDIA_610.62_Windows_32.0.16.1062',
    '--power-mode=Ultimate_Performance',
    '--thermal-state=unavailable_no_sensor',
    '--scenario=offline-practice-eight-character-traversal',
    '--match-seed=offline-practice-default',
    '--player-count=1',
    '--bot-count=7',
    "--output-dir=$OutputDirectory"
  )
  $script:captureProcess = Start-Process `
    -FilePath $node `
    -ArgumentList $captureArguments `
    -WorkingDirectory $repositoryRoot `
    -RedirectStandardOutput $captureStdoutPath `
    -RedirectStandardError $captureStderrPath `
    -WindowStyle Hidden `
    -PassThru
  Write-LaunchState -Phase 'capture_running'

  $script:captureProcess.WaitForExit()
  $captureExitCode = $script:captureProcess.ExitCode
  Write-LaunchState -Phase 'capture_completed' -ExitCode $captureExitCode
  exit $captureExitCode
} catch {
  Write-LaunchState -Phase 'failed' -ExitCode 1 -ErrorMessage $_.Exception.Message
  throw
} finally {
  if ($null -ne $script:serverProcess -and -not $script:serverProcess.HasExited) {
    Stop-Process -Id $script:serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

param(
    # 修改此路径可用于其他安装位置；不需要 LiveLink for MATLAB。
    [string]$ComsolBin = 'D:\Program Files\COMSOL\COMSOL61\Multiphysics\bin\win64',
    [switch]$SkipRayleigh
)

$ErrorActionPreference = 'Stop'
$baseDir = $PSScriptRoot
$source = Join-Path $baseDir 'FiberRayleighComsol.java'
$classFile = Join-Path $baseDir 'FiberRayleighComsol.class'
$modelFile = Join-Path $baseDir 'fiber_rayleigh_comsol.mph'
$taggedModel = Join-Path $baseDir 'fiber_rayleigh_comsol_FiberRayleigh.mph'
$batchLog = Join-Path $baseDir 'fiber-rayleigh-comsol.log'
$stdoutLog = Join-Path $baseDir 'fiber-rayleigh-comsol.stdout.log'

if (-not (Test-Path -LiteralPath (Join-Path $ComsolBin 'comsolcompile.exe'))) {
    throw "COMSOL not found: $ComsolBin"
}

Push-Location $baseDir
try {
    Write-Host '1/3 Compiling COMSOL Java source...'
    $started = Get-Date
    $compileMessages = @(& (Join-Path $ComsolBin 'comsolcompile.exe') $source 2>&1)
    $compileMessages | ForEach-Object { Write-Host $_ }
    # COMSOL 6.1 编译失败时可能仍返回 0，故还要检查日志和 class 修改时间。
    if (-not (Test-Path -LiteralPath $classFile)) { throw 'Java compilation produced no class file.' }
    if ((Get-Item -LiteralPath $classFile).LastWriteTime -lt $started.AddSeconds(-1)) {
        throw 'COMSOL did not update the class file; inspect the compiler output.'
    }
    if (($compileMessages -join "`n") -match 'ERROR: Compilation failed') { throw 'Java compilation failed.' }

    Write-Host '2/3 Solving with the local COMSOL 6.1 installation...'
    $solveStarted = Get-Date
    # 由 COMSOL 自身保存 .mph；Java 不直接读写文件，也不放开全局安全配置。
    $messages = @(& (Join-Path $ComsolBin 'comsolbatch.exe') -inputfile $classFile `
        -outputfile $modelFile -batchlog $batchLog -np 2 2>&1)
    $messages | Set-Content -LiteralPath $stdoutLog -Encoding UTF8
    $lines = @($messages | ForEach-Object { $_.ToString() })
    if (-not ($lines -contains 'MODEL_READY: FiberRayleigh')) {
        throw "COMSOL failed before exporting results. See $batchLog and $stdoutLog"
    }
    if (-not (Test-Path -LiteralPath $taggedModel)) { throw 'COMSOL did not save the model.' }
    if ((Get-Item -LiteralPath $taggedModel).LastWriteTime -lt $solveStarted.AddSeconds(-1)) {
        throw 'The model was not updated by this run.'
    }
    # COMSOL Java 批处理自动给输出名附加模型 tag；统一成简短的用户文件名。
    Move-Item -LiteralPath $taggedModel -Destination $modelFile -Force

    $csv = @($lines | Where-Object { $_.StartsWith('CSV_DATA:') } | ForEach-Object { $_.Substring(9) })
    if ($csv.Count -lt 3) { throw 'COMSOL exported too few finite element samples.' }
    $csv | Set-Content -LiteralPath (Join-Path $baseDir 'fiber_rayleigh_comsol_results.csv') -Encoding UTF8

    # 参数由 COMSOL 求值后返回，统一为 SI 单位，避免后处理与求解参数不一致。
    $parameters = [ordered]@{}
    foreach ($line in $lines) {
        if ($line.StartsWith('MODEL_PARAM:')) {
            $entry = $line.Substring(12).Split(',')
            $parameters[$entry[0]] = [double]::Parse($entry[1], [cultureinfo]::InvariantCulture)
        }
    }
    $parameters | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $baseDir 'comsol_parameters_si.json') -Encoding UTF8

    Write-Host "Saved model: $modelFile"
    Write-Host "Exported $($csv.Count - 1) finite element samples."
    if (-not $SkipRayleigh) {
        Write-Host '3/3 Rayleigh postprocessing and analytical verification...'
        $node = Get-Command node -ErrorAction SilentlyContinue
        if (-not $node) {
            $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
            if (Test-Path -LiteralPath $bundledNode) { $nodeExe = $bundledNode }
            else { throw 'Node.js is required for Rayleigh postprocessing. Re-run with -SkipRayleigh for COMSOL only.' }
        } else { $nodeExe = $node.Source }
        & $nodeExe (Join-Path $baseDir 'rayleigh-postprocess.js')
        if ($LASTEXITCODE -ne 0) { throw 'Rayleigh postprocessing or numerical verification failed.' }
    }
} finally {
    Pop-Location
}

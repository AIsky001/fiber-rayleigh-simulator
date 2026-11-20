$ErrorActionPreference = 'Stop'
# 仅打包可编辑源码、模型和说明；排除依赖、日志和测试临时目录。
$projectRoot = Split-Path -Parent $PSScriptRoot
$stage = Join-Path ([IO.Path]::GetTempPath()) ('fiber-source-' + [guid]::NewGuid().ToString('N'))
$releaseDir = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Path $stage,$releaseDir -Force | Out-Null
try {
    $rootFiles = @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','.gitignore','README.md','THIRD_PARTY_NOTICES.md','start-app.ps1')
    foreach ($name in $rootFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage }
    foreach ($name in @('desktop','android','tests','scripts','assets','.github','docs','examples')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage -Recurse }
    # Exclude local Gradle state, SDK paths, and any previous build output.
    Get-ChildItem -LiteralPath (Join-Path $stage 'android') -Directory -Filter '.gradle' -Recurse | Remove-Item -Recurse -Force
    Remove-Item -LiteralPath (Join-Path $stage 'android\local.properties') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $stage 'android\app\build') -Recurse -Force -ErrorAction SilentlyContinue
    $outputDir = Join-Path $stage 'outputs'
    New-Item -ItemType Directory -Path $outputDir | Out-Null
    $webFiles = @('server.js','fiber-rayleigh-simulator.html','scan-login.html','qrcode-generator.js','lucide.min.js','lucide.LICENSE.txt','project.js','app-controls.js')
    $modelFiles = @('FiberRayleighComsol.java','fiber_rayleigh_comsol.mph','run-comsol.ps1','run-comsol.bat','rayleigh-postprocess.js','COMSOL模型说明.md','comsol_parameters_si.json','comsol_summary.json','fiber_rayleigh_comsol_results.csv','rayleigh_from_comsol.csv')
    foreach ($name in ($webFiles + $modelFiles)) { Copy-Item -LiteralPath (Join-Path $projectRoot ('outputs\' + $name)) -Destination $outputDir }
    $archive = Join-Path $releaseDir 'FiberRayleigh-1.0.0-Editable-Source.zip'
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
    Write-Output $archive
} finally {
    # 删除前验证临时目录的实际绝对路径与本脚本创建的目录一致。
    $resolved = [IO.Path]::GetFullPath($stage)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'fiber-source-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

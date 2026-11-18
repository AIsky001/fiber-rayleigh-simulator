$ErrorActionPreference = 'Stop'
# 武汉职业技术大学，作者：池行强。启动源码开发版 APP。
$node = Get-Command node -ErrorAction Stop
$electronCli = Join-Path $PSScriptRoot 'node_modules\electron\cli.js'
if (-not (Test-Path -LiteralPath $electronCli)) {
    throw 'Install Node.js and pnpm, then run pnpm install in this folder first.'
}
Push-Location $PSScriptRoot
try { & $node.Source $electronCli . }
finally { Pop-Location }

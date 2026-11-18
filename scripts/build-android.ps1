$ErrorActionPreference = 'Stop'
# 武汉职业技术大学光纤瑞利仿真安卓 APK 构建入口。作者：池行强。
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent $scriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -and (Test-Path (Join-Path $projectRoot 'work\android-sdk\platforms\android-33\android.jar'))) {
    $sdk = Join-Path $projectRoot 'work\android-sdk'
}
if (-not $sdk -or -not (Test-Path (Join-Path $sdk 'platforms\android-33\android.jar'))) {
    throw 'Android SDK 33 not found. Install Android SDK Platform 33 and set ANDROID_HOME.'
}
$java = $null
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $java = Join-Path $env:JAVA_HOME 'bin\java.exe'
} elseif (Get-Command java.exe -ErrorAction SilentlyContinue) {
    $java = (Get-Command java.exe).Source
}
if (-not $java) { throw 'JDK 17 or newer is required to build the Android app.' }
$version = (& $java -version 2>&1 | Out-String)
if ($version -notmatch 'version "(\d+)') { throw 'Cannot determine the Java runtime version.' }
if ([int]$Matches[1] -lt 17) { throw 'JDK 17 or newer is required to build Android.' }
$javaBin = Split-Path -Parent $java
if (-not (Test-Path -LiteralPath (Join-Path $javaBin 'jlink.exe'))) {
    throw 'The selected JDK does not include jlink.exe; install a full JDK 17 distribution.'
}
$sdkPath = $sdk.Replace('\', '/')
Set-Content -LiteralPath (Join-Path $androidRoot 'local.properties') -Value "sdk.dir=$sdkPath" -Encoding ASCII
$localGradle = Join-Path $projectRoot 'work\android-tools\gradle-extract\gradle-7.5.1\bin\gradle.bat'
# Reuse the pinned local distribution when available instead of downloading it again.
$gradle = if (Test-Path -LiteralPath $localGradle) { $localGradle } else { Join-Path $androidRoot 'gradlew.bat' }
$gradleArgs = @('--no-daemon', ':app:assembleDebug', '--console=plain')
if (-not (Test-Path -LiteralPath $gradle)) {
    # Use a repository-pinned Gradle when the wrapper scripts are unavailable.
    $gradle = $localGradle
    if (-not (Test-Path -LiteralPath $gradle)) {
        $globalGradle = Get-Command gradle.bat,gradle -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($globalGradle) { $gradle = $globalGradle.Source }
        else { throw 'Gradle wrapper is missing. Run android\gradlew.bat wrapper or install Gradle 7.5.1.' }
    }
}
Push-Location $androidRoot
try {
    & $gradle @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "Android Gradle build failed with exit code $LASTEXITCODE." }
    $apk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path -LiteralPath $apk)) { throw 'Gradle finished without an APK output.' }
    $release = Join-Path $projectRoot 'release'
    New-Item -ItemType Directory -Path $release -Force | Out-Null
    $destination = Join-Path $release 'FiberRayleigh-1.0.0-Android.apk'
    Copy-Item -LiteralPath $apk -Destination $destination -Force
    Get-Item -LiteralPath $destination | Select-Object FullName,Length,LastWriteTime
} finally { Pop-Location }

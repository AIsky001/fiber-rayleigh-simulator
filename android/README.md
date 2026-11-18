# 光纤瑞利仿真 Android 源码

武汉职业技术大学 · 作者：池行强

本目录包含 Android 应用工程。应用通过原生 WebView 离线加载共享仿真页面：用户界面和模型计算代码可以直接编辑；项目 JSON 导入、保存和 CSV 导出使用 Android 系统文档选择器。默认演示账号为 `admin`，密码为 `admin`。登录信息保存在本机应用偏好设置中。

Android 版不会运行 COMSOL。使用 COMSOL 有限元求解，需在安装并授权 COMSOL 的 Windows 电脑上使用 Windows APP。

## 环境要求

- Android SDK Platform 33
- Android SDK Build Tools 33.0.2
- 完整 JDK 17，需包含 `java.exe` 和 `jlink.exe`
- Gradle Wrapper 下载的 Gradle 7.5.1
- Android 7.0 或更新版本用于安装和运行（API 24 起）

将 `JAVA_HOME` 指向 JDK 17 安装目录，将 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指向 Android SDK 根目录。首次构建需要网络连接以下载 Android Gradle Plugin 和 Gradle；Android SDK 平台与 Build Tools 需要从 Android 开发者网站安装，并接受相应许可条款。

## 构建调试版

在此目录运行：

```powershell
./gradlew.bat :app:assembleDebug
```

也可在项目根目录运行 `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1`。该脚本检查 JDK、SDK 并复制 APK 到 `release/FiberRayleigh-1.0.0-Android.apk`。直接使用 Gradle 时，APK 位于 `app/build/outputs/apk/debug/app-debug.apk`。

可编辑源码 ZIP 不包含 APK、Android SDK 或 JDK；已生成的 APK 独立提供于项目根目录的 `release/FiberRayleigh-1.0.0-Android.apk`。调试版使用本地 Android 工具链签名；正式发布需配置独立的应用签名密钥，并更新版本号与发布渠道设置。

## 安装到手机

1. 将 APK 通过 USB、微信文件传输或其他文件传输方式发送到安卓手机。
2. 在手机文件管理器中打开 APK，按系统提示允许该文件管理器安装应用。
3. 安装后打开“光纤瑞利仿真”，登录名与密码均为 `admin`。

需要 Android 7.0 或更新版本。仿真在手机离线运行，无需启动电脑服务。当前包通过构建和签名检查，共享页面已验证登录、参数编辑、项目导入与导出桥接；尚未在实际手机或模拟器验证安装、原生文件选择器和文件读写。

## 工程结构

- `app/src/main/java/cn/whpu/fiberrayleigh/MainActivity.java`：WebView、离线资源白名单、登录状态和系统文件选择器桥接。
- `app/src/main/assets/`：如需增加专用静态资源，放在此目录。
- `app/src/main/res/`：应用图标等 Android 资源。
- `app/src/main/AndroidManifest.xml`：应用入口和作者、学校元数据。
- `app/build.gradle`：Android SDK 版本、Java 编译选项和共享页面资源目录。
- `gradlew.bat`：Windows Gradle Wrapper 入口。
- `gradlew`：macOS/Linux Gradle Wrapper 入口。

仿真页面、样式、参数与绘图代码位于项目根目录的 `outputs/fiber-rayleigh-simulator.html`、`outputs/project.js` 和 `outputs/app-controls.js`。修改这些共享文件后重新构建，即可将变更打进 Android 安装包。

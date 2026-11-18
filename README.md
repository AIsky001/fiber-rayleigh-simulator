# 武汉职业技术大学 · 光纤应变与瑞利散射仿真 APP

作者：池行强。Windows、安卓与网页使用相同的仿真界面。默认条件为 SMF-28、长度 100 mm、Pd 10 nm、Cu 10 nm、铜层电流 1 mA、氢气体积分数 1%。

## 安卓 APP

`android/` 是原生 Android WebView 容器，仿真页面与 JavaScript 作为安装包 assets 离线提供。安卓端使用 `admin/admin` 本地演示登录；首次登录后会保存登录状态，退出登录会清除。桌面网页仍保留一次性扫码确认流程。

项目 JSON 导入使用安卓系统文件选择器，保存项目与导出 CSV 使用“创建文档”选择保存位置；实验参数会保存在应用 WebView 的本地数据。安卓端可调整参数和编辑实验项目，不能运行 Windows COMSOL；请在 Windows APP 中执行有限元求解。最低支持 Android 7.0（API 24）。

安卓工程源码和独立构建说明见 [`android/README.md`](android/README.md)。安装 Android SDK Platform 33、Build Tools 33.0.2、JDK 17（完整 JDK，须包含 `jlink.exe`）后，在项目根目录执行 `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1`，或在 `android/` 目录运行 `gradlew.bat :app:assembleDebug`。调试版 APK 输出到 `release/FiberRayleigh-1.0.0-Android.apk`。本源码包不包含 Android SDK、JDK 或 APK。

已生成的 APK 独立提供于 `release/FiberRayleigh-1.0.0-Android.apk`。将文件传到安卓手机后，在文件管理器中打开，按系统提示允许该来源安装应用，安装后打开“光纤瑞利仿真”，输入 `admin` / `admin` 登录。此包为调试签名版，可直接安装测试；未上架应用商店。已完成构建、签名和共享页面交互检查，尚未在手机或模拟器上验证安装与系统文件选择器。

## Windows 运行

构建成功后，`release/FiberRayleigh-1.0.0-Windows-x64.exe` 是免安装的便携版。双击启动后自动运行本机登录服务，无需另外安装 Node.js。默认用户名与密码均为 `admin`。手机与电脑连接同一局域网时，可扫描电脑上的二维码并确认登录。退出 APP 后，本机服务随之停止。

APP 优先使用 8080 端口；如果被占用，会自动分配可用端口。实际手机访问地址可从“帮助 > 关于”查看。扫码确认依赖本机服务和网络连通性，不是微信账号认证。当前二维码确认用于本机演示，不提供多用户身份管理。

## 编辑实验项目

界面中的尺寸、材料层厚度、电流、氢浓度、环境和仪器参数均可编辑，曲线随参数变化重新计算。项目名称与实验备注一起保存。

- “保存项目”导出可继续编辑的 JSON 文件，包含参数、名称、备注、作者与版本号。
- “打开项目”导入本程序保存的 JSON；非法数值和不支持的文件版本不会覆盖当前项目。
- 有效修改会自动保存到当前 APP 配置中，下次打开后恢复。导出 JSON 可用于迁移到另一台电脑。
- “导出 CSV”输出当前网页近似模型的曲线数据。

## COMSOL 源码与模型

“COMSOL 源码”打开带注释的 `FiberRayleighComsol.java`，可以在 APP 内直接修改并保存。工作文件首次复制到 Windows 文档目录下的 `FiberRayleigh-Projects/COMSOL`；后续启动不覆盖已修改的文件。保存 Java 源码时，上一个版本备份为 `.java.bak`。

在编辑器中点击“COMSOL 目录”，选择本机安装中的 `bin/win64` 文件夹，其中必须有 `comsolcompile.exe` 和 `comsolbatch.exe`。然后点击“求解并生成 MPH”。本机必须安装并具有可用许可证的 COMSOL；APP 不包含 COMSOL 软件或许可证。

COMSOL 使用 Java 源码 `defineParameters` 中的参数，**与主界面项目参数独立**。修改主界面输入不会自动改写 Java 模型，COMSOL 求解结果也不会自动替换网页图表。编辑器中的求解命令生成 MPH 与有限元结果 CSV；“打开 MPH”通过 Windows 文件关联在 COMSOL 中打开模型。

工作目录中的 `run-comsol.bat` 与 `run-comsol.ps1` 也可独立运行。需要瑞利统计后处理时，可安装 Node.js 后执行 `rayleigh-postprocess.js`；APP 的求解按钮只运行 COMSOL 编译、求解与有限元 CSV 导出。物理假设与校准限制见 `outputs/COMSOL模型说明.md`。已有 MPH 是之前生成的模型文件，重新求解需要本机 COMSOL 可用。

## 修改 APP 源码

推荐 Node.js 24 LTS 和 pnpm。所有业务源码都在项目目录中，可以使用 VS Code 等编辑器修改。

```powershell
pnpm install
pnpm start
pnpm test
pnpm dist
pnpm source
```

若包管理器阻止 Electron 的安装脚本，可按包管理器说明允许 Electron 的构建脚本，或在依赖安装完成后执行 `node node_modules/electron/install.js`。便携版使用 electron-builder 打包。

| 文件 | 用途 |
| --- | --- |
| `desktop/main.cjs` | Windows 窗口、菜单、本机服务生命周期与 COMSOL 接口 |
| `desktop/preload.cjs` | 网页与本机功能之间的隔离接口 |
| `android/app/src/main/java/cn/whpu/fiberrayleigh/MainActivity.java` | 安卓离线页面容器、文件选择器与本地登录 |
| `outputs/fiber-rayleigh-simulator.html` | 页面样式、近似计算与 Canvas 图表 |
| `outputs/app-controls.js` | 项目保存、导入、自动恢复与源码编辑器 |
| `outputs/project.js` | 可编辑项目格式与数值校验 |
| `outputs/server.js` | 网页资源、密码登录、一次性扫码票据与会话 |
| `outputs/FiberRayleighComsol.java` | 带注释的 COMSOL 有限元模型 |
| `tests/app.test.cjs` | 项目与登录接口验证 |

## 网页运行与发布

运行 `pnpm web`，在浏览器打开 `http://localhost:8080`。默认监听局域网接口；手机扫码需要 Windows 防火墙允许该端口及两台设备之间通信。仅启动本机程序不会生成公网网址。

发布时可在支持 Node.js 的服务器部署网页文件与 `outputs/server.js`，由 HTTPS 反向代理转发请求。设置 `PUBLIC_URL` 为实际 HTTPS 域名，并设置 `APP_LOGIN_USER`、`APP_LOGIN_PASSWORD`。公网主机不能调用你电脑上的 COMSOL；本机功能由 Windows APP 提供。部署公网前应按用途完善账号认证，默认 `admin/admin` 与无身份验证的扫码确认适用于演示。

## GitHub 参考

- [Electron 官方 minimal-repro](https://github.com/electron/minimal-repro)：参考 Windows 窗口和应用生命周期结构。
- [electron-builder](https://github.com/electron-userland/electron-builder)：生成 Windows 便携程序。
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)：本地生成扫码登录二维码。
- [Lucide](https://github.com/lucide-icons/lucide)：工具按钮图标。

第三方授权见 `THIRD_PARTY_NOTICES.md` 和随附许可证。本项目没有自动发布到 GitHub，也未将本机 COMSOL 或其许可证打包。

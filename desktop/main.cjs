"use strict";

// 武汉职业技术大学，作者：池行强。参考 Electron 官方 minimal-repro 生命周期。
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createAppServer } = require("../outputs/server.js");

let mainWindow;
let service;
let serverInfo;
let solveProcess;
let allowQuit = false;
const templateFiles = ["FiberRayleighComsol.java", "fiber_rayleigh_comsol.mph", "run-comsol.ps1", "run-comsol.bat", "rayleigh-postprocess.js", "COMSOL模型说明.md"];
const workspace = () => path.join(app.getPath("documents"), "FiberRayleigh-Projects", "COMSOL");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

async function readSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), "utf8")); }
  catch { return {}; }
}

async function ensureWorkspace() {
  const source = app.isPackaged ? path.join(process.resourcesPath, "comsol-template") : path.join(__dirname, "../outputs");
  await fs.mkdir(workspace(), { recursive: true });
  for (const name of templateFiles) {
    // 首次复制后不覆盖用户编辑过的源码及求解结果。
    try { await fs.copyFile(path.join(source, name), path.join(workspace(), name), require("node:fs").constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  return workspace();
}

function trusted(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && new URL(event.senderFrame.url).origin === serverInfo.url;
}

function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!trusted(event)) throw new Error("仅允许本机 APP 窗口操作。");
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

function sendSolveState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("comsol:state", state);
}

function registerIpc() {
  handle("desktop:info", async () => ({ version: app.getVersion(), lanUrl: serverInfo.lanUrl, workspace: workspace(), comsolBin: (await readSettings()).comsolBin || "" }));
  handle("desktop:workspace", async () => shell.openPath(await ensureWorkspace()));
  handle("comsol:read-source", async () => {
    await ensureWorkspace();
    return fs.readFile(path.join(workspace(), "FiberRayleighComsol.java"), "utf8");
  });
  handle("comsol:save-source", async source => {
    if (solveProcess) throw new Error("求解期间不能修改源码。");
    if (typeof source !== "string" || source.length > 500000) throw new Error("源码格式或大小不正确。");
    await ensureWorkspace();
    const file = path.join(workspace(), "FiberRayleighComsol.java");
    await fs.copyFile(file, `${file}.bak`);
    await fs.writeFile(file, source, "utf8");
    return { saved: true };
  });
  handle("comsol:select-bin", async () => {
    const selected = await dialog.showOpenDialog(mainWindow, { title: "选择 COMSOL bin\\win64 文件夹", properties: ["openDirectory"] });
    if (selected.canceled) return null;
    const comsolBin = selected.filePaths[0];
    await fs.access(path.join(comsolBin, "comsolbatch.exe"));
    await fs.access(path.join(comsolBin, "comsolcompile.exe"));
    await fs.writeFile(settingsFile(), JSON.stringify({ ...await readSettings(), comsolBin }, null, 2));
    return comsolBin;
  });
  handle("comsol:open-model", async () => {
    await ensureWorkspace();
    const file = path.join(workspace(), "fiber_rayleigh_comsol.mph");
    const error = await shell.openPath(file);
    if (error) throw new Error(`无法打开模型：${error}`);
    return true;
  });
  handle("comsol:run", async () => {
    if (solveProcess) throw new Error("已有 COMSOL 任务正在运行。");
    const { comsolBin } = await readSettings();
    if (!comsolBin) throw new Error("请先选择本机 COMSOL 的 bin\\win64 文件夹。");
    await fs.access(path.join(comsolBin, "comsolbatch.exe"));
    await ensureWorkspace();
    // 只允许运行固定工作目录中的求解脚本；HTTP 服务不提供执行命令接口。
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    solveProcess = spawn(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(workspace(), "run-comsol.ps1"), "-ComsolBin", comsolBin, "-SkipRayleigh"], { cwd: workspace(), windowsHide: true });
    let tail = "";
    const append = data => { tail = (tail + data.toString()).slice(-12000); sendSolveState({ state: "running", log: tail }); };
    solveProcess.stdout.on("data", append);
    solveProcess.stderr.on("data", append);
    solveProcess.once("error", error => append(error.message));
    solveProcess.once("close", code => {
      solveProcess = null;
      sendSolveState({ state: code === 0 ? "complete" : "failed", log: tail, code });
    });
    return { started: true };
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380, height: 940, minWidth: 900, minHeight: 650,
    title: "武汉职业技术大学 · 光纤应变与瑞利散射仿真",
    icon: path.join(__dirname, "../assets/app-icon.png"),
    backgroundColor: "#f2f5f2", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== serverInfo.url) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "文件", submenu: [
      { label: "COMSOL 可编辑工作目录", click: () => ensureWorkspace().then(shell.openPath).catch(showError) },
      { type: "separator" }, { role: "quit", label: "退出" }
    ] },
    { label: "编辑", submenu: [{ role: "undo", label: "撤销" }, { role: "redo", label: "重做" }, { type: "separator" }, { role: "cut", label: "剪切" }, { role: "copy", label: "复制" }, { role: "paste", label: "粘贴" }, { role: "selectAll", label: "全选" }] },
    { label: "视图", submenu: [{ role: "reload", label: "重新加载" }, { role: "toggleDevTools", label: "开发者工具" }, { role: "resetZoom", label: "实际大小" }, { role: "zoomIn", label: "放大" }, { role: "zoomOut", label: "缩小" }] },
    { label: "帮助", submenu: [
      { label: "GitHub: Electron 官方示例", click: () => shell.openExternal("https://github.com/electron/minimal-repro") },
      { label: "GitHub: electron-builder", click: () => shell.openExternal("https://github.com/electron-userland/electron-builder") },
      { label: "关于", click: () => dialog.showMessageBox(mainWindow, { title: "关于光纤仿真 APP", message: "武汉职业技术大学", detail: `光纤应变与瑞利散射仿真 ${app.getVersion()}\n作者：池行强\n手机扫码地址：${serverInfo.lanUrl}\n可编辑 COMSOL 工作目录：${workspace()}` }) }
    ] }
  ]));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", event => {
    if (solveProcess) { event.preventDefault(); dialog.showMessageBox(mainWindow, { message: "COMSOL 正在求解，请等待任务结束后退出。" }); }
  });
  await mainWindow.loadURL(serverInfo.url);
}

function showError(error) { dialog.showErrorBox("光纤仿真 APP", error.message); }

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    service = createAppServer({ port: 8080, fallbackOnBusy: true });
    serverInfo = await service.start();
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    registerIpc();
    await createWindow();
  }).catch(error => { showError(error); app.quit(); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (solveProcess) { event.preventDefault(); return; }
    if (service && !allowQuit) { event.preventDefault(); allowQuit = true; service.stop().finally(() => app.quit()); }
  });
}

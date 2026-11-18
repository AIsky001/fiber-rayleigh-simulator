"use strict";

// 隔离网页与本机权限，只向可信主窗口暴露固定用途的接口。
const { contextBridge, ipcRenderer } = require("electron");
async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
contextBridge.exposeInMainWorld("desktopApp", {
  info: () => invoke("desktop:info"),
  openWorkspace: () => invoke("desktop:workspace"),
  readSource: () => invoke("comsol:read-source"),
  saveSource: source => invoke("comsol:save-source", source),
  selectComsolBin: () => invoke("comsol:select-bin"),
  openModel: () => invoke("comsol:open-model"),
  runComsol: () => invoke("comsol:run"),
  onComsolState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("comsol:state", listener);
    return () => ipcRenderer.removeListener("comsol:state", listener);
  }
});

"use strict";

// 武汉职业技术大学，作者：池行强。项目编辑与本机 COMSOL 功能；不依赖外网。
(() => {
  const $ = id => document.getElementById(id);
  const projectApi = window.FiberProject;
  const keys = Object.keys(projectApi.defaults);
  const storageKey = "fiber-rayleigh-project-v1";
  const native = window.desktopApp;
  let sourceDirty = false;
  let solving = false;
  let savedProject = null;
  let storageError = "";
  if (window.lucide) lucide.createIcons();

  function status(text, error = false) {
    $("projectStatus").textContent = text;
    $("projectStatus").classList.toggle("error", error);
  }
  function readProject() {
    const parameters = {};
    for (const key of keys) {
      if (!$(key).value.trim()) throw new Error(`参数 ${key} 不能为空。`);
      parameters[key] = Number($(key).value);
    }
    return projectApi.create($("projectName").value, parameters, $("projectNotes").value);
  }
  function apply(project) {
    $("projectName").value = project.name;
    $("projectNotes").value = project.notes;
    for (const key of keys) $(key).value = project.parameters[key];
    $("runBtn").click();
  }
  function autosave() {
    try {
      const project = readProject();
      localStorage.setItem(storageKey, JSON.stringify(project));
      status(`已自动保存 · ${new Date(project.savedAt).toLocaleTimeString("zh-CN")}`);
    } catch (error) { status(error.message, true); }
  }

  function saveWithAndroidPicker(filename, mime, contents) {
    const bytes = new TextEncoder().encode(contents);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    if (window.FiberAndroid.saveFile(filename, mime, btoa(binary))) {
      status("请选择安卓系统文件保存位置");
    } else {
      status("文件保存窗口正在使用中，请完成当前操作后重试", true);
    }
  }

  function importProjectText(text) {
    try {
      const project = projectApi.parse(text);
      apply(project);
      autosave();
    } catch (error) { status(error.message, true); }
  }
  document.addEventListener("fiber:project-import", event => importProjectText(event.detail.text));
  document.addEventListener("fiber:file-export", event => {
    const { filename, mime, contents } = event.detail;
    saveWithAndroidPicker(filename, mime, contents);
  });
  document.addEventListener("fiber:file-saved", event => status(`已保存：${event.detail.name}`));
  document.addEventListener("fiber:file-save-error", event => status(event.detail.text, true));
  document.addEventListener("fiber:file-save-cancelled", event => status(event.detail.text));

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) savedProject = projectApi.parse(stored);
  } catch { storageError = "上次项目无法恢复，请重新打开项目文件。"; }
  document.addEventListener("fiber:authenticated", () => {
    if (savedProject) { apply(savedProject); savedProject = null; status("已恢复上次实验项目"); }
    else if (storageError) { status(storageError, true); storageError = ""; }
  });
  for (const id of [...keys, "projectName", "projectNotes"]) $(id).addEventListener("input", autosave);
  document.addEventListener("fiber:parameters-reset", autosave);
  $("saveProjectBtn").addEventListener("click", () => {
    try {
      const project = readProject();
      const contents = JSON.stringify(project, null, 2);
      if (window.FiberAndroid) {
        saveWithAndroidPicker(`${project.name.replace(/[\\/:*?"<>|]/g, "_") || "fiber-project"}.json`, "application/json", contents);
        autosave();
        return;
      }
      const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "_") || "fiber-project"}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      autosave();
    } catch (error) { status(error.message, true); }
  });
  $("importProjectBtn").addEventListener("click", () => $("projectFile").click());
  $("projectFile").addEventListener("change", async () => {
    const file = $("projectFile").files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("项目文件不能超过 1 MB。");
      importProjectText(await file.text());
    } catch (error) { status(error.message, true); }
    finally { $("projectFile").value = ""; }
  });

  if (!native) return;
  $("sourceBtn").hidden = false;
  $("openModelBtn").hidden = false;
  async function sourceAction(action) {
    try { await action(); }
    catch (error) { $("sourceState").textContent = error.message; status(error.message, true); }
  }
  function updateSolveControls() {
    $("runComsolBtn").disabled = solving;
    $("saveSourceBtn").disabled = solving;
    $("sourceEditor").readOnly = solving;
  }
  $("sourceBtn").addEventListener("click", () => sourceAction(async () => {
    $("sourceEditor").value = await native.readSource();
    sourceDirty = false;
    const info = await native.info();
    $("sourceState").textContent = info.comsolBin ? `COMSOL：${info.comsolBin}` : "COMSOL 目录未设置";
    $("sourceDialog").showModal();
  }));
  function confirmClose(event) {
    if (sourceDirty && !confirm("源码尚未保存，关闭并放弃修改？")) { if (event) event.preventDefault(); return; }
    sourceDirty = false;
    $("sourceDialog").close();
  }
  $("closeSourceBtn").addEventListener("click", () => confirmClose());
  $("sourceDialog").addEventListener("cancel", confirmClose);
  $("sourceEditor").addEventListener("input", () => { sourceDirty = true; $("sourceState").textContent = "源码已修改，尚未保存"; });
  async function saveSource() {
    await native.saveSource($("sourceEditor").value);
    sourceDirty = false;
    $("sourceState").textContent = "源码已保存，上一版本备份为 FiberRayleighComsol.java.bak";
  }
  $("saveSourceBtn").addEventListener("click", () => sourceAction(saveSource));
  $("chooseComsolBtn").addEventListener("click", () => sourceAction(async () => {
    const selected = await native.selectComsolBin();
    if (selected) $("sourceState").textContent = `COMSOL：${selected}`;
  }));
  $("workspaceBtn").addEventListener("click", () => sourceAction(async () => {
    const error = await native.openWorkspace();
    if (error) throw new Error(error);
  }));
  $("openModelBtn").addEventListener("click", async () => {
    try { await native.openModel(); }
    catch (error) { status(error.message, true); }
  });
  $("runComsolBtn").addEventListener("click", () => sourceAction(async () => {
    await saveSource();
    solving = true;
    updateSolveControls();
    try {
      await native.runComsol();
      $("sourceState").textContent = "COMSOL 求解中";
    } catch (error) { solving = false; updateSolveControls(); throw error; }
  }));
  native.onComsolState(state => {
    solving = state.state === "running";
    updateSolveControls();
    $("comsolLog").hidden = false;
    $("comsolLog").textContent = state.log;
    $("comsolLog").scrollTop = $("comsolLog").scrollHeight;
    $("sourceState").textContent = solving ? "COMSOL 求解中" : state.state === "complete" ? "求解完成，MPH 与结果 CSV 已写入工作目录" : "求解失败，请检查日志";
  });
})();

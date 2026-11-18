/* 武汉职业技术大学，作者：池行强。浏览器与 Node 共用的项目格式及参数校验。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FiberProject = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({ length: 100, wavelength: 1550, pd: 10, cu: 10, current: 1, hydrogen: 1, ambient: 25, pressure: 1, rhoFactor: 3, heatTransfer: 8, hSensitivity: 0.1, gauge: 10 });
  const ranges = Object.freeze({ length: [1, 10000], wavelength: [700, 1700], pd: [0, 1000], cu: [0.1, 1000], current: [0, 1000], hydrogen: [0, 100], ambient: [-50, 300], pressure: [0.01, 100], rhoFactor: [1, 1000], heatTransfer: [0.1, 1000], hSensitivity: [0, 10000], gauge: [0.1, 10000] });
  function validateParameters(parameters) {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("项目缺少实验参数。");
    const validated = {};
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = parameters[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`参数 ${key} 必须在 ${min} 至 ${max} 之间。`);
      validated[key] = value;
    }
    return validated;
  }
  function create(name, parameters, notes = "") {
    return { format: "fiber-rayleigh-project", version: 1, name: String(name || "未命名实验").slice(0, 100), notes: String(notes).slice(0, 20000), institution: "武汉职业技术大学", author: "池行强", savedAt: new Date().toISOString(), parameters: validateParameters(parameters) };
  }
  function parse(text) {
    const project = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!project || project.format !== "fiber-rayleigh-project" || project.version !== 1) throw new Error("不支持的项目格式，请选择本程序导出的项目 JSON。");
    if (typeof project.name !== "string" || typeof project.notes !== "string") throw new Error("项目名称或备注格式不正确。");
    return create(project.name, project.parameters, project.notes);
  }
  return { defaults, ranges, validateParameters, create, parse };
});

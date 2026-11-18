"use strict";

// 武汉职业技术大学，作者：池行强。
// 用法：node rayleigh-postprocess.js [COMSOL结果.csv] [COMSOL参数.json]
// 输入来自 run-comsol.ps1；无需 npm 库。输出归一化统计散斑和解析校验摘要。
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const csvFile = process.argv[2] || path.join(__dirname, "fiber_rayleigh_comsol_results.csv");
const paramFile = process.argv[3] || path.join(__dirname, "comsol_parameters_si.json");
const p = JSON.parse(fs.readFileSync(paramFile, "utf8").replace(/^\uFEFF/, ""));

// 这是本程序自有的固定列纯数值 CSV，无引号或逗号转义的字符串单元格。
const lines = fs.readFileSync(csvFile, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
const expectedHeaders = ["z_m", "T_K", "deltaT_K", "displacement_m", "mechanical_strain",
  "rayleigh_optical_strain", "delta_lambda_m", "delta_frequency_Hz"];
assert.deepEqual(lines.shift().split(","), expectedHeaders, "Unexpected COMSOL CSV columns");
const samples = lines.map((line, i) => {
  const v = line.split(",").map(Number);
  assert.equal(v.length, expectedHeaders.length, `CSV row ${i + 2}: wrong column count`);
  assert.ok(v.every(Number.isFinite), `CSV row ${i + 2}: nonfinite value`);
  return v;
}).sort((a, b) => a[0] - b[0]);
assert.ok(samples.length > 10, "Too few COMSOL samples");
for (const key of ["L", "Dcore", "tCu", "kSi", "ESi", "EPd", "ECu", "hEff", "lambda0", "Lg", "nEff"]) {
  assert.ok(Number.isFinite(p[key]) && p[key] > 0, `Invalid parameter: ${key}`);
}

const rSi = p.Dcore / 2;
const rPd = rSi + p.tPd;
const rCu = rPd + p.tCu;
const ASi = Math.PI * rSi ** 2;
const APd = Math.PI * (rPd ** 2 - rSi ** 2);
const ACu = Math.PI * (rCu ** 2 - rPd ** 2);
const kA = p.kSi * ASi + p.kPd * APd + p.kCu * ACu;
const EA = p.ESi * ASi + p.EPd * APd + p.ECu * ACu;
const alphaEff = (p.ESi * ASi * p.aSi + p.EPd * APd * p.aPd + p.ECu * ACu * p.aCu) / EA;
const hP = p.hEff * 2 * Math.PI * rCu;
const q0 = p.I0 ** 2 * p.rhoCu * p.filmFactor / ACu;
const epsH = p.epsPdRef * Math.sqrt(p.H2 * p.pTot / 1013.25) * p.EPd * APd / EA;
const g = hP - q0 * p.alphaCuR;

// 独立解析解：-kA*T'' + (hP-alphaCuR*q0)*T=q0，T(0)=T(L)=0。
// 适用于本交付的均匀参数、两端等温、恒电流条件；不是实验精度声明。
assert.ok(g > 0, "This analytical verifier requires hP > alphaCuR*q0; reduce current or revise the verifier.");
const beta = Math.sqrt(g / kA);
const half = beta * p.L / 2;
// cosh(a)/cosh(b) 的稳定形式，长光纤也不产生数值上溢。
function coshRatio(a, b) {
  return (Math.exp(a - b) + Math.exp(-a - b)) / (1 + Math.exp(-2 * b));
}
function sinhRatio(a, b) {
  return (Math.exp(a - b) - Math.exp(-a - b)) / (1 + Math.exp(-2 * b));
}
function analytic(z) {
  const dt = q0 / g * (1 - coshRatio(beta * (z - p.L / 2), half));
  const integral = q0 / g * (z - (sinhRatio(beta * (z - p.L / 2), half) + Math.tanh(half)) / beta);
  return { dt, strain: alphaEff * dt + epsH, disp: alphaEff * integral + epsH * z };
}
let maxTempError = 0, maxDispError = 0, maxStrainError = 0;
for (const s of samples) {
  const a = analytic(s[0]);
  maxTempError = Math.max(maxTempError, Math.abs(s[2] - a.dt));
  maxDispError = Math.max(maxDispError, Math.abs(s[3] - a.disp));
  maxStrainError = Math.max(maxStrainError, Math.abs(s[4] - a.strain));
  const fractional = (1 - p.pe) * s[4] + (p.xi + p.pe * p.aSi) * s[2];
  assert.ok(Math.abs(s[6] - p.lambda0 * fractional) < 1e-19, "Wavelength postprocess mismatch");
  assert.ok(Math.abs(s[7] + p.c0 / p.lambda0 * fractional) < 1, "Frequency postprocess mismatch");
}
assert.ok(Math.abs(samples[0][0]) < 1e-10 && Math.abs(samples.at(-1)[0] - p.L) < 1e-10, "Missing fiber endpoints");
assert.ok(Math.abs(samples[0][2]) < 1e-6 && Math.abs(samples.at(-1)[2]) < 1e-6, "Temperature boundary mismatch");
assert.ok(Math.abs(samples[0][3]) < 1e-12, "Axial anchor mismatch");
assert.ok(maxTempError < 0.002 && maxDispError < 1e-9 && maxStrainError < 1e-8, "Finite element error exceeds the default verification limits");

// 固定种子复高斯统计场。局部谱移控制参考场/扰动场的相关度，非光学全波求解。
let seed = 48017;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed + 1) / 4294967297;
}
function complexGaussian() {
  const radius = Math.sqrt(-Math.log(random()));
  const angle = 2 * Math.PI * random();
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}
const bandwidth = p.c0 / (2 * p.nEff * p.Lg);
const rayleigh = samples.map(s => {
  const [re, im] = complexGaussian();
  const [nr, ni] = complexGaussian();
  const corr = Math.exp(-0.5 * (s[7] / bandwidth) ** 2);
  const independent = Math.sqrt(Math.max(0, 1 - corr ** 2));
  return [s[0], re ** 2 + im ** 2,
    (corr * re + independent * nr) ** 2 + (corr * im + independent * ni) ** 2,
    corr ** 2, s[4], s[2], s[7]];
});
const mean = rayleigh.reduce((sum, r) => sum + r[1], 0) / rayleigh.length;
for (const r of rayleigh) { r[1] /= mean; r[2] /= mean; }
const outputDir = path.dirname(csvFile);
const rayleighPath = path.join(outputDir, "rayleigh_from_comsol.csv");
const rayleighHeaders = "z_m,reference_intensity_norm,perturbed_intensity_norm,expected_intensity_correlation,mechanical_strain,deltaT_K,delta_frequency_Hz";
fs.writeFileSync(rayleighPath, rayleighHeaders + "\r\n" + rayleigh.map(r => r.join(",")).join("\r\n") + "\r\n", "utf8");

function integral(column) {
  let sum = 0;
  for (let i = 1; i < samples.length; i++) sum += (samples[i][0] - samples[i - 1][0]) * (samples[i][column] + samples[i - 1][column]) / 2;
  return sum;
}
const avgDt = integral(2) / p.L;
const summary = {
  model: "COMSOL 6.1 1D composite axial thermoelastic approximation",
  author: "池行强", institution: "武汉职业技术大学",
  parameters_file: path.basename(paramFile), samples: samples.length,
  copper_resistance_at_ambient_ohm: p.rhoCu * p.filmFactor * p.L / ACu,
  average_temperature_rise_K: avgDt,
  maximum_temperature_rise_K: Math.max(...samples.map(s => s[2])),
  maximum_mechanical_strain_microstrain: Math.max(...samples.map(s => s[4])) * 1e6,
  hydrogen_transferred_strain_microstrain: epsH * 1e6,
  minimum_rayleigh_frequency_shift_GHz: Math.min(...samples.map(s => s[7])) / 1e9,
  maximum_rayleigh_wavelength_shift_pm: Math.max(...samples.map(s => s[6])) * 1e12,
  average_joule_power_mW: q0 * p.L * (1 + p.alphaCuR * avgDt) * 1000,
  validation: {
    passed: true,
    temperature_max_error_K: maxTempError,
    displacement_max_error_m: maxDispError,
    axial_strain_max_error_microstrain: maxStrainError * 1e6,
    checks: ["finite values", "temperature endpoints", "axial anchor", "analytical steady heat solution", "analytical free-end axial solution", "optical shift convention"]
  },
  limits: "Pd hydrogen eigenstrain is an uncalibrated example. Perfect bonding, uniform material parameters and thermalized ends. Rayleigh CSV is normalized statistical speckle only; samples do not define instrument spatial resolution."
};
fs.writeFileSync(path.join(outputDir, "comsol_summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));
console.log(`Rayleigh CSV: ${rayleighPath}`);

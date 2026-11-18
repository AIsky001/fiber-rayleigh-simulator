# 光纤瑞利应变仿真：可编辑源码与 COMSOL 6.1

作者：池行强  
单位：武汉职业技术大学

## 文件

- `FiberRayleighComsol.java`：带中文注释的 COMSOL Java Model API 源码；参数集中在 `defineParameters` 方法中。
- `run-comsol.bat`：使用本机 COMSOL 6.1 编译源码并运行稳态求解。
- `fiber_rayleigh_comsol.mph`：运行后生成的可在 COMSOL GUI 打开的模型与解。

## 运行

双击 `run-comsol.bat`，或在 PowerShell 执行：

```powershell
cd C:\Users\Lenovo\Documents\Codex\2026-11-04\xie\outputs
.\run-comsol.bat
```

脚本会在当前 `outputs` 目录生成可在 COMSOL GUI 打开的 `fiber_rayleigh_comsol.mph`，并在模型中创建温度、轴向应变、光学等效应变和频移沿程图。

脚本默认读取 `D:\Program Files\COMSOL\COMSOL61\Multiphysics\bin\win64`。如果安装位置不同，可执行 `powershell -File .\run-comsol.ps1 -ComsolBin "实际安装目录\bin\win64"`，或在 Windows APP 的“COMSOL 源码 > COMSOL 目录”中选择路径。

## 物理假设

模型使用 100 mm 一维区间作为光纤轴线。SMF-28 石英包层外径设为 125 µm，外覆 Pd 10 nm、Cu 10 nm。纳米薄层不直接划分为实体网格，而是通过同心圆环截面积、轴向刚度和热导等效进入 1D 方程。

热场采用稳态轴向导热、外表面对流和 Cu 薄膜直流焦耳热；端点固定在环境温度。铜层电阻温度系数已包含在焦耳热表达式中。力学场采用石英/Pd/Cu 完全粘结的复合杆近似，左端固定，右端自由，热膨胀按轴向刚度加权。氢作用用 Pd 层的等效本征应变加载，并输出光弹/热光学一阶瑞利漂移。

`epsPdRef`（默认 200 µε）是 1% 氢气、1 atm 时 Pd 层自由本征应变的示例值，不是经验证的 Pd 氢响应预测。实际传给石英的轴向应变按 `EPd*APd/EA` 衰减，默认约 0.11 µε。应以 Pd 氢吸收等温线、薄膜应力和封装传递实验标定。

`H2=0.01` 表示 1% 氢气；`hEff`、薄膜电阻率倍率、材料参数以及边界条件也应按装置实测修正。假设氢能到达 Pd 层，未建模外覆 Cu 对氢扩散的阻碍。忽略端部电接触电阻和纳米薄膜不连续性。该模型不含氢扩散动力学、局部涂层缺陷、环向/径向应力、真实散斑的随机相位传播，也不能代替经实验验证的三维模型。

光学后处理采用 `Δλ/λ=(1-pe)*(epsMech-aSi*ΔT)+(aSi+xi)*ΔT`，其中 `epsMech` 是复合杆总轴向应变，去除自由石英热应变后再加温度响应，可避免热膨胀重复计数。频移取 `Δf=-(c/λ)*Δλ/λ`。这些系数仍需用实际 OFDR/OTDR 仪器校准。

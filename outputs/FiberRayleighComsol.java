import com.comsol.model.Model;
import com.comsol.model.util.ModelUtil;

/**
 * 武汉职业技术大学 - SMF-28 / Pd / Cu 光纤电热-轴向应变等效模型。
 *
 * 运行方式：使用同目录 run-comsol.bat（COMSOL Multiphysics 6.1）。
 * 模型采用 1D 细长杆近似：纳米薄膜以等效截面积和轴向刚度进入方程，
 * 不对 10 nm 涂层建立实体网格。氢致 Pd 本征应变系数需用传感器数据标定。
 */
public class FiberRayleighComsol {
    public static void main(String[] args) throws Exception {
        Model model = ModelUtil.create("FiberRayleigh");
        model.label("SMF-28 Pd-Cu 氢敏光纤 1D 等效模型");
        model.comments("作者：池行强；武汉职业技术大学。COMSOL 6.1，带注释的可编辑 Java Model API 模型。"
                + "1D 轴向热传导、等效表面对流、铜层 Joule 热、复合轴向热/氢本征应变。"
                + "氢致应变系数为待实验标定参数；瑞利谱移使用后处理的一阶光弹/热光学近似。");

        defineParameters(model);
        buildGeometryAndMesh(model);
        buildThermalPhysics(model);
        buildAxialMechanics(model);
        buildStudy(model);

        // 运行稳态有限元求解。模型保存交给 comsolbatch -outputfile，兼容默认安全沙箱。
        model.study("std1").run();
        addResultPlots(model);
        printParameters(model);
        sampleAndPrint(model);
        System.out.println("MODEL_READY: FiberRayleigh");
    }

    /** 用户可在此处集中修改实验尺寸、材料常数、环境和仪器参数。 */
    private static void defineParameters(Model model) {
        model.param().set("L", "100[mm]", "涂覆光纤有效长度");
        model.param().set("Dcore", "125[um]", "SMF-28 石英包层外径");
        model.param().set("tPd", "10[nm]", "钯层厚度");
        model.param().set("tCu", "10[nm]", "铜层厚度");
        model.param().set("I0", "1[mA]", "铜层轴向直流电流");
        model.param().set("H2", "0.01", "氢气体积分数，0.01 表示 1%");
        model.param().set("pTot", "1[atm]", "总气压");
        model.param().set("Tamb", "298.15[K]", "环境温度");
        model.param().set("hEff", "8[W/(m^2*K)]", "外表面等效对流换热系数");
        model.param().set("rhoCu", "1.68e-8[ohm*m]", "铜体电阻率");
        model.param().set("filmFactor", "3", "10 nm 铜膜电阻率相对体材料的倍率");
        model.param().set("alphaCuR", "0.0039[1/K]", "铜电阻温度系数");
        model.param().set("kSi", "1.38[W/(m*K)]", "石英轴向导热系数");
        model.param().set("kPd", "71.8[W/(m*K)]", "钯轴向导热系数");
        model.param().set("kCu", "401[W/(m*K)]", "铜轴向导热系数");
        model.param().set("ESi", "72[GPa]", "石英杨氏模量");
        model.param().set("EPd", "121[GPa]", "钯杨氏模量");
        model.param().set("ECu", "110[GPa]", "铜杨氏模量");
        model.param().set("aSi", "0.55e-6[1/K]", "石英线膨胀系数");
        model.param().set("aPd", "11.8e-6[1/K]", "钯线膨胀系数");
        model.param().set("aCu", "16.5e-6[1/K]", "铜线膨胀系数");
        model.param().set("epsPdRef", "200e-6", "1% 氢气、1 atm 时 Pd 自由线膨胀本征应变；仅为待标定示例");
        model.param().set("nElem", "400", "轴向网格单元数量");
        model.param().set("pe", "0.22", "石英光弹系数近似值");
        model.param().set("xi", "6.9e-6[1/K]", "石英热光系数近似值");
        model.param().set("lambda0", "1550[nm]", "瑞利/OFDR 工作波长");
        model.param().set("nEff", "1.4682", "SMF-28 有效折射率近似值");
        model.param().set("Lg", "10[mm]", "仪器瑞利相关长度");
        model.param().set("c0", "299792458[m/s]", "真空光速");
    }

    /** 一维区间代表光纤轴线；纳米薄层用同心圆环截面积等效。 */
    private static void buildGeometryAndMesh(Model model) {
        model.component().create("comp1", true);
        model.component("comp1").geom().create("geom1", 1);
        model.component("comp1").geom("geom1").lengthUnit("m");
        model.component("comp1").geom("geom1").create("fiber", "Interval");
        model.component("comp1").geom("geom1").feature("fiber").set("p", "0 L");
        model.component("comp1").geom("geom1").run();

        model.component("comp1").mesh().create("mesh1");
        model.component("comp1").mesh("mesh1").create("edge1", "Edge");
        model.component("comp1").mesh("mesh1").feature("edge1").create("dist1", "Distribution");
        model.component("comp1").mesh("mesh1").feature("edge1").feature("dist1").set("numelem", "nElem");
        model.component("comp1").mesh("mesh1").run();
    }

    /** 稳态轴向导热 + 沿程等效对流 + 铜层 I^2 R 面热源。 */
    private static void buildThermalPhysics(Model model) {
        model.component("comp1").physics().create("wT", "WeakFormPDE", "geom1", new String[] {"theta"});
        model.component("comp1").physics("wT").label("等效稳态温升");
        model.component("comp1").physics("wT").prop("Units").set("DependentVariableQuantity", "temperature");
        model.component("comp1").physics("wT").prop("Units").set("SourceTermQuantity", "none");
        model.component("comp1").physics("wT").prop("Units").set("CustomSourceTermUnit", "W/m");

        // weak form: kA*theta' * test(theta') + hP*theta*test(theta) = q'*test(theta)
        // 以下整体乘以 -1，采用 COMSOL Weak Form PDE 的残差符号约定。
        String thermalWeak = "-kA*test(thetax)*thetax"
                + "-hP*theta*test(theta)"
                + "+qLine*test(theta)";
        model.component("comp1").physics("wT").feature("wfeq1").setIndex("weak", thermalWeak, 0);

        // 光纤两个端面连接到环境温度；对 1D 区间端点使用几何点 1 和 2。
        model.component("comp1").physics("wT").create("ends", "DirichletBoundary", 0);
        model.component("comp1").physics("wT").feature("ends").selection().set(new int[] {1, 2});
        model.component("comp1").physics("wT").feature("ends").setIndex("r", "0[K]", 0);

        model.component("comp1").variable().create("vars");
        model.component("comp1").variable("vars").set("rSi", "Dcore/2", "石英包层半径");
        model.component("comp1").variable("vars").set("rPd", "rSi+tPd", "Pd/石英界面半径");
        model.component("comp1").variable("vars").set("rCu", "rPd+tCu", "Cu 外表面半径");
        model.component("comp1").variable("vars").set("ASi", "pi*rSi^2", "石英截面积");
        model.component("comp1").variable("vars").set("APd", "pi*(rPd^2-rSi^2)", "Pd 环形截面积");
        model.component("comp1").variable("vars").set("ACu", "pi*(rCu^2-rPd^2)", "Cu 环形截面积");
        model.component("comp1").variable("vars").set("kA", "kSi*ASi+kPd*APd+kCu*ACu", "复合光纤轴向 kA");
        model.component("comp1").variable("vars").set("hP", "hEff*2*pi*rCu", "单位长度表面对流热导");
        model.component("comp1").variable("vars").set("qLine",
                "I0^2*rhoCu*filmFactor*(1+alphaCuR*theta)/ACu", "铜层单位长度焦耳热，含温度电阻修正");
        model.component("comp1").variable("vars").set("epsH",
                "epsPdRef*sqrt(H2*pTot/(0.01[atm]))", "Pd 氢吸收引起的自由本征应变，经验平方根规律");
        model.component("comp1").variable("vars").set("EA",
                "ESi*ASi+EPd*APd+ECu*ACu", "复合截面轴向拉伸刚度");
        model.component("comp1").variable("vars").set("alphaEffEA",
                "(ESi*ASi*aSi+EPd*APd*aPd+ECu*ACu*aCu)/EA", "轴向刚度加权热膨胀系数");
    }

    /** 完全粘结的复合杆模型；石英、Pd、Cu 共同承受轴向力。 */
    private static void buildAxialMechanics(Model model) {
        model.component("comp1").physics().create("wU", "WeakFormPDE", "geom1", new String[] {"disp"});
        model.component("comp1").physics("wU").label("复合截面轴向位移");
        model.component("comp1").physics("wU").prop("Units").set("DependentVariableQuantity", "length");
        model.component("comp1").physics("wU").prop("Units").set("SourceTermQuantity", "none");
        model.component("comp1").physics("wU").prop("Units").set("CustomSourceTermUnit", "N/m");

        // eps0 由轴向刚度加权热膨胀和 Pd 吸氢本征膨胀构成。
        String eigenstrain = "alphaEffEA*theta+EPd*APd*epsH/EA";
        String mechanicsWeak = "-EA*(dispx-(" + eigenstrain + "))*test(dispx)";
        model.component("comp1").physics("wU").feature("wfeq1").setIndex("weak", mechanicsWeak, 0);

        // x=0 处固定以消除刚体平移；x=L 端无轴向外力，代表自由端。
        model.component("comp1").physics("wU").create("anchor", "DirichletBoundary", 0);
        model.component("comp1").physics("wU").feature("anchor").selection().set(1);
        model.component("comp1").physics("wU").feature("anchor").setIndex("r", "0[m]", 0);

        model.component("comp1").variable("vars").set("epsMech", "dispx", "机械轴向应变");
        model.component("comp1").variable("vars").set("epsOpt",
                "epsMech+(xi+pe*aSi)*theta/(1-pe)", "热光/光弹校准的一阶等效光学应变");
        model.component("comp1").variable("vars").set("dLambda",
                "lambda0*((1-pe)*epsMech+(xi+pe*aSi)*theta)", "自由石英热膨胀作为热光校准参考的波长漂移");
        model.component("comp1").variable("vars").set("dFreq",
                "-c0/lambda0*((1-pe)*epsMech+(xi+pe*aSi)*theta)", "瑞利特征频率一阶漂移");
        model.component("comp1").variable("vars").set("Tabsolute", "Tamb+theta", "绝对温度");
    }

    private static void buildStudy(Model model) {
        model.study().create("std1");
        model.study("std1").create("stat", "Stationary");
    }

    /** 一并导出求解实际使用的 SI 参数，后处理可复现且不依赖重复手填参数。 */
    private static void printParameters(Model model) {
        String[] names = {"L", "Dcore", "tPd", "tCu", "I0", "H2", "pTot", "Tamb", "hEff",
                "rhoCu", "filmFactor", "alphaCuR", "kSi", "kPd", "kCu", "ESi", "EPd", "ECu",
                "aSi", "aPd", "aCu", "epsPdRef", "pe", "xi", "lambda0", "nEff", "Lg", "c0", "nElem"};
        for (int i = 0; i < names.length; i++) {
            System.out.println("MODEL_PARAM:" + names[i] + "," + model.param().evaluate(names[i]));
        }
    }

    /** 在 .mph 中建立温升和瑞利频移沿程图，方便打开后直接检查结果。 */
    private static void addResultPlots(Model model) {
        model.result().create("pgT", "PlotGroup1D");
        model.result("pgT").label("光纤温度沿程分布");
        model.result("pgT").create("lineT", "LineGraph");
        model.result("pgT").feature("lineT").selection().all();
        model.result("pgT").feature("lineT").set("expr", "Tabsolute");
        model.result("pgT").feature("lineT").set("unit", "degC");
        model.result("pgT").run();

        model.result().create("pgS", "PlotGroup1D");
        model.result("pgS").label("机械应变与光学等效应变");
        model.result("pgS").create("lineS", "LineGraph");
        model.result("pgS").feature("lineS").selection().all();
        model.result("pgS").feature("lineS").set("expr", "epsMech");
        model.result("pgS").feature("lineS").set("unit", "um/m");
        model.result("pgS").create("lineO", "LineGraph");
        model.result("pgS").feature("lineO").selection().all();
        model.result("pgS").feature("lineO").set("expr", "epsOpt");
        model.result("pgS").feature("lineO").set("unit", "um/m");
        model.result("pgS").run();
        model.result().create("pgF", "PlotGroup1D");
        model.result("pgF").label("瑞利频率漂移（非全波求解）");
        model.result("pgF").create("lineF", "LineGraph");
        model.result("pgF").feature("lineF").selection().all();
        model.result("pgF").feature("lineF").set("expr", "dFreq");
        model.result("pgF").feature("lineF").set("unit", "GHz");
        model.result("pgF").run();
    }

    /** 采样结果通过批处理日志输出；无需放开 Java 沙箱的文件访问权限。 */
    private static void sampleAndPrint(Model model) {
        // Eval 直接读取有限元节点，避免 COMSOL 6.1 的一维 Interp 返回空坐标。
        model.result().numerical().create("sample", "Eval");
        model.result().numerical("sample").set("data", "dset1");
        model.result().numerical("sample").selection().geom("geom1", 1);
        model.result().numerical("sample").selection().all();
        model.result().numerical("sample").set("expr", new String[] {
                "Tabsolute", "theta", "disp", "epsMech", "epsOpt", "dLambda", "dFreq"});
        double[][][] values = model.result().numerical("sample").getData();
        double[][] coordinates = model.result().numerical("sample").getCoordinates();
        if (coordinates.length == 0 || coordinates[0].length == 0) {
            throw new IllegalStateException("COMSOL evaluation has no sample data");
        }
        int count = coordinates[0].length;
        System.out.println("CSV_DATA:z_m,T_K,deltaT_K,displacement_m,mechanical_strain,rayleigh_optical_strain,delta_lambda_m,delta_frequency_Hz");
        for (int i = 0; i < count; i++) {
            String line = "CSV_DATA:" + coordinates[0][i];
            for (int j = 0; j < 7; j++) line += "," + values[j][0][i];
            System.out.println(line);
        }
    }
}

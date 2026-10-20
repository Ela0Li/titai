#!/usr/bin/env node
/* 机器学习数学基础包：在拆出来的「数学与概率基础」之上，补齐线性代数 / 概率统计 /
   微积分与优化 / 信息论与数值稳定 四个模块，并统一标题与术语。
   输入：decks/ml-math.json（tools/split-deck.js 的产物）
   输出：decks/ml-math.json、app/src/main/assets/decks/ml-math.json
        同时把 decks/ml-intro.json 里「第 N 章 · 」前缀去掉
   用法：node tools/build-ml-math.js
*/
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECK_PATH = path.join(ROOT, "decks", "ml-math.json");
const INTRO_PATH = path.join(ROOT, "decks", "ml-intro.json");
const ASSETS = path.join(ROOT, "app", "src", "main", "assets", "decks");

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const cn = (n) => CN[n] || String(n);

/* ---------------- 新增模块 ---------------- */
const EXTRA = [
  {
    id: "m2",
    title: "线性代数：把模型看成矩阵",
    priority: "P1",
    stage: 2,
    signal: "能从形状推断计算、知道秩/条件数什么时候会坑你",
    keypoints: [
      "形状先行：任何一步先算 (m,k)(k,n) 会不会对得上",
      "范数是“大小”的定义，L1 稀疏、L2 平滑、∞ 看最大分量",
      "特征分解描述“方向不变”，SVD 描述“任意矩阵的最优低秩”",
      "条件数 κ 衡量输入扰动会被放大多少倍",
    ],
    traps: [
      "把矩阵乘法当可交换，顺序写反还觉得结果差不多",
      "求逆去解线性系统（应该用分解或最小二乘）",
      "把特征值当“重要性”，忽略特征向量方向",
    ],
    checks: [
      { id: "m2.1", text: "向量、内积与 L1/L2/∞ 范数：为什么正则化选哪个范数会带来不同稀疏性", lvl: "P1" },
      { id: "m2.2", text: "矩阵乘法的形状规则、秩与可逆性：秩亏时最小二乘在做什么", lvl: "P1" },
      { id: "m2.3", text: "特征值与特征分解：对称矩阵为什么能正交对角化，谱半径说明什么", lvl: "P2" },
      { id: "m2.4", text: "SVD 与低秩近似：Eckart–Young 定理、PCA 与嵌入压缩的关系", lvl: "P1" },
      { id: "m2.5", text: "二次型、正定与条件数：凸性判定和“病态问题为什么难优化”", lvl: "P2" },
      { id: "m2.6", text: "矩阵求导的三个常用恒等式与链式法则，形状怎么对齐", lvl: "P1" },
    ],
  },
  {
    id: "m3",
    title: "概率与统计：从数据反推分布",
    priority: "P0",
    stage: 2,
    signal: "看到业务问题能写出随机变量、似然和估计量",
    keypoints: [
      "先问“随机变量是什么、取值空间多大、独立吗”",
      "贝叶斯 = 先验 × 似然 / 证据；共轭先验是为了能算",
      "MLE 是使数据最可能，MAP 是 MLE 加先验",
      "方差公式 Var=E[X²]−E[X]² 在数值上要小心抵消",
    ],
    traps: [
      "把 p 值当成“原假设为真的概率”",
      "用相关系数推因果，或忘了非线性相关",
      "样本很小就相信中心极限定理的正态近似",
    ],
    checks: [
      { id: "m3.1", text: "常见分布族与它们的支撑集：伯努利/二项/泊松/高斯/拉普拉斯/指数各自适合什么数据", lvl: "P1" },
      { id: "m3.2", text: "期望、方差、协方差与相关系数的定义和计算陷阱（数值抵消、量纲）", lvl: "P0" },
      { id: "m3.3", text: "条件概率、全概率与贝叶斯更新：先验/似然/后验各是什么，共轭先验解决什么问题", lvl: "P0" },
      { id: "m3.4", text: "极大似然与 MAP：怎么推、为什么等价于最小化负对数似然", lvl: "P0" },
      { id: "m3.5", text: "大数定律与中心极限定理：样本均值为什么近似正态，置信区间怎么来", lvl: "P1" },
      { id: "m3.6", text: "估计量的偏差、方差与一致性：MSE 分解和偏差-方差权衡的统计版本", lvl: "P2" },
      { id: "m3.7", text: "bootstrap、置换检验与 p 值的正确解读", lvl: "P2" },
    ],
  },
  {
    id: "m4",
    title: "微积分与优化：找到最小值",
    priority: "P0",
    stage: 2,
    signal: "能写出梯度、判断凸性、说清 Adam 和 SGD 的差别",
    keypoints: [
      "梯度指向最速上升，负梯度是最速下降",
      "Hessian 定号决定驻点是极小、极大还是鞍点",
      "凸问题的局部极小就是全局极小，这是“可依赖”的来源",
      "学习率是步长：太大振荡、太小爬不动",
    ],
    traps: [
      "在非凸问题上期待全局最优保证",
      "忘记学习率要随 batch size 和网络深度调整",
      "把 Adam 的自适应步长当万能，忽略权重衰减与 warmup",
    ],
    checks: [
      { id: "m4.1", text: "导数、偏导、方向导数与梯度：为什么负梯度是局部最快下降方向", lvl: "P0" },
      { id: "m4.2", text: "Jacobian 与 Hessian：多元链式法则怎么串起来，二阶信息能告诉你什么", lvl: "P1" },
      { id: "m4.3", text: "一阶/二阶泰勒展开与近似误差：为什么二阶方法收敛快但内存贵", lvl: "P1" },
      { id: "m4.4", text: "凸集、凸函数与判定方法：凸性给了哪些保证，哪些常见函数是凸的", lvl: "P1" },
      { id: "m4.5", text: "拉格朗日乘子与 KKT 条件：等式约束和不等式约束分别怎么处理", lvl: "P2" },
      { id: "m4.6", text: "SGD、动量、Adam 的更新式与直觉：各自在修正什么", lvl: "P0" },
      { id: "m4.7", text: "学习率、批大小与收敛：warmup、衰减、病态曲率下的表现", lvl: "P1" },
    ],
  },
  {
    id: "m5",
    title: "信息论与数值稳定：损失函数从哪来",
    priority: "P0",
    stage: 2,
    signal: "能解释交叉熵为什么是分类损失、softmax 为什么要减最大值",
    keypoints: [
      "熵是不确定性的下界，交叉熵 = 熵 + KL",
      "KL 不对称，所以它是“散度”不是“距离”",
      "log-sum-exp 是数值稳定的标准写法",
      "浮点相减会抵消有效位，概率连乘要转成对数相加",
    ],
    traps: [
      "概率为 0 时直接取 log，得到 −inf",
      "把 KL 当距离去做对称的聚类目标",
      "用 float32 累加百万级小量，误差累积到肉眼可见",
    ],
    checks: [
      { id: "m5.1", text: "熵、条件熵与交叉熵：定义、最大熵原理，以及它为什么成为分类损失", lvl: "P0" },
      { id: "m5.2", text: "KL 散度与互信息：非对称性、与最大似然的关系、VAE 里的用法", lvl: "P1" },
      { id: "m5.3", text: "从最大似然推到交叉熵损失：高斯假设对应 MSE、伯努利假设对应 BCE", lvl: "P0" },
      { id: "m5.4", text: "log-sum-exp 与数值稳定的 softmax：减最大值、log 域计算、避免下溢", lvl: "P1" },
      { id: "m5.5", text: "浮点数、machine epsilon 与灾难性抵消：混合精度训练要注意什么", lvl: "P2" },
      { id: "m5.6", text: "梯度检查与数值微分：中心差分的误差阶、相对误差怎么判", lvl: "P2" },
    ],
  },
];

/* ---------------- 新增问答 ---------------- */
const QAS = [
  {
    id: "q.m2.vec", m: "m2", lvl: "P1", layer: 2,
    q: "向量、范数和内积分别在表达什么？为什么 L1 会产生稀疏解、L2 不会？",
    tags: ["范数", "稀疏性", "正则化"],
    covers: ["m2.1"],
    next: ["q.m2.rank", "q.m2.svd"],
    ans: [
      { h: "结论", p: "向量是“一组有顺序的数”，范数定义它的大小，内积定义两个向量的夹角与投影。L1 的等高线是菱形，顶点落在坐标轴上，所以解容易把某些分量压到 0；L2 的等高线是圆，只会整体缩小，不会真的变成 0。" },
      { h: "机制", p: "L1 在 0 点不可导且导数有界（次梯度在 [−1,1]），当梯度的某个分量小于阈值时，惩罚项能把它一路推到 0；L2 的梯度与参数成正比，参数越小推力越小，只能无限逼近 0。" },
      { h: "取舍", p: "要特征选择、模型可解释，用 L1 或 Elastic Net；要平滑、数值稳定、和 SGD 一起用，用 L2 或 weight decay。L1 在小学习率下收敛慢，因为次梯度行为不光滑。" },
      { h: "实战", p: "深度模型里常用 weight decay（L2）而不是 L1；稀疏诉求交给结构化剪枝或门控。做线性回归时先标准化再上 L1，否则惩罚强度会被量纲带偏。" },
    ],
  },
  {
    id: "q.m2.rank", m: "m2", lvl: "P1", layer: 2,
    q: "矩阵乘法的形状规则、秩和可逆性之间是什么关系？秩亏时最小二乘在做什么？",
    tags: ["矩阵乘法", "秩", "最小二乘"],
    covers: ["m2.2"],
    next: ["q.m2.eig", "q.m2.calc"],
    ans: [
      { h: "结论", p: "(m,k)·(k,n) 必须 k 对得上，结果是 (m,n)。秩 rank(A) 是线性无关的行/列数，也是映射后空间的维数。方阵可逆当且仅当满秩。秩亏时 A⁻¹ 不存在，最小二乘解不唯一，需要加正则或取伪逆。" },
      { h: "机制", p: "Ax=b 有解的条件是 b 落在 A 的列空间里；秩亏意味着列空间维数不足，投影后有无穷多原像。最小二乘求 min‖Ax−b‖²，正规方程 AᵀAx=Aᵀb 在秩亏时 AᵀA 也奇异，所以要 Moore–Penrose 伪逆或岭回归 (AᵀA+λI)⁻¹。" },
      { h: "取舍", p: "精确解用 LU/QR；超定用 QR 或 SVD 而非显式求逆；大规模稀疏用迭代法（CG/LSQR）。显式求逆数值最差、最慢，只在 n 很小时可接受。" },
      { h: "实战", p: "把特征共线当成“秩亏的近似”，此时系数会剧烈震荡；先做相关分析或用 L2 稳定。深度学习中“形状对不上”是第一大 bug 来源，写代码前先写下每步形状。" },
    ],
  },
  {
    id: "q.m2.eig", m: "m2", lvl: "P2", layer: 3,
    q: "特征值分解说明什么？为什么对称矩阵一定能正交对角化？谱半径在优化里意味着什么？",
    tags: ["特征分解", "谱", "收敛"],
    covers: ["m2.3"],
    next: ["q.m2.svd"],
    ans: [
      { h: "结论", p: "Av=λv 表示存在方向 v，矩阵作用后只缩放不转向。实对称矩阵的谱定理保证存在正交矩阵 Q 使 A=QΛQᵀ，特征值全为实数。谱半径 ρ(A)=max|λ| 决定迭代 x←Ax 的收敛速度。" },
      { h: "机制", p: "对称矩阵的不同特征子空间正交；取 Q 的列作基，A 变成对角阵。梯度下降的误差传播矩阵是 I−ηH，收敛要求 |1−ηλmax|<1，即 η<2/λmax；条件数 λmax/λmin 越大，各方向收敛速度差越悬殊。" },
      { h: "取舍", p: "特征分解只对可对角化矩阵成立；非对称矩阵要 Schur 分解。大规模问题不做完整分解，用幂迭代/Lanczos 求极端特征值即可。" },
      { h: "实战", p: "训练时看 Hessian 的最大特征值来判断学习率上限；batch norm 与残差连接本质上在改善谱性质。PCA 就是协方差矩阵的特征分解。" },
    ],
  },
  {
    id: "q.m2.svd", m: "m2", lvl: "P1", layer: 3,
    q: "SVD 和特征分解有什么区别？Eckart–Young 定理保证了什么？PCA 和嵌入压缩为什么都能用它解释？",
    tags: ["SVD", "低秩近似", "PCA"],
    covers: ["m2.4", "m2.5"],
    next: ["q.m2.eig"],
    peer: ["ml-intro#q.m8.pca"],
    ans: [
      { h: "结论", p: "任意矩阵都有 A=UΣVᵀ，U/V 正交、Σ 非负对角。截断前 k 个奇异值就是最优的秩-k 近似（Eckart–Young），误差等于被丢掉奇异值的平方和。PCA 是对中心化数据做 SVD，嵌入压缩同理。" },
      { h: "机制", p: "AᵀA 的特征分解给出 V 与 σ²，AAᵀ 给出 U；奇异值非负所以永远可分解，不像特征值可能是复数。低秩近似把数据投影到前 k 个主方向上，保留方差最大的子空间。" },
      { h: "取舍", p: "SVD 稳定但 O(mn·min(m,n)) 太贵；大矩阵用随机化 SVD 或只求前 k 个。PCA 是线性、无监督的，非线性结构要靠自编码器或核 PCA，但后者不可扩展。" },
      { h: "实战", p: "推荐系统的隐因子、词向量的降维、LoRA 的低秩分解都是这个思路。做可视化时先中心化再 PCA，否则第一主成分会被均值吃掉。" },
    ],
  },
  {
    id: "q.m2.calc", m: "m2", lvl: "P1", layer: 2,
    q: "矩阵求导的三个常用恒等式是什么？为什么梯度要和参数形状一致？",
    tags: ["矩阵求导", "梯度", "形状"],
    covers: ["m2.6"],
    next: ["q.m4.grad"],
    ans: [
      { h: "结论", p: "∂(aᵀx)/∂x=a，∂(xᵀAx)/∂x=(A+Aᵀ)x（A 对称时 2Ax），∂‖Ax−b‖²/∂x=2Aᵀ(Ax−b)。梯度的形状必须和参数一致，否则无法做参数更新。" },
      { h: "机制", p: "标量对向量求导得到同形状向量（分母布局）；对矩阵求导得到同形状矩阵。链式法则在矩阵情形是“雅可比相乘”，顺序不能交换，维度要能连起来。" },
      { h: "取舍", p: "推导时用分母布局更直观；框架里 autograd 会自动处理，但手写自定义算子时必须对齐形状与布局，否则会出现“看起来能跑但学不动”的隐性错误。" },
      { h: "实战", p: "写反向传播先画形状流；对 batch 维做 sum 而不是 mean 时，梯度会随 batch size 放大，需要同步缩放学习率。" },
    ],
  },
  {
    id: "q.m3.dist", m: "m3", lvl: "P1", layer: 2,
    q: "伯努利、二项、泊松、高斯、拉普拉斯、指数分布各自对应什么数据？选错了会怎样？",
    tags: ["分布", "似然", "建模"],
    covers: ["m3.1"],
    next: ["q.m3.moments", "q.m3.bayes"],
    ans: [
      { h: "结论", p: "二分类→伯努利；n 次试验的成功数→二项；单位时间事件数→泊松；连续对称噪声→高斯；稀疏/重尾噪声→拉普拉斯；等待时间→指数。分布选择等价于选择似然，直接决定损失函数。" },
      { h: "机制", p: "伯努利的负对数似然是 BCE；高斯的负对数似然是 MSE（方差固定时）；拉普拉斯的负对数似然是 MAE，所以 L1 对离群点更稳健。泊松的对数似然给出 Poisson 回归的损失。" },
      { h: "取舍", p: "高斯假设方便但怕离群点；拉普拉斯稳健但在 0 点不可导；计数数据用高斯会预测出负数。重尾数据也可以选 t 分布，代价是没有共轭先验。" },
      { h: "实战", p: "先画残差分布再选损失；分类任务最后一定配 sigmoid/softmax + 交叉熵，而不是 MSE，否则梯度会被饱和区吞掉。" },
    ],
  },
  {
    id: "q.m3.moments", m: "m3", lvl: "P0", layer: 2,
    q: "期望、方差、协方差和相关系数怎么算？有哪些数值陷阱？",
    tags: ["期望", "方差", "协方差"],
    covers: ["m3.2"],
    next: ["q.m3.mle"],
    peer: ["ue5-pcg#q.m2.prob"],
    ans: [
      { h: "结论", p: "E[X]=Σx·p(x)；Var(X)=E[X²]−E[X]²=E[(X−μ)²]；Cov(X,Y)=E[XY]−E[X]E[Y]；相关系数 ρ=Cov/(σxσy)∈[−1,1]。ρ 只刻画线性相关。" },
      { h: "机制", p: "方差是二阶中心矩，可加性要求独立（或至少不相关）：Var(X+Y)=Var X+Var Y+2Cov。协方差矩阵必须半正定，这是很多算法（高斯过程、PCA）的前提。" },
      { h: "取舍", p: "E[X²]−E[X]² 在均值远大于标准差时会灾难性抵消，应改用两遍法或 Welford 在线算法。ρ 对异常值敏感，稳健场景用 Spearman。" },
      { h: "实战", p: "深度学习中统计 BN 的 running variance 就用无偏/有偏版本区分；特征相关性强时先看协方差矩阵条件数，再决定是否做白化。" },
    ],
  },
  {
    id: "q.m3.bayes", m: "m3", lvl: "P0", layer: 2,
    q: "贝叶斯更新是怎么做的？共轭先验解决了什么问题？",
    tags: ["贝叶斯", "先验", "后验"],
    covers: ["m3.3"],
    next: ["q.m3.mle"],
    ans: [
      { h: "结论", p: "后验 ∝ 先验 × 似然：P(θ|D)=P(D|θ)P(θ)/P(D)。共轭先验指先验与后验同族（如 Beta-伯努利、高斯-高斯），好处是后验有解析解、可以增量更新。" },
      { h: "机制", p: "Beta(a,b) 先验 + 观察到 s 次成功、f 次失败 → Beta(a+s, b+f)。分母 P(D) 是归一化常数，常被忽略；预测分布要把后验积分掉。" },
      { h: "取舍", p: "共轭先验计算便宜但表达力有限；一般先验要用 MCMC/变分推断，代价是慢和近似误差。数据量大时先验影响趋近于 0，小样本时先验就是正则化。" },
      { h: "实战", p: "A/B 测试的转化率用 Beta-Bernoulli 跟踪后验区间比 p 值直观；冷启动推荐用先验兜底，避免 0 点击直接判死。" },
    ],
  },
  {
    id: "q.m3.mle", m: "m3", lvl: "P0", layer: 2,
    q: "极大似然和 MAP 怎么推？为什么它们等价于不同的正则化？",
    tags: ["MLE", "MAP", "正则化"],
    covers: ["m3.4", "m3.6"],
    next: ["q.m5.ce"],
    ans: [
      { h: "结论", p: "MLE 最大化 Σlog p(xᵢ|θ)；MAP 最大化 Σlog p(xᵢ|θ)+log p(θ)。加高斯先验等价于 L2 正则，加拉普拉斯先验等价于 L1 正则。" },
      { h: "机制", p: "取负号变成最小化负对数似然；先验项 −log p(θ) 就是惩罚项。高斯先验的 −log 是 θ²/2σ²，乘上后正好是 λ‖θ‖²；拉普拉斯是 |θ|/b，对应 L1。" },
      { h: "取舍", p: "MLE 在大样本下方差最小，但小样本容易过拟合；MAP 用先验换偏差。贝叶斯做法是保留整个后验，代价是推断成本。" },
      { h: "实战", p: "深度学习的 weight decay 常被当作 L2，但 Adam 里的解耦权重衰减（AdamW）与 L2 并不等价，因为自适应分母改变了梯度方向。" },
    ],
  },
  {
    id: "q.m3.clt", m: "m3", lvl: "P1", layer: 3,
    q: "大数定律和中心极限定理分别在说什么？置信区间怎么来的？",
    tags: ["CLT", "置信区间", "假设检验"],
    covers: ["m3.5", "m3.7"],
    next: ["ml-intro#q.m7.offline"],
    ans: [
      { h: "结论", p: "大数定律：样本均值依概率收敛到期望。中心极限定理：独立同分布下 (x̄−μ)/(σ/√n) 近似 N(0,1)，于是有 x̄±1.96σ/√n 的 95% 置信区间。" },
      { h: "机制", p: "CLT 只要求有限方差，收敛速度依赖分布形状；样本小或重尾时用 t 分布或 bootstrap。假设检验把“观测到的差异”换算成在 H0 下出现该差异的概率（p 值）。" },
      { h: "取舍", p: "置信区间是“重复抽样下区间覆盖真值的比例”，不是“真值落在区间内的概率”。p 值不是 H0 为真的概率，也不代表效应大小。" },
      { h: "实战", p: "A/B 看的是效应量与区间，不是“显著/不显著”的二元结论；多指标多次检验要做多重比较校正（Bonferroni/FDR）。" },
    ],
  },
  {
    id: "q.m4.grad", m: "m4", lvl: "P0", layer: 2,
    q: "梯度是什么，为什么沿负梯度走能降低损失？",
    tags: ["梯度", "方向导数", "优化"],
    covers: ["m4.1"],
    next: ["q.m4.hess", "q.m4.sgd"],
    ans: [
      { h: "结论", p: "梯度是偏导拼成的向量，指向上升最快的方向；负梯度是局部下降最快方向。一阶泰勒展开给出 f(x−η∇f)≈f(x)−η‖∇f‖²，只要 η>0 且足够小，损失就下降。" },
      { h: "机制", p: "方向导数 D_u f=∇f·u，在 ‖u‖=1 时最小值在 u=−∇f/‖∇f‖ 处取得，值为 −‖∇f‖。因此负梯度方向是单位步长下的一阶最优方向。" },
      { h: "取舍", p: "梯度只给一阶信息，病态曲率下会来回震荡；用动量、预条件或二阶方法改善。随机梯度有噪声，但噪声本身有助于逃离尖锐极小。" },
      { h: "实战", p: "训练不降时先看梯度范数：接近 0 可能是消失或饱和，异常大可能是爆炸；再看学习率与数据缩放是否匹配。" },
    ],
  },
  {
    id: "q.m4.hess", m: "m4", lvl: "P1", layer: 3,
    q: "Jacobian、Hessian 和泰勒展开怎么配合？为什么二阶方法快但用不起？",
    tags: ["Hessian", "泰勒展开", "二阶方法"],
    covers: ["m4.2", "m4.3"],
    next: ["q.m4.convex"],
    ans: [
      { h: "结论", p: "Jacobian 是向量函数的导数矩阵，Hessian 是标量函数的二阶导矩阵。二阶泰勒展开 f(x+d)≈f+∇fᵀd+½dᵀHd，令导数为 0 得到牛顿方向 d=−H⁻¹∇f。" },
      { h: "机制", p: "Hessian 描述曲率：正定则局部凸，负定是极大，不定是鞍点。牛顿法在二次函数上一步到位，因此收敛快（二次收敛）；但每步要 O(n³) 求逆、O(n²) 内存。" },
      { h: "取舍", p: "参数百万级时全 Hessian 不现实；用对角近似（Adam 的 v）、低秩近似（L-BFGS）、或隐式矩阵向量积（Hessian-vector product）。" },
      { h: "实战", p: "理解 Adam 的关键是它用梯度平方的滑动平均做逐参数缩放，相当于对角预条件；这也是它对尺度不同的参数更鲁棒的原因。" },
    ],
  },
  {
    id: "q.m4.convex", m: "m4", lvl: "P1", layer: 3,
    q: "怎么判断一个函数是凸的？凸性到底保证了什么？KKT 又在约束优化里做什么？",
    tags: ["凸性", "KKT", "约束优化"],
    covers: ["m4.4", "m4.5"],
    next: ["q.m4.sgd"],
    ans: [
      { h: "结论", p: "凸函数满足 f(θx+(1−θ)y)≤θf(x)+(1−θ)f(y)；可微时等价于 f(y)≥f(x)+∇f(x)ᵀ(y−x)；二阶可微时 Hessian 半正定。凸优化里任何局部极小都是全局极小。" },
      { h: "机制", p: "KKT 是带约束最优性的必要条件：拉格朗日函数对原变量梯度为 0、原始可行、对偶可行（乘子非负）、互补松弛（乘子×约束=0）。凸问题下 KKT 也是充分条件。" },
      { h: "取舍", p: "神经网络损失高度非凸，凸性保证不适用；但每一层是凸的、或者做凸松弛（如 SVM 的对偶）时仍然有用。softmax + 交叉熵对 logits 是凸的。" },
      { h: "实战", p: "把约束写成惩罚项（projected gradient、拉格朗日松弛）是工程常态；遇到“训练不收敛”先检查是不是把非凸问题当凸的来调。" },
    ],
  },
  {
    id: "q.m4.sgd", m: "m4", lvl: "P0", layer: 2,
    q: "SGD、动量、Adam 的更新式各自在修正什么？什么时候该选哪个？",
    tags: ["SGD", "动量", "Adam"],
    covers: ["m4.6", "m4.7"],
    next: ["ml-intro#q.m6.tune"],
    ans: [
      { h: "结论", p: "SGD：θ←θ−ηg；动量：v←βv+g, θ←θ−ηv（用历史方向平滑噪声）；Adam：m、v 分别是梯度与其平方的滑动平均，θ←θ−η·m̂/(√v̂+ε)（逐参数缩放）。" },
      { h: "机制", p: "动量把“来回震荡的分量”相互抵消、“一致的分量”累加，等效放大有效步长并抑制病态方向。Adam 的分母让每个参数以自己的尺度更新，代价是可能放大噪声、泛化略差。" },
      { h: "取舍", p: "CV/小模型常用 SGD+动量，泛化好、调参直观；Transformer/稀疏梯度用 Adam/AdamW；预算紧就先 Adam 起步，再考虑换 SGD 微调。" },
      { h: "实战", p: "AdamW 把 weight decay 从梯度里解耦，正则更有效；warmup 避免早期自适应方差估计不准导致发散；学习率与 batch size 大致成比例（线性缩放规则）。" },
    ],
  },
  {
    id: "q.m5.entropy", m: "m5", lvl: "P0", layer: 2,
    q: "熵、交叉熵和 KL 散度是什么关系？为什么分类用交叉熵？",
    tags: ["熵", "交叉熵", "KL"],
    covers: ["m5.1", "m5.2"],
    next: ["q.m5.ce"],
    ans: [
      { h: "结论", p: "H(p)=−Σp log p 是不确定性；H(p,q)=−Σp log q 是用 q 编码 p 的平均代价；KL(p‖q)=H(p,q)−H(p)≥0。做分类时 p 是 one-hot，H(p)=0，所以最小化交叉熵等价于最小化 KL。" },
      { h: "机制", p: "log 的凹性 + Jensen 不等式给出 KL≥0，等号当且仅当 p=q。KL 不对称：KL(p‖q) 与 KL(q‖p) 在 q 覆盖不到 p 的支撑时分别为有限/无穷。" },
      { h: "取舍", p: "交叉熵对错误且自信的预测惩罚大（梯度∝(p−q)），配合 softmax 数值稳定；MSE 在饱和区梯度消失。label smoothing 相当于换成软标签目标，抑制过度自信。" },
      { h: "实战", p: "VAE 的 KL 项、知识蒸馏的 KL(q‖p)、互信息估计都建立在这套量上；算困惑度就是 exp(交叉熵)。" },
    ],
  },
  {
    id: "q.m5.ce", m: "m5", lvl: "P0", layer: 2,
    q: "怎么从最大似然推出交叉熵和 MSE？为什么分类不能用 MSE？",
    tags: ["最大似然", "交叉熵", "MSE"],
    covers: ["m5.3"],
    next: ["q.m5.logsumexp"],
    peer: ["q.m3.mle"],
    ans: [
      { h: "结论", p: "伯努利似然取负对数 → BCE；多分类 categorical 似然取负对数 → 交叉熵；高斯似然取负对数（方差固定）→ ½‖y−ŷ‖² 即 MSE。损失函数本质上是你假设的噪声模型。" },
      { h: "机制", p: "−log p(y|x) 对 logits 求导时，softmax+CE 的梯度是 (p−y)，干净且不会因饱和而消失；MSE 经过 sigmoid 后的梯度含 σ′(z)，两端趋近 0。" },
      { h: "取舍", p: "MSE 适合回归、且对离群点敏感（平方放大）；分类任务想稳健可用 focal loss 或 label smoothing。概率校准差的时候可以考虑温度缩放。" },
      { h: "实战", p: "框架里 BCEWithLogits/CrossEntropy 已经把 softmax 与 log 合并，不要自己先 softmax 再取 log，既慢又不稳。" },
    ],
  },
  {
    id: "q.m5.logsumexp", m: "m5", lvl: "P1", layer: 3,
    q: "softmax 为什么要减最大值？log-sum-exp 技巧解决什么问题？",
    tags: ["softmax", "数值稳定", "溢出"],
    covers: ["m5.4", "m5.5"],
    next: ["q.m5.gradcheck"],
    ans: [
      { h: "结论", p: "exp 在大数值上会溢出成 inf，减最大值后 exp(z−max)∈(0,1] 不溢出且结果不变（分子分母同乘 e^{-max}）。log-sum-exp 同理：logΣe^{zᵢ}=max+logΣe^{zᵢ−max}。" },
      { h: "机制", p: "Float32 最大约 3.4e38，exp(89) 就溢出；减最大值把指数控制在 0 附近。log 域里连乘变相加，避免概率连乘下溢到 0，这也是 HMM/CTC 前向算法的标准做法。" },
      { h: "取舍", p: "减最大值要多一遍求 max，但只有 O(n)；混合精度下 exp 与 log 仍建议在 fp32 里做，BF16 的指数范围大但尾数少。" },
      { h: "实战", p: "写自定义损失时直接用 torch.logsumexp；调试 NaN 先从 log(0)、除 0、exp 溢出三个方向查，再看梯度是否爆炸。" },
    ],
  },
  {
    id: "q.m5.gradcheck", m: "m5", lvl: "P2", layer: 4,
    q: "梯度检查怎么做？为什么用中心差分？相对误差多少算通过？",
    tags: ["梯度检查", "数值微分", "调试"],
    covers: ["m5.6"],
    next: ["q.m2.calc"],
    ans: [
      { h: "结论", p: "用 (f(x+h)−f(x−h))/(2h) 近似导数，与解析梯度比较相对误差 ‖g_num−g_ana‖/(‖g_num‖+‖g_ana‖+ε)。中心差分误差 O(h²)，前向差分只有 O(h)。" },
      { h: "机制", p: "h 太大截断误差大，太小舍入误差大；经验取 h≈1e-5（float64）。比较前要关掉 dropout、固定随机种子、用双精度。" },
      { h: "取舍", p: "梯度检查慢（每个参数两次前向），只在小模型或自定义算子上做。相对误差 <1e-7 优秀，1e-4 可疑，>1e-2 基本是错。" },
      { h: "实战", p: "先查最容易错的点：softmax 的减最大值、mask 的广播方向、sum 与 mean 的混用、in-place 操作破坏计算图。" },
    ],
  },
];

/* ---------------- 组装 ---------------- */
const deck = JSON.parse(fs.readFileSync(DECK_PATH, "utf8"));

/* 幂等：如果之前已经追加过，先摘掉（只保留拆出来的 m1） */
deck.groups = deck.groups.filter((g) => g.id === "m1");
deck.qas = (deck.qas || []).filter((q) => q && q.m === "m1");

/* m1：修标题 + 术语 */
deck.title = "机器学习数学基础";
deck.terms = { group: "模块", check: "知识点", qa: "问答" };
deck.meta = Object.assign({}, deck.meta, { short: "数学基础" });
deck.groups.forEach((g, i) => {
  g.title = "模块" + cn(i + 1) + " · " + String(g.title).replace(/^.*?[·]\s*/, "").replace(/^第\s*\d+\s*章\s*[·]?\s*/, "");
});

/* 追加模块 */
EXTRA.forEach((m) => {
  deck.groups.push({
    id: m.id,
    title: "模块" + cn(deck.groups.length + 1) + " · " + m.title,
    priority: m.priority,
    stage: m.stage,
    signal: m.signal,
    keypoints: m.keypoints,
    traps: m.traps,
    checks: m.checks,
  });
  m.checks.forEach((c) => deck.qas.push({})); // 占位，避免 lint 抱怨
});
deck.qas = deck.qas.filter((q) => q && q.id);
QAS.forEach((q) => {
  const o = { id: q.id, m: q.m, lvl: q.lvl, layer: q.layer, q: q.q, tags: q.tags, covers: q.covers };
  if (q.next && q.next.length) o.next = q.next;
  if (q.peer && q.peer.length) o.peer = q.peer;
  o.ans = q.ans;
  deck.qas.push(o);
});

fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 1) + "\n", "utf8");

/* ml-intro：去掉「第 N 章 · 」前缀 */
const intro = JSON.parse(fs.readFileSync(INTRO_PATH, "utf8"));
intro.groups.forEach((g) => {
  g.title = String(g.title)
    .replace(/^(模块[一二三四五六七八九十]+)\s*·\s*第\s*\d+\s*章\s*·\s*/, "$1 · ")
    .replace(/^第\s*\d+\s*章\s*·\s*/, "模块 · ");
});
fs.writeFileSync(INTRO_PATH, JSON.stringify(intro, null, 1) + "\n", "utf8");

/* 同步到 assets */
fs.mkdirSync(ASSETS, { recursive: true });
["ml-math.json", "ml-intro.json"].forEach((f) => {
  fs.copyFileSync(path.join(ROOT, "decks", f), path.join(ASSETS, f));
});

const checks = deck.groups.reduce((n, g) => n + g.checks.length, 0);
console.log(`decks/ml-math.json  模块 ${deck.groups.length} · 知识点 ${checks} · 问答 ${deck.qas.length}`);
console.log(`decks/ml-intro.json 模块 ${intro.groups.length} · 已去掉章节前缀`);

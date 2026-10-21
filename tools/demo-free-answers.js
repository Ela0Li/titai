#!/usr/bin/env node
/* demo-free-answers.js — 把两条问答改成协议 v1.5 的自由答案结构，作为渲染回归样本
 *
 *   1) ml-math / q.m2.svd：三级标题 + 要点列表
 *   2) ml-intro / q.m1.what：完全不写标题，只有两段
 *
 * 幂等：内容已经是对应的结构就直接跳过。
 * 现在两个包的 JSON 里已经是这个结构，日常不需要再跑；只有整份内容被外部工具覆盖回四段式时才用它修回来。
 * 用法：node tools/demo-free-answers.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECKS = path.join(ROOT, "decks");
const ASSETS = path.join(ROOT, "app", "src", "main", "assets", "decks");

const SVD_ANS = [
  {
    h: "一句话",
    p: "任意矩阵都能写成 $A = U\\Sigma V^{T}$：$U/V$ 正交、$\\Sigma$ 非负对角；截断前 $k$ 个奇异值就是最优秩-$k$ 近似，误差正好等于被丢掉的奇异值平方和。"
  },
  {
    h: "为什么比特征分解更能用",
    p: "特征分解要求方阵且可能出复数；$A^{T}A$ 与 $AA^{T}$ 一定对称半正定，特征值非负，所以 SVD 对任意形状的矩阵都成立。PCA 就是把数据中心化后再做 SVD，嵌入压缩是同一个思路的截断。"
  },
  {
    h: "实际怎么用",
    lvl: 1,
    p: "先决定“要留多少信息”，再决定算法。"
  },
  {
    h: "按预算选算法",
    lvl: 2,
    p: "完整 SVD 是 $O(mn\\min(m,n))$，百万级矩阵直接算不动，得换近似。"
  },
  {
    h: "三个常用档位",
    lvl: 3,
    p: "按矩阵规模从便宜到贵排：",
    list: [
      "只要前 $k$ 个：随机化 SVD，$k \\ll \\min(m,n)$ 时比完整分解快一个量级",
      "稀疏矩阵：Lanczos / Arnoldi 迭代求主奇异三元组",
      "模型压缩：LoRA 那种固定低秩分解，秩 $r$ 直接当超参调"
    ]
  },
  {
    h: "两个坑",
    lvl: 1,
    p: "第一，PCA 前必须中心化，否则第一主成分会被均值方向吃掉；第二，线性降维抓不到非线性结构，硬上只会把簇压扁，这种情况要换自编码器或核方法，但核方法在样本量大时不可扩展。"
  }
];

const WHAT_ANS = [
  {
    p: "规则系统是“人先把判断写清楚”，机器学习是“人只给数据和目标，判断由模型自己拟合出来”。前者在需求稳定、规则能枚举的场景依然更划算；后者的价值在于规则写不出来、或者规则每天都在变的场景。"
  },
  {
    p: "更实际的区别在维护方式：规则错了去改 if，模型错了得回头查数据、标签和特征。所以上机器学习的隐形成本不在训练，而在数据管线和线上监控；如果这两样没人管，用规则往往更稳。"
  }
];

function patch(deckFile, qaId, ans, marker) {
  const file = path.join(DECKS, deckFile);
  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const qa = (deck.qas || []).find((q) => q.id === qaId);
  if (!qa) {
    console.error("找不到问答：" + deckFile + " / " + qaId);
    process.exit(1);
  }
  const already = qa.ans && qa.ans.length === ans.length &&
    qa.ans.every((a, i) => (a.h || "") === (ans[i].h || "") && a.p === ans[i].p);
  if (already) {
    console.log("· 已是最新：" + deckFile + " / " + qaId);
  } else {
    qa.ans = JSON.parse(JSON.stringify(ans));
    fs.writeFileSync(file, JSON.stringify(deck, null, 2) + "\n", "utf8");
    console.log("✓ 改写：" + deckFile + " / " + qaId + "（" + marker + "）");
  }
  /* 同步到 APK 资源目录 */
  const asset = path.join(ASSETS, deckFile);
  if (fs.existsSync(path.dirname(asset))) {
    const cur = fs.existsSync(asset) ? fs.readFileSync(asset, "utf8") : "";
    const next = fs.readFileSync(file, "utf8");
    if (cur !== next) {
      fs.writeFileSync(asset, next, "utf8");
      console.log("  ↳ 同步 assets/decks/" + deckFile);
    }
  }
}

patch("ml-math.json", "q.m2.svd", SVD_ANS, "三级标题 + list");
patch("ml-intro.json", "q.m1.what", WHAT_ANS, "无标题两段");
console.log("完成。");

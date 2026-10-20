#!/usr/bin/env node
/* 把 docs/deck-protocol.src.md 拆成三册：protocol-core / deck-protocol / plan-protocol
 * 章节号沿用总编号（不重排），跨册引用自动加前缀（deck §1.7 / plan §9 / core §2）。
 * 幂等：可反复运行；源文件是 docs/deck-protocol.src.md。
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const origPath = path.join(docs, "deck-protocol.md");
const srcPath = path.join(docs, "deck-protocol.src.md");
if (!fs.existsSync(srcPath)) fs.copyFileSync(origPath, srcPath);

const lines = fs.readFileSync(srcPath, "utf8").split(/\r?\n/);
function idx(re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  throw new Error("找不到章节：" + re);
}
const cuts = {
  intro: idx(/^本协议定义/),
  s0: idx(/^## 0\. /),
  s1: idx(/^## 1\. /),
  s2: idx(/^## 2\. /),
  s3: idx(/^## 3\. /),
  s4: idx(/^## 4\. /),
  s5: idx(/^## 5\. /),
  s6: idx(/^## 6\. /),
  s7: idx(/^## 7\. /),
  s8: idx(/^## 8\. /),
  s9: idx(/^## 9\. /),
  s10: idx(/^## 10\. /),
  app: idx(/^## 附录 A/),
};

/* 跨册引用加前缀：本册没有的 §x 一律标明在哪一册 */
const CORE_SECS = ["0", "2", "3", "4", "5", "10"];
const DECK_SECS = ["0", "1", "6", "7", "8"];
const PLAN_SECS = ["9"];
function xlink(text, self) {
  const home = self === "core" ? CORE_SECS : self === "deck" ? DECK_SECS : PLAN_SECS;
  const prefix = { core: "core", deck: "deck", plan: "plan" };
  return text.replace(/§(\d+)(?:\.(\d+))?/g, (m, a, b) => {
    if (home.indexOf(a) >= 0) return m; // 本册章节原样保留
    const owner = DECK_SECS.indexOf(a) >= 0 ? "deck" : PLAN_SECS.indexOf(a) >= 0 ? "plan" : "core";
    return prefix[owner] + " " + m;
  });
}
const slice = (a, b) => xlink(lines.slice(a, b).join("\n").replace(/\s+$/, "") + "\n", cur);
let cur = "core";

const nav = [
  "## 三册导览",
  "",
  "协议自 v1.7 起拆成三册，**章节号沿用总编号不重排**，所以旧链接里的 §9 依然是 §9，只是住进了计划册。",
  "",
  "| 册 | 文件 | 章节 | 读者 |",
  "| --- | --- | --- | --- |",
  "| 总纲 | `docs/protocol-core.md` | §0 边界、§2 进度层、§3 同步层、§4 校验器、§5 版本与兼容、§10 掌握度同步、附录 A 字段速查 | 所有人；改任何一册前先读这册 |",
  "| 知识包 | `docs/deck-protocol.md` | §0 快速示例、§1 内容层、§6 制作步骤、§7 数学公式、§8 跨包引用 | 写内容、做包的人 |",
  "| 学习计划 | `docs/plan-protocol.md` | §9 学习计划 | 分发计划、做计划 UI 的人 |",
  "",
  "**版本号只在总纲定义**（§5.1）。另两册的修订必须同步在总纲修订表里加一行，写清影响哪一册；三册共用同一个版本号。",
  "**错误码只在总纲定义**（§4 之后那张表）。校验器报出的码，含义一律以总纲为准。",
  "",
].join("\n");

cur = "core";
const core = [
  "# 题台 · 协议总纲（core）\n",
  nav,
  "---\n",
  "## 0. 这份协议管什么\n",
  slice(cuts.intro, cuts.s0),
  slice(cuts.s2, cuts.s3),
  slice(cuts.s3, cuts.s4),
  slice(cuts.s4, cuts.s5),
  slice(cuts.s5, cuts.s6),
  slice(cuts.s10, cuts.app),
  slice(cuts.app, lines.length),
].join("\n");

cur = "deck";
const deck = [
  "# 题台 · 知识包协议（deck）\n",
  "本册讲**一个学习包文件长什么样**：内容层（模块 / 知识点 / 问答 / 答案 / 公式 / 跨包引用）。",
  "进度、同步、校验、版本、掌握度这些跨包的东西在 `docs/protocol-core.md`；学习计划在 `docs/plan-protocol.md`。",
  "章节号沿用总编号，所以本册是 §0、§1、§6、§7、§8。\n",
  "---\n",
  slice(cuts.s0, cuts.s1),
  slice(cuts.s1, cuts.s2),
  slice(cuts.s6, cuts.s7),
  slice(cuts.s7, cuts.s8),
  slice(cuts.s8, cuts.s9),
].join("\n");

cur = "plan";
const plan = [
  "# 题台 · 学习计划协议（plan）\n",
  "本册讲**学习计划文件**：它把若干学习包排成一条学习路径，并决定手机端顶部能一键切换哪几个包。",
  "计划文件是普通 JSON，可以自己写、发给别人、放到电脑上同步。",
  "包内结构见 `docs/deck-protocol.md`，进度与合并规则见 `docs/protocol-core.md`。",
  "章节号沿用总编号，所以本册只有 §9。\n",
  "---\n",
  slice(cuts.s9, cuts.s10),
].join("\n");

fs.writeFileSync(path.join(docs, "protocol-core.md"), core);
fs.writeFileSync(path.join(docs, "deck-protocol.md"), deck);
fs.writeFileSync(path.join(docs, "plan-protocol.md"), plan);
console.log("core", core.split("\n").length, "deck", deck.split("\n").length, "plan", plan.split("\n").length);

#!/usr/bin/env node
/* 一次性整理：cv 改名、写两个学习计划、同步到 assets。可重复执行。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECKS = path.join(ROOT, "decks");
const ASSET_DECKS = path.join(ROOT, "app", "src", "main", "assets", "decks");
const ASSET_PLANS = path.join(ROOT, "app", "src", "main", "assets", "plans");
const PLANS = path.join(ROOT, "plans");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, o) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o, null, 1) + "\n", "utf8");
};

/* 1. cv-graphics 改名：计算机图形学 */
const cv = read(path.join(DECKS, "cv-graphics.json"));
cv.title = "计算机图形学 · 图形与渲染";
cv.meta = Object.assign({}, cv.meta, { short: "计算机图形学" });
cv.terms = { group: "模块", check: "知识点", qa: "问答" };
write(path.join(DECKS, "cv-graphics.json"), cv);

/* 2. 术语统一：所有包都用 模块 / 知识点 / 问答；顺带把简称理顺 */
const SHORT = {
  "cs-base": "计算机基础",
  "cv-graphics": "计算机图形学",
  "ue5-pcg": "UE5 PCG",
  "ml-math": "数学基础",
  "ml-intro": "机器学习入门",
};
["cs-base", "cv-graphics", "ue5-pcg", "ml-intro", "ml-math"].forEach((id) => {
  const p = path.join(DECKS, id + ".json");
  if (!fs.existsSync(p)) return;
  const d = read(p);
  d.terms = { group: "模块", check: "知识点", qa: "问答" };
  d.meta = Object.assign({}, d.meta, { short: SHORT[id] || d.meta && d.meta.short });
  /* 标题里的「模块X · 第 N 章 · 」这种双前缀也一并压掉 */
  d.groups.forEach((g, i) => {
    const t = String(g.title)
      .replace(/^模块[一二三四五六七八九十]+\s*·\s*/, "")
      .replace(/^第\s*\d+\s*章\s*·\s*/, "")
      .trim();
    const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
      "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
    g.title = "模块" + (CN[i + 1] || String(i + 1)) + " · " + t;
  });
  write(p, d);
});

/* 3. 两个学习计划 */
const planMl = {
  schema: 1,
  id: "ml",
  title: "机器学习入门",
  subtitle: "数学基础 → 机器学习主线：先把线性代数、概率、优化、信息论打好，再进模型与工程",
  members: ["ml-math", "ml-intro"],
  primary: "ml-intro",
  order: 1,
};
const planCs = {
  schema: 1,
  id: "cs-cg-ue5",
  title: "计算机基础 · 图形学 · UE5 PCG",
  subtitle: "基础 → 图形 → PCG：面试主线",
  members: ["cs-base", "cv-graphics", "ue5-pcg"],
  primary: "cs-base",
  order: 2,
};
write(path.join(PLANS, "ml.plan.json"), planMl);
write(path.join(PLANS, "cs-cg-ue5.plan.json"), planCs);
/* 旧的四包计划删掉 */
const old = path.join(PLANS, "ue5-ml.plan.json");
if (fs.existsSync(old)) fs.unlinkSync(old);

/* 4. 同步到 assets（demo 只给电脑端当示例，不随 APK 发） */
for (const f of fs.readdirSync(DECKS)) {
  if (!f.endsWith(".json") || f === "demo.json") continue;
  fs.mkdirSync(ASSET_DECKS, { recursive: true });
  fs.copyFileSync(path.join(DECKS, f), path.join(ASSET_DECKS, f));
}
const stale = path.join(ASSET_DECKS, "demo.json");
if (fs.existsSync(stale)) fs.unlinkSync(stale);
/* 内置计划：只放这两个 */
if (fs.existsSync(ASSET_PLANS)) {
  for (const f of fs.readdirSync(ASSET_PLANS)) {
    if (f.endsWith(".json")) fs.unlinkSync(path.join(ASSET_PLANS, f));
  }
}
fs.mkdirSync(ASSET_PLANS, { recursive: true });
for (const f of fs.readdirSync(PLANS)) {
  if (!f.endsWith(".json")) continue;
  fs.copyFileSync(path.join(PLANS, f), path.join(ASSET_PLANS, f));
}

console.log("已整理：cv 改名、术语统一、两个计划、assets 同步");
for (const id of ["cs-base", "cv-graphics", "ue5-pcg", "ml-math", "ml-intro"]) {
  const d = read(path.join(DECKS, id + ".json"));
  const c = d.groups.reduce((n, g) => n + g.checks.length, 0);
  console.log(`  ${id.padEnd(12)} 模块 ${d.groups.length} · 知识点 ${c} · 问答 ${d.qas.length} · ${d.title}`);
}

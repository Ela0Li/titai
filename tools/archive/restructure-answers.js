#!/usr/bin/env node
/* restructure-answers.js — 按「体裁」重排问答答案（协议 v1.5 的自由结构）
 *
 *   node tools/restructure-answers.js            # 应用补丁表
 *   node tools/restructure-answers.js --check    # 只报告哪些还没应用
 *
 * 补丁数据放在 tools/answers-patches.json，脚本只负责应用与校验：
 *   { "<deckId>": { "<qaId>": [ { h, lvl?, p, list? }, ... ] } }
 *
 * 为什么是后处理而不是直接改源文件：
 *   decks/*.json 由生成/拆分脚本产出（tools/build-ml-math.js、tools/split-deck.js …），
 *   直接手改会被下次重建覆盖。补丁表幂等，重建后重跑一次即可恢复。
 *
 * 结构约定（内容约定，不是协议强制）：
 *   操作型（怎么处理/怎么选/怎么排查）→ 一句话 / 分几步(list) / 边界或坑 / 落地
 *   对比型（A 与 B 的区别）          → 一句话 / 关键差异(list) / 怎么选 / 边界
 *   概念型（是什么/为什么）          → 结论 / 机制 / 取舍 / 实战
 *   ｜一律：块正文至少 8 个字（校验器 E_ANS_P 的下限），带 list 的引导句也不能空。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECKS = path.join(ROOT, "decks");
const ASSETS = path.join(ROOT, "app", "src", "main", "assets", "decks");
const TABLE = path.join(ROOT, "tools", "answers-patches.json");

if (!fs.existsSync(TABLE)) {
  console.error("找不到补丁表：" + TABLE);
  process.exit(1);
}
const PATCH = JSON.parse(fs.readFileSync(TABLE, "utf8"));

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

let applied = 0;
let skipped = 0;
let missing = 0;
const checkOnly = process.argv.includes("--check");

for (const deckId of Object.keys(PATCH)) {
  const file = path.join(DECKS, deckId + ".json");
  if (!fs.existsSync(file)) {
    console.error("× 找不到学习包：" + file);
    missing++;
    continue;
  }
  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const byId = new Map((deck.qas || []).map((q) => [q.id, q]));
  let dirty = false;

  for (const qaId of Object.keys(PATCH[deckId])) {
    const qa = byId.get(qaId);
    if (!qa) {
      console.error("× 找不到问答：" + deckId + " / " + qaId);
      missing++;
      continue;
    }
    const target = PATCH[deckId][qaId];
    if (same(qa.ans, target)) { skipped++; continue; }
    if (checkOnly) { console.log("· 待应用：" + deckId + " / " + qaId); continue; }
    qa.ans = JSON.parse(JSON.stringify(target));
    dirty = true;
    applied++;
    console.log("✓ 重排：" + deckId + " / " + qaId + "（" + target.length + " 块）");
  }

  if (dirty) {
    const text = JSON.stringify(deck, null, 2) + "\n";
    fs.writeFileSync(file, text, "utf8");
    if (fs.existsSync(ASSETS)) {
      fs.writeFileSync(path.join(ASSETS, deckId + ".json"), text, "utf8");
      console.log("  ↳ 同步 assets/decks/" + deckId + ".json");
    }
  }
}

console.log("");
console.log("应用 " + applied + " · 已是目标结构 " + skipped + " · 缺失 " + missing);
if (missing) process.exit(1);

#!/usr/bin/env node
/* snapshot-patches.js — 把「已经改好的答案」固化成补丁表 tools/answers-patches.json
 *
 * 背景：restructure-answers.js 原本把补丁写在脚本里，一次 PowerShell 的
 * Set-Content 回写把脚本编码弄坏了（UTF-8 被当成本地代码页写回）。
 * 这之后改成「脚本只负责应用，数据放 JSON」，脚本再也不会因为体积大而难改。
 *
 * 用法：node tools/snapshot-patches.js <deckId>:<qaId> [<deckId>:<qaId> ...]
 *   会把当前 decks/<deckId>.json 里这些问答的 ans 原样写进补丁表（覆盖同名键）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECKS = path.join(ROOT, "decks");
const OUT = path.join(ROOT, "tools", "answers-patches.json");

const pairs = process.argv.slice(2).filter((a) => a.includes(":"));
if (!pairs.length) {
  console.error("用法：node tools/snapshot-patches.js ml-intro:q.m1.what ...");
  process.exit(1);
}

let table = {};
if (fs.existsSync(OUT)) {
  try { table = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { table = {}; }
}

for (const pair of pairs) {
  const [deckId, qaId] = pair.split(":");
  const file = path.join(DECKS, deckId + ".json");
  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const qa = (deck.qas || []).find((q) => q.id === qaId);
  if (!qa) { console.error("× 找不到 " + deckId + " / " + qaId); process.exitCode = 1; continue; }
  if (!table[deckId]) table[deckId] = {};
  table[deckId][qaId] = qa.ans;
  console.log("✓ 记入补丁表：" + deckId + " / " + qaId + "（" + qa.ans.length + " 块）");
}

fs.writeFileSync(OUT, JSON.stringify(table, null, 2) + "\n", "utf8");
const decks = Object.keys(table).length;
const total = Object.keys(table).reduce((n, k) => n + Object.keys(table[k]).length, 0);
console.log("");
console.log("补丁表：" + OUT);
console.log("  包 " + decks + " · 问答 " + total);

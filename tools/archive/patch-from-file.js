#!/usr/bin/env node
/* patch-from-file.js — 把补丁 JSON 合并进 answers-patches.json 并立刻应用
 *
 *   node tools/patch-from-file.js <patch.json>
 *
 * patch.json 形如 { "<deckId>": { "<qaId>": [ {h,lvl?,p,list?}, ... ] } }
 * 合并进 tools/answers-patches.json（同名键覆盖），然后跑一次 restructure-answers。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TABLE = path.join(ROOT, "tools", "answers-patches.json");
const src = process.argv[2];
if (!src) { console.error("用法：node tools/patch-from-file.js <patch.json>"); process.exit(1); }

const add = JSON.parse(fs.readFileSync(src, "utf8"));
const table = JSON.parse(fs.readFileSync(TABLE, "utf8"));

let n = 0;
for (const deckId of Object.keys(add)) {
  if (!table[deckId]) table[deckId] = {};
  for (const qaId of Object.keys(add[deckId])) {
    table[deckId][qaId] = add[deckId][qaId];
    n++;
  }
}
fs.writeFileSync(TABLE, JSON.stringify(table, null, 2) + "\n", "utf8");
console.log("合并 " + n + " 条进补丁表");

execFileSync(process.execPath, [path.join(ROOT, "tools", "restructure-answers.js")], { stdio: "inherit" });

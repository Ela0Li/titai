#!/usr/bin/env node
/* 一条命令跑完体检：自动判断是知识包还是学习计划，再调对应校验器 + 答案体检。
   用法：
     node scripts/check.js my-deck.json
     node scripts/check.js my.plan.json --decks ./decks
   退出码：0 全过；1 有错误；2 用法问题。
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const di = args.indexOf("--decks");
const decksDir = di >= 0 ? args[di + 1] : "";
const file = args.find((a, i) => !a.startsWith("-") && !(di >= 0 && i === di + 1));

if (!file) {
  console.log("用法：node scripts/check.js <deck.json | plan.json> [--decks <目录>]");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  console.log("✗ 不是合法 JSON：" + e.message);
  process.exit(1);
}

const here = __dirname;
const run = (script, argv) => {
  const r = spawnSync(process.execPath, [path.join(here, script)].concat(argv), { encoding: "utf8" });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return r.status === 0;
};

let ok = true;
if (Array.isArray(data.groups)) {
  ok = run("validate-deck.js", [file]) && ok;
  /* 答案体检只给线索，不参与通过与否（退出码恒为 0） */
  run("audit-answers.js", [file]);
} else if (Array.isArray(data.members)) {
  ok = run("validate-plan.js", [file].concat(decksDir ? ["--decks", decksDir] : [])) && ok;
} else {
  console.log("✗ 既不像知识包（没有 groups）也不像计划（没有 members）");
  process.exit(1);
}

console.log(ok ? "\n✓ 全部通过" : "\n✗ 还有问题，按上面的行号改完再跑一次");
process.exit(ok ? 0 : 1);

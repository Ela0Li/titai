#!/usr/bin/env node
/* 校验学习计划文件（协议 v1.3 §9）。
   用法：
     node tools/validate-plan.js plans/ml.plan.json
     node tools/validate-plan.js --with-decks plans/*.plan.json   （同时核对成员包是否都在 decks/ 里）
*/
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const problems = [];
const warnings = [];
const notes = [];

function bad(code, msg) { problems.push(code + " " + msg); }
function warn(code, msg) { warnings.push(code + " " + msg); }

function checkPlan(file, opts) {
  let p;
  try {
    p = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    bad("E_PLAN_JSON", "解析失败：" + e.message);
    return;
  }
  if (p.schema !== 1) bad("E_SCHEMA", "schema 必须是 1");
  if (!p.id || !ID_RE.test(p.id)) bad("E_PLAN_ID", "id 只能用 a-z 0-9 . _ -，2–64 字");
  if (!p.title || typeof p.title !== "string") bad("E_PLAN_TITLE", "缺 title");
  if (p.subtitle && typeof p.subtitle !== "string") bad("E_PLAN_SUB", "subtitle 必须是字符串");

  const m = Array.isArray(p.members) ? p.members : [];
  if (!m.length) bad("E_PLAN_MEMBERS", "members 至少要有一个知识包");
  const seen = new Set();
  m.forEach((id, i) => {
    if (typeof id !== "string" || !ID_RE.test(id)) bad("E_PLAN_MEMBER_ID", "members[" + i + "] 不是合法 id：" + id);
    if (seen.has(id)) bad("E_PLAN_MEMBER_DUP", "members 里重复：" + id);
    seen.add(id);
  });
  if (p.primary && !seen.has(p.primary)) bad("E_PLAN_PRIMARY", "primary 必须是 members 之一：" + p.primary);
  if (m.length > 12) warn("W_PLAN_BIG", "成员超过 12 个，手机端切包条会太长");

  /* 成员包是否存在 */
  if (opts.withDecks) {
    const dir = path.join(ROOT, "decks");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    const have = new Set(files.map((f) => path.basename(f, ".json")));
    m.forEach((id) => {
      if (!have.has(id)) bad("E_PLAN_MEMBER_MISSING", "decks/ 里没有这个包：" + id);
    });
  }

  const title = "学习计划：" + (p.title || "?") + "（" + (p.id || "?") + "）";
  console.log(title);
  console.log("  成员 " + m.length + "：" + m.join(" → ") + (p.primary ? "（默认 " + p.primary + "）" : ""));
}

function main() {
  const args = process.argv.slice(2);
  const opts = { withDecks: args.includes("--with-decks") };
  const files = args.filter((a) => !a.startsWith("-"));
  if (!files.length) {
    console.log("用法：node tools/validate-plan.js [--with-decks] plans/*.plan.json");
    process.exit(2);
  }
  files.forEach((f) => checkPlan(path.resolve(f), opts));

  if (warnings.length) {
    console.log("\nwarnings（" + warnings.length + "）");
    warnings.forEach((w) => console.log("  [W] " + w));
  }
  if (problems.length) {
    console.log("\nproblems（" + problems.length + "）");
    problems.forEach((x) => console.log("  [E] " + x));
    console.log("\n✗ 未通过");
    process.exit(1);
  }
  if (notes.length) notes.forEach((n) => console.log("  · " + n));
  console.log("\n✓ 计划通过校验");
}

main();

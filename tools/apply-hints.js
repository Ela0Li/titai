#!/usr/bin/env node
/* 把 tools/hints/<deck>.json 里的「及格线」提示写进 decks/*.json 和 assets/decks/*.json。
 *
 * 用法：
 *   node tools/apply-hints.js              # 全部写入并报告
 *   node tools/apply-hints.js --check      # 只检查覆盖率与长度，不写文件
 *   node tools/apply-hints.js --deck ue5-pcg
 *
 * 重建过知识包（mkdeck / split-* / build-ml-math）之后都要重跑一次，
 * 因为 hint 是内容属性，藏在这些生成脚本之外。
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const hintDir = path.join(__dirname, "hints");
const deckDirs = [path.join(root, "decks"), path.join(root, "app", "src", "main", "assets", "decks")];

const argv = process.argv.slice(2);
const only = argv.includes("--deck") ? argv[argv.indexOf("--deck") + 1] : null;
const checkOnly = argv.includes("--check");

/* 先读全部提示，顺便自检 */
const hints = {};
let bad = 0;
for (const f of fs.readdirSync(hintDir)) {
  if (!f.endsWith(".json")) continue;
  const deckId = f.replace(/\.json$/, "");
  if (only && only !== deckId) continue;
  const obj = JSON.parse(fs.readFileSync(path.join(hintDir, f), "utf8"));
  for (const [cid, hint] of Object.entries(obj)) {
    const t = String(hint).trim();
    if (t.length < 6 || t.length > 60 || /[\r\n]/.test(t)) {
      console.log("  ✗ 长度不合规 " + deckId + " " + cid + " (" + t.length + ")： " + t);
      bad++;
      continue;
    }
    (hints[deckId] = hints[deckId] || {})[cid] = t;
  }
}
if (bad) {
  console.log("\n有 " + bad + " 条不合规（6–60 字、不换行），先改再跑。");
  process.exit(1);
}

let totalMissing = 0;
for (const dir of deckDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const deckId of Object.keys(hints)) {
    const p = path.join(dir, deckId + ".json");
    if (!fs.existsSync(p)) continue;
    const deck = JSON.parse(fs.readFileSync(p, "utf8"));
    const map = hints[deckId];
    const used = new Set();
    let changed = 0;
    let missing = [];
    for (const g of deck.groups || []) {
      for (const c of g.checks || []) {
        const hint = map[c.id];
        if (hint) {
          used.add(c.id);
          if (c.hint !== hint) {
            /* 保持字段顺序：id / text / lvl / hint / seeAlso */
            if ("hint" in c) c.hint = hint;
            else {
              const rebuild = {};
              for (const k of Object.keys(c)) {
                rebuild[k] = c[k];
                if (k === "lvl") rebuild.hint = hint;
              }
              if (!("hint" in rebuild)) rebuild.hint = hint;
              for (const k of Object.keys(c)) delete c[k];
              Object.assign(c, rebuild);
            }
            changed++;
          }
        } else missing.push(c.id);
      }
    }
    const stale = Object.keys(map).filter((k) => !used.has(k));
    if (stale.length) console.log("  ! " + deckId + " 提示表里有不存在的 id：" + stale.join(", "));
    if (missing.length) {
      totalMissing += missing.length;
      console.log("  ! " + deckId + " 还缺 " + missing.length + " 条提示：" + missing.slice(0, 8).join(", ") + (missing.length > 8 ? " …" : ""));
    }
    if (!checkOnly && changed) {
      fs.writeFileSync(p, JSON.stringify(deck, null, 2) + "\n");
    }
    const n = (deck.groups || []).reduce((s, g) => s + (g.checks || []).length, 0);
    console.log("  " + (changed ? "✎" : "·") + " " + path.relative(root, p) + "  " + (n - missing.length) + "/" + n + " 条有提示" + (changed ? "，写入 " + changed + " 处" : ""));
  }
}

if (totalMissing) {
  console.log("\n共缺 " + totalMissing + " 条提示（写进 tools/hints/<deck>.json 后重跑）。");
  process.exit(checkOnly ? 1 : 0);
}
console.log("\n✓ 全部知识点都有「及格线」提示");

#!/usr/bin/env node
/**
 * 从 dist/deck.json 反向生成 pcg-doc/data/modules.js（源码格式）。
 * 用途：modules.js 是手写源文件、不在 git 里，万一被脚本写坏，可以用上一次
 * 构建出的 deck.json（在 studydeck 仓库里，有版本记录）还原出来。
 *
 *   node tools/gen-modules-src.js           # 输出到 ../pcg-doc/data/modules.js
 *   node tools/gen-modules-src.js --stdout  # 只打印
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, "..", "pcg-doc", "data", "modules.js");
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "deck.json"), "utf8"));
const q = (s) => JSON.stringify(String(s));

const blocks = [];
const head = "// 模块定义：signal=面试官真正在考察什么；keypoints=速览；traps=高频踩坑；checks=自查点";
deck.groups.forEach((g) => {
  const lines = [];
  lines.push("{");
  lines.push(
    "  id:" + q(g.id) + ", title:" + q(g.title) + ", short:" + q(g.short) +
      ", priority:" + q(g.priority) + ", stage:" + g.stage + ","
  );
  lines.push("  signal:" + q(g.signal || "") + ",");
  lines.push("  keypoints:[" + (g.keypoints || []).map(q).join(",") + "],");
  lines.push("  traps:[" + (g.traps || []).map(q).join(",") + "],");
  lines.push("  checks:[");
  (g.checks || []).forEach((c, i) => {
    const tail = i === g.checks.length - 1 ? "" : ",";
    lines.push("    {t:" + q(c.text) + ",lvl:" + q(c.lvl) + "}" + tail);
  });
  lines.push("  ]");
  lines.push("}");
  blocks.push(lines.join("\n"));
});

const out = head + "\nmodule.exports = [\n" + blocks.join(",\n") + "\n];\n";
if (process.argv.includes("--stdout")) process.stdout.write(out);
else {
  fs.writeFileSync(OUT, out, "utf8");
  console.log("已写出 " + OUT + "（" + deck.groups.length + " 个模块）");
}

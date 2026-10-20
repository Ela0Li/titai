#!/usr/bin/env node
/**
 * 重写 qa-*.js 的首行注释，让注释里的模块序号跟模块表一致。
 * 只改以「// 问答：」开头的第一行，其它注释与代码不动。
 */
const fs = require("fs");
const path = require("path");

const DATA = path.resolve(__dirname, "..", "..", "pcg-doc", "data");
const CN = ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];
const mods = new Map(
  require(path.join(DATA, "modules.js")).map((m) => [m.id, m.short])
);

const files = fs
  .readdirSync(DATA)
  .filter((f) => /^qa-\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

let changed = 0;
files.forEach((f) => {
  const file = path.join(DATA, f);
  const text = fs.readFileSync(file, "utf8");
  const ids = [];
  for (const m of text.matchAll(/m:"(m\d+)"/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  const label = ids
    .map((id) => "模块" + CN[Number(id.slice(1)) - 1] + " " + (mods.get(id) || ""))
    .join("、");

  const out = text.replace(/^\/\/ 问答：.*$/m, "// 问答：" + label);
  if (out !== text) {
    fs.writeFileSync(file, out, "utf8");
    changed++;
  }
});
console.log("已更新 " + changed + "/" + files.length + " 个文件的首行注释");

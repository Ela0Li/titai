#!/usr/bin/env node
/**
 * 一次性迁移：把 UE5 学习包的模块顺序重排，并把 id / 标题序号 / 问答 id /
 * covers / next / peer 全部改成与新顺序一致。
 *
 * 为什么连 id 一起改：模块号同时出现在
 *   - 模块 id          m1 → m3
 *   - 写死的标题序号   "模块一 · C++ 语言机制" → "模块三 · …"
 *   - 自查点 id        m1.1 → m3.1（由模块 id 派生）
 *   - 问答 id          q.m1.types → q.m3.types
 *   - 引用             covers / next / peer
 * 只重排数组而不改 id，列表会变成“模块十五排第 3 个”，详情页还会出现
 * “模块十一 · 数学… · q.m15.prob”这种自相矛盾的标签。
 *
 *   node tools/reorder-modules.js --dry     # 只看会改成什么
 *   node tools/reorder-modules.js           # 真的写回
 *
 * 注意：进度是按自查点 id 存的，重排后旧进度对不上（UE5 包当时是 0%，无影响）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.resolve(ROOT, "..", "pcg-doc", "data");

/* 新顺序：用「旧 id」表达，脚本按这个顺序重新编号为 m1…m18 */
const NEW_ORDER = [
  "m1",  // C++ 语言机制
  "m2",  // STL 与容器
  "m4",  // 数据结构与算法
  "m5",  // 操作系统与并发
  "m6",  // 计算机网络
  "m3",  // 程序设计与软件工程
  "m7",  // 计算机图形学基础
  "m8",  // 现代渲染管线
  "m9",  // UE5 渲染与场景系统
  "m10", // UE5 PCG 系统核心
  "m15", // 数学与程序化生成算法
  "m16", // 工具链与工程化
  "m17", // 系统设计：可扩展 PCG 框架
  "m12", // PCG 综合实战
  "m11", // Bug 排查与性能优化
  "m13", // 高频面试问题自测
  "m18", // 追问链与压力题
  "m14", // 最终自查与面试准备
];

const CN = ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];

const dry = process.argv.includes("--dry");
const map = new Map(); // 旧 mN → 新 mK
NEW_ORDER.forEach((old, i) => map.set(old, "m" + (i + 1)));

function rewriteModuleBlock(block) {
  const oldId = (block.match(/id:"(m\d+)"/) || [])[1];
  const newId = map.get(oldId);
  if (!newId) throw new Error("未知模块 id：" + oldId);
  const n = Number(newId.slice(1));
  return block
    .replace(/id:"m\d+"/, 'id:"' + newId + '"')
    .replace(/title:"模块[^"]*? · /, "title:\"模块" + CN[n - 1] + " · ");
}

/* ---------- modules.js：切块 → 重排 → 改 id/标题 ---------- */
function reorderModules() {
  const file = path.join(DATA, "modules.js");
  const text = fs.readFileSync(file, "utf8");
  const headAt = text.indexOf('{\n  id:"');
  if (headAt < 0) throw new Error("modules.js 结构变了：找不到第一个模块对象");
  const head = text.slice(0, headAt);
  const body = text.slice(headAt).replace(/\s*$/, "");

  const blocks = body.split(/\n\},\n\{/);
  if (blocks.length !== NEW_ORDER.length)
    throw new Error("模块数对不上：文件里 " + blocks.length + " 个，NEW_ORDER " + NEW_ORDER.length + " 个");

  /* 每一块只保留块内内容（形如 "\n  id:\"m1\" …\n  ]"），首块去掉开头的 "{"，
     末块去掉收尾的 "}\n];" */
  const byId = new Map();
  blocks.forEach((b, i) => {
    let inner = i === 0 ? b.replace(/^\{/, "") : b;
    inner = inner.replace(/\n\}\n\];\s*$/, "");
    const id = (inner.match(/id:"(m\d+)"/) || [])[1];
    if (!id) throw new Error("第 " + (i + 1) + " 块找不到 id");
    byId.set(id, inner);
  });
  if (byId.size !== blocks.length) throw new Error("模块 id 有重复");

  const ordered = NEW_ORDER.map((old) => rewriteModuleBlock(byId.get(old) || ""));
  const out = head + ordered.map((s) => "{" + s + "}").join(",\n") + "\n];\n";
  if (!dry) fs.writeFileSync(file, out, "utf8");
  return { file, count: ordered.length };
}

/* ---------- qa-*.js：改 m / id / covers / next / peer ---------- */
function renumberQaFile(file) {
  const text = fs.readFileSync(file, "utf8");
  let out = text
    .replace(/q\.m(\d+)\./g, (s, n) => "q." + map.get("m" + n) + ".")
    .replace(/m:"m(\d+)"/g, (s, n) => 'm:"' + map.get("m" + n) + '"')
    .replace(/"m(\d+)\.(\d+)"/g, (s, n, k) => '"' + map.get("m" + n) + "." + k + '"');

  /* 首行注释 // 问答：模块十一 XXX，同步成本文第一个问答所属模块 */
  const first = out.match(/m:"(m\d+)"/);
  if (first) {
    const cn = CN[Number(first[1].slice(1)) - 1];
    out = out.replace(/^\/\/ 问答：模块[一二三四五六七八九十]+ /m, "// 问答：模块" + cn + " ");
  }
  if (!dry && out !== text) fs.writeFileSync(file, out, "utf8");
  return out !== text;
}

const mod = reorderModules();
const onlyModules = process.argv.includes("--only-modules");
const qaFiles = fs
  .readdirSync(DATA)
  .filter((f) => /^qa-\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

let touched = 0;
if (!onlyModules) {
  qaFiles.forEach((f) => {
    if (renumberQaFile(path.join(DATA, f))) touched++;
  });
}

console.log(
  (dry ? "[dry] " : "") +
    "模块重排 " + mod.count + " 个；问答文件改动 " + touched + "/" + qaFiles.length + " 个"
);
console.log("映射：" + NEW_ORDER.map((o) => o + "→" + map.get(o)).join("  "));

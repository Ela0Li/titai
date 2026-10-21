/* ⚠ 已停用（0.8.7 起）：内容以 decks/ml-intro.json 为准，直接编辑那份 JSON。
 * 这里的源停在 0.7.0（10 模块 / 60 知识点），跑一次会把现在的 9 模块 / 54 知识点版本覆盖掉，
 * 并丢掉 hint（及格线）等后加字段。保留只为说明当年内容是怎么生成的，别再执行。
 *
 * 构建 ml-intro 知识包：生成 studydeck/decks/ml-intro.json。
 * 不触碰 dist/deck.json 或 app/src/main/assets 下的内置包。
 */
const fs = require("fs");
const path = require("path");

const { meta, modules } = require("./modules.js");
const core = require("./qa-core.js");
const advanced = require("./qa-advanced.js");

const allQa = [...core, ...advanced];
const errors = [];

function fail(msg) {
  errors.push(msg);
}

/* ---------- 1. 生成 group 与 check id ---------- */
const groups = modules.map((m) => {
  const checks = m.checks.map(([text, lvl, seeAlso], i) => ({
    id: `${m.id}.${i + 1}`,
    text,
    lvl,
    ...(seeAlso && seeAlso.length ? { seeAlso } : {}),
  }));
  return {
    id: m.id,
    title: m.title,
    priority: m.priority,
    stage: m.stage,
    signal: m.signal,
    keypoints: m.keypoints,
    traps: m.traps,
    checks,
  };
});

const groupMap = new Map(groups.map((g) => [g.id, g]));
const checkMap = new Map();
for (const g of groups) {
  for (const c of g.checks) {
    if (checkMap.has(c.id)) fail(`重复 check id: ${c.id}`);
    checkMap.set(c.id, c);
  }
}

/* 跨包引用（协议 v1.2）：deckId#localId 不在本包内解析，交给 tools/check-links.js */
const isCross = (r) => typeof r === "string" && r.indexOf("#") >= 0;

/* ---------- 2. 基础 QA 覆盖检查 ---------- */
const qaMap = new Map();
const covered = new Map();
const baseQa = allQa.filter((q) => !q.id.startsWith("q.syn."));
const synthQa = allQa.filter((q) => q.id.startsWith("q.syn."));

for (const q of allQa) {
  if (!/^q\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/.test(q.id)) fail(`QA id 不合法: ${q.id}`);
  if (qaMap.has(q.id)) fail(`重复 QA id: ${q.id}`);
  qaMap.set(q.id, q);

  if (!groupMap.has(q.m)) fail(`${q.id}: m 指向不存在的 group ${q.m}`);
  if (!["P0", "P1", "P2"].includes(q.lvl)) fail(`${q.id}: lvl 非法`);
  if (![1, 2, 3, 4].includes(q.layer)) fail(`${q.id}: layer 非法`);
  if (!q.q || !/[？。]$/.test(q.q)) fail(`${q.id}: 问句缺少中文问号/句号`);
  if (!Array.isArray(q.ans) || q.ans.length < 1 || q.ans.length > 4) fail(`${q.id}: ans 数量非法`);

  const heads = ["结论", "机制", "取舍", "实战"];
  q.ans.forEach((a, i) => {
    if (a.h !== heads[i]) fail(`${q.id}: 第 ${i + 1} 段标题应为「${heads[i]}」，实际「${a.h}」`);
    if (typeof a.p !== "string") fail(`${q.id}: p 不是字符串`);
    else if (a.p.length < 8 || a.p.length > 1200) fail(`${q.id}: 第 ${i + 1} 段长度 ${a.p.length} 越界`);
    if (/<[a-zA-Z/][^>]*>/.test(a.p || "")) fail(`${q.id}: 含 HTML 标签`);
  });

  if (!Array.isArray(q.covers) || q.covers.length === 0) fail(`${q.id}: covers 为空`);
  for (const cid of q.covers || []) {
    if (isCross(cid)) continue;
    if (!checkMap.has(cid)) fail(`${q.id}: covers 指向不存在的 check ${cid}`);
    if (q.id.startsWith("q.syn.")) continue;
    covered.set(cid, (covered.get(cid) || 0) + 1);
  }

  for (const key of ["next", "peer"]) {
    for (const other of q[key] || []) {
      if (other === q.id) fail(`${q.id}: ${key} 指向自身`);
      if (new Set(q[key]).size !== (q[key] || []).length) fail(`${q.id}: ${key} 有重复`);
    }
  }
}

for (const c of checkMap.keys()) {
  if ((covered.get(c) || 0) !== 1) fail(`check ${c} 被基础 QA 覆盖 ${covered.get(c) || 0} 次，应为 1 次`);
}
if (baseQa.length !== checkMap.size) fail(`基础 QA 数量 ${baseQa.length} 与 check 数量 ${checkMap.size} 不一致`);

/* ---------- 3. 引用与层级检查 ---------- */
for (const q of allQa) {
  for (const key of ["next", "peer"]) {
    for (const other of q[key] || []) {
      if (!qaMap.has(other)) {
        if (isCross(other)) continue; // 跨包引用，交给 check-links.js
        fail(`${q.id}: ${key} 指向不存在的 QA ${other}`);
        continue;
      }
      if (key === "next" && qaMap.get(other).layer < q.layer) {
        fail(`${q.id}(${q.layer}) -> next ${other}(${qaMap.get(other).layer}) 层级回退`);
      }
    }
  }
}

/* ---------- 4. 反向链接 ---------- */
const backNext = new Map();
const backPeer = new Map();
for (const q of allQa) {
  for (const target of q.next || []) {
    if (!backNext.has(target)) backNext.set(target, []);
    backNext.get(target).push(q.id);
  }
  for (const target of q.peer || []) {
    if (!backPeer.has(target)) backPeer.set(target, []);
    backPeer.get(target).push(q.id);
  }
}

/* ---------- 5. 组装输出 ---------- */
const qas = allQa.map((q) => {
  const out = {
    id: q.id,
    m: q.m,
    lvl: q.lvl,
    layer: q.layer,
    q: q.q,
    tags: q.tags || [],
    covers: q.covers,
  };
  if (q.next && q.next.length) out.next = q.next;
  if (q.peer && q.peer.length) out.peer = q.peer;
  if (backNext.has(q.id)) out.backNext = [...new Set(backNext.get(q.id))];
  if (backPeer.has(q.id)) out.backPeer = [...new Set(backPeer.get(q.id))];
  out.ans = q.ans;
  return out;
});

const deck = {
  schema: 1,
  id: meta.id,
  title: meta.title,
  subtitle: `${groups.length} 章 · ${checkMap.size} 个知识点 · ${qas.length} 条问答`,
  accent: meta.accent,
  terms: meta.terms,
  updatedAt: "2026-10-21",
  groups,
  qas,
};

if (errors.length) {
  console.error(`构建失败，共 ${errors.length} 个问题：`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

const outPath = path.resolve(__dirname, "../../decks/ml-intro.json");
fs.writeFileSync(outPath, JSON.stringify(deck, null, 2) + "\n", "utf8");

console.log(`已生成 ${outPath}`);
console.log(`groups=${groups.length} checks=${checkMap.size} qas=${qas.length} (base=${baseQa.length}, syn=${synthQa.length})`);
console.log(`coverage=${covered.size}/${checkMap.size}; backNext=${backNext.size}; backPeer=${backPeer.size}`);

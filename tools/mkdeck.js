#!/usr/bin/env node
/**
 * 把 pcg-doc/data/*.js（复习文档的数据源）编译成学习包。
 * 产物：
 *   dist/deck.json                 唯一的真相，可读/可 diff/可同步
 *   app/src/main/assets/deck.js    window.DECK = {...}，供 WebView 直接 <script> 加载
 *
 * 用法：
 *   node tools/mkdeck.js                          # 用默认数据源 ../pcg-doc/data
 *   node tools/mkdeck.js decks/ue5-pcg           # 指定任意数据源目录（换学习目标时用）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(ROOT, "..", "pcg-doc", "data");

function loadModules() {
  return require(path.join(DATA, "modules.js"));
}

function loadQAs() {
  const files = fs
    .readdirSync(DATA)
    .filter((f) => /^qa-\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const out = [];
  for (const f of files) {
    const arr = require(path.join(DATA, f));
    if (!Array.isArray(arr)) throw new Error(f + " 不是数组");
    out.push(...arr);
  }
  return out;
}

function build() {
  const modules = loadModules();
  const qas = loadQAs();

  const groups = modules.map((m) => ({
    id: m.id,
    title: m.title,
    short: m.short,
    priority: m.priority,
    stage: m.stage,
    signal: m.signal,
    keypoints: m.keypoints || [],
    traps: m.traps || [],
    checks: (m.checks || []).map((c, i) => ({
      id: m.id + "." + (i + 1),
      text: c.t,
      lvl: c.lvl,
      ...(c.seeAlso && c.seeAlso.length ? { seeAlso: c.seeAlso } : {}),
    })),
  }));

  // 数据源可选 meta.json：换学习目标时只改这一个文件
  let meta = { id: "ue5-pcg", title: "UE5 PCG 面试复习", subtitle: "层层递进的问题网络 × 全量自查覆盖", accent: "#2f81f7" };
  const metaFile = path.join(DATA, "meta.json");
  if (fs.existsSync(metaFile)) {
    try { meta = Object.assign(meta, JSON.parse(fs.readFileSync(metaFile, "utf8"))); } catch (e) {}
  }

  const deck = {
    schema: 1,
    id: meta.id,
    title: meta.title,
    subtitle: meta.subtitle,
    accent: meta.accent,
    // 界面上怎么称呼这些东西；本包保留“自查点”的说法（协议默认是“知识点”）
    terms: meta.terms || { group: "模块", check: "自查点", qa: "问答" },
    ...(meta.deps ? { deps: meta.deps } : {}),
    updatedAt: new Date().toISOString(),
    groups,
    qas,
  };

  const checkIds = new Set(groups.flatMap((g) => g.checks.map((c) => c.id)));
  const qaIds = new Set(qas.map((q) => q.id));

  // 覆盖率自检：每个自查点至少被一条问答覆盖，所有引用必须存在
  const problems = [];
  const covered = new Set();
  /* 跨包引用（v1.2）：deckId#localId 不在本包内解析，交给 check-links.js */
  const isCross = (r) => typeof r === "string" && r.indexOf("#") >= 0;

  for (const q of qas) {
    for (const c of q.covers || []) {
      if (isCross(c)) continue;
      if (!checkIds.has(c)) problems.push(q.id + " 覆盖了不存在的自查点 " + c);
      covered.add(c);
    }
    for (const k of ["next", "peer"]) {
      for (const r of q[k] || []) {
        if (isCross(r)) continue;
        if (!qaIds.has(r)) problems.push(q.id + "." + k + " 指向不存在的问题 " + r);
      }
    }
  }
  const uncovered = [...checkIds].filter((c) => !covered.has(c));
  const dupQa = qas.length - qaIds.size;

  // 反向引用（被谁追问 / 被谁交叉引用）
  const back = { next: {}, peer: {} };
  for (const q of qas) {
    for (const k of ["next", "peer"]) {
      for (const r of q[k] || []) {
        (back[k][r] = back[k][r] || []).push(q.id);
      }
    }
  }
  for (const q of qas) {
    q.backNext = back.next[q.id] || [];
    q.backPeer = back.peer[q.id] || [];
  }

  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const json = JSON.stringify(deck, null, 1);
  fs.writeFileSync(path.join(ROOT, "dist", "deck.json"), json + "\n", "utf8");

  const assets = path.join(ROOT, "app", "src", "main", "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(
    path.join(assets, "deck.js"),
    "/* 由 tools/mkdeck.js 生成，请勿手改 */\nwindow.DECK = " + json + ";\n",
    "utf8"
  );
  // 多包共存：每份 deck 以独立 JSON 放在 assets/decks/<id>.json，
  // 引擎启动时通过 Native.listDecks()/readDeck(id) 选择要用的那份
  const deckAssets = path.join(assets, "decks");
  fs.mkdirSync(deckAssets, { recursive: true });
  fs.writeFileSync(path.join(deckAssets, deck.id + ".json"), json + "\n", "utf8");

  const stats = {
    groups: groups.length,
    checks: checkIds.size,
    qas: qas.length,
    covered: covered.size,
    coverage: ((covered.size / checkIds.size) * 100).toFixed(1) + "%",
    edges:
      qas.reduce((n, q) => n + (q.next || []).length + (q.peer || []).length, 0),
    dupQa,
    uncovered: uncovered.slice(0, 20),
    problems: problems.slice(0, 20),
    bytes: Buffer.byteLength(json, "utf8"),
  };
  console.log(JSON.stringify(stats, null, 1));
  if (problems.length || uncovered.length) {
    process.exitCode = 1;
  }
}

build();

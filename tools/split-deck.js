#!/usr/bin/env node
/* 把一个学习包按模块（group id）拆成两个包，并重编号 + 重写引用（协议 v1.2/v1.3）。
   用法：
     node tools/split-deck.js --src decks/ml-intro.json --take m2 \
          --id ml-math --title "机器学习数学基础" --short "数学基础" \
          --out decks/ml-math.json --rest-out decks/ml-intro.json
   - --take 可以是逗号分隔的多个 group id
   - 两个输出都会从 m1 起重新编号，check = mN.i，qa = q.mN.<原名>
   - 跨包的 covers/next/peer/backNext/seeAlso 会写成 deckId#id 并记入 meta.deps
*/
"use strict";
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const ROOT = path.resolve(__dirname, "..");
const SRC = path.resolve(ROOT, arg("src", ""));
const TAKE = String(arg("take", "")).split(",").map((s) => s.trim()).filter(Boolean);
const NEW_ID = arg("id", "split");
const NEW_TITLE = arg("title", NEW_ID);
const NEW_SHORT = arg("short", NEW_TITLE);
const OUT = path.resolve(ROOT, arg("out", "decks/" + NEW_ID + ".json"));
const REST_OUT = arg("rest-out", "") ? path.resolve(ROOT, arg("rest-out", "")) : "";

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const qaName = (oldId) => oldId.replace(/^q\.[^.]+\./, "");

/* 1. 分派模块 */
const takeSet = new Set(TAKE);
const groupsA = src.groups.filter((g) => takeSet.has(g.id));
const groupsB = src.groups.filter((g) => !takeSet.has(g.id));
if (!groupsA.length) throw new Error("--take 没有命中任何模块");
if (!groupsB.length) throw new Error("拆完就没有剩余模块了");

/* 2. 旧 id → 新 id 映射（check/qa 跟着模块走） */
const map = new Map(); // oldId -> { deck, id }
function planGroups(groups, deckId) {
  groups.forEach((g, gi) => {
    const ng = "m" + (gi + 1);
    map.set(g.id, { deck: deckId, id: ng });
    (g.checks || []).forEach((c, ci) => map.set(c.id, { deck: deckId, id: ng + "." + (ci + 1) }));
    src.qas
      .filter((q) => q.m === g.id)
      .forEach((q) => map.set(q.id, { deck: deckId, id: "q." + ng + "." + qaName(q.id) }));
  });
}
planGroups(groupsA, NEW_ID);
planGroups(groupsB, src.id);

/* 3. 引用重写 */
function mkRewrite(selfId, deps) {
  return function (ref) {
    if (typeof ref === "string" && ref.indexOf("#") > 0) {
      deps.add(ref.slice(0, ref.indexOf("#")));
      return ref;
    }
    const hit = map.get(ref);
    if (!hit) throw new Error("引用无法映射：" + ref + "（来自 " + selfId + "）");
    if (hit.deck === selfId) return hit.id;
    deps.add(hit.deck);
    return hit.deck + "#" + hit.id;
  };
}

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
function cn(n) { return CN[n] || String(n); }
function stripPrefix(t) {
  return String(t).replace(/^(模块|第)[一二三四五六七八九十0-9]+\s*(模块|章)?\s*[·、.．]?\s*/, "").trim();
}

const TERMS = { group: "模块", check: "知识点", qa: "问答" };

function build(groups, deckId, title, short, metaExtra) {
  const deps = new Set();
  const rw = mkRewrite(deckId, deps);
  const out = groups.map((g, gi) => {
    const ng = "m" + (gi + 1);
    return {
      id: ng,
      title: "模块" + cn(gi + 1) + " · " + stripPrefix(g.title).replace(/^·\s*/, ""),
      priority: g.priority,
      stage: g.stage,
      signal: g.signal,
      keypoints: g.keypoints || [],
      traps: g.traps || [],
      checks: (g.checks || []).map((c, ci) => {
        const o = { id: ng + "." + (ci + 1), text: c.text, lvl: c.lvl };
        if (c.seeAlso && c.seeAlso.length) o.seeAlso = c.seeAlso.map(rw);
        return o;
      }),
    };
  });
  const qas = [];
  groups.forEach((g) => {
    src.qas
      .filter((q) => q.m === g.id)
      .forEach((q) => {
        const o = {
          id: map.get(q.id).id,
          m: map.get(g.id).id,
          lvl: q.lvl,
          layer: q.layer,
          q: q.q,
          tags: q.tags || [],
          covers: (q.covers || []).map(rw),
        };
        ["next", "peer", "backNext"].forEach((k) => {
          if (q[k] && q[k].length) o[k] = q[k].map(rw);
        });
        o.ans = q.ans;
        qas.push(o);
      });
  });
  const deck = {
    schema: 1,
    id: deckId,
    title: title,
    terms: TERMS,
    meta: Object.assign({ updated: (src.meta && src.meta.updated) || "" }, metaExtra, { short: short }),
    groups: out,
    qas: qas,
  };
  if (deps.size) deck.meta.deps = Array.from(deps).sort();
  return deck;
}

const deckA = build(groupsA, NEW_ID, NEW_TITLE, NEW_SHORT, { splitFrom: src.id });
const deckB = build(groupsB, src.id, src.title, (src.meta && src.meta.short) || src.title, {
  splitOff: NEW_ID,
});

function stat(d) {
  const checks = d.groups.reduce((n, g) => n + g.checks.length, 0);
  return `模块 ${d.groups.length} · 知识点 ${checks} · 问答 ${d.qas.length}` +
    (d.meta.deps ? " · deps " + d.meta.deps.join(",") : "");
}

retitleFixed(deckB);

function retitleFixed(d) {
  /* 保留原有 title 文案，只重编号 */
  void d;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(deckA, null, 1) + "\n", "utf8");
console.log(path.relative(ROOT, OUT) + "  " + stat(deckA));
if (REST_OUT) {
  fs.writeFileSync(REST_OUT, JSON.stringify(deckB, null, 1) + "\n", "utf8");
  console.log(path.relative(ROOT, REST_OUT) + "  " + stat(deckB));
}

#!/usr/bin/env node
/**
 * check-links.js — 跨包引用检查（协议 v1.2 §8）
 *
 *   node tools/check-links.js dist/deck.json decks/ml-intro.json
 *   node tools/check-links.js deck-*.json --json
 *
 * 单包校验器只能查包内闭环；跨包引用必须两个包都在场才能判断。
 * 这里把多个 deck.json 一起读进来，输出：已解析 / 目标已删（失效）/ 目标包未装 / 跨包环 / 依赖缺失。
 *
 * 退出码：0 = 全部解析成功；1 = 有失效或未装（CI 用它当闸门）。
 */
const fs = require("fs");
const path = require("path");

const RE_CROSS = /^(?:([a-z0-9][a-z0-9-]{1,40})#)([A-Za-z0-9_.:-]+)$/;

function load(file) {
  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const qas = new Map();
  const checks = new Map();
  (deck.groups || []).forEach((g) => (g.checks || []).forEach((c) => checks.set(c.id, c)));
  (deck.qas || []).forEach((q) => qas.set(q.id, q));
  return { file, deck, qas, checks };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const files = argv.filter((a) => !a.startsWith("-")).map((a) => path.resolve(a));
  if (!files.length) {
    console.error("用法：node tools/check-links.js <deck1.json> [deck2.json ...] [--json]");
    process.exit(2);
  }

  const decks = files.map(load);
  const byId = new Map(decks.map((d) => [d.deck.id, d]));

  const rows = [];
  const cycles = [];

  const refsOf = (d) => {
    const out = [];
    (d.deck.qas || []).forEach((q) => {
      ["covers", "next", "peer"].forEach((k) =>
        (q[k] || []).forEach((ref) => out.push({ from: q.id, field: k, ref }))
      );
    });
    (d.deck.groups || []).forEach((g) =>
      (g.checks || []).forEach((c) =>
        (c.seeAlso || []).forEach((ref) => out.push({ from: c.id, field: "seeAlso", ref }))
      )
    );
    return out;
  };

  /* 跨包边：qa → qa（用于找环） */
  const edges = new Map(); // "deck#qa" -> Set("deck#qa")

  decks.forEach((d) => {
    const own = d.deck.id;
    refsOf(d).forEach((r) => {
      if (typeof r.ref !== "string" || r.ref.indexOf("#") < 0) return;
      const m = RE_CROSS.exec(r.ref);
      if (!m) {
        rows.push({ deck: own, from: r.from, field: r.field, ref: r.ref, status: "bad-syntax" });
        return;
      }
      const [, targetDeck, targetId] = m;
      if (targetDeck === own) {
        rows.push({ deck: own, from: r.from, field: r.field, ref: r.ref, status: "self-deck" });
        return;
      }
      const t = byId.get(targetDeck);
      if (!t) {
        rows.push({ deck: own, from: r.from, field: r.field, ref: r.ref, status: "missing-deck" });
        return;
      }
      const exists = targetId.startsWith("q.") ? t.qas.has(targetId) : t.checks.has(targetId);
      rows.push({ deck: own, from: r.from, field: r.field, ref: r.ref, status: exists ? "ok" : "stale" });

      if (exists && r.field === "next" && r.from.startsWith("q.")) {
        const a = own + "#" + r.from;
        const b = targetDeck + "#" + targetId;
        if (!edges.has(a)) edges.set(a, new Set());
        edges.get(a).add(b);
      }
    });
  });

  /* 两节点环：A#x → B#y 且 B#y → A#x */
  edges.forEach((set, a) => {
    set.forEach((b) => {
      const back = edges.get(b);
      if (back && back.has(a) && a < b) cycles.push([a, b]);
    });
  });

  const stat = {
    ok: rows.filter((r) => r.status === "ok").length,
    stale: rows.filter((r) => r.status === "stale").length,
    missingDeck: rows.filter((r) => r.status === "missing-deck").length,
    badSyntax: rows.filter((r) => r.status === "bad-syntax" || r.status === "self-deck").length,
    cross: rows.length,
  };

  /* 依赖声明 vs 实际安装 */
  const deps = [];
  decks.forEach((d) => {
    (d.deck.deps || []).forEach((dep) => {
      if (!byId.has(dep.id)) deps.push({ deck: d.deck.id, dep: dep.id, title: dep.title || "" });
    });
  });

  const ok = stat.stale === 0 && stat.missingDeck === 0 && stat.badSyntax === 0;

  if (json) {
    console.log(JSON.stringify({ ok, decks: decks.map((d) => ({ id: d.deck.id, title: d.deck.title, file: path.relative(process.cwd(), d.file) })), stat, rows, cycles, missingDeps: deps }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  console.log("学习包：" + decks.map((d) => d.deck.id + "（" + (d.deck.qas || []).length + " 问答）").join(" · "));
  console.log("跨包引用 " + stat.cross + " 条：已解析 " + stat.ok + " · 目标已删 " + stat.stale +
    " · 目标包未装 " + stat.missingDeck + " · 语法错 " + stat.badSyntax);

  const bad = rows.filter((r) => r.status !== "ok");
  if (bad.length) {
    console.log("");
    bad.forEach((r) => {
      const tag = r.status === "stale" ? "失效" : r.status === "missing-deck" ? "未装" : "语法";
      console.log("  [" + tag + "] " + r.deck + " · " + r.from + "." + r.field + " → " + r.ref);
    });
  }
  if (cycles.length) {
    console.log("");
    console.log("跨包环 " + cycles.length + " 处（允许，仅提示）：");
    cycles.forEach(([a, b]) => console.log("  " + a + " ⇄ " + b));
  }
  if (deps.length) {
    console.log("");
    console.log("声明了但未安装的依赖：");
    deps.forEach((d) => console.log("  " + d.deck + " → " + d.dep + (d.title ? "（" + d.title + "）" : "")));
  }
  console.log("");
  console.log(ok ? "✓ 跨包引用全部可解析" : "✗ 存在无法解析的跨包引用");
  process.exit(ok ? 0 : 1);
}

main();

#!/usr/bin/env node
/* audit-answers.js — 扫一遍所有包里的问答，找出「答案结构不合适」的候选
 *
 * 判定不是审美，而是可复现的规则：
 *   E1 空洞块：某块正文 < 40 字（四段式硬凑的典型症状）
 *   E2 单一化：全文只有 1 块，但 > 260 字（该分节没分）
 *   E3 体裁错配：问句是「怎么/如何」这类操作型，却用「取舍/实战」观点型标题
 *   E4 标题错配：「结论」块里在写步骤
 *   E5 长清单段落：某块 > 400 字且 3 个以上分号（该拆 list）
 *   E6 缺标题：>3 块却全无小标题
 *   E7 层深不当：内容有嵌套语义却全是 1 级标题
 *
 * 用法：
 *   node tools/audit-answers.js                     # 汇总
 *   node tools/audit-answers.js --deck ml-math      # 单个包
 *   node tools/audit-answers.js --json > audit.json # 机器可读
 *   node tools/audit-answers.js --list              # 逐条列出候选
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECKS = path.join(ROOT, "decks");
const ALL = ["cs-base", "cv-graphics", "ue5-pcg", "ml-math", "ml-intro"];

const VIEW_WORDS = ["取舍", "实战", "边界", "权衡"];
const FLOW_Q = /^(怎么|如何|怎样)(?!.*(为什么|区别|原理|本质))/;
const FLOW_TEXT = /(先[^。]{0,12}(再|然后|接着|最后)|第一步|第二步|第三步|依次)/;
const GENRE_DECIDE = /(怎么(处理|选|做|设计|排查|定位|验证|拆|搭|改|定)|如何(处理|选|做|设计|排查|定位)|分别|步骤|流程|从.+走到)/;
const GENRE_COMPARE = /(区别|差异|相比|哪个|哪种|还是|vs|VS)/;
const GENRE_CONCEPT = /(是什么|为什么|原理|本质|含义|作用)/;

function genreOf(q) {
  if (GENRE_COMPARE.test(q)) return "对比";
  if (GENRE_DECIDE.test(q)) return "操作";
  if (GENRE_CONCEPT.test(q)) return "概念";
  return "其他";
}

function load(id) {
  return JSON.parse(fs.readFileSync(path.join(DECKS, id + ".json"), "utf8"));
}

function analyze(q) {
  const ans = q.ans || [];
  const flags = [];
  const lens = ans.map((a) => (a.p || "").length);
  const total = lens.reduce((a, b) => a + b, 0);
  const heads = ans.filter((a) => a.h);
  /* 已经给出「步骤/流程」类结构（list 或 步骤型标题）之后，再补一段取舍是正常的，
     不应该继续算体裁错配；E3 只在整篇没有操作型结构时才算问题 */
  const hasFlow = ans.some((a) => Array.isArray(a.list) && a.list.length) ||
    heads.some((a) => /怎么|步骤|顺序|流程|排查|处理|选/.test(a.h));

  ans.forEach((a, i) => {
    const p = a.p || "";
    /* 带 list 的块只看 p 会误判：正文是引导句，真正的内容在条目里 */
    const bodyLen = p.length + (Array.isArray(a.list) ? a.list.join("").length : 0);
    if (bodyLen < 40) flags.push({ code: "E1", at: i, why: "第 " + (i + 1) + " 块只有 " + bodyLen + " 字", h: a.h || "" });
    if (a.h && VIEW_WORDS.includes(a.h) && FLOW_Q.test(q.q) && !hasFlow) {
      flags.push({ code: "E3", at: i, why: "问句是操作型，却用「" + a.h + "」标题", h: a.h });
    }
    if (a.h === "结论" && FLOW_TEXT.test(p)) {
      flags.push({ code: "E4", at: i, why: "「结论」块在写步骤", h: a.h });
    }
    const sep = (p.match(/[；;]/g) || []).length;
    if (p.length > 400 && sep >= 3 && !a.list) {
      flags.push({ code: "E5", at: i, why: "第 " + (i + 1) + " 块 " + p.length + " 字、" + sep + " 个分句，建议拆 list", h: a.h || "" });
    }
  });

  if (ans.length === 1 && total > 260) flags.push({ code: "E2", at: 0, why: "单块 " + total + " 字未分节" });
  if (ans.length > 3 && !heads.length) flags.push({ code: "E6", at: 0, why: ans.length + " 块却全无标题" });
  if (ans.length >= 3 && ans.every((a) => !a.lvl || a.lvl === 1)) {
    const deep = ans.some((a) => /(其中|具体来说|再细分|进一步)/.test(a.p || ""));
    if (deep) flags.push({ code: "E7", at: 0, why: "内容有嵌套语义但全是 1 级标题" });
  }
  return { id: q.id, q: q.q, blocks: ans.length, total, lens, flags };
}

function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes("--deck") ? argv[argv.indexOf("--deck") + 1] : null;
  const asJson = argv.includes("--json");
  const list = argv.includes("--list");
  const dump = argv.includes("--dump");
  const decks = only ? [only] : ALL;

  /* --dump：把候选问答的完整正文打出来，方便逐条改 */
  if (dump) {
    for (const d of decks) {
      const deck = JSON.parse(fs.readFileSync(path.join(DECKS, d + ".json"), "utf8"));
      const qas = (deck.qas || []).filter((q) => analyze(q).flags.length);
      console.log("######## " + d + "（" + qas.length + " 条）");
      qas.forEach((q) => {
        const a = analyze(q);
        console.log("");
        console.log("## " + q.id + "  [" + a.flags.map((f) => f.code).join(",") + "]  " + q.q);
        (q.ans || []).forEach((b, i) => {
          const head = (b.h || "(无标题)") + (b.lvl ? " lv" + b.lvl : "");
          console.log(i + ". " + head + "  {" + (b.p || "").length + "}");
          console.log("   " + (b.p || ""));
          if (b.list) b.list.forEach((li) => console.log("   - " + li));
        });
      });
    }
    return;
  }

  const report = [];
  for (const d of decks) {
    const deck = load(d);
    const rows = (deck.qas || []).map(analyze);
    report.push({ deck: d, title: deck.title, qas: rows.length, rows });
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const byCode = {};
  let flagged = 0;
  let totalQa = 0;
  for (const r of report) {
    const hits = r.rows.filter((x) => x.flags.length);
    totalQa += r.qas;
    flagged += hits.length;
    hits.forEach((h) => h.flags.forEach((f) => { byCode[f.code] = (byCode[f.code] || 0) + 1; }));
    console.log(
      r.deck.padEnd(12) + " 问答 " + String(r.qas).padStart(3) +
      " · 需看 " + String(hits.length).padStart(3) +
      " · 平均块数 " + (r.rows.reduce((a, b) => a + b.blocks, 0) / r.rows.length).toFixed(2) +
      " · 平均字数 " + Math.round(r.rows.reduce((a, b) => a + b.total, 0) / r.rows.length)
    );
    if (list) {
      hits.forEach((h) => {
        console.log("   · " + h.id + "  " + h.q.slice(0, 42));
        h.flags.forEach((f) => console.log("      " + f.code + " " + f.why));
      });
    }
  }
  console.log("");
  console.log("合计：问答 " + totalQa + " · 需看 " + flagged + "（" + Math.round((flagged / totalQa) * 100) + "%）");
  console.log("按规则：" + Object.keys(byCode).sort().map((k) => k + "=" + byCode[k]).join("  "));
}

main();

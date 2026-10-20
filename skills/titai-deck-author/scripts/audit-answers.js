#!/usr/bin/env node
/* audit-answers.js — 扫一个知识包里的问答，找出「答案结构不合适」的候选
 *
 * 判定不是审美，而是可复现的规则：
 *   E1 空洞块：某块正文 < 40 字（四段式硬凑的典型症状；快问类降到 25 字）
 *   E2 单一化：全文只有 1 块，但 > 260 字（该分节没分）
 *   E3 体裁错配：问句是「怎么/如何」这类操作型，却用「取舍/实战」观点型标题
 *   E4 标题错配：「结论」块里在写步骤
 *   E5 长清单段落：某块 > 400 字且 3 个以上分号（该拆 list）
 *   E6 缺标题：>3 块却全无小标题
 *   E7 层深不当：内容有嵌套语义却全是 1 级标题
 *
 * 用法：
 *   node scripts/audit-answers.js my-deck.json            # 逐条列出候选
 *   node scripts/audit-answers.js my-deck.json --list     # 只列 id 与规则
 *   node scripts/audit-answers.js my-deck.json --json     # 机器可读
 *   node scripts/audit-answers.js my-deck.json --dump     # 连同正文打出来
 *
 * 退出码恒为 0：这个脚本给线索，不决定能不能导入。
 */
const fs = require("fs");

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

  /* 快问类问答本来就是「一句话回答」，块短是设计意图不是空洞；
     门槛降到 25 字，只拦住真正的空块 */
  const quickFire = /^快问|快问：/.test(q.q || "");
  const minBlock = quickFire ? 25 : 40;

  ans.forEach((a, i) => {
    const p = a.p || "";
    /* 带 list 的块只看 p 会误判：正文是引导句，真正的内容在条目里 */
    const bodyLen = p.length + (Array.isArray(a.list) ? a.list.join("").length : 0);
    if (bodyLen < minBlock) flags.push({ code: "E1", at: i, why: "第 " + (i + 1) + " 块只有 " + bodyLen + " 字", h: a.h || "" });
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
  return { id: q.id, q: q.q, genre: genreOf(q.q || ""), blocks: ans.length, total, lens, flags };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const list = argv.includes("--list");
  const dump = argv.includes("--dump");
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.log("用法：node scripts/audit-answers.js <deck.json> [--list|--json|--dump]");
    process.exit(2);
  }

  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = (deck.qas || []).map(analyze);
  const hits = rows.filter((r) => r.flags.length);

  if (dump) {
    console.log("######## " + (deck.id || file) + "（" + hits.length + " 条候选）");
    hits.forEach((h) => {
      console.log("\n## " + h.id + "  [" + h.flags.map((f) => f.code).join(",") + "]  " + h.q);
      const q = deck.qas.find((x) => x.id === h.id);
      (q.ans || []).forEach((b, i) => {
        console.log(i + ". " + (b.h || "(无标题)") + (b.lvl ? " lv" + b.lvl : "") + "  {" + (b.p || "").length + "}");
        console.log("   " + (b.p || ""));
        if (b.list) b.list.forEach((li) => console.log("   - " + li));
      });
    });
    return;
  }

  if (asJson) {
    console.log(JSON.stringify({ deck: deck.id, title: deck.title, qas: rows.length, rows }, null, 2));
    return;
  }

  const byCode = {};
  hits.forEach((h) => h.flags.forEach((f) => { byCode[f.code] = (byCode[f.code] || 0) + 1; }));

  console.log("答案结构体检：" + (deck.title || deck.id) + "（" + rows.length + " 条问答）");
  if (!hits.length) {
    console.log("\n✓ 没有命中规则，结构都说得过去");
    return;
  }
  console.log("命中 " + hits.length + " 条（" + Math.round((hits.length / rows.length) * 100) + "%）：\n");
  hits.forEach((h) => {
    console.log(h.id + "  [" + h.genre + "·" + h.blocks + " 块·" + h.total + " 字]  " + h.q);
    h.flags.forEach((f) => {
      if (list) console.log("      " + f.code + " " + f.why);
      else console.log("    " + f.code + " " + f.why + (f.h ? "（标题「" + f.h + "」）" : ""));
    });
  });
  console.log("\n按规则：" + Object.keys(byCode).sort().map((k) => k + "=" + byCode[k]).join("  "));
}

main();

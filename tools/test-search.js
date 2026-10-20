#!/usr/bin/env node
/**
 * 题台 · 搜索行为测试
 *
 * 把引擎塞进无头 Edge，模拟真实敲键盘（改 input.value + dispatch input），
 * 检查「中文 / 拼音首字母 / 英文 / 多关键词」四类查询的召回与排序。
 *
 *   node tools/test-search.js                     # 跑默认用例（decks/ml-intro.json）
 *   node tools/test-search.js --dump "zs" "梯度"   # 只打印前几条命中，用来挑期望值
 *   node tools/test-search.js --deck decks/ml-math.json
 *
 * 退出码：0 全过；1 有失败。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "app", "src", "main", "assets");
const EDGE =
  process.env.EDGE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/* 默认用例：query → 期望首条 id（top）或 topN 内出现的片段（want） */
const CASES = [
  { q: "交叉熵", want: "交叉熵", top: "m3.3", note: "中文原文" },
  { q: "jcs", want: "交叉熵", top: "m3.3", note: "拼音首字母" },
  { q: "jiaochashang", want: "交叉熵", top: "m3.3", note: "拼音全拼" },
  { q: "mse", want: "MSE", top: "m3.1", note: "英文子串 / 大小写不敏感" },
  { q: "梯度", want: "梯度", top: "m6.6", note: "短词命中多条，按相关度排序" },
  { q: "交叉熵 分类", want: "交叉熵", top: "m3.3", note: "多关键词 AND" }
];

const PROBE = (queries) => `
<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    var out = { errors: [], list: {}, qa: {} };
    window.addEventListener("error", function (e) { out.errors.push(String(e.message)); });
    function rows(sel) {
      return [].slice.call(document.querySelectorAll("#view " + sel)).map(function (r) {
        var body = r.querySelector(".check-c, .q");
        return { id: r.dataset.check || r.dataset.qa || "", t: (body ? body.textContent : "").replace(/\\s+/g, " ").trim().slice(0, 46) };
      });
    }
    function type(sel, q) {
      var inp = document.querySelector("#view " + sel);
      if (!inp) return null;
      inp.value = q;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return rows(sel === "#listSearch" ? ".check" : ".qa-row");
    }
    function marks() { return document.querySelectorAll("#view mark").length; }
    function run() {
      out.markCounts = {}; out.qaMarkCounts = {};
      ${JSON.stringify(queries)}.forEach(function (q) { out.list[q] = type("#listSearch", q) || []; out.markCounts[q] = marks(); });
      var qaTab = document.querySelector('[data-tab="qa"]');
      if (qaTab) qaTab.click();
      ${JSON.stringify(queries)}.forEach(function (q) { out.qa[q] = type("#qaSearch", q) || []; out.qaMarkCounts[q] = marks(); });
      document.title = "SEARCH " + JSON.stringify(out);
    }
    try { run(); } catch (e) { out.errors.push("probe: " + String(e && e.message)); document.title = "SEARCH " + JSON.stringify(out); }
  }, 60);
});
</script>
`;

function parseArgs(argv) {
  const a = { deck: path.join(ROOT, "decks", "ml-intro.json"), dump: null, cases: null };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--deck") a.deck = path.resolve(argv[++i]);
    else if (argv[i] === "--dump") { a.dump = []; while (argv[i + 1] && !argv[i + 1].startsWith("--")) a.dump.push(argv[++i]); }
    else rest.push(argv[i]);
  }
  if (rest.length) a.cases = rest;
  return a;
}

function runProbe(deckPath, queries) {
  const raw = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "titai-search-"));
  ["index.html", "app.css", "app.js", "math.js", "pinyin.js"].forEach((f) =>
    fs.copyFileSync(path.join(ASSETS, f), path.join(tmp, f))
  );
  fs.writeFileSync(path.join(tmp, "deck.js"), "window.DECK = " + JSON.stringify(raw) + ";\n", "utf8");
  let html = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
  html = html.replace('<script src="deck.js"></script>', PROBE(queries) + '<script src="deck.js"></script>');
  fs.writeFileSync(path.join(tmp, "index.html"), html, "utf8");

  let dom = "";
  try {
    dom = execFileSync(EDGE, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--allow-file-access-from-files",
      "--virtual-time-budget=5000", "--user-data-dir=" + path.join(tmp, "profile"),
      "--dump-dom", "file:///" + tmp.replace(/\\/g, "/") + "/index.html",
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  } catch (e) {
    dom = (e.stdout || "") + "";
    if (!/SEARCH /.test(dom)) throw new Error("浏览器没回结果：" + String(e.message).slice(0, 160));
  }
  const m = dom.match(/SEARCH (\{[\s\S]*?\})<\/title>/);
  if (!m) throw new Error("探针没有回传结果");
  let out;
  try {
    out = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } catch (err) {
    throw new Error("探针结果解析失败");
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const dump = args.dump;
  const cases = args.cases
    ? args.cases.map((q) => ({ q, want: "", note: "临时" }))
    : CASES;
  const queries = (dump && dump.length ? dump : cases.map((c) => c.q));

  let res;
  try {
    res = runProbe(args.deck, queries);
  } catch (e) {
    console.log("✗ " + e.message);
    process.exit(1);
  }
  if (res.errors.length) {
    console.log("✗ JS 异常：" + res.errors.join(" | "));
    process.exit(1);
  }

  if (dump) {
    queries.forEach((q) => {
      const rows = res.list[q] || [];
      console.log("\n「" + q + "」知识点 " + rows.length + " 条");
      rows.slice(0, 6).forEach((r, i) => console.log("  " + (i + 1) + ". " + r.id + "  " + r.t));
      const qr = res.qa[q] || [];
      console.log("  问答 " + qr.length + " 条");
      qr.slice(0, 4).forEach((r, i) => console.log("     " + (i + 1) + ". " + r.id + "  " + r.t));
    });
    return;
  }

  let bad = 0;
  cases.forEach((c) => {
    const rows = res.list[c.q] || [];
    const top = rows.slice(0, 6);
    const hit = !c.want || top.some((r) => r.t.indexOf(c.want) >= 0 || r.id.indexOf(c.want) >= 0);
    const first = !c.top || (rows[0] && rows[0].id === c.top);
    if (!hit || !first) bad++;
    console.log((hit && first ? "✓ " : "✗ ") + "「" + c.q + "」" + (c.note ? "（" + c.note + "）" : "") +
      " → 知识点 " + rows.length + " 条" + (top[0] ? "，首条 " + top[0].id + "：" + top[0].t : "") +
      (!first ? "（期望首条 " + c.top + "）" : ""));
  });
  const qaRows = res.qa[cases[0].q] || [];
  const mk = res.markCounts || {}, qmk = res.qaMarkCounts || {};
  const markQ = cases[0].q;
  console.log("\n问答页「" + markQ + "」命中 " + qaRows.length + " 条" + (qaRows[0] ? "，首条 " + qaRows[0].t : ""));
  console.log("高亮 <mark>：「" + markQ + "」知识点 " + (mk[markQ] || 0) + " 处 · 问答 " + (qmk[markQ] || 0) + " 处");
  if (!mk[markQ] || !qmk[markQ]) bad++;
  process.exit(bad ? 1 : 0);
}

main();

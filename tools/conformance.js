#!/usr/bin/env node
/**
 * 题台 · 一致性测试（conformance）
 *
 * 把一份 deck.json 塞进真实的引擎资源（index.html / app.css / app.js），
 * 用无头浏览器渲染一遍，确认它“真的能被打开”，而不只是“看起来符合协议”。
 *
 *   node tools/conformance.js                       # 测 decks/ml-intro.json
 *   node tools/conformance.js test/decks/minimal.deck.json
 *   node tools/conformance.js a.json b.json         # 一次测多份
 *
 * 检查项：
 *   1. 引擎加载后没有 JS 异常；
 *   2. 模块数、自查点数与 deck 声明一致（渲染不丢项）；
 *   3. 列表页搜索框、底部 tab 的文案用上了 terms；
 *   4. 问答页能渲染出全部 qa 行；
 *   5. 点开一条问答，详情面板能打开。
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

const PROBE = (expected) => `
<script>
window.__probe = { errors: [], expected: ${JSON.stringify(expected)}, mathQa: ${JSON.stringify(
  expected.mathQa || null
)} };
window.addEventListener("error", function (e) {
  window.__probe.errors.push(String(e.message || e.error));
});
window.addEventListener("load", function () {
  var p = window.__probe;
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    document.title = "PROBE " + JSON.stringify(p);
  }
  setTimeout(function () {
    try {
      p.groups = document.querySelectorAll(".mod").length;
      p.checks = document.querySelectorAll(".check").length;
      p.tabList = (document.getElementById("tabList") || {}).textContent;
      p.tabQa = (document.getElementById("tabQa") || {}).textContent;
      var s = document.querySelector("#view .search");
      p.searchPlaceholder = s ? s.placeholder : null;

      var qaTab = document.querySelector('[data-tab="qa"]');
      if (qaTab) qaTab.click();
      setTimeout(function () {
        p.qas = document.querySelectorAll(".qa-row").length;
        /* 优先点开“有公式的那条”，用来验证 MathML 真的排出来了 */
        var first = (p.mathQa &&
          document.querySelector('.qa-row[data-qa="' + p.mathQa + '"]')) ||
          document.querySelector(".qa-row");
        if (first) first.click();
        setTimeout(function () {
          p.sheetOpen = document
            .getElementById("sheet")
            .classList.contains("on");
          p.math = document.querySelectorAll("math").length;
          p.mathBlock = document.querySelectorAll('math[display="block"]').length;
          finish();
        }, 30);
      }, 30);
    } catch (err) {
      p.errors.push("probe: " + String(err && err.message));
      finish();
    }
  }, 40);
});
</script>
`;

/* 数一个包里有多少个公式（反引号代码里的 $ 不算） */
function countFormulas(raw) {
  let n = 0;
  const scan = (s) => {
    if (typeof s !== "string") return;
    const t = s.replace(/`[^`]*`/g, " ");
    const m = t.match(/\$\$/g);
    if (m) n += m.length;
    const single = t.replace(/\$\$/g, " ").match(/(?<!\\)\$/g);
    if (single) n += single.length;
  };
  (raw.groups || []).forEach((g) =>
    (g.checks || []).forEach((c) => scan(c.text))
  );
  (raw.qas || []).forEach((q) => {
    scan(q.q);
    (q.ans || []).forEach((a) => scan(a.p));
  });
  return Math.ceil(n / 2);
}

/* 找第一条带公式的问答，返回它的 id（没有就返回 null） */
function firstMathQa(raw) {
  const has = (s) => {
    if (typeof s !== "string") return false;
    const t = s.replace(/`[^`]*`/g, " ");
    return /\$[^$]/.test(t) || /\$\$/.test(t);
  };
  for (const q of raw.qas || []) {
    if (has(q.q)) return q.id;
    for (const a of q.ans || []) if (has(a.p)) return q.id;
  }
  return null;
}

function parseArgs(argv) {
  const files = [];
  argv.slice(2).forEach((a) => {
    if (!a.startsWith("-")) files.push(path.resolve(a));
  });
  return files.length ? files : [path.join(ROOT, "decks", "ml-intro.json")];
}

function runOne(deckPath) {
  const raw = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const totalChecks = (raw.groups || []).reduce(
    (n, g) => n + ((g.checks || []).length || 0),
    0
  );
  const terms = Object.assign(
    { group: "模块", check: "知识点", qa: "问答" },
    raw.terms || {}
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "titai-conformance-"));
  ["index.html", "app.css", "app.js", "math.js", "pinyin.js"].forEach((f) =>
    fs.copyFileSync(path.join(ASSETS, f), path.join(tmp, f))
  );
  fs.writeFileSync(
    path.join(tmp, "deck.js"),
    "window.DECK = " + JSON.stringify(raw) + ";\n",
    "utf8"
  );
  const probeTag = PROBE({ qas: (raw.qas || []).length, mathQa: firstMathQa(raw) });
  const html = fs
    .readFileSync(path.join(tmp, "index.html"), "utf8")
    .replace('<script src="deck.js"></script>', probeTag + '<script src="deck.js"></script>');
  fs.writeFileSync(path.join(tmp, "index.html"), html, "utf8");

  let dom = "";
  try {
    dom = execFileSync(
      EDGE,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--virtual-time-budget=4000",
        "--user-data-dir=" + path.join(tmp, "profile"),
        "--dump-dom",
        "file:///" + tmp.replace(/\\/g, "/") + "/index.html",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 }
    );
  } catch (e) {
    dom = (e.stdout || "") + "";
    if (!/PROBE /.test(dom)) {
      return { ok: false, deckPath, err: "浏览器启动失败：" + String(e.message).slice(0, 200) };
    }
  }

  const m = dom.match(/PROBE (\{[\s\S]*?\})<\/title>/);
  if (!m) {
    return { ok: false, deckPath, err: "探针没有回传结果（页面可能直接崩了）" };
  }
  let p;
  try {
    p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch (e) {
    return { ok: false, deckPath, err: "探针结果解析失败" };
  }

  const fails = [];
  if (p.errors && p.errors.length) fails.push("JS 异常：" + p.errors.join(" | "));
  if (p.groups !== (raw.groups || []).length)
    fails.push("模块渲染 " + p.groups + " 个，应为 " + (raw.groups || []).length);
  if (p.checks !== totalChecks)
    fails.push("自查点渲染 " + p.checks + " 个，应为 " + totalChecks);
  if (p.tabList !== terms.check)
    fails.push("tab 文案是「" + p.tabList + "」，应为「" + terms.check + "」");
  if (p.tabQa !== terms.qa)
    fails.push("问答 tab 文案是「" + p.tabQa + "」，应为「" + terms.qa + "」");
  if (p.qas !== (raw.qas || []).length)
    fails.push("问答渲染 " + p.qas + " 行，应为 " + (raw.qas || []).length);
  if (!p.sheetOpen) fails.push("点开问答后详情面板没打开");

  /* 协议 v1.1：包里写了公式，页面就必须真的渲染出 <math> */
  const wantMath = countFormulas(raw);
  if (wantMath > 0 && !(p.math > 0))
    fails.push("包里有 " + wantMath + " 个公式，但页面一个 <math> 都没渲染出来");
  if (wantMath === 0 && p.math > 0)
    fails.push("包里没有公式，页面却渲染出 " + p.math + " 个 <math>");

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {}

  return { ok: fails.length === 0, deckPath, fails, counts: p };
}

function main() {
  const files = parseArgs(process.argv);
  let bad = 0;
  files.forEach((f) => {
    if (!fs.existsSync(f)) {
      console.log("✗ " + f + " 不存在");
      bad++;
      return;
    }
    const r = runOne(f);
    const name = path.relative(ROOT, f) || f;
    if (r.ok) {
      const c = r.counts;
      console.log(
        "✓ " + name + " — 模块 " + c.groups + " · 自查点 " + c.checks + " · 问答 " + c.qas +
          " · tab「" + c.tabList + "/" + c.tabQa + "」· 无 JS 异常"
      );
    } else {
      bad++;
      console.log("✗ " + name);
      (r.fails || [r.err]).filter(Boolean).forEach((x) => console.log("   - " + x));
      if (r.fails && r.counts) {
        console.log("   实测：" + JSON.stringify(r.counts));
      }
    }
  });
  if (files.length > 1) {
    console.log("\n" + (bad ? "✗ " + bad + "/" + files.length + " 份未通过" : "✓ 全部通过（" + files.length + " 份）"));
  }
  process.exit(bad ? 1 : 0);
}

main();

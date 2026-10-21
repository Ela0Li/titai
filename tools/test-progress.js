#!/usr/bin/env node
/**
 * 题台 · 打点即时刷新回归测试
 *
 * 背景：模块进度条与知识包百分比原来只在整页重渲染时才算（收起/展开知识包、
 * 切页签），点完掌握度圆点要等下一次渲染才更新。这个用例盯住那个行为：
 * 点完圆点，模块百分比、进度条宽度、知识包百分比必须**当场**变，且不依赖重渲染。
 *
 *   node tools/test-progress.js                        # 测 decks/ml-intro.json
 *   node tools/test-progress.js decks/ml-math.json
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

const PROBE = `
<script>
window.__probe = { errors: [] };
window.addEventListener("error", function (e) {
  window.__probe.errors.push(String(e.message || e.error));
});
function txt(el) { return el ? String(el.textContent || "").trim() : null; }
window.addEventListener("load", function () {
  setTimeout(function () {
    var p = window.__probe;
    try {
      var mod = document.querySelector(".mod");
      var bar = mod.querySelector(".bar > i");
      var pctEl = mod.querySelector(".mod-pct");
      var sec = document.querySelector(".decksec");
      var metaEl = sec ? sec.querySelector(".ds-meta") : null;
      function snap() {
        return {
          pct: txt(pctEl),
          bar: bar ? bar.style.width : null,
          meta: txt(metaEl)
        };
      }
      p.before = snap();

      /* 1) 列表里点第三个圆点 */
      var dot3 = mod.querySelector(".check .dot[data-m='3']");
      if (!dot3) throw new Error("找不到圆点");
      dot3.click();
      p.afterDot = snap();
      p.afterDot.lv = mod.querySelector(".dots").dataset.lv;

      /* 2) 详情面板里改掌握度（会不会同步到后面的列表） */
      var row2 = mod.querySelectorAll(".check")[1];
      if (row2) {
        row2.querySelector(".check-c").click();
        var seg = document.querySelector('#checkSeg button[data-cm="2"]');
        p.sheetOpen = document.getElementById("sheet").classList.contains("on");
        if (seg) seg.click();
        p.afterSheet = snap();
        var close = document.querySelector('[data-act="close-sheet"]');
        if (close) close.click();
      }
    } catch (err) {
      p.errors.push("probe: " + String(err && err.message));
    }
    document.title = "PROBE " + JSON.stringify(p);
  }, 80);
});
</script>
`;

function num(s) {
  const m = String(s == null ? "" : s).match(/(\d+)%/);
  return m ? parseInt(m[1], 10) : null;
}

function runOne(deckPath) {
  const raw = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "titai-progress-"));
  ["index.html", "app.css", "app.js", "math.js", "pinyin.js"].forEach((f) =>
    fs.copyFileSync(path.join(ASSETS, f), path.join(tmp, f))
  );
  fs.writeFileSync(
    path.join(tmp, "deck.js"),
    "window.DECK = " + JSON.stringify(raw) + ";\n",
    "utf8"
  );
  const html = fs
    .readFileSync(path.join(tmp, "index.html"), "utf8")
    .replace('<script src="deck.js"></script>', PROBE + '<script src="deck.js"></script>');
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
      return { ok: false, deckPath, fails: ["浏览器启动失败：" + String(e.message).slice(0, 200)] };
    }
  }

  const m = dom.match(/PROBE (\{[\s\S]*?\})<\/title>/);
  if (!m) return { ok: false, deckPath, fails: ["探针没有回传结果"] };
  let p;
  try {
    p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch (e) {
    return { ok: false, deckPath, fails: ["探针结果解析失败"] };
  }

  const fails = [];
  if (p.errors && p.errors.length) fails.push("JS 异常：" + p.errors.join(" | "));
  if (!p.before) return { ok: false, deckPath, fails: fails.concat(["列表没渲染出来"]) };

  const b = num(p.before.pct), a = num(p.afterDot && p.afterDot.pct);
  if (b === null || a === null) fails.push("模块百分比读不到");
  else if (a <= b) fails.push("点了圆点模块百分比没变：" + b + "% → " + a + "%");
  if (p.afterDot && p.afterDot.bar !== p.afterDot.pct)
    fails.push("进度条宽度(" + p.afterDot.bar + ")与百分比(" + p.afterDot.pct + ")不一致");
  if (p.afterDot && p.afterDot.lv !== "3")
    fails.push("点完第三个圆点，data-lv 是 " + p.afterDot.lv + "，应为 3");

  const mb = num(p.before.meta), ma = num(p.afterDot && p.afterDot.meta);
  if (mb === null || ma === null) fails.push("知识包百分比读不到");
  else if (ma <= mb) fails.push("点了圆点知识包百分比没变：" + mb + "% → " + ma + "%");

  if (p.afterSheet) {
    const c = num(p.afterSheet.pct);
    if (c === null) fails.push("详情面板打点后模块百分比读不到");
    else if (c <= a) fails.push("详情面板里改掌握度，模块百分比没跟着变：" + a + "% → " + c + "%");
  }

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {}

  return { ok: fails.length === 0, deckPath, fails, counts: p };
}

function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const list = files.length ? files.map((f) => path.resolve(f)) : [path.join(ROOT, "decks", "ml-intro.json")];
  let bad = 0;
  list.forEach((f) => {
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
        "✓ " + name + " — 模块 " + c.before.pct + " → " + c.afterDot.pct +
          " · 知识包 " + num(c.before.meta) + "% → " + num(c.afterDot.meta) + "%" +
          (c.afterSheet ? " · 详情面板打点后 " + c.afterSheet.pct : "")
      );
    } else {
      bad++;
      console.log("✗ " + name);
      (r.fails || []).forEach((x) => console.log("   - " + x));
      if (r.counts && r.counts.before) console.log("   实测：" + JSON.stringify(r.counts));
    }
  });
  process.exit(bad ? 1 : 0);
}

main();

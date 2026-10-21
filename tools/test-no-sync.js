#!/usr/bin/env node
/**
 * 题台 · 掌握度不联动回归测试
 *
 * 锁住一条约定（协议 v1.10 起）：改一个知识点只写它自己，
 * 同一条问答覆盖的其它知识点分数不变。
 *
 *   node tools/test-no-sync.js                        # 默认测 decks/ml-intro.json
 *   node tools/test-no-sync.js <deck.json> ...
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
function lvOf(id) {
  var row = document.querySelector('.check[data-check="' + id + '"]');
  var d = row && row.querySelector(".dots");
  return d ? d.dataset.lv : null;
}
window.addEventListener("load", function () {
  setTimeout(function () {
    var p = window.__probe;
    try {
      var deck = window.DECK || {};
      var qas = deck.qas || [];
      var groups = deck.groups || [];
      var pair = null;
      for (var i = 0; i < qas.length && !pair; i++) {
        var cs = (qas[i].covers || []).filter(function (c) { return String(c).indexOf("#") < 0; });
        if (cs.length < 2) continue;
        var g = null;
        for (var j = 0; j < groups.length; j++) {
          var ids = (groups[j].checks || []).map(function (c) { return c.id || c; });
          if (ids.indexOf(cs[0]) >= 0) { g = groups[j]; break; }
        }
        if (g) pair = { qa: qas[i].id, a: cs[0], b: cs[1], group: g.id };
      }
      p.pair = pair;
      if (!pair) {
        p.errors.push("这个包里没有「一条问答覆盖多个知识点」的样本，跳过");
      } else {
        var head = document.querySelector('.mod[data-g="' + pair.group + '"] .mod-head');
        if (head && !head.parentNode.classList.contains("open")) head.click();
        p.expanded = !!(head && head.parentNode.classList.contains("open"));
        var before = { a: lvOf(pair.a), b: lvOf(pair.b) };
        p.before = before;
        var rowA = document.querySelector('.check[data-check="' + pair.a + '"] .check-c');
        if (rowA) rowA.click();
        var seg = document.querySelector('#checkSeg button[data-cm="3"]');
        p.opened = !!seg;
        if (seg) seg.click();
        p.sheetLit = (function () {
          var on = document.querySelectorAll("#checkSeg button.on");
          return on.length === 1 ? on[0].className : on.length;
        })();
        var close = document.querySelector('#sheet [data-act="close-sheet"]');
        if (close) close.click();
        p.after = { a: lvOf(pair.a), b: lvOf(pair.b) };
      }
    } catch (err) {
      p.errors.push("probe: " + String(err && err.message));
    }
    document.title = "PROBE " + JSON.stringify(p);
  }, 120);
});
</script>
`;

function runOne(deckPath) {
  const raw = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "titai-nosync-"));
  ["index.html", "app.css", "app.js", "math.js", "pinyin.js"].forEach((f) =>
    fs.copyFileSync(path.join(ASSETS, f), path.join(tmp, f))
  );
  fs.writeFileSync(path.join(tmp, "deck.js"), "window.DECK = " + JSON.stringify(raw) + ";\n", "utf8");
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
  if (!m) {
    if (process.env.PROBE_DEBUG) fs.writeFileSync(path.join(__dirname, ".probe-dom.html"), dom, "utf8");
    return { ok: false, deckPath, fails: ["探针没有回传结果"] };
  }
  let p;
  try {
    p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch (e) {
    return { ok: false, deckPath, fails: ["探针结果解析失败"] };
  }

  const fails = [];
  if (p.errors && p.errors.length) fails.push("JS 异常：" + p.errors.join(" | "));
  if (!p.pair) return { ok: false, deckPath, fails: fails.concat(["没有可测的样本"]) };
  if (!p.expanded) fails.push("模块没展开，读不到知识点行");
  if (!p.opened) fails.push("知识点卡片没打开");
  if (p.sheetLit !== 1 && String(p.sheetLit).indexOf && String(p.sheetLit).indexOf("lv3") < 0)
    fails.push("卡片里选「熟练」后亮的按钮不对：" + JSON.stringify(p.sheetLit));
  const b = p.before || {}, a = p.after || {};
  if (a.a !== "3") fails.push("改完之后 " + p.pair.a + " 的档位是 " + a.a + "，应为 3");
  if (String(a.b) !== String(b.b) || (b.b === "0" && a.b !== "0"))
    fails.push("同一条问答覆盖的 " + p.pair.b + " 跟着变了：" + b.b + " → " + a.b + "（不应联动）");

  return { ok: fails.length === 0, deckPath, fails, pair: p.pair, before: b, after: a };
}

function main() {
  const decks = process.argv.slice(2);
  const list = decks.length ? decks : [path.join(ROOT, "decks", "ml-intro.json")];
  let bad = 0;
  list.forEach((d) => {
    const r = runOne(d);
    if (r.ok) {
      console.log("✓ " + d + " — 问答 " + (r.pair ? r.pair.qa : "?") + "，改 " + (r.pair ? r.pair.a : "?") +
        " 后 " + (r.pair ? r.pair.b : "?") + " 仍是 " + (r.before ? r.before.b : "?") + "（未联动）");
    } else {
      bad++;
      console.log("✗ " + d);
      (r.fails || []).forEach((f) => console.log("   - " + f));
    }
  });
  process.exit(bad ? 1 : 0);
}

main();

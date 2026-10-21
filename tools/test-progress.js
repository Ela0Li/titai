#!/usr/bin/env node
/**
 * 题台 · 掌握度交互回归测试
 *
 * 锁住两条约定：
 *   1. 列表里的圆点**只展示**，点它不写状态（改掌握度只能在知识点卡片里）；
 *   2. 卡片里改完掌握度，退出卡片时列表刷新一次：模块百分比、进度条宽度、
 *      知识包百分比跟着变，圆点档位也跟着变。
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
      /* 每次快照都重新查：关掉卡片后列表会整页重渲染，旧节点已脱离文档 */
      function snap() {
        var m0 = document.querySelector(".mod");
        var b0 = m0 && m0.querySelector(".bar > i");
        var p0 = m0 && m0.querySelector(".mod-pct");
        var s0 = document.querySelector(".decksec");
        var e0 = s0 && s0.querySelector(".ds-meta");
        return { pct: txt(p0), bar: b0 ? b0.style.width : null, meta: txt(e0) };
      }
      p.before = snap();

      /* 圆点必须是纯展示：没有 data-m、点它不改状态 */
      p.dotsWithM = document.querySelectorAll(".check .dot[data-m]").length;
      var firstRow = mod.querySelector(".check");
      var lvBefore = firstRow.querySelector(".dots").dataset.lv;
      firstRow.querySelector(".dot").click();
      p.afterDotClick = {
        lv: firstRow.querySelector(".dots").dataset.lv,
        same: firstRow.querySelector(".dots").dataset.lv === lvBefore,
        pct: snap().pct
      };

      /* 卡片里选「熟练」 */
      firstRow.querySelector(".check-c").click();
      p.sheetOpen = document.getElementById("sheet").classList.contains("on");
      var segs = document.querySelectorAll("#checkSeg button");
      var seg3 = document.querySelector('#checkSeg button[data-cm="3"]');
      if (!seg3) throw new Error("卡片里找不到熟练按钮");
      seg3.click();
      var on = Array.prototype.filter.call(segs, function (b) { return b.classList.contains("on"); });
      p.sheet = {
        onCount: on.length,
        onLv: on.length === 1 ? on[0].className : on.map(function (b) { return b.className; }).join(","),
        seg: snap()
      };

      /* 关掉卡片：列表重渲染一次 */
      document.querySelector('[data-act="close-sheet"]').click();
      p.closed = document.getElementById("sheet").classList.contains("on");
      p.after = snap();
      var rowNow = document.querySelector(".mod .check");
      p.after.lv = rowNow.querySelector(".dots").dataset.lv;

      /* 再进一次卡片，点当前档位 = 取消 */
      rowNow.querySelector(".check-c").click();
      document.querySelector('#checkSeg button[data-cm="3"]').click();
      var on2 = Array.prototype.filter.call(document.querySelectorAll("#checkSeg button"), function (b) {
        return b.classList.contains("on");
      });
      p.cleared = { onCount: on2.length };
      document.querySelector('[data-act="close-sheet"]').click();
      p.afterClear = snap();
      p.afterClear.lv = document.querySelector(".mod .check .dots").dataset.lv;
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

  /* 1. 外部圆点只展示 */
  if (p.dotsWithM) fails.push("列表圆点还带 data-m（" + p.dotsWithM + " 个），说明还能点着写状态");
  if (!p.afterDotClick || !p.afterDotClick.same)
    fails.push("点外部圆点把掌握度改了：" + JSON.stringify(p.afterDotClick));

  /* 2. 卡片里只亮当前档位 */
  if (!p.sheetOpen) fails.push("知识点卡片没打开");
  if (!p.sheet) fails.push("卡片里没读到掌握度按钮");
  else {
    if (p.sheet.onCount !== 1) fails.push("卡片里亮了 " + p.sheet.onCount + " 个按钮，应为 1 个");
    if (p.sheet.onLv.indexOf("lv3") < 0) fails.push("选「熟练」后亮的是 " + p.sheet.onLv);
  }

  /* 3. 关卡片后列表刷新 */
  if (p.closed) fails.push("卡片关不掉");
  const b = num(p.before.pct), a = num(p.after && p.after.pct);
  if (b === null || a === null) fails.push("模块百分比读不到");
  else if (a <= b) fails.push("关卡片后模块百分比没变：" + b + "% → " + a + "%");
  if (p.after && p.after.bar !== p.after.pct)
    fails.push("进度条宽度(" + p.after.bar + ")与百分比(" + p.after.pct + ")不一致");
  if (p.after && p.after.lv !== "3")
    fails.push("关卡片后圆点档位是 " + p.after.lv + "，应为 3");
  const mb = num(p.before.meta), ma = num(p.after && p.after.meta);
  if (mb === null || ma === null) fails.push("知识包百分比读不到");
  else if (ma <= mb) fails.push("关卡片后知识包百分比没变：" + mb + "% → " + ma + "%");

  /* 4. 再点同一档 = 取消 */
  if (p.cleared && p.cleared.onCount !== 0) fails.push("再点当前档位没有取消（还亮着 " + p.cleared.onCount + " 个）");
  if (p.afterClear && p.afterClear.lv !== "0")
    fails.push("取消后圆点档位是 " + p.afterClear.lv + "，应为 0");

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
        "✓ " + name + " — 模块 " + c.before.pct + " → " + c.after.pct +
          " · 知识包 " + num(c.before.meta) + "% → " + num(c.after.meta) + "%" +
          " · 圆点只展示 · 卡片单亮 · 再点取消"
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

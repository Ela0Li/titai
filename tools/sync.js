#!/usr/bin/env node
/**
 * 题台 · 电脑端同步服务（局域网直连，无需账号/云端）
 *
 *   node tools/sync.js            # 默认 8787 端口
 *   node tools/sync.js 9000       # 自定义端口
 *
 * 手机上打开「设置 → 局域网同步」，填本机 IP:端口 和这里打印的 4 位配对码即可。
 * 数据都放在 ./sync/ 目录：deck.json（知识包）、state.json（进度）、code.txt（配对码）。
 * 浏览器打开 http://<ip>:<port>/ 看说明；打开 /a/ 直接在电脑上用同一套界面。
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "app", "src", "main", "assets");
const SYNC_DIR = path.join(ROOT, "sync");
const DIST_DECK = path.join(ROOT, "dist", "deck.json");
const DECK = path.join(SYNC_DIR, "deck.json");
const STATE = path.join(SYNC_DIR, "state.json");
const STATES_DIR = path.join(SYNC_DIR, "states");
const CODE_FILE = path.join(SYNC_DIR, "code.txt");
/** 想给手机装的知识包都放这里：decks/<任意文件名>.json */
const DECKS_DIR = path.join(ROOT, "decks");

fs.mkdirSync(SYNC_DIR, { recursive: true });
fs.mkdirSync(STATES_DIR, { recursive: true });
fs.mkdirSync(DECKS_DIR, { recursive: true });
if (!fs.existsSync(DECK) && fs.existsSync(DIST_DECK)) {
  fs.copyFileSync(DIST_DECK, DECK);
}

/** 扫描所有可分发的知识包：当前包（sync/deck.json）+ decks/ 目录 */
function scanDecks() {
  const out = new Map();
  const add = (file) => {
    const d = loadJSON(file, null);
    if (!d || !d.id || !Array.isArray(d.groups)) return;
    let checks = 0;
    d.groups.forEach((g) => { checks += (g.checks || []).length; });
    out.set(d.id, {
      file,
      id: d.id,
      title: d.title || d.id,
      checks,
      qas: (d.qas || []).length,
      bytes: fs.statSync(file).size,
    });
  };
  if (fs.existsSync(DECK)) add(DECK);
  for (const f of fs.readdirSync(DECKS_DIR)) {
    if (f.endsWith(".json")) add(path.join(DECKS_DIR, f));
  }
  return [...out.values()];
}

function readCode() {
  if (fs.existsSync(CODE_FILE)) {
    const c = fs.readFileSync(CODE_FILE, "utf8").trim();
    if (/^\d{4}$/.test(c)) return c;
  }
  const c = String(Math.floor(1000 + Math.random() * 9000));
  fs.writeFileSync(CODE_FILE, c, "utf8");
  return c;
}

function loadJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(p, obj) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), "utf8");
  fs.renameSync(tmp, p);
}

function emptyState(deckId) {
  const d = deckId ? { id: deckId } : loadJSON(DECK, null);
  return { v: 1, deck: (d && d.id) || "deck", rev: 0, checks: {}, fav: {}, quiz: {}, settings: {}, sync: {} };
}

/** 进度按知识包分桶：sync/states/<id>.json，互不影响 */
function stateFileFor(deckId) {
  return path.join(STATES_DIR, String(deckId || "deck").replace(/[^A-Za-z0-9_\-]/g, "_") + ".json");
}

function readStateFor(deckId) {
  const s = loadJSON(stateFileFor(deckId), null);
  return s && s.checks ? s : emptyState(deckId);
}

function writeStateFor(deckId, obj) {
  writeJSON(stateFileFor(deckId), obj);
}

/** 老版本只有一份 sync/state.json，首次启动并到它自己的包名下 */
function migrateLegacyState() {
  if (!fs.existsSync(STATE)) return;
  const s = loadJSON(STATE, null);
  const id = (s && s.deck) || (loadJSON(DECK, {}) || {}).id;
  if (!id) return;
  const dst = stateFileFor(id);
  if (!fs.existsSync(dst)) fs.renameSync(STATE, dst);
  else fs.unlinkSync(STATE);
}

/** 同一个 key 取时间戳较新的那份；收藏用 on:false 作墓碑，避免互相“复活” */
function mergeState(local, remote) {
  if (!remote || typeof remote !== "object") return local || emptyState();
  const out = local && local.checks ? local : emptyState();
  ["checks", "fav", "quiz"].forEach((k) => {
    const src = remote[k] || {};
    out[k] = out[k] || {};
    Object.keys(src).forEach((id) => {
      const a = out[k][id];
      const b = src[id];
      if (!a || (b.t || 0) > (a.t || 0)) out[k][id] = b;
    });
  });
  out.rev = Math.max(out.rev || 0, remote.rev || 0) + 1;
  out.touched = Date.now();
  return out;
}

function deckSummary() {
  const d = loadJSON(DECK, null);
  if (!d) return { ok: false, msg: "没有 dist/deck.json，先运行 node tools/mkdeck.js" };
  return { deck: d.id, title: d.title, groups: d.groups.length, qas: d.qas.length };
}

function stateSummary(s) {
  if (!s) return { rev: 0, checks: 0, favs: 0, quiz: 0 };
  return {
    rev: s.rev || 0,
    checks: Object.keys(s.checks || {}).length,
    favs: Object.keys(s.fav || {}).filter((k) => s.fav[k] && s.fav[k].on).length,
    quiz: Object.keys(s.quiz || {}).length,
    touched: s.touched || 0,
  };
}

/** 每个包各自的进度摘要，给 /api/ping 和电脑端页面用 */
function listDeckStates() {
  return scanDecks().map((d) => {
    const st = stateSummary(readStateFor(d.id));
    return {
      id: d.id,
      title: d.title,
      checks: d.checks,
      qas: d.qas,
      rev: st.rev,
      done: st.checks,
      favs: st.favs,
      quiz: st.quiz,
    };
  });
}

/**
 * 电脑端 /a/ 页面：把内置的 deck.js 换成引导脚本，
 * 由它按 ?deck= 或上次选择向服务端要对应的知识包，再加载 app.js。
 */
function withDeckBoot(html) {
  return html.replace(
    '<script src="deck.js"></script>',
    '<script src="deck.boot.js"></script>'
  );
}

function deckBootJs(code) {
  return `(function () {
  var CODE = ${JSON.stringify(code)};
  var q = new URLSearchParams(location.search);
  var want = q.get("deck") || localStorage.getItem("titai.pcdeck") || "";
  function start(deck) {
    if (deck) {
      window.DECK = deck;
      try { localStorage.setItem("titai.pcdeck", deck.id); } catch (e) {}
    }
    var s = document.createElement("script");
    s.src = "app.js";
    document.body.appendChild(s);
  }
  fetch("/api/decks?code=" + encodeURIComponent(CODE))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var decks = (j && j.decks) || [];
      if (!decks.length) throw new Error("no decks");
      var pick = decks.filter(function (d) { return d.id === want; })[0] || decks[0];
      return fetch("/api/deck?id=" + encodeURIComponent(pick.id) + "&code=" + CODE)
        .then(function (r) { return r.json(); });
    })
    .then(start)
    .catch(function () {
      /* 拿不到就用页面自带的 deck.js 兜底 */
      var d = document.createElement("script");
      d.src = "deck.js";
      d.onload = function () { start(null); };
      document.body.appendChild(d);
    });
})();`;
}

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 32 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => resolve(buf));
    req.on("error", () => resolve(""));
  });
}

function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((i) => {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    });
  });
  if (!out.length) out.push("127.0.0.1");
  return out;
}

function page(code, port) {
  const decks = listDeckStates();
  const d = deckSummary();
  const ips = lanIPs();
  const deckRows = decks.length
    ? decks
        .map(
          (x) =>
            `<tr><td><a href="/a/?deck=${encodeURIComponent(x.id)}">${x.title}</a>` +
            `<div class="dim">${x.id} · ${x.checks} 知识点 · ${x.qas} 问答</div></td>` +
            `<td class="num">rev ${x.rev}</td><td class="num">${x.done}</td>` +
            `<td class="num">${x.favs}</td><td class="num">${x.quiz}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="dim">decks/ 目录里还没有知识包</td></tr>`;
  return `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>题台 · 电脑端</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0d1117;color:#e6edf3;font:15px/1.7 -apple-system,"Microsoft YaHei",sans-serif;padding:28px}
h1{font-size:20px;margin:0 0 4px}
small,.dim{color:#8b98a5}
small{font-size:13px}
.card{border:1px solid #263140;background:#161d27;border-radius:12px;padding:16px;margin:14px 0;max-width:660px}
a{color:#2f81f7;text-decoration:none}
a:hover{text-decoration:underline}
code{background:#1b2331;border:1px solid #263140;border-radius:5px;padding:1px 6px;color:#35c6d4}
.code{font-size:34px;letter-spacing:8px;color:#7ee787;font-weight:700}
.ip{font-size:18px;color:#2f81f7;margin-top:2px}
ul{margin:8px 0 0;padding-left:18px;color:#9fb0c3}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #263140;vertical-align:top}
th{color:#8b98a5;font-weight:500;font-size:13px}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:#e6edf3;white-space:nowrap}
tr:last-child td{border-bottom:0}
</style>
<h1>题台 · 电脑端</h1>
<small>保持这个窗口开着；手机与电脑在同一个 WiFi 下。</small>
<div class="card">
  <div>配对码</div><div class="code">${code}</div>
  <div style="margin-top:12px">手机里填这个地址</div>
  ${ips.map((ip) => `<div class="ip">${ip}:${port}</div>`).join("")}
  <small>模拟器填 <code>10.0.2.2:${port}</code></small>
</div>
<div class="card">
  <div>知识包 <small>（点标题在浏览器里打开对应内容；进度各自独立）</small></div>
  <table>
    <tr><th>知识包</th><th style="text-align:right">版本</th><th style="text-align:right">有记录</th><th style="text-align:right">收藏</th><th style="text-align:right">刷过</th></tr>
    ${deckRows}
  </table>
  <small>当前默认包：${d.title || "?"} · ${d.groups || 0} 个模块 · ${d.qas || 0} 条问答</small>
</div>
<div class="card">
  <div>手机上：设置 → 局域网同步 → 填地址与配对码</div>
  <ul>
    <li><b>拉取</b>：把电脑上这个包的进度合并到手机</li>
    <li><b>推送</b>：把手机上的进度写到电脑</li>
    <li>合并规则：同一个知识点取时间戳较新的记录，不会互相覆盖丢分</li>
  </ul>
</div>
<div class="card">
  <div><a href="/a/">在电脑浏览器里打开学习界面 →</a></div>
  <small>同一套内容与交互，进度存在浏览器本地；和手机之间靠上面的拉取/推送对齐。</small>
</div>
</html>`;
}

const PORT = parseInt(process.argv[2], 10) || 8787;
const CODE = readCode();
migrateLegacyState();

http
  .createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    const qs = new URLSearchParams(req.url.split("?")[1] || "");

    /* 电脑端的选包引导：按 ?deck= 或上次选择加载对应知识包（必须排在 /a/ 静态分支之前） */
    if (req.method === "GET" && url === "/a/deck.boot.js") {
      const boot = Buffer.from(deckBootJs(CODE), "utf8");
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Length": boot.length,
        "Cache-Control": "no-cache",
      });
      return res.end(boot);
    }

    if (req.method === "GET" && url.startsWith("/a/")) {
      const rel = decodeURIComponent(url.slice(3)) || "index.html";
      const file = path.join(ASSETS, rel);
      if (!file.startsWith(ASSETS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return json(res, 404, { ok: false, msg: "no such asset" });
      }
      const ext = path.extname(file).toLowerCase();
      const type =
        ext === ".css" ? "text/css; charset=utf-8" :
        ext === ".js" ? "application/javascript; charset=utf-8" :
        "text/html; charset=utf-8";
      let body = fs.readFileSync(file);
      /* 电脑端页面：把内置的 deck.js + app.js 换成「先选包、再加载引擎」的引导脚本 */
      if (rel === "index.html") {
        body = Buffer.from(withDeckBoot(body.toString("utf8")), "utf8");
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-cache" });
      return res.end(body);
    }

    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      const body = Buffer.from(page(CODE, PORT), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
      return res.end(body);
    }

    if (url === "/api/ping") {
      const d = deckSummary();
      const want = qs.get("deck") || d.deck || "";
      const s = stateSummary(readStateFor(want));
      return json(res, 200, {
        ok: true,
        name: "题台 · 电脑端",
        port: PORT,
        code: CODE,
        deck: want,
        title: d.title || "",
        groups: d.groups || 0,
        qas: d.qas || 0,
        rev: s.rev,
        checks: s.checks,
        decks: listDeckStates(),
      });
    }

    /* 列出电脑上可下发的知识包 */
    if (url === "/api/decks" && req.method === "GET") {
      if (qs.get("code") !== CODE) return json(res, 200, { ok: false, msg: "配对码不对" });
      const decks = scanDecks().map((d) => {
        const st = stateSummary(readStateFor(d.id));
        return {
          id: d.id, title: d.title, checks: d.checks, qas: d.qas, bytes: d.bytes,
          rev: st.rev, done: st.checks, favs: st.favs, quiz: st.quiz,
        };
      });
      return json(res, 200, { ok: true, decks });
    }

    /* 下发某个知识包的原始 JSON */
    if (url === "/api/deck" && req.method === "GET") {
      if (qs.get("code") !== CODE) return json(res, 200, { ok: false, msg: "配对码不对" });
      const id = qs.get("id") || "";
      const hit = scanDecks().find((d) => d.id === id);
      if (!hit) return json(res, 404, { ok: false, msg: "没有这个知识包" });
      const body = fs.readFileSync(hit.file);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": body.length,
        "Cache-Control": "no-cache",
      });
      return res.end(body);
    }

    if (url === "/api/pull" && req.method === "POST") {
      const body = await readBody(req);
      let p = {};
      try { p = JSON.parse(body || "{}"); } catch (e) {}
      if (String(p.code || "") !== CODE) return json(res, 200, { ok: false, msg: "配对码不对" });
      const deck = String(p.deck || deckSummary().deck || "");
      return json(res, 200, { ok: true, deck, state: readStateFor(deck) });
    }

    if (url === "/api/push" && req.method === "POST") {
      const body = await readBody(req);
      let p = {};
      try { p = JSON.parse(body || "{}"); } catch (e) {}
      if (String(p.code || "") !== CODE) return json(res, 200, { ok: false, msg: "配对码不对" });
      if (!p.state) return json(res, 200, { ok: false, msg: "缺少 state" });
      const deck = String(p.deck || p.state.deck || deckSummary().deck || "");
      const merged = mergeState(readStateFor(deck), p.state);
      merged.deck = deck;
      writeStateFor(deck, merged);
      const s = stateSummary(merged);
      console.log("[push] deck=" + deck + " rev=" + s.rev + " checks=" + s.checks + " favs=" + s.favs);
      return json(res, 200, { ok: true, deck, rev: s.rev, checks: s.checks });
    }

    json(res, 404, { ok: false, msg: "not found" });
  })
  .listen(PORT, "0.0.0.0", () => {
    const ips = lanIPs();
    console.log("");
    console.log("  题台 · 电脑端已启动");
    console.log("  ─────────────────────────────");
    console.log("  配对码:  " + CODE);
    console.log("  手机填:  " + ips.map((ip) => ip + ":" + PORT).join("  或  "));
    console.log("  模拟器:  10.0.2.2:" + PORT);
    console.log("  浏览器:  http://127.0.0.1:" + PORT + "   学习界面 /a/");
    console.log("  数据目录: " + SYNC_DIR);
    console.log("");
  });

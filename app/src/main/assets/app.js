/* 题台 · 通用学习包引擎（无框架，Chromium 110 可用） */
(function () {
  "use strict";

  var D = window.DECK || { groups: [], qas: [] };
  var STATE_KEY = "studydesk.state.v1";

  /* 多学习包：内置包在 assets/decks/*.json，导入包在 files/decks/。
     启动时先问原生当前用哪份，读不到就退回 deck.js 里内置的那份。 */
  var CUR_DECK = (D && D.id) || "builtin";
  (function hydrateDeck() {
    if (!window.Native || !window.Native.readDeck) return;
    try {
      var id = String(window.Native.currentDeck() || "");
      if (!id) return;
      var txt = String(window.Native.readDeck(id) || "");
      if (!txt) { CUR_DECK = id; return; }
      var d = JSON.parse(txt);
      if (d && d.groups && d.groups.length) {
        D = d;
        CUR_DECK = d.id || id;
      }
    } catch (e) {
      /* 坏包：继续用内置的，别让 App 打不开 */
    }
  })();
  var APP_VERSION = (function () {
    try {
      if (window.Native && window.Native.versionName) {
        var v = window.Native.versionName();
        if (v) return v;
      }
    } catch (e) {}
    return "dev";
  })();

  /* 界面上怎么称呼这些东西，由学习包自己定（terms 可选） */
  var TERMS = Object.assign({ group: "模块", check: "知识点", qa: "问答" }, D.terms || {});
  function term(k) { return TERMS[k] || k; }

  /* ---------------- 索引 ---------------- */
  var QA = {}, CHECK = {}, GROUP_OF = {}, COVERS = {}, QAS_OF_CHECK = {};
  var QA_LIST = (D.qas || []).slice();

  (D.groups || []).forEach(function (g, gi) {
    g.gi = gi;
    (g.checks || []).forEach(function (c) {
      CHECK[c.id] = { id: c.id, text: c.text, lvl: c.lvl, g: g.id, group: g };
      GROUP_OF[c.id] = g;
    });
  });
  QA_LIST.forEach(function (q) {
    QA[q.id] = q;
    (q.covers || []).forEach(function (cid) {
      COVERS[cid] = COVERS[cid] || [];
      COVERS[cid].push(q.id);
      QAS_OF_CHECK[cid] = COVERS[cid];
    });
  });

  /* ---------------- 状态 ---------------- */
  var state = {
    v: 1,
    deck: D.id,
    rev: 0,
    checks: {},
    fav: {},
    quiz: {},
    settings: { theme: "dark", tab: "list" },
    sync: { host: "", code: "" },
    touched: 0
  };

  /* 设备级偏好：外观与同步地址跟"学哪个包"无关，跟着包存会在换包时丢掉 */
  var prefs = {};
  function loadPrefs() {
    var raw = "";
    try {
      if (window.Native && window.Native.readPrefs) raw = String(window.Native.readPrefs() || "");
      else raw = localStorage.getItem("studydesk.prefs.v1") || "";
    } catch (e) { raw = ""; }
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  function savePrefs() {
    var json = JSON.stringify(prefs);
    try {
      if (window.Native && window.Native.writePrefs) { window.Native.writePrefs(json); return; }
      localStorage.setItem("studydesk.prefs.v1", json);
    } catch (e) {}
  }
  function setPref(k, v) { prefs[k] = v; savePrefs(); }

  function loadState() {
    var raw = "";    try {
      if (window.Native) {
        raw = String(
          (window.Native.readState ? window.Native.readState(CUR_DECK) : window.Native.loadState()) || ""
        );
      } else {
        raw = localStorage.getItem(STATE_KEY + ":" + CUR_DECK) || "";
      }
    } catch (e) { raw = ""; }
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (s && s.checks) {
        state.checks = s.checks || {};
        state.fav = s.fav || {};
        state.quiz = s.quiz || {};
        state.settings = Object.assign(state.settings, s.settings || {});
        state.sync = Object.assign(state.sync, s.sync || {});
        state.rev = s.rev || 0;
        state.touched = s.touched || 0;
        /* 老版本把 theme/sync 存在包内：首次读到就搬到设备级，之后以设备级为准 */
        var migrated = false;
        if (!prefs.theme && state.settings.theme) { prefs.theme = state.settings.theme; migrated = true; }
        if (!prefs.host && state.sync.host) { prefs.host = state.sync.host; migrated = true; }
        if (!prefs.code && state.sync.code) { prefs.code = state.sync.code; migrated = true; }
        if (migrated) savePrefs();
        if (prefs.theme) state.settings.theme = prefs.theme;
        if (prefs.host) state.sync.host = prefs.host;
        if (prefs.code) state.sync.code = prefs.code;
      }
    } catch (e) { toast("进度读取失败，已忽略"); }
  }

  var saveTimer = null;
  function save(now) {
    state.touched = Date.now();
    if (saveTimer) clearTimeout(saveTimer);
    var run = function () {
      saveTimer = null;
      var json = JSON.stringify(state);
      try {
        if (window.Native) {
          if (window.Native.writeState) window.Native.writeState(CUR_DECK, json);
          else window.Native.saveState(json);
        } else {
          localStorage.setItem(STATE_KEY + ":" + CUR_DECK, json);
        }
      } catch (e) { toast("保存失败"); }
    };
    if (now) run(); else saveTimer = setTimeout(run, 350);
  }

  function mOf(checkId) {
    var r = state.checks[checkId];
    return r && typeof r.m === "number" ? r.m : 0;
  }
  function setM(checkId, m) {
    state.checks[checkId] = { m: m, t: Date.now() };
    save();
  }
  function isFav(id) {
    var r = state.fav[id];
    return !!(r && r.on);
  }
  function toggleFav(id) {
    var cur = isFav(id);
    state.fav[id] = { on: !cur, t: Date.now() };
    save();
    return !cur;
  }

  /* ---------------- 小工具 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function rich(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); }, 1600);
  }

  /* ---------------- 统计 ---------------- */
  function stats() {
    var total = 0, sum = 0, byLevel = { 0: 0, 1: 0, 2: 0, 3: 0 };
    D.groups.forEach(function (g) {
      g.checks.forEach(function (c) {
        total++;
        var m = mOf(c.id);
        sum += m;
        byLevel[m]++;
      });
    });
    return {
      total: total,
      sum: sum,
      pct: total ? Math.round((sum / (total * 3)) * 100) : 0,
      byLevel: byLevel,
      favChecks: Object.keys(state.fav).filter(function (k) { return isFav(k) && CHECK[k]; }).length,
      favQas: Object.keys(state.fav).filter(function (k) { return isFav(k) && QA[k]; }).length
    };
  }

  function paintRing() {
    var s = stats();
    var c = 2 * Math.PI * 15.5;
    var fg = $("#ringFg");
    fg.style.strokeDasharray = c.toFixed(1);
    fg.style.strokeDashoffset = (c * (1 - s.sum / Math.max(1, s.total * 3))).toFixed(1);
    $("#ringTxt").textContent = s.pct + "%";
  }

  /* ---------------- 视图：自查 ---------------- */
  var listFilter = "all";
  var listQuery = "";

  function passesMastery(checkId) {
    var m = mOf(checkId);
    if (listFilter === "all") return true;
    if (listFilter === "fav") return isFav(checkId);
    return m === parseInt(listFilter, 10);
  }

  function matches(text) {
    if (!listQuery) return true;
    return String(text).toLowerCase().indexOf(listQuery) >= 0;
  }

  function renderList() {
    var html = [];
    html.push('<input class="search" id="listSearch" placeholder="搜索' + esc(term("check")) + '…" value="' + esc(listQuery) + '">');
    html.push('<div class="chips" id="listChips">' +
      chip("all", "全部") + chip("0", "未学") + chip("1", "模糊") +
      chip("2", "会") + chip("3", "熟练") + chip("fav", "收藏") + "</div>");

    var shown = 0;
    D.groups.forEach(function (g) {
      var checks = g.checks.filter(function (c) { return passesMastery(c.id) && (matches(c.text) || matches(g.title)); });
      if (!checks.length) return;
      shown += checks.length;
      var done = checks.filter(function (c) { return mOf(c.id) >= 2; }).length;
      var pct = Math.round((done / checks.length) * 100);
      html.push('<section class="mod" data-g="' + g.id + '">');
      html.push('<div class="mod-head" data-act="toggle">' +
        '<span class="mod-id">' + esc(g.id.toUpperCase()) + "</span>" +
        '<span class="mod-t"><b>' + esc(g.title) + "</b><small>S" + g.stage + " · " + esc(g.priority) +
        " · " + checks.length + " 项</small></span>" +
        '<span class="mod-pct">' + pct + "%</span></div>");
      html.push('<div class="bar"><i style="width:' + pct + '%"></i></div>');
      html.push('<div class="mod-body">');
      if (g.keypoints && g.keypoints.length) {
        html.push('<div class="kp"><b>要点</b><ul>' +
          g.keypoints.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ul></div>");
      }
      if (g.traps && g.traps.length) {
        html.push('<div class="kp trap"><b>易错</b><ul>' +
          g.traps.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ul></div>");
      }
      checks.forEach(function (c) {
        html.push(checkRow(c));
      });
      html.push("</div></section>");
    });

    if (!shown) html.push('<div class="empty">没有符合条件的' + esc(term("check")) + '</div>');
    html.push('<div class="hint" style="margin-top:14px">点圆点记掌握度：亮 1 个＝模糊 · 亮 2 个＝会 · 亮 3 个＝熟练 · 全不亮＝未学（再点同一个点可清除）；点文字看对应问答。</div>');
    $("#view").innerHTML = html.join("");
  }

  function chip(v, label) {
    return '<button class="chip' + (listFilter === v ? " on" : "") + '" data-chip="' + v + '">' + label + "</button>";
  }

  function checkRow(c) {
    var m = mOf(c.id);
    var dots = [1, 2, 3].map(function (k) {
      var cls = m >= k ? "dot on m" + m : "dot";
      return '<button class="' + cls + '" data-m="' + k + '" aria-label="掌握度' + k + '"></button>';
    }).join("");
    return '<div class="check" data-check="' + c.id + '">' +
      '<div class="check-c" data-act="open-check"><em>' + esc(c.id) + "</em>" + rich(c.text) + "</div>" +
      '<span class="lvl ' + esc(c.lvl) + '">' + esc(c.lvl) + "</span>" +
      '<div class="dots" data-dots="' + c.id + '">' + dots + "</div>" +
      '<button class="star' + (isFav(c.id) ? " on" : "") + '" data-star="' + c.id + '">' + (isFav(c.id) ? "★" : "☆") + "</button>" +
      "</div>";
  }

  /* ---------------- 视图：问答 ---------------- */
  var qaFilter = "all";
  var qaQuery = "";

  function renderQa() {
    var html = [];
    html.push('<input class="search" id="qaSearch" placeholder="搜索问题、标签、答案…" value="' + esc(qaQuery) + '">');
    html.push('<div class="chips" id="qaChips">' +
      ["all", "1", "2", "3", "4"].map(function (v) {
        var label = v === "all" ? "全部" : "L" + v;
        return '<button class="chip' + (qaFilter === v ? " on" : "") + '" data-qchip="' + v + '">' + label + "</button>";
      }).join("") + "</div>");

    var list = QA_LIST.filter(function (q) {
      if (qaFilter !== "all" && String(q.layer) !== qaFilter) return false;
      if (!qaQuery) return true;
      var hay = q.q + " " + (q.tags || []).join(" ") + " " +
        (q.ans || []).map(function (a) { return a.p; }).join(" ");
      return hay.toLowerCase().indexOf(qaQuery) >= 0;
    });

    list.forEach(function (q) {
      var g = D.groups.filter(function (x) { return x.id === q.m; })[0];
      html.push('<div class="qa-row" data-qa="' + q.id + '">' +
        '<div class="lr"><span class="lbadge L' + q.layer + '">L' + q.layer + "</span></div>" +
        '<div class="main"><div class="q">' + rich(q.q) + "</div>" +
        '<div class="meta"><span>' + esc(g ? g.title : q.m) + "</span>" +
        (q.tags || []).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
        "</div></div></div>");
    });
    if (!list.length) html.push('<div class="empty">没有匹配的问答</div>');
    html.push('<div class="hint" style="margin-top:12px">共 ' + list.length + " 条 · 点开可看四段答案与追问网络</div>");
    $("#view").innerHTML = html.join("");
  }

  /* ---------------- 视图：收藏 ---------------- */
  function renderFav() {
    var cs = Object.keys(state.fav).filter(function (k) { return isFav(k) && CHECK[k]; });
    var qs = Object.keys(state.fav).filter(function (k) { return isFav(k) && QA[k]; });
    var html = [];
    html.push('<div class="sub-h"><b>' + esc(term("check")) + '收藏</b><span>' + cs.length + " 个</span></div>");
    if (!cs.length) html.push('<div class="empty" style="padding:18px">还没有收藏的' + esc(term("check")) + '</div>');
    else {
      cs.forEach(function (id) {
        var c = CHECK[id];
        html.push('<div class="check" data-check="' + id + '">' +
          '<div class="check-c" data-act="open-check"><em>' + esc(id) + "</em>" + rich(c.text) + "</div>" +
          '<span class="lvl ' + esc(c.lvl) + '">' + esc(c.lvl) + "</span>" +
          '<button class="star on" data-star="' + id + '">★</button></div>');
      });
    }
    html.push('<div class="sub-h"><b>问答收藏</b><span>' + qs.length + " 条</span></div>");
    if (!qs.length) html.push('<div class="empty" style="padding:18px">还没有收藏的问答</div>');
    else {
      qs.forEach(function (id) {
        var q = QA[id];
        html.push('<div class="qa-row" data-qa="' + id + '"><div class="lr">' +
          '<span class="lbadge L' + q.layer + '">L' + q.layer + "</span></div>" +
          '<div class="main"><div class="q">' + rich(q.q) + "</div>" +
          '<div class="meta"><span>' + esc(q.id) + "</span></div></div></div>");
      });
    }
    $("#view").innerHTML = html.join("");
  }

  /* ---------------- 视图：刷题 ---------------- */
  var drillMode = "all";     // all | weak | fav
  var drillCur = null;
  var drillRevealed = false;
  var drillStat = { ok: 0, no: 0 };

  function drillPool() {
    return QA_LIST.filter(function (q) {
      if (drillMode === "fav") return isFav(q.id);
      if (drillMode === "weak") {
        var ms = (q.covers || []).map(mOf);
        if (!ms.length) return true;
        var avg = ms.reduce(function (a, b) { return a + b; }, 0) / ms.length;
        return avg < 2;
      }
      return true;
    });
  }

  function pickDrill() {
    var pool = drillPool();
    if (!pool.length) { drillCur = null; return; }
    var next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && drillCur) {
      var guard = 0;
      while (next.id === drillCur.id && guard++ < 5) next = pool[Math.floor(Math.random() * pool.length)];
    }
    drillCur = next;
    drillRevealed = false;
  }

  function renderDrill() {
    if (!drillCur) pickDrill();
    var html = [];
    html.push('<div class="seg" id="drillSeg">' +
      ["all", "weak", "fav"].map(function (v) {
        var label = v === "all" ? "随机" : v === "weak" ? "薄弱项" : "只刷收藏";
        return '<button data-dmode="' + v + '" class="' + (drillMode === v ? "on" : "") + '">' + label + "</button>";
      }).join("") + "</div>");

    if (!drillCur) {
      html.push('<div class="empty">这个筛选下没有题目<br><small>换个筛选或先把题收藏起来</small></div>');
      $("#view").innerHTML = html.join("");
      return;
    }
    var q = drillCur;
    var g = D.groups.filter(function (x) { return x.id === q.m; })[0];
    html.push('<div class="drill-card">');
    html.push('<div class="drill-meta"><span class="lbadge L' + q.layer + '">L' + q.layer + "</span>" +
      "<span>" + esc(g ? g.title : q.m) + "</span><span>" + esc(q.lvl) + "</span></div>");
    html.push('<div class="drill-q">' + rich(q.q) + "</div>");
    if (drillRevealed) {
      html.push('<div class="drill-ans">');
      (q.ans || []).forEach(function (a) {
        html.push('<div class="ans-block"><div class="ans-h">' + esc(a.h) + '</div><div class="ans-p">' + rich(a.p) + "</div></div>");
      });
      html.push("</div>");
    }
    html.push("</div>");

    if (!drillRevealed) {
      html.push('<button class="btn primary block" data-act="reveal">先想 10 秒，再看答案</button>');
    } else {
      html.push('<div class="rate">' +
        '<button class="r1" data-rate="1">没答上来</button>' +
        '<button class="r2" data-rate="2">答得含糊</button>' +
        '<button class="r3" data-rate="3">说清楚了</button></div>');
    }
    html.push('<div class="hint" style="margin-top:12px">本轮：会 ' + drillStat.ok + " · 不会 " + drillStat.no + " · 当前池 " + drillPool().length + " 题</div>");
    $("#view").innerHTML = html.join("");
  }

  function rate(n) {
    if (!drillCur) return;
    (drillCur.covers || []).forEach(function (cid) { if (CHECK[cid]) setM(cid, n); });
    var rec = state.quiz[drillCur.id] || { ok: 0, no: 0 };
    if (n >= 2) { rec.ok = (rec.ok || 0) + 1; drillStat.ok++; }
    else { rec.no = (rec.no || 0) + 1; drillStat.no++; }
    rec.t = Date.now();
    state.quiz[drillCur.id] = rec;
    save();
    paintRing();
    pickDrill();
    renderDrill();
  }

  /* ---------------- 视图：设置 ---------------- */
  var syncBusy = false;

  /* ---- 学习包：多个包共存，各有各的进度 ---- */
  function deckList() {
    if (!window.Native || !window.Native.listDecks) {
      return [{ id: CUR_DECK, title: D.title || "内置学习包", checks: (D.groups || []).reduce(function (n, g) { return n + (g.checks || []).length; }, 0), qas: (D.qas || []).length, builtin: true }];
    }
    try {
      var arr = JSON.parse(String(window.Native.listDecks() || "[]"));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function renderDeckSection() {
    var list = deckList();
    var html = ['<div class="sub-h"><b>学习包</b><span>' + list.length + " 个</span></div>"];
    list.forEach(function (d) {
      var on = d.id === CUR_DECK;
      html.push('<div class="deck-row' + (on ? " on" : "") + '">' +
        '<div class="deck-main"><div class="deck-t">' + esc(d.title || d.id) +
        (on ? ' <span class="deck-cur">使用中</span>' : "") + "</div>" +
        '<div class="deck-m">' + esc(d.id) + " · " + (d.checks || 0) + " " + esc(term("check")) +
        " · " + (d.qas || 0) + " " + esc(term("qa")) + (d.builtin ? " · 内置" : " · 已导入") + "</div></div>" +
        (on ? "" : '<button class="btn mini" data-deck="' + esc(d.id) + '">切换</button>') +
        (!d.builtin && !on ? '<button class="btn mini danger" data-del-deck="' + esc(d.id) + '">删</button>' : "") +
        "</div>");
    });
    html.push('<div class="btn-row"><button class="btn" id="btnDecks">从电脑获取学习包</button>' +
      '<button class="btn" id="btnImportFile">从文件导入</button></div>');
    html.push('<div class="note" id="deckNote">每个学习包有自己的进度；切换不会丢数据。也可以把 .json 分享给「题台」直接打开。</div>');
    return html.join("");
  }

  function switchDeck(id) {
    if (!id || id === CUR_DECK) return;
    try {
      if (window.Native && window.Native.setCurrentDeck) {
        window.Native.setCurrentDeck(id);
        save(true);
        location.replace("index.html");
        return;
      }
      toast("网页调试模式不支持换包");
    } catch (e) { toast("切换失败"); }
  }

  function deckEndpoint(path) {
    var host = (state.sync.host || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!host) return "";
    var code = (($("#syncCode") || {}).value || state.sync.code || "").trim();
    return "http://" + host + path + (path.indexOf("?") >= 0 ? "&" : "?") + "code=" + encodeURIComponent(code);
  }

  function fetchDeckIndex() {
    var url = deckEndpoint("/api/decks");
    if (!url) { toast("先填电脑地址"); return; }
    if (!window.Native) { toast("网页调试模式：请把 deck.json 直接放进 data/"); return; }
    var note = $("#deckNote");
    if (note) note.textContent = "正在问电脑要学习包列表…";
    var raw = window.Native.http("GET", url, "", 5000);
    var res, data;
    try { res = JSON.parse(raw); } catch (e) { toast("返回不是 JSON"); return; }
    if (!res.status) { toast("连不上：" + (res.error || "").slice(0, 40)); if (note) note.textContent = "连不上，检查同一 WiFi 与地址。"; return; }
    try { data = JSON.parse(res.body); } catch (e) { toast("响应解析失败"); return; }
    if (!data || data.ok === false) { if (note) note.textContent = (data && data.msg) || "配对码不对"; return; }
    var decks = data.decks || [];
    if (!decks.length) { if (note) note.textContent = "电脑上还没有可下载的学习包。"; return; }
    var html = ['<div class="sub-h" style="margin-top:10px"><b>电脑上的学习包</b><span>' + decks.length + " 个</span></div>"];
    decks.forEach(function (d) {
      html.push('<div class="deck-row"><div class="deck-main"><div class="deck-t">' + esc(d.title || d.id) + "</div>" +
        '<div class="deck-m">' + esc(d.id) + " · " + (d.checks || 0) + " " + esc(term("check")) + " · " + (d.qas || 0) + " " + esc(term("qa")) + "</div></div>" +
        '<button class="btn mini" data-download="' + esc(d.id) + '">下载</button></div>');
    });
    if (note) note.innerHTML = html.join("");
  }

  function downloadDeck(id) {
    var url = deckEndpoint("/api/deck?id=" + encodeURIComponent(id));
    if (!url) { toast("先填电脑地址"); return; }
    var note = $("#deckNote");
    if (note) note.textContent = "正在下载 " + id + " …";
    var raw = window.Native.http("GET", url, "", 15000);
    var res;
    try { res = JSON.parse(raw); } catch (e) { toast("返回不是 JSON"); return; }
    if (!res.status) { toast("连不上"); return; }
    if (res.status !== 200) { toast("HTTP " + res.status); return; }
    var saved = "";
    try { saved = String(window.Native.saveDeck(res.body) || ""); } catch (e) { saved = ""; }
    if (!saved) { toast("不是合法的学习包"); if (note) note.textContent = "下载失败：文件不是合法学习包"; return; }
    toast("已导入 " + saved);
    switchDeck(saved);
  }

  /* ---- 从文件导入：先在本地体检，坏包不入库 ---- */
  var IMPORT_MAX = 2 * 1024 * 1024;
  var DECK_ID_RE = /^[A-Za-z0-9_\-\.]{1,64}$/;
  var QA_ID_RE = /^q\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;
  var HTML_TAG_RE = /<\/?(b|i|em|strong|br|p|div|span|code|pre|ul|ol|li|a|script|style|img)\b[^>]*>/i;

  /** 轻量版的 validate-deck：只看会导致引擎出错或渲染异常的硬规则 */
  function inspectDeck(text) {
    var p = [];
    function bad(code, msg) { p.push(code + "：" + msg); }
    if (!text) return { problems: ["文件是空的"] };
    if (text.length > IMPORT_MAX) return { problems: ["文件超过 2 MB，太大了"] };

    var d;
    try { d = JSON.parse(text); } catch (e) {
      return { problems: ["不是合法 JSON（" + String(e && e.message || e) + "）"] };
    }
    if (!d || typeof d !== "object") return { problems: ["顶层不是对象"] };

    if (d.schema !== 1) bad("E_SCHEMA", "schema 必须是 1");
    if (!d.id || !DECK_ID_RE.test(d.id)) bad("E_ID", "id 只能用字母/数字/下划线/短横/点，1–64 字");
    if (!d.title || typeof d.title !== "string") bad("E_TITLE", "缺少 title");

    var groups = Array.isArray(d.groups) ? d.groups : [];
    if (!groups.length) bad("E_GROUPS", "至少要有一个 groups");
    var groupIds = {}, checkIds = {};
    groups.forEach(function (g, gi) {
      var tag = "groups[" + gi + "]";
      if (!g || !g.id) { bad("E_GROUP_ID", tag + " 缺 id"); return; }
      if (groupIds[g.id]) bad("E_GROUP_DUP", "模块 id 重复：" + g.id);
      groupIds[g.id] = 1;
      if (!g.title) bad("E_GROUP_TITLE", tag + " 缺 title");
      var cs = Array.isArray(g.checks) ? g.checks : [];
      if (!cs.length) bad("E_CHECKS", tag + " 至少要有一条 " + "check");
      cs.forEach(function (c, ci) {
        var want = g.id + "." + (ci + 1);
        if (!c || !c.id) { bad("E_CHECK_ID", tag + ".checks[" + ci + "] 缺 id"); return; }
        if (c.id !== want) bad("E_CHECK_PREFIX", c.id + " 应为 " + want);
        if (checkIds[c.id]) bad("E_CHECK_DUP", "知识点 id 重复：" + c.id);
        checkIds[c.id] = 1;
        if (!c.text) bad("E_CHECK_TEXT", c.id + " 缺 text");
        if (["P0", "P1", "P2"].indexOf(c.lvl) < 0) bad("E_CHECK_LVL", c.id + " 的 lvl 只能是 P0/P1/P2");
      });
    });

    var qas = Array.isArray(d.qas) ? d.qas : [];
    var qaIds = {};
    qas.forEach(function (q) { if (q && q.id) qaIds[q.id] = 1; });
    var seen = {};
    qas.forEach(function (q, qi) {
      var tag = "qas[" + qi + "]";
      if (!q || !q.id) { bad("E_QA_ID", tag + " 缺 id"); return; }
      if (!QA_ID_RE.test(q.id)) bad("E_QA_ID_RE", q.id + " 的 id 应形如 q.模块.名字");
      if (seen[q.id]) bad("E_QA_DUP", "问答 id 重复：" + q.id);
      seen[q.id] = 1;
      if (!groupIds[q.m]) bad("E_QA_M", q.id + " 的 m 指向不存在的模块 " + q.m);
      if (["P0", "P1", "P2"].indexOf(q.lvl) < 0) bad("E_QA_LVL", q.id + " 的 lvl 只能是 P0/P1/P2");
      if ([1, 2, 3, 4].indexOf(q.layer) < 0) bad("E_QA_LAYER", q.id + " 的 layer 只能是 1–4");
      if (!q.q) bad("E_QA_Q", q.id + " 缺问题文本");

      var cov = Array.isArray(q.covers) ? q.covers : [];
      if (!cov.length) bad("E_QA_COVERS", q.id + " 的 covers 是空的");
      cov.forEach(function (c) {
        if (c === q.id) bad("E_SELF_REF", q.id + " 不能覆盖自己");
        else if (!checkIds[c]) bad("E_COVER_REF", q.id + " 覆盖了不存在的自查点 " + c);
      });

      ["next", "peer"].forEach(function (k) {
        (Array.isArray(q[k]) ? q[k] : []).forEach(function (r) {
          if (r === q.id) bad("E_SELF_REF", q.id + " 的 " + k + " 指向自己");
          else if (!qaIds[r]) bad("E_QA_REF", q.id + " 的 " + k + " 指向不存在的问答 " + r);
        });
      });

      var ans = Array.isArray(q.ans) ? q.ans : [];
      if (!ans.length) bad("E_ANS", q.id + " 没有 ans");
      else if (!ans[0] || ans[0].h !== "结论") bad("E_ANS_HEAD", q.id + " 的第一段必须是「结论」");
      ans.forEach(function (a, ai) {
        if (!a || !a.p) bad("E_ANS_P", q.id + " 第 " + (ai + 1) + " 段是空的");
        else if (HTML_TAG_RE.test(a.p)) bad("E_ANS_HTML", q.id + " 第 " + (ai + 1) + " 段里有 HTML 标签");
      });
    });

    return { problems: p, deck: d, checks: Object.keys(checkIds).length, qas: qas.length };
  }

  function showImportProblems(list) {
    var html = ['<div class="note" style="color:var(--fg2)">这个文件没能入库：' + list.length + " 个问题。</div>"];
    html.push('<ul class="import-err">');
    list.slice(0, 8).forEach(function (m) { html.push("<li>" + esc(m) + "</li>"); });
    html.push("</ul>");
    if (list.length > 8) html.push('<div class="note">……还有 ' + (list.length - 8) + " 个问题。</div>");
    html.push('<div class="note">对照 docs/deck-protocol.md 的 §1，或先跑 <code>node tools/validate-deck.js</code>。</div>');
    html.push('<div class="btn-row" style="margin-top:14px"><button class="btn" data-act="close-sheet">知道了</button></div>');
    openSheet(html.join(""));
  }

  /** 由原生调用：读缓存里的文件 → 体检 → 入库 → 切过去 */
  function importStaged() {
    if (!window.Native || !window.Native.readStagedImport) { toast("网页模式不支持文件导入"); return; }
    var text = "";
    try { text = String(window.Native.readStagedImport() || ""); } catch (e) { text = ""; }
    if (!text) { toast("没读到文件内容"); return; }
    var r = inspectDeck(text);
    if (r.problems && r.problems.length) {
      try { window.Native.dropStagedImport(); } catch (e) {}
      showImportProblems(r.problems);
      return;
    }
    var saved = "";
    try { saved = String(window.Native.saveDeck(text) || ""); } catch (e) { saved = ""; }
    try { window.Native.dropStagedImport(); } catch (e) {}
    if (!saved) { showImportProblems(["写入失败：id 不合法或存储空间不足"]); return; }
    toast("已导入 " + saved + "（" + r.checks + " 个知识点）");
    switchDeck(saved);
  }
  window.__importStaged = importStaged;

  function pickDeckFile() {
    if (!window.Native || !window.Native.pickDeckFile) { toast("网页模式不支持文件导入"); return; }
    try { window.Native.pickDeckFile(); } catch (e) { toast("打开文件选择器失败"); }
  }

  function renderMore() {
    var s = stats();
    var html = [];
    html.push('<div class="stat-grid">' +
      stat(s.total, term("check")) + stat(s.byLevel[2] + s.byLevel[3], "已掌握") +
      stat(Object.keys(state.quiz).length, "刷过题") + "</div>");

    html.push('<div class="sub-h"><b>外观</b></div>');
    html.push('<div class="seg" id="themeSeg">' +
      '<button data-theme="dark" class="' + (themeNow() === "dark" ? "on" : "") + '">深色</button>' +
      '<button data-theme="light" class="' + (themeNow() === "light" ? "on" : "") + '">浅色</button></div>');

    html.push('<div class="divider"></div>');
    html.push(renderDeckSection());

    html.push('<div class="divider"></div>');
    html.push('<div class="sub-h"><b>局域网同步</b><span>电脑端运行 tools/sync.js</span></div>');
    html.push('<div class="field"><label>电脑地址（IP:端口）</label>' +
      '<input class="search" id="syncHost" placeholder="192.168.1.5:8787" value="' + esc(state.sync.host) + '"></div>');
    html.push('<div class="field"><label>配对码</label>' +
      '<input class="search" id="syncCode" placeholder="4 位数字" inputmode="numeric" value="' + esc(state.sync.code) + '"></div>');
    html.push('<div class="btn-row">' +
      '<button class="btn" id="btnPing">测试连接</button>' +
      '<button class="btn primary" id="btnPull">拉取</button>' +
      '<button class="btn" id="btnPush">推送</button></div>');
    html.push('<div class="note" id="syncNote">拉取=用电脑上的进度覆盖本机（会按时间戳合并）；推送=把本机进度写到电脑。</div>');

    html.push('<div class="divider"></div>');
    html.push('<div class="sub-h"><b>数据</b></div>');
    html.push('<div class="note">学习包：' + esc(D.title) + "（" + esc(D.id) + "）<br>" +
      term("group") + " " + (D.groups || []).length + " · " + term("check") + " " + s.total + " · " + term("qa") + " " + QA_LIST.length + "<br>" +
      "进度文件：" + (window.Native ? "应用私有目录 states/" + esc(D.id) + ".json" : "浏览器 localStorage（按包分开存）") + "</div>");
    html.push('<div class="btn-row"><button class="btn danger" id="btnReset">清空本机进度</button></div>');
    html.push('<div class="note" style="margin-top:16px">题台 ' + APP_VERSION + ' · 通用学习包引擎，内容与程序分离。</div>');
    $("#view").innerHTML = html.join("");
  }

  function stat(n, label) {
    return '<div class="stat"><b>' + n + "</b><small>" + label + "</small></div>";
  }

  /* ---------------- 详情面板 ---------------- */
  var sheetOpen = false;

  function openSheet(html) {
    var s = $("#sheet");
    s.innerHTML = '<div class="sheet-head"><span class="grab"></span>' +
      '<span class="note" style="color:var(--fg2)">详情</span>' +
      '<button class="x" data-act="close-sheet">✕</button></div>' +
      '<div class="sheet-body">' + html + "</div>";
    s.classList.add("on");
    $("#mask").classList.add("on");
    s.scrollTop = 0;
    sheetOpen = true;
  }

  function closeSheet() {
    $("#sheet").classList.remove("on");
    $("#mask").classList.remove("on");
    sheetOpen = false;
  }

  function jumpBtn(id, kind) {
    var q = QA[id];
    if (!q) return "";
    var icon = kind === "next" ? "↳" : kind === "peer" ? "⇄" : "↑";
    return '<button class="jump" data-jump="' + id + '">' + icon + " " + esc(q.q) + "</button>";
  }

  function openQa(id) {
    var q = QA[id];
    if (!q) return;
    var g = D.groups.filter(function (x) { return x.id === q.m; })[0];
    var html = [];
    html.push('<div class="qa-row" style="border:0;background:transparent;padding:0">' +
      '<div class="lr"><span class="lbadge L' + q.layer + '">L' + q.layer + '</span></div>' +
      '<div class="main"><div class="meta" style="margin:0">' + esc(g ? g.title : q.m) +
      " · " + esc(q.lvl) + " · " + esc(q.id) + "</div></div></div>");
    html.push('<div class="q-title">' + rich(q.q) + "</div>");
    html.push('<div class="meta-row">' + (q.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + "</span>";
    }).join("") + "</div>");
    (q.ans || []).forEach(function (a) {
      html.push('<div class="ans-block"><div class="ans-h">' + esc(a.h) + '</div><div class="ans-p">' + rich(a.p) + "</div></div>");
    });
    if (q.covers && q.covers.length) {
      html.push('<div class="foot-row"><span class="foot-k">覆盖点</span>' +
        q.covers.map(function (c) {
          var chk = CHECK[c];
          return '<button class="jump" data-check="' + c + '">' + esc(c) + " " + esc(chk ? chk.text.slice(0, 14) : "") + "…</button>";
        }).join("") + "</div>");
    }
    if (q.next && q.next.length) {
      html.push('<div class="foot-row"><span class="foot-k">追问</span>' + q.next.map(function (x) { return jumpBtn(x, "next"); }).join("") + "</div>");
    }
    if (q.peer && q.peer.length) {
      html.push('<div class="foot-row"><span class="foot-k">关联</span>' + q.peer.map(function (x) { return jumpBtn(x, "peer"); }).join("") + "</div>");
    }
    if (q.backNext && q.backNext.length) {
      html.push('<div class="foot-row"><span class="foot-k">被追问</span>' + q.backNext.map(function (x) { return jumpBtn(x, "back"); }).join("") + "</div>");
    }
    html.push('<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn" data-act="fav-qa" data-id="' + q.id + '">' + (isFav(q.id) ? "★ 已收藏" : "☆ 收藏此题") + "</button>" +
      '<button class="btn" data-act="drill-this" data-id="' + q.id + '">拿它刷一遍</button></div>');
    openSheet(html.join(""));
  }

  function openCheck(id) {
    var c = CHECK[id];
    if (!c) return;
    var qs = QAS_OF_CHECK[id] || [];
    var html = [];
    html.push('<div class="meta-row"><span class="tag">' + esc(id) + '</span><span class="lvl ' + esc(c.lvl) + '">' + esc(c.lvl) + "</span></div>");
    html.push('<div class="q-title">' + rich(c.text) + "</div>");
    html.push('<div class="foot-row"><span class="foot-k">所属</span><span class="note">' + esc(c.group.title) + "</span></div>");
    html.push('<div class="sub-h"><b>对应' + esc(term("qa")) + '</b><span>' + qs.length + " 条</span></div>");
    if (!qs.length) html.push('<div class="note">这条' + esc(term("check")) + '还没有对应' + esc(term("qa")) + '。</div>');
    qs.forEach(function (qid) {
      var q = QA[qid];
      html.push('<div class="qa-row" data-jump="' + qid + '"><div class="lr"><span class="lbadge L' + q.layer + '">L' + q.layer + "</span></div>" +
        '<div class="main"><div class="q">' + rich(q.q) + "</div></div></div>");
    });
    html.push('<div class="sub-h"><b>掌握度</b></div>');
    html.push('<div class="seg" id="checkSeg">' + [1, 2, 3].map(function (k) {
      return '<button data-cm="' + k + '" data-cid="' + id + '" class="' + (mOf(id) >= k ? "on" : "") + '">' +
        ["", "模糊", "会", "熟练"][k] + "</button>";
    }).join("") + "</div>");
    html.push('<div class="btn-row"><button class="btn" data-act="fav-check" data-id="' + id + '">' +
      (isFav(id) ? "★ 已收藏" : "☆ 收藏此" + esc(term("check")) ) + "</button></div>");
    openSheet(html.join(""));
  }

  /* ---------------- 主题 ---------------- */
  function themeNow() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    state.settings.theme = t;
    setPref("theme", t);
    save();
    $("#themeBtn").textContent = t === "light" ? "☀" : "☾";
    try { if (window.Native && window.Native.setChrome) window.Native.setChrome(t); } catch (e) {}
  }

  /* ---------------- 同步 ---------------- */
  function mergeState(remote) {
    if (!remote || !remote.checks) return 0;
    var n = 0;
    ["checks", "fav", "quiz"].forEach(function (k) {
      var src = remote[k] || {};
      Object.keys(src).forEach(function (id) {
        var a = state[k][id], b = src[id];
        if (!a || (b.t || 0) > (a.t || 0)) { state[k][id] = b; n++; }
      });
    });
    state.rev = Math.max(state.rev, remote.rev || 0) + 1;
    save(true);
    return n;
  }

  function syncCall(path, body) {
    var host = (state.sync.host || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!host) { toast("先填电脑地址"); return; }
    state.sync.host = host;
    state.sync.code = ($("#syncCode") || {}).value || state.sync.code;
    setPref("host", state.sync.host);
    setPref("code", state.sync.code);
    var code = (state.sync.code || "").trim();
    if (!code) { toast("先填配对码"); return; }
    var url = "http://" + host + path;
    var payload = JSON.stringify({
      code: code,
      deck: D.id,
      state: path === "/api/push" ? state : null
    });
    if (!window.Native) { toast("网页调试模式：同步需在 App 内使用"); return; }
    syncBusy = true;
    var note = $("#syncNote");
    if (note) note.textContent = "连接 " + host + " …";
    var raw = window.Native.http(path === "/api/ping" ? "GET" : "POST", url, path === "/api/ping" ? "" : payload, 5000);
    syncBusy = false;
    var res;
    try { res = JSON.parse(raw); } catch (e) { toast("返回不是 JSON"); return; }
    if (!res.status) { toast("连不上：" + (res.error || "").slice(0, 40)); if (note) note.textContent = "连不上，检查是否同一 WiFi、地址与防火墙。"; return; }
    if (res.status !== 200) { toast("HTTP " + res.status); if (note) note.textContent = "HTTP " + res.status + "：" + String(res.body).slice(0, 120); return; }
    var data;
    try { data = JSON.parse(res.body); } catch (e) { toast("响应解析失败"); return; }
    if (data.ok === false) { toast(data.msg || "配对码不对"); if (note) note.textContent = data.msg || "配对码不对"; return; }

    if (path === "/api/ping") {
      if (note) note.textContent = "已连接 " + (data.name || host) + "，电脑端有 " + (data.qas || 0) + " 条问答。";
      toast("连接成功");
    } else if (path === "/api/pull") {
      if (data.state && data.state.deck && data.state.deck !== D.id) {
        toast("电脑上这份进度属于 " + data.state.deck + "，不是当前学习包");
        if (note) note.textContent = "学习包对不上，没有合并。";
        return;
      }
      var n = mergeState(data.state);
      toast("拉取完成");
      paintRing();
      render();
      var nn = $("#syncNote");
      var mastered = 0;
      for (var ck in state.checks) { if (state.checks[ck] && state.checks[ck].m >= 2) mastered++; }
      if (nn) nn.textContent = "拉取完成，合并了 " + n + " 条更新（已掌握 " + mastered + "）。";
    } else {
      if (note) note.textContent = "推送完成，电脑端已保存。";
      toast("推送完成");
    }
  }

  /* ---------------- 事件 ---------------- */
  function render() {
    var tab = currentTab();
    if (tab === "list") renderList();
    else if (tab === "qa") renderQa();
    else if (tab === "fav") renderFav();
    else if (tab === "drill") renderDrill();
    else renderMore();
    paintRing();
  }

  var tab = "list";
  function currentTab() { return tab; }
  function setTab(t) {
    console.log("[tab] " + t);
    tab = t;
    state.settings.tab = t;
    save();
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar button"), function (b) {
      b.classList.toggle("on", b.dataset.tab === t);
    });
    window.scrollTo(0, 0);
    render();
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-tab],[data-act],[data-chip],[data-qchip],[data-qa],[data-jump],[data-star],[data-m],[data-check],[data-dmode],[data-rate],[data-cm],[data-deck],[data-del-deck],[data-download],.seg [data-theme]");
    if (!t) { console.log("[click] miss " + ev.target.tagName); return; }
    console.log("[click] " + (t.dataset.tab ? "tab=" + t.dataset.tab : JSON.stringify(t.dataset).slice(0, 80)));

    if (t.dataset.tab) { setTab(t.dataset.tab); return; }

    /* 学习包切换 / 删除 / 下载 */
    if (t.dataset.deck) { switchDeck(t.dataset.deck); return; }
    if (t.dataset.delDeck) {
      var delId = t.dataset.delDeck;
      if (!confirm("删除学习包「" + delId + "」？它的进度也会一起删掉。")) return;
      try {
        if (window.Native && window.Native.deleteDeck) window.Native.deleteDeck(delId);
        if (window.Native && window.Native.clearState) window.Native.clearState(delId);
      } catch (e) {}
      toast("已删除 " + delId);
      renderMore();
      return;
    }
    if (t.dataset.download) { downloadDeck(t.dataset.download); return; }

    if (t.dataset.chip) { listFilter = t.dataset.chip; renderList(); return; }
    if (t.dataset.qchip) { qaFilter = t.dataset.qchip; renderQa(); return; }

    if (t.dataset.star) {
      var on = toggleFav(t.dataset.star);
      t.classList.toggle("on", on);
      t.textContent = on ? "★" : "☆";
      toast(on ? "已收藏" : "已取消收藏");
      return;
    }

    if (t.dataset.m && t.closest("[data-dots]")) {
      var cid = t.closest("[data-dots]").dataset.dots;
      var cur = mOf(cid);
      var m = parseInt(t.dataset.m, 10);
      setM(cid, cur === m ? 0 : m);
      paintRing();
      var row = t.closest(".check");
      var fresh = checkRow(CHECK[cid]);
      var tmp = document.createElement("div");
      tmp.innerHTML = fresh;
      row.replaceWith(tmp.firstChild);
      return;
    }

    if (t.dataset.qa) { openQa(t.dataset.qa); return; }
    if (t.dataset.jump) { openQa(t.dataset.jump); return; }

    if (t.dataset.dmode) { drillMode = t.dataset.dmode; drillCur = null; renderDrill(); return; }
    if (t.dataset.rate) { rate(parseInt(t.dataset.rate, 10)); return; }
    if (t.dataset.theme) { setTheme(t.dataset.theme); renderMore(); return; }
    if (t.dataset.cm) {
      var cid2 = t.dataset.cid;
      if (cid2) {
        setM(cid2, parseInt(t.dataset.cm, 10));
        Array.prototype.forEach.call(document.querySelectorAll("#checkSeg button"), function (b) {
          b.classList.toggle("on", mOf(cid2) >= parseInt(b.dataset.cm, 10));
        });
        paintRing();
      }
      return;
    }

    var act = t.dataset.act;
    if (act === "toggle") { t.closest(".mod").classList.toggle("open"); return; }
    if (act === "open-check") { openCheck(t.closest(".check").dataset.check); return; }
    if (act === "close-sheet") { closeSheet(); return; }
    if (act === "reveal") { drillRevealed = true; renderDrill(); return; }
    if (act === "fav-qa") {
      var qid = t.dataset.id, on2 = toggleFav(qid);
      t.textContent = on2 ? "★ 已收藏" : "☆ 收藏此题";
      toast(on2 ? "已收藏" : "已取消收藏");
      return;
    }
    if (act === "fav-check") {
      var on3 = toggleFav(t.dataset.id);
      t.textContent = on3 ? "★ 已收藏" : "☆ 收藏此点";
      toast(on3 ? "已收藏" : "已取消收藏");
      return;
    }
    if (act === "drill-this") {
      drillCur = QA[t.dataset.id];
      drillRevealed = false;
      closeSheet();
      setTab("drill");
      renderDrill();
      return;
    }
  });

  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.id === "listSearch") { listQuery = t.value.trim().toLowerCase(); var pos = t.selectionStart; renderList(); var f = $("#listSearch"); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }
    else if (t.id === "qaSearch") { qaQuery = t.value.trim().toLowerCase(); var p2 = t.selectionStart; renderQa(); var g = $("#qaSearch"); if (g) { g.focus(); g.setSelectionRange(p2, p2); } }
    else if (t.id === "syncHost") { state.sync.host = t.value; setPref("host", t.value); save(); }
    else if (t.id === "syncCode") { state.sync.code = t.value; setPref("code", t.value); save(); }
  });

  $("#mask").addEventListener("click", closeSheet);

  $("#themeBtn").addEventListener("click", function () {
    setTheme(themeNow() === "light" ? "dark" : "light");
    if (tab === "more") renderMore();
  });

  document.addEventListener("click", function (ev) {
    if (ev.target.id === "btnPing") syncCall("/api/ping", null);
    else if (ev.target.id === "btnPull") syncCall("/api/pull", null);
    else if (ev.target.id === "btnPush") syncCall("/api/push", null);
    else if (ev.target.id === "btnDecks") fetchDeckIndex();
    else if (ev.target.id === "btnImportFile") pickDeckFile();
    else if (ev.target.id === "btnReset") {
      state.checks = {}; state.fav = {}; state.quiz = {}; state.rev++;
      save(true);
      paintRing(); render();
      toast("本机进度已清空");
    }
  });

  /* 返回键：先关面板，再回自查页，否则交给系统 */
  window.__back = function () {
    if (sheetOpen) { closeSheet(); return true; }
    if (tab !== "list") { setTab("list"); return true; }
    return false;
  };

  /* 深链：?tab=qa &open=q.m1.types（问答）或 ?check=m1.1 —— 也方便截图与调试 */
  function applyDeepLink() {
    var q = location.search.replace(/^\?/, "");
    if (!q) return;
    var p = {};
    q.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    /* 换包深链：?deck=demo —— 切到该包并重新加载 */
    if (p.deck && p.deck !== CUR_DECK) {
      try {
        if (window.Native && window.Native.setCurrentDeck) {
          window.Native.setCurrentDeck(p.deck);
          location.replace("index.html");
          return;
        }
      } catch (e) {}
    }
    /* 同步/下载的前提：先把地址与配对码落下来，后面几步才能用 */
    if (p.host) { state.sync.host = p.host; setPref("host", p.host); }
    if (p.code) { state.sync.code = p.code; setPref("code", p.code); }
    if (p.host || p.code) save();
    if (p.tab) setTab(p.tab);
    if (p.download) { setTab("more"); downloadDeck(p.download); return; }
    if (p.decks) { setTab("more"); setTimeout(fetchDeckIndex, 200); return; }
    if (p.pick) { setTab("more"); setTimeout(pickDeckFile, 300); return; }
    if (p.open && QA[p.open]) { setTab("qa"); openQa(p.open); }
    else if (p.check && CHECK[p.check]) { setTab("list"); openCheck(p.check); }
    if (p.sync) {
      setTab("more");
      var path = p.sync === "pull" ? "/api/pull" : (p.sync === "push" ? "/api/push" : "/api/ping");
      setTimeout(function () { syncCall(path, null); }, 300);
    }
  }

  /* ---------------- 启动 ---------------- */
  prefs = loadPrefs();
  loadState();
  $("#deckTitle").textContent = D.title || "题台";
  $("#tabList").textContent = term("check");
  $("#tabQa").textContent = term("qa");
  $("#deckSub").textContent = (D.groups || []).length + " 个" + term("group") + " · " + QA_LIST.length + " 条" + term("qa");
  setTheme(state.settings.theme || "dark");
  setTab(state.settings.tab || "list");
  applyDeepLink();
})();

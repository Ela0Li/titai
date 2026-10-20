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

  /* ---------------- 索引（每次换包重建） ---------------- */
  var QA = {}, CHECK = {}, GROUP_OF = {}, COVERS = {}, QAS_OF_CHECK = {};
  var QA_LIST = [];

  function hydrate(d) {
    if (d && d.groups && d.groups.length) D = d;
    QA = {}; CHECK = {}; GROUP_OF = {}; COVERS = {}; QAS_OF_CHECK = {};
    QA_LIST = (D.qas || []).slice();
    (D.groups || []).forEach(function (g, gi) {
      g.gi = gi;
      (g.checks || []).forEach(function (c) {
        CHECK[c.id] = { id: c.id, text: c.text, lvl: c.lvl, g: g.id, group: g, seeAlso: c.seeAlso || [] };
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
    TERMS = Object.assign({ group: "模块", check: "知识点", qa: "问答" }, D.terms || {});
  }
  hydrate(D);

  /* ---------------- 学习计划（协议 v1.3） ---------------- */
  var PLAN = null, MEMBERS = [], DECK_META = [], DECK_CACHE = {}, QA_ALL = [];

  /* Java 桥方法不是普通 JS 函数，不能 apply，只能按名字定参调用 */
  function n0(name) {
    try { if (!window.Native || typeof window.Native[name] !== "function") return null; return window.Native[name](); } catch (e) { return null; }
  }
  function n1(name, a) {
    try { if (!window.Native || typeof window.Native[name] !== "function") return null; return window.Native[name](a); } catch (e) { return null; }
  }

  (function loadPlan() {
    var plans = [];
    try { plans = JSON.parse(n0("listPlans") || "[]") || []; } catch (e) { plans = []; }
    var pid = n0("currentPlan") || "";
    plans.forEach(function (p) { if (!PLAN && p.id === pid) PLAN = p; });
    if (!PLAN) PLAN = plans[0] || null;
    MEMBERS = PLAN && PLAN.members && PLAN.members.length ? PLAN.members.slice() : [CUR_DECK];
    if (MEMBERS.indexOf(CUR_DECK) < 0 && CUR_DECK) MEMBERS.unshift(CUR_DECK);

    try { DECK_META = JSON.parse(n0("listDecks") || "[]") || []; } catch (e) { DECK_META = []; }

    MEMBERS.forEach(function (id) {
      try {
        var d = null;
        try {
          var txt = n1("readDeck", id);
          if (txt) d = JSON.parse(txt);
        } catch (e) { d = null; }
        if (!d && id === CUR_DECK) d = D;
        if (!d) return;
        DECK_CACHE[id] = d;
        (d.qas || []).forEach(function (q) {
          QA_ALL.push({ deck: id, id: q.id, q: q.q, layer: q.layer, m: q.m, tags: q.tags || [] });
        });
      } catch (e) {}
    });
    if (!DECK_CACHE[CUR_DECK]) DECK_CACHE[CUR_DECK] = D;
  })();

  function deckInfo(id) {
    for (var i = 0; i < DECK_META.length; i++) if (DECK_META[i].id === id) return DECK_META[i];
    var d = DECK_CACHE[id];
    return d ? { id: id, title: d.title, checks: (d.groups || []).reduce(function (n, g) { return n + (g.checks || []).length; }, 0), qas: (d.qas || []).length } : null;
  }
  function deckTitle(id) {
    var m = deckInfo(id);
    return (m && (m.short || m.title)) || id;
  }
  function deckShort(id) {
    var d = DECK_CACHE[id];
    return (d && d.meta && d.meta.short) || String(deckTitle(id)).split(" · ")[0];
  }
  function inPlan(id) { return MEMBERS.indexOf(id) >= 0; }


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
    propagateMastery(checkId, m);
    save();
  }

  /* ---- 掌握度同步：同一条问答覆盖的自查点共享掌握度（协议 v1.3 §10） ---- */
  function splitLocal(ref) {
    var i = String(ref).indexOf("#");
    return i > 0 ? { deck: ref.slice(0, i), id: ref.slice(i + 1) } : { deck: "", id: String(ref) };
  }
  function readForeignState(deckId) {
    try {
      var raw = window.Native && window.Native.readState ? window.Native.readState(deckId) : null;
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { return {}; }
  }
  function writeForeignState(deckId, st) {
    try {
      if (window.Native && window.Native.writeState) window.Native.writeState(deckId, JSON.stringify(st));
    } catch (e) { toast("同步到 " + deckId + " 失败"); }
  }
  function siblingChecks(cid) {
    var out = [], seen = {};
    (QAS_OF_CHECK[cid] || []).forEach(function (qid) {
      var q = QA[qid];
      if (!q) return;
      (q.covers || []).forEach(function (ref) {
        var r = splitLocal(ref);
        var deck = r.deck || CUR_DECK;
        var key = deck + "|" + r.id;
        if (deck === CUR_DECK && r.id === cid) return;
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ deck: deck, id: r.id });
      });
    });
    return out;
  }
  function propagateMastery(cid, m) {
    var sibs = siblingChecks(cid);
    if (!sibs.length) return;
    var batches = {}, touched = 0;
    sibs.forEach(function (s) {
      if (s.deck === CUR_DECK) {
        if (!CHECK[s.id]) return;
        state.checks[s.id] = { m: m, t: Date.now() };
        touched++;
        return;
      }
      if (!DECK_CACHE[s.deck]) return;          /* 对方包没装：跳过 */
      var st = batches[s.deck] || (batches[s.deck] = readForeignState(s.deck));
      st.checks = st.checks || {};
      st.checks[s.id] = { m: m, t: Date.now() };
      st.rev = (st.rev || 0) + 1;
      st.touched = Date.now();
      touched++;
    });
    Object.keys(batches).forEach(function (did) { writeForeignState(did, batches[did]); });
    if (touched) toast("掌握度已同步到另外 " + touched + " 个" + term("check"));
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
    /* 先切公式（$…$ 行内 / $$…$$ 块级），其余照旧：转义 + 反引号转 code */
    function plain(t) { return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>"); }
    if (window.MathML && window.MathML.renderText) return window.MathML.renderText(s, plain);
    return plain(s);
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
    var decks = MEMBERS.filter(function (id) { return !!DECK_CACHE[id]; });
    if (!decks.length) decks = [CUR_DECK];
    decks.forEach(function (did) {
      var dd = DECK_CACHE[did] || D;
      var active = did === CUR_DECK;
      var dChecks = (dd.groups || []).reduce(function (n, gg) { return n + (gg.checks || []).length; }, 0);
      var openGroups = (did === CUR_DECK ? (window.__openDecks || {}) : {})[did];
      html.push('<div class="decksec' + (active ? " on" : "") + '" data-decksec="' + esc(did) + '">' +
        '<span class="ds-chev">' + (active ? "▾" : "▸") + "</span>" +
        '<span class="ds-name">' + esc(deckShort(did)) + "</span>" +
        '<span class="ds-meta">' + (dd.groups || []).length + " 模块 · " + dChecks + " " + esc(term("check")) + "</span></div>");
      if (!active) return;
      (dd.groups || []).forEach(function (g) {
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
    });

    if (!shown) html.push('<div class="empty">没有符合条件的' + esc(term("check")) + '</div>');
    html.push('<div class="hint lgdline" style="margin-top:14px">点圆点记掌握度（再点同一个点可清除；点文字看对应问答）'
      + '<div class="lgds">'
      + '<span class="lgt"><span class="ld"></span><span class="ld"></span><span class="ld"></span>未学</span>'
      + '<span class="lgt lv1"><span class="ld on"></span><span class="ld"></span><span class="ld"></span>模糊</span>'
      + '<span class="lgt lv2"><span class="ld on"></span><span class="ld on"></span><span class="ld"></span>会</span>'
      + '<span class="lgt lv3"><span class="ld on"></span><span class="ld on"></span><span class="ld on"></span>熟练</span>'
      + '</div></div>');
    $("#view").innerHTML = html.join("");
  }

  function chip(v, label) {
    return '<button class="chip' + (listFilter === v ? " on" : "") + '" data-chip="' + v + '">' + label + "</button>";
  }

  function checkRow(c) {
    var m = mOf(c.id);
    var dots = [1, 2, 3].map(function (k) {
      return '<button class="dot' + (m >= k ? " on" : "") + '" data-m="' + k + '" aria-label="掌握度' + k + '"></button>';
    }).join("");
    return '<div class="check" data-check="' + c.id + '">' +
      '<div class="check-c" data-act="open-check"><em>' + esc(c.id) + "</em>" + rich(c.text) + "</div>" +
      '<span class="lvl ' + esc(c.lvl) + '">' + esc(c.lvl) + "</span>" +
      '<div class="dots" data-dots="' + c.id + '" data-lv="' + m + '">' + dots + "</div>" +
      '<button class="star' + (isFav(c.id) ? " on" : "") + '" data-star="' + c.id + '">' + (isFav(c.id) ? "★" : "☆") + "</button>" +
      "</div>";
  }

  /* ---------------- 视图：问答 ---------------- */
  var qaFilter = "all";
  var qaQuery = "";
  /* 问答页按知识包筛选：on=false 表示“全部包” */
  var qaDecks = { on: false, ids: {} };

  function renderQa() {
    var html = [];
    html.push('<input class="search" id="qaSearch" placeholder="搜索问题、标签、答案…" value="' + esc(qaQuery) + '">');
    /* 按知识包筛选：默认勾选计划里的全部知识包 */
    var decks = MEMBERS.filter(function (id) { return !!DECK_CACHE[id]; });
    if (decks.length > 1) {
      html.push('<div class="chips" id="qaDecks">' +
        '<button class="chip' + (qaDecks.on ? "" : " on") + '" data-qdeck="all">全部包</button>' +
        decks.map(function (id) {
          return '<button class="chip' + (qaDecks.on && qaDecks.ids[id] ? " on" : "") +
            '" data-qdeck="' + esc(id) + '">' + esc(deckShort(id)) + "</button>";
        }).join("") + "</div>");
    }
    html.push('<div class="chips" id="qaChips">' +
      ["all", "1", "2", "3", "4"].map(function (v) {
        var label = v === "all" ? "全部" : "L" + v;
        return '<button class="chip' + (qaFilter === v ? " on" : "") + '" data-qchip="' + v + '">' + label + "</button>";
      }).join("") + "</div>");

    var pool = decks.length > 1 ? QA_ALL : QA_LIST.map(function (q) { return { deck: CUR_DECK, q: q.q, id: q.id, layer: q.layer, m: q.m, tags: q.tags || [] }; });
    var list = pool.filter(function (row) {
      if (decks.length > 1 && qaDecks.on && !qaDecks.ids[row.deck]) return false;
      if (qaFilter !== "all" && String(row.layer) !== qaFilter) return false;
      if (!qaQuery) return true;
      var q = row.deck === CUR_DECK ? QA[row.id] : null;
      var hay = row.q + " " + (row.tags || []).join(" ") + " " + (q ? (q.ans || []).map(function (a) { return a.p; }).join(" ") : "");
      return hay.toLowerCase().indexOf(qaQuery) >= 0;
    });

    list.forEach(function (row) {
      var dd = DECK_CACHE[row.deck] || D;
      var g = (dd.groups || []).filter(function (x) { return x.id === row.m; })[0];
      html.push('<div class="qa-row" data-qa="' + esc(row.id) + '" data-qdeckrow="' + esc(row.deck) + '">' +
        '<div class="lr"><span class="lbadge L' + row.layer + '">L' + row.layer + "</span></div>" +
        '<div class="main"><div class="q">' + rich(row.q) + "</div>" +
        '<div class="meta">' + (decks.length > 1 ? '<span class="dtag">' + esc(deckShort(row.deck)) + "</span>" : "") +
        "<span>" + esc(g ? g.title : row.m) + "</span>" +
        (row.tags || []).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
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
    /* 计划内的包按计划顺序排，其余排在后面 */
    list.sort(function (a, b) {
      var ia = MEMBERS.indexOf(a.id), ib = MEMBERS.indexOf(b.id);
      if (ia < 0) ia = 99 + (a.builtin ? 0 : 1);
      if (ib < 0) ib = 99 + (b.builtin ? 0 : 1);
      if (ia !== ib) return ia - ib;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
    var html = ['<div class="sub-h"><b>学习计划</b><span>' + esc((PLAN && PLAN.title) || "未命名计划") + "</span></div>"];
    html.push('<div class="note" style="margin:0 0 10px">计划里的知识包在顶部可一键切换、不重载页面；进度仍各存各的。</div>');
    html.push('<div class="sub-h"><b>知识包</b><span>' + list.length + " 个</span></div>");
    list.forEach(function (d) {
      var on = d.id === CUR_DECK;
      var member = inPlan(d.id);
      html.push('<div class="deck-row' + (on ? " on" : "") + '">' +
        '<div class="deck-main"><div class="deck-t">' + esc(d.title || d.id) +
        (on ? ' <span class="deck-cur">使用中</span>' : "") +
        (member ? ' <span class="dtag">计划内</span>' : "") + "</div>" +
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
    /* 手动换包 = 结束跨包会话，顺手解掉只读 */
    prefs.pendingBack = null;
    prefs.pendingOpen = null;
    try { savePrefs(); } catch (e) {}
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

  /* 新导入的包自动加入当前计划（计划内才能一键切） */
  function addToPlan(deckId) {
    if (!PLAN || !deckId || inPlan(deckId)) return;
    try {
      PLAN.members = (PLAN.members || []).concat([deckId]);
      if (window.Native && window.Native.savePlan) window.Native.savePlan(JSON.stringify(PLAN));
      MEMBERS = PLAN.members.slice();
    } catch (e) {}
  }

  function resetState() {
    state.checks = {};
    state.fav = {};
    state.quiz = {};
    state.rev = 0;
    state.touched = 0;
  }

  /* 计划内软切换：不重载页面，就地换索引、进度与视图 */
  function softSwitch(id) {
    if (!id || id === CUR_DECK) return false;
    var d = DECK_CACHE[id];
    if (!d) { toast("这个知识包还没装"); return false; }
    try { save(true); } catch (e) {}
    try { if (window.Native && window.Native.setCurrentDeck) window.Native.setCurrentDeck(id); } catch (e) {}
    CUR_DECK = id;
    resetState();
    hydrate(d);
    loadState();
    /* 主题、同步地址是设备级的，别被对方包里存的老值带跑 */
    if (prefs.theme) state.settings.theme = prefs.theme;
    if (prefs.host) state.sync.host = prefs.host;
    if (prefs.code) state.sync.code = prefs.code;
    renderTop();
    paintRing();
    render();
    setTheme(state.settings.theme || "dark");
    try { window.scrollTo(0, 0); } catch (e) {}
    return true;
  }

  function renderTop() {
    var bar = $("#planBar");
    var decks = MEMBERS.filter(function (id) { return !!DECK_CACHE[id]; });
    var total = 0, done = 0;
    decks.forEach(function (id) {
      var dd = DECK_CACHE[id];
      (dd.groups || []).forEach(function (g) {
        (g.checks || []).forEach(function (c) {
          total++;
          if (id === CUR_DECK && mOf(c.id) >= 2) done++;
        });
      });
    });
    $("#deckTitle").textContent = (PLAN && PLAN.title) || D.title || "题台";
    $("#deckSub").textContent = decks.length > 1
      ? decks.length + " 个知识包 · " + total + " " + term("check") + " · " + QA_ALL.length + " " + term("qa")
      : (D.groups || []).length + " 个" + term("group") + " · " + QA_LIST.length + " 条" + term("qa");

    if (!bar) return;
    if (decks.length < 2) { bar.innerHTML = ""; bar.classList.remove("on"); return; }
    bar.classList.add("on");
    bar.innerHTML = decks.map(function (id) {
      return '<button class="pchip' + (id === CUR_DECK ? " on" : "") + '" data-plan-deck="' + esc(id) + '">' +
        esc(deckShort(id)) + "</button>";
    }).join("");
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
    /* 跨包引用（协议 v1.2）：deckId#localId —— 只查语法，解析交给 check-links */
    function isCrossRef(r) { return typeof r === "string" && r.indexOf("#") > 0; }
    function crossSyntax(r, where) {
      var i = r.indexOf("#");
      var deck = r.slice(0, i), id = r.slice(i + 1);
      if (!DECK_ID_RE.test(deck)) bad("E_CROSS_SYNTAX", where + " 的包 id 不合法：" + deck);
      if (deck === d.id) bad("E_CROSS_SYNTAX", where + " 不该写自己的包 id：" + r);
      if (!id) bad("E_CROSS_SYNTAX", where + " 缺条目 id：" + r);
    }
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
        (Array.isArray(c.seeAlso) ? c.seeAlso : []).forEach(function (r) {
          if (isCrossRef(r)) crossSyntax(r, c.id + " seeAlso");
        });
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
        else if (isCrossRef(c)) crossSyntax(c, q.id + " covers");
        else if (!checkIds[c]) bad("E_COVER_REF", q.id + " 覆盖了不存在的自查点 " + c);
      });

      ["next", "peer"].forEach(function (k) {
        (Array.isArray(q[k]) ? q[k] : []).forEach(function (r) {
          if (r === q.id) bad("E_SELF_REF", q.id + " 的 " + k + " 指向自己");
          else if (isCrossRef(r)) crossSyntax(r, q.id + " " + k);
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
    addToPlan(saved);
    toast("已导入 " + saved + "（" + r.checks + " 个" + term("check") + "）");
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
    html.push('<div class="sub-h"><b>跨包关联</b><span>协议 v1.2</span></div>');
    html.push('<div class="seg" id="cwSeg">' +
      '<button data-cw="0" class="' + (prefs.crossWrite ? "" : "on") + '">只读</button>' +
      '<button data-cw="1" class="' + (prefs.crossWrite ? "on" : "") + '">可打点</button></div>');
    html.push('<div class="note">其他学习包指向本包的记录会显示在详情页「被引用」里。默认跨包只读：<b>只读</b>时不改对方进度，<b>可打点</b>时允许在对方包里记掌握度（两边各记一份）。</div>');
    if (prefs.pendingBack && prefs.pendingBack.deck && prefs.pendingBack.deck !== CUR_DECK) {
      html.push('<div class="btn-row"><button class="btn" data-act="end-cross">结束跨包只读</button></div>');
    }

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
  var SHEET_ID = "";

  function openSheet(html) {
    var s = $("#sheet");
    var back = prefs.pendingBack;
    var backBar = "";
    if (back && back.deck && back.deck !== CUR_DECK) {
      backBar = '<div class="backbar"><button class="jump" data-cross-back="1">← 返回 ' +
        esc(deckTitle(back.deck)) + "</button><span class=\"note\">跨包只读</span></div>";
    }
    s.innerHTML = '<div class="sheet-head"><span class="grab"></span>' +
      '<span class="note" style="color:var(--fg2)">详情</span>' +
      '<button class="x" data-act="close-sheet">✕</button></div>' +
      '<div class="sheet-body">' + backBar + html + "</div>";
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

  /* ---------------- 跨包引用（协议 v1.2 §8） ---------------- */
  var LINK_INDEX = null;

  function deckMeta() {
    if (DECK_META && DECK_META.length) return DECK_META;
    var arr = [];
    try {
      if (window.Native && window.Native.listDecks) arr = JSON.parse(String(window.Native.listDecks() || "[]"));
    } catch (e) { arr = []; }
    if (!Array.isArray(arr) || !arr.length) arr = [{ id: CUR_DECK, title: D.title }];
    /* 保证当前包在列表里 */
    if (!arr.some(function (x) { return x.id === CUR_DECK; })) arr = arr.concat([{ id: CUR_DECK, title: D.title }]);
    DECK_META = arr;
    return arr;
  }

  function deckTitle(id) {
    if (id === CUR_DECK) return D.title;
    var m = deckMeta().filter(function (x) { return x.id === id; })[0];
    return m ? m.title : id;
  }

  function readDeckData(id) {
    if (id === CUR_DECK) return D;
    if (Object.prototype.hasOwnProperty.call(DECK_CACHE, id)) return DECK_CACHE[id];
    var d = null;
    try { d = JSON.parse(String(window.Native.readDeck(id) || "null")); } catch (e) { d = null; }
    DECK_CACHE[id] = d;
    return d;
  }

  function splitRef(ref) {
    var i = typeof ref === "string" ? ref.indexOf("#") : -1;
    return i < 0 ? { deck: null, id: ref || "" } : { deck: ref.slice(0, i), id: ref.slice(i + 1) };
  }

  function deckQa(d, id) {
    if (!d || !d.qas) return null;
    for (var i = 0; i < d.qas.length; i++) if (d.qas[i].id === id) return d.qas[i];
    return null;
  }

  function deckCheckItem(d, id) {
    if (!d || !d.groups) return null;
    for (var i = 0; i < d.groups.length; i++) {
      var cs = d.groups[i].checks || [];
      for (var j = 0; j < cs.length; j++) if (cs[j].id === id) return cs[j];
    }
    return null;
  }

  /* 解析一个引用：本地 / 跨包可解析 / 目标包未装 / 目标已删 */
  function resolveRef(ref) {
    var r = splitRef(ref);
    if (!r.deck) return { deck: null, id: r.id, item: QA[r.id] || null, ok: !!QA[r.id] };
    var d = readDeckData(r.deck);
    if (!d) return { deck: r.deck, id: r.id, item: null, ok: false, why: "nodeck" };
    var item = deckQa(d, r.id) || deckCheckItem(d, r.id);
    return { deck: r.deck, id: r.id, item: item, ok: !!item, why: item ? "" : "stale", isCheck: !deckQa(d, r.id) };
  }

  /* 统一的引用按钮：本地走 data-*，跨包走 data-cross */
  function refBtn(ref, kind) {
    var r = resolveRef(ref);
    var icon = kind === "next" ? "↳" : kind === "peer" ? "⇄" : kind === "check" ? "⌖" : kind === "see" ? "◇" : "↑";
    var text;
    if (!r.deck) {
      var q = QA[r.id];
      if (!q) return "";
      text = esc(q.q);
      return '<button class="jump" data-jump="' + esc(r.id) + '">' + icon + " " + text + "</button>";
    }
    var tag = '<span class="xdeck">' + esc(deckTitle(r.deck)) + "</span>";
    if (!r.ok) {
      text = r.why === "nodeck" ? "未安装的学习包 · " + esc(r.id) : "已失效 · " + esc(r.id);
      return '<button class="jump stale" disabled>' + icon + " " + tag + " " + text + "</button>";
    }
    text = r.isCheck ? esc((r.item.text || r.id).slice(0, 16)) : esc(r.item.q || r.id);
    return '<button class="jump xlink" data-cross="' + esc(r.deck + "#" + r.id) + '">' + icon + " " + tag + " " + text + "</button>";
  }

  /* 反向引用：扫已装包，找指向本包条目（或被本包引用的条目）的跨包连接 */
  function buildLinkIndex() {
    if (LINK_INDEX) return LINK_INDEX;
    var idx = {};
    deckMeta().forEach(function (m) {
      if (m.id === CUR_DECK) return;
      var d = readDeckData(m.id);
      if (!d) return;
      (d.qas || []).forEach(function (q) {
        ["next", "peer", "covers"].forEach(function (k) {
          (q[k] || []).forEach(function (ref) {
            var r = splitRef(ref);
            if (r.deck !== CUR_DECK) return;
            (idx[r.id] = idx[r.id] || []).push({ deck: m.id, from: q.id, field: k });
          });
        });
      });
      (d.groups || []).forEach(function (g) {
        (g.checks || []).forEach(function (c) {
          (c.seeAlso || []).forEach(function (ref) {
            var r = splitRef(ref);
            if (r.deck !== CUR_DECK) return;
            (idx[r.id] = idx[r.id] || []).push({ deck: m.id, from: c.id, field: "seeAlso" });
          });
        });
      });
    });
    LINK_INDEX = idx;
    return idx;
  }

  function backLinks(id) {
    var idx = buildLinkIndex();
    return idx[id] || [];
  }

  /* 跨包进来的包默认只读；设置里开启「可打点」后放开 */
  function lockedDeck() {
    if (prefs.crossWrite) return false;
    if (!prefs.pendingBack || !prefs.pendingBack.deck) return false;
    if (prefs.pendingBack.deck === CUR_DECK) return false;
    toast("这是关联包，默认只读（设置 → 跨包关联 可改为「可打点」）");
    return true;
  }

  /* 切包跳转：记住来路，切完重载页面再打开目标 */
  function crossJump(ref, fromId) {
    var r = splitRef(ref);
    if (!r.deck || r.deck === CUR_DECK) { openQa(r.id); return; }
    var back = { deck: CUR_DECK, id: fromId || (SHEET_ID || "") };
    setPref("pendingOpen", { deck: r.deck, id: r.id });
    setPref("pendingBack", back);
    try {
      save(true);
      if (window.Native && window.Native.setCurrentDeck) window.Native.setCurrentDeck(r.deck);
      location.replace("index.html");
    } catch (e) {
      toast("跳转失败：" + e);
    }
  }

  function jumpBtn(id, kind) {
    return refBtn(id, kind);
  }

  function openQa(id) {
    var q = QA[id];
    if (!q) return;
    SHEET_ID = id;
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
          if (splitRef(c).deck) return refBtn(c, "check");
          var chk = CHECK[c];
          return '<button class="jump" data-check="' + esc(c) + '">' + esc(c) + " " + esc(chk ? chk.text.slice(0, 14) : "") + "…</button>";
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
    var bl = backLinks(q.id);
    if (bl.length) {
      html.push('<div class="foot-row"><span class="foot-k">被引用</span>' + bl.map(function (x) {
        return refBtn(x.deck + "#" + x.from, "peer");
      }).join("") + "</div>");
    }
    html.push('<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn" data-act="fav-qa" data-id="' + q.id + '">' + (isFav(q.id) ? "★ 已收藏" : "☆ 收藏此题") + "</button>" +
      '<button class="btn" data-act="drill-this" data-id="' + q.id + '">拿它刷一遍</button></div>');
    openSheet(html.join(""));
  }

  function openCheck(id) {
    var c = CHECK[id];
    if (!c) return;
    SHEET_ID = id;
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
    var bl = backLinks(id);
    var crossCov = bl.filter(function (x) { return x.field === "covers"; });
    var crossOther = bl.filter(function (x) { return x.field !== "covers"; });
    if (c.seeAlso && c.seeAlso.length) {
      html.push('<div class="foot-row"><span class="foot-k">参见</span>' +
        c.seeAlso.map(function (r) { return refBtn(r, "see"); }).join("") + "</div>");
    }
    if (crossOther.length) {
      html.push('<div class="foot-row"><span class="foot-k">被引用</span>' +
        crossOther.map(function (x) { return refBtn(x.deck + "#" + x.from, "peer"); }).join("") + "</div>");
    }
    if (crossCov.length) {
      html.push('<div class="foot-row"><span class="foot-k">外包装覆盖</span>' +
        crossCov.map(function (x) { return refBtn(x.deck + "#" + x.from, "peer"); }).join("") + "</div>");
      html.push('<div class="note">其他学习包的记录也覆盖这一条；两边各自记掌握度。</div>');
    }
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
    var t = ev.target.closest("[data-tab],[data-act],[data-chip],[data-qchip],[data-qdeck],[data-qa],[data-jump],[data-cross],[data-cross-back],[data-star],[data-m],[data-check],[data-dmode],[data-rate],[data-cm],[data-deck],[data-plan-deck],[data-decksec],[data-del-deck],[data-download],[data-cw],.seg [data-theme]");
    if (!t) { console.log("[click] miss " + ev.target.tagName); return; }
    console.log("[click] " + (t.dataset.tab ? "tab=" + t.dataset.tab : JSON.stringify(t.dataset).slice(0, 80)));

    if (t.dataset.tab) { setTab(t.dataset.tab); return; }

    /* 计划内软切换（不重载） */
    if (t.dataset.planDeck) { softSwitch(t.dataset.planDeck); return; }
    if (t.dataset.decksec) { softSwitch(t.dataset.decksec); return; }
    if (t.dataset.qdeck) {
      var dq = t.dataset.qdeck;
      if (dq === "all") {
        qaDecks.on = false;
        qaDecks.ids = {};
      } else {
        if (!qaDecks.on) {
          qaDecks.on = true;
          MEMBERS.forEach(function (id) { if (DECK_CACHE[id]) qaDecks.ids[id] = true; });
        }
        qaDecks.ids[dq] = !qaDecks.ids[dq];
      }
      renderQa();
      return;
    }

    /* 跨包跳转 */
    if (t.dataset.cross) { crossJump(t.dataset.cross, SHEET_ID); return; }
    if (t.dataset.crossBack) {
      var bk = prefs.pendingBack;
      prefs.pendingBack = null;
      prefs.pendingOpen = bk;
      savePrefs();
      try {
        save(true);
        if (window.Native && window.Native.setCurrentDeck) window.Native.setCurrentDeck(bk.deck);
        location.replace("index.html");
      } catch (e) { toast("返回失败：" + e); }
      return;
    }
    if (t.dataset.cw !== undefined && t.dataset.cw !== "") {
      prefs.crossWrite = t.dataset.cw === "1";
      savePrefs();
      renderMore();
      toast(prefs.crossWrite ? "已允许在关联包里打点" : "关联包已改为只读");
      return;
    }

    /* 学习包切换 / 删除 / 下载 */
    if (t.dataset.deck) {
      var did = t.dataset.deck;
      if (inPlan(did) && DECK_CACHE[did]) softSwitch(did);
      else switchDeck(did);
      return;
    }
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
      if (lockedDeck()) return;
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

    if (t.dataset.qa) {
      var qaDeck = t.dataset.qdeckrow || CUR_DECK;
      if (qaDeck !== CUR_DECK) softSwitch(qaDeck);
      openQa(t.dataset.qa);
      return;
    }
    if (t.dataset.jump) { openQa(t.dataset.jump); return; }

    if (t.dataset.dmode) { drillMode = t.dataset.dmode; drillCur = null; renderDrill(); return; }
    if (t.dataset.rate) { rate(parseInt(t.dataset.rate, 10)); return; }
    if (t.dataset.theme) { setTheme(t.dataset.theme); renderMore(); return; }
    if (t.dataset.cm) {
      if (lockedDeck()) return;
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
    if (act === "end-cross") {
      prefs.pendingBack = null;
      prefs.pendingOpen = null;
      try { savePrefs(); } catch (e) {}
      renderMore();
      toast("已结束跨包只读");
      return;
    }
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
  $("#tabList").textContent = term("check");
  $("#tabQa").textContent = term("qa");
  renderTop();
  setTheme(state.settings.theme || "dark");
  setTab(state.settings.tab || "list");
  applyDeepLink();
  /* 跨包跳转落地：打开目标条目；返回入口留在 prefs.pendingBack */
  (function restorePending() {
    var po = prefs.pendingOpen;
    if (!po || !po.deck || po.deck !== CUR_DECK) return;
    prefs.pendingOpen = null;
    try { savePrefs(); } catch (e) {}
    if (QA[po.id]) { setTab("qa"); openQa(po.id); }
    else if (CHECK[po.id]) { setTab("list"); openCheck(po.id); }
    else {
      prefs.pendingBack = null;
      try { savePrefs(); } catch (e) {}
      toast("目标条目已不存在：" + po.id);
    }
  })();
})();

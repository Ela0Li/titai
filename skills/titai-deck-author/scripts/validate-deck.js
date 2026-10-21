#!/usr/bin/env node
/**
 * 题台 · 知识包校验器（协议 v1.9 的语义层；v1.9 只动进度层，内容层同 v1.8）
 *
 *   node validate-deck.js path/to/deck.json            # 校验指定文件
 *   node validate-deck.js --json path/to/deck.json     # 输出机器可读结果
 *   node validate-deck.js --verbose path/to/deck.json  # 展开 notes（W_CYCLE / W_LAYER_DOWN）
 *
 * 校验 JSON Schema 表达不了的部分：引用闭合、id 派生规则、覆盖完整性、
 * 追问链的层级递进与互引、答案分段的结构与顺序。
 *
 * 这份文件在 tools/ 与 skills/titai-deck-author/scripts/ 各有一份，内容必须一致（CI 会比对）。
 *
 * 退出码：0 = ok，1 = 有 problems，2 = 用法问题（warnings 与 notes 不影响退出码）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const LVL = new Set(["P0", "P1", "P2"]);
const HEADS = ["结论", "机制", "取舍", "实战"];
const RE_DECK_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const RE_GROUP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,15}$/;
const RE_CHECK_ID = /^[A-Za-z][A-Za-z0-9_-]*\.\d+$/;
const RE_QA_ID = /^q\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;
const RE_CROSS = /^(?:([a-z0-9][a-z0-9-]{1,40})#)([A-Za-z0-9_.:-]+)$/;
/** 只做提示、不计入 warnings 的软规则（协议明确允许） */
const NOTE_CODES = new Set(["W_CYCLE", "W_LAYER_DOWN"]);

/** 拆开引用：本地 → {deck:null, id}；跨包 → {deck, id}；语法不对 → null
 *  规则见协议 §8.2：恰好一个 #，两侧非空，deckId 合法，禁止指向本包 */
function splitRef(ref, selfId) {
  if (typeof ref !== "string" || !ref) return { bad: "空引用" };
  const i = ref.indexOf("#");
  if (i < 0) return { deck: null, id: ref };
  if (ref.indexOf("#", i + 1) >= 0) return { bad: "只能有一个 #：" + ref };
  const m = RE_CROSS.exec(ref);
  if (!m) return { bad: "跨包引用格式应为 deckId#localId：" + ref };
  if (m[1] === selfId) return { bad: "不要引用自己的包（写裸 id 即可）：" + ref };
  return { deck: m[1], id: m[2] };
}

/* ---------- 数学标记（协议 v1.1） ----------
 * 行内 $…$，块级 $$…$$；\$ 表示字面美元符。
 * 这里只做「能不能被渲染器吃下去」的结构检查，排版效果交给 conformance.js。
 */
const MATH_CMDS = new Set(`
frac dfrac tfrac sqrt text mathrm textrm operatorname mathbf bm boldsymbol
overline bar hat vec dot left right big Big bigl bigr bigl Bigr biggl biggr
alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa
lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega
Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
cdot times div pm mp ast star circ bullet oplus otimes
le leq ge geq ne neq approx equiv sim simeq propto ll gg
infty partial nabla forall exists in notin ni subset subseteq supset supseteq
cup cap setminus emptyset to rightarrow leftarrow Rightarrow Leftarrow
leftrightarrow Leftrightarrow mapsto longrightarrow ldots dots cdots vdots ddots
angle perp parallel mid vert Vert prime degree therefore because
langle rangle lfloor rfloor lceil rceil
sum prod coprod int iint iiint oint bigcup bigcap lim log lg ln exp sin cos tan
cot sec csc arcsin arccos arctan max min sup inf arg argmax argmin det dim mod
quad qquad
`.trim().split(/\s+/));

function short(s) { return s.length > 60 ? s.slice(0, 60) + "…" : s; }

/** 遍历文本里的公式片段，回调 {tex, block, raw}；反引号里的内容不算公式 */
function eachMath(text, fn) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === "\\" && text[i + 1] === "$") { i += 2; continue; }
    /* 跳过 `代码`，里面允许出现 $ */
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > 0) { i = close + 1; continue; }
    }
    if (text[i] !== "$") { i++; continue; }
    const block = text[i + 1] === "$";
    const open = block ? "$$" : "$";
    const start = i + open.length;
    const end = text.indexOf(open, start);
    if (end < 0) { fn({ unclosed: true, raw: text.slice(i), from: i }); return; }
    fn({ tex: text.slice(start, end), block, raw: text.slice(i, end + open.length) });
    i = end + open.length;
  }
}

/** 去掉公式片段，供 HTML 检查用（同样跳过 `代码`） */
function stripMath(text) {
  let out = "", i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === "\\" && text[i + 1] === "$") { out += "$"; i += 2; continue; }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > 0) { out += text.slice(i, close + 1); i = close + 1; continue; }
    }
    if (text[i] !== "$") { out += text[i]; i++; continue; }
    const block = text[i + 1] === "$";
    const open = block ? "$$" : "$";
    const start = i + open.length;
    const end = text.indexOf(open, start);
    if (end < 0) { out += text.slice(i); break; }
    out += " ";
    i = end + open.length;
  }
  return out;
}

function checkMath(text, at, P, W) {
  if (typeof text !== "string" || text.indexOf("$") < 0) return;
  eachMath(text, (m) => {
    if (m.unclosed) { P("E_MATH_BALANCE", at, "公式 $ 没有配对：" + short(m.raw)); return; }
    if (!m.tex.trim()) P("E_MATH_EMPTY", at, "空公式 " + (m.block ? "$$ $$" : "$ $"));
    let depth = 0;
    for (let k = 0; k < m.tex.length; k++) {
      const ch = m.tex[k];
      if (ch === "\\") { k++; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth < 0) break; }
    }
    if (depth !== 0) P("E_MATH_BRACE", at, "公式花括号不配对：" + short(m.tex));
    (m.tex.match(/\\[A-Za-z]+/g) || []).forEach((c) => {
      const name = c.slice(1);
      if (!MATH_CMDS.has(name)) W("W_MATH_CMD", at, "渲染器不支持 " + c + "，会原样显示");
    });
  });
}

function parseArgs(argv) {
  const out = { file: "", json: false, verbose: false };
  argv.slice(2).forEach((a) => {
    if (a === "--json") out.json = true;
    else if (a === "--verbose" || a === "-v") out.verbose = true;
    else if (!a.startsWith("-")) out.file = path.resolve(a);
  });
  return out;
}

function validate(deck) {
  const problems = [];
  const warnings = [];
  const P = (code, at, msg) => problems.push({ code, path: at, msg });
  const W = (code, at, msg) => warnings.push({ code, path: at, msg });

  if (!deck || typeof deck !== "object" || Array.isArray(deck)) {
    P("E_ROOT", "", "顶层必须是对象");
    return { problems, warnings, stats: null };
  }

  /* ---------- 顶层 ---------- */
  if (deck.schema !== 1) P("E_SCHEMA", "schema", "schema 必须为 1（当前 " + JSON.stringify(deck.schema) + "）");
  if (typeof deck.id !== "string" || !RE_DECK_ID.test(deck.id)) P("E_DECK_ID", "id", "知识包 id 不合规：" + deck.id);
  if (typeof deck.title !== "string" || !deck.title.trim()) P("E_TITLE", "title", "title 不能为空");
  if (deck.accent && !/^#[0-9a-fA-F]{6}$/.test(deck.accent)) P("E_ACCENT", "accent", "accent 必须是 #rrggbb");
  if (!Array.isArray(deck.groups) || !deck.groups.length) P("E_GROUPS", "groups", "groups 必须是非空数组");
  if (!Array.isArray(deck.qas) || !deck.qas.length) P("E_QAS", "qas", "qas 必须是非空数组");
  if (problems.length) return { problems, warnings, stats: null };

  /* ---------- groups / checks ---------- */
  const groupById = new Map();
  const checkById = new Map();
  const checkSeen = [];
  let checkCount = 0;

  deck.groups.forEach((g, gi) => {
    const at = "groups[" + gi + "]";
    if (!g || typeof g !== "object") return P("E_GROUP", at, "group 必须是对象");
    if (typeof g.id !== "string" || !RE_GROUP_ID.test(g.id)) P("E_GROUP_ID", at + ".id", "group id 不合规：" + g.id);
    if (groupById.has(g.id)) P("E_GROUP_DUP", at + ".id", "group id 重复：" + g.id);
    else groupById.set(g.id, g);
    if (typeof g.title !== "string" || !g.title.trim()) P("E_GROUP_TITLE", at + ".title", "group title 不能为空");
    if (!LVL.has(g.priority)) P("E_GROUP_LVL", at + ".priority", "priority 必须是 P0/P1/P2");
    if (!Number.isInteger(g.stage) || g.stage < 1 || g.stage > 4) P("E_GROUP_STAGE", at + ".stage", "stage 必须是 1..4");
    if (!g.signal) W("W_SIGNAL", at, g.id + " 缺少 signal（一句话说明这组在考什么）");
    if (!Array.isArray(g.keypoints) || !g.keypoints.length) W("W_KEYPOINTS", at, g.id + " 没有 keypoints");
    if (!Array.isArray(g.traps) || !g.traps.length) W("W_TRAPS", at, g.id + " 没有 traps");
    if (!Array.isArray(g.checks) || !g.checks.length) return P("E_CHECKS", at + ".checks", "checks 必须是非空数组");

    g.checks.forEach((c, ci) => {
      const cat = at + ".checks[" + ci + "]";
      checkCount++;
      if (!c || typeof c !== "object") return P("E_CHECK", cat, "check 必须是对象");
      if (typeof c.id !== "string" || !RE_CHECK_ID.test(c.id)) P("E_CHECK_ID", cat + ".id", "check id 不合规：" + c.id);
      if (checkById.has(c.id)) P("E_CHECK_DUP", cat + ".id", "check id 重复：" + c.id);
      else checkById.set(c.id, c);
      if (typeof c.id === "string" && c.id.indexOf(g.id + ".") !== 0)
        P("E_CHECK_PREFIX", cat + ".id", "check id 必须以 “" + g.id + ".” 开头，实际 " + c.id);
      if (typeof c.text !== "string" || c.text.trim().length < 4) P("E_CHECK_TEXT", cat + ".text", "知识点文本过短");
      else if (c.text.length > 300) W("W_CHECK_LONG", cat + ".text", "知识点超过 300 字，建议拆细");
      else checkMath(c.text, cat + ".text", P, W);
      if (!LVL.has(c.lvl)) P("E_CHECK_LVL", cat + ".lvl", "lvl 必须是 P0/P1/P2");
      /* v1.7：可选的「及格线」提示，讲清说到哪几条算过，不写答案 */
      if (c.hint != null) {
        if (typeof c.hint !== "string") P("E_CHECK_HINT", cat + ".hint", "hint 必须是字符串");
        else {
          const ht = c.hint.trim();
          if (ht.length < 6) P("E_CHECK_HINT", cat + ".hint", "hint 过短（至少 6 字）");
          else if (ht.length > 60) P("E_CHECK_HINT", cat + ".hint", "hint 超过 60 字（" + ht.length + "），只写及格线");
          else if (/[\r\n]/.test(c.hint)) P("E_CHECK_HINT", cat + ".hint", "hint 不能换行");
          else checkMath(c.hint, cat + ".hint", P, W);
        }
      }
      if (c.seeAlso != null) {
        if (!Array.isArray(c.seeAlso)) P("E_REF_LIMIT", cat + ".seeAlso", "seeAlso 必须是数组");
        else {
          if (c.seeAlso.length > 2) P("E_REF_LIMIT", cat + ".seeAlso", "seeAlso 最多 2 条");
          if (new Set(c.seeAlso).size !== c.seeAlso.length) P("E_REF_DUP", cat + ".seeAlso", "seeAlso 有重复元素");
          c.seeAlso.forEach((r) => checkSeen.push({ at: cat + ".seeAlso", cid: c.id, ref: r }));
        }
      }
    });
  });

  /* ---------- qas ---------- */
  const qaById = new Map();
  deck.qas.forEach((q, qi) => {
    const at = "qas[" + qi + "]";
    if (!q || typeof q !== "object") return P("E_QA", at, "qa 必须是对象");
    if (typeof q.id !== "string" || !RE_QA_ID.test(q.id)) P("E_QA_ID", at + ".id", "qa id 不合规：" + q.id);
    if (qaById.has(q.id)) P("E_QA_DUP", at + ".id", "qa id 重复：" + q.id);
    else qaById.set(q.id, q);
    if (!groupById.has(q.m)) P("E_QA_M", at + ".m", "主归属模块不存在：" + q.m);
    if (!LVL.has(q.lvl)) P("E_QA_LVL", at + ".lvl", "lvl 必须是 P0/P1/P2");
    if (!Number.isInteger(q.layer) || q.layer < 1 || q.layer > 4) P("E_QA_LAYER", at + ".layer", "layer 必须是 1..4");
    if (typeof q.q !== "string" || q.q.trim().length < 6) P("E_QA_Q", at + ".q", "问题文本过短");
    else if (!/[？?。]$/.test(q.q)) W("W_QA_MARK", at + ".q", "问题缺少句末标点（？或 。）：" + q.id);
    checkMath(q.q, at + ".q", P, W);
    if (q.tags != null && (!Array.isArray(q.tags) || q.tags.length > 6)) W("W_QA_TAGS", at + ".tags", "tags 建议 0–6 个");

    if (!Array.isArray(q.covers) || !q.covers.length) P("E_QA_COVERS", at + ".covers", "covers 必须非空");
    else if (new Set(q.covers).size !== q.covers.length) P("E_QA_COVERS_DUP", at + ".covers", "covers 有重复元素");

    ["next", "peer"].forEach((k) => {
      const arr = q[k];
      if (arr == null) return;
      if (!Array.isArray(arr)) return P("E_QA_ARR", at + "." + k, k + " 必须是数组");
      if (new Set(arr).size !== arr.length) P("E_QA_ARR_DUP", at + "." + k, k + " 有重复元素");
    });

    if (!Array.isArray(q.ans) || !q.ans.length) P("E_QA_ANS", at + ".ans", "ans 必须非空");
    else {
      let prevLvl = 0;
      let heads = 0;
      q.ans.forEach((a, ai) => {
        const aat = at + ".ans[" + ai + "]";
        if (!a || typeof a !== "object") return P("E_ANS", aat, "答案段必须是对象");

        /* 标题：可选、自拟文案；lvl 控制层级（1..3，默认 1） */
        let lvl = 0;
        if (a.h != null) {
          if (typeof a.h !== "string" || !a.h.trim()) P("E_ANS_HEAD", aat + ".h", "h 要么不写，要么是非空字符串");
          else {
            heads++;
            if (a.h.length > 24) W("W_ANS_HEAD_LONG", aat + ".h", "小标题超过 24 字，建议缩短");
            lvl = a.lvl == null ? 1 : a.lvl;
            if (!Number.isInteger(lvl) || lvl < 1 || lvl > 3) {
              P("E_ANS_LVL", aat + ".lvl", "lvl 必须是 1..3 的整数，实际 " + a.lvl);
              lvl = 1;
            } else if (lvl > prevLvl + 1) {
              P("E_ANS_LVL", aat + ".lvl", "层级不能跳级：上一级是 " + prevLvl + "，这里是 " + lvl);
            }
            prevLvl = lvl;
          }
        } else if (a.lvl != null) {
          P("E_ANS_LVL", aat + ".lvl", "没有 h 就不要写 lvl");
        }

        if (typeof a.p !== "string" || a.p.trim().length < 8) P("E_ANS_P", aat + ".p", "段落过短");
        else if (a.p.length > 1200) W("W_ANS_LONG", aat + ".p", "段落超过 1200 字，建议拆分");
        if (typeof a.p === "string" && /<\/?(b|i|em|strong|br|p|div|span|code|pre|ul|ol|li|a|script|style|img|math|mrow|mi|mo|mn)\b[^>]*>/i
          .test(stripMath(a.p)))
          P("E_ANS_HTML", aat + ".p", "段落里不要写 HTML 标签（会被转义）；公式请用 $…$");
        checkMath(a.p, aat + ".p", P, W);

        /* 可选要点列表：不给 HTML，直接给字符串数组 */
        if (a.list != null) {
          if (!Array.isArray(a.list) || !a.list.length) P("E_ANS_LIST", aat + ".list", "list 要么不写，要么是非空字符串数组");
          else {
            if (a.list.length > 10) W("W_ANS_LIST_LONG", aat + ".list", "要点超过 10 条，建议拆段");
            a.list.forEach((li, ii) => {
              const lat = aat + ".list[" + ii + "]";
              if (typeof li !== "string" || li.trim().length < 2) return P("E_ANS_LIST", lat, "要点必须是非空字符串");
              if (li.length > 200) W("W_ANS_LIST_LONG", lat, "单条要点超过 200 字");
              checkMath(li, lat, P, W);
            });
          }
        }
      });
      if (!heads && q.ans.length > 3) W("W_ANS_NOHEAD", at + ".ans", "4 段以上却没有小标题；长答案建议分节并加标题");
    }
  });

  /* ---------- 引用闭合（本地 + 跨包，协议 §8） ---------- */
  const crossRefs = [];
  function collectRef(from, field, ref) {
    const r = splitRef(ref, deck.id);
    if (r.bad) { P("E_CROSS_SYNTAX", from + "." + field, r.bad); return null; }
    if (r.deck) { crossRefs.push({ from, field, deck: r.deck, id: r.id }); return null; }
    return r.id;
  }

  deck.qas.forEach((q) => {
    (q.covers || []).forEach((cid) => {
      const id = collectRef(q.id, "covers", cid);
      if (id && !checkById.has(id)) P("E_COVER_REF", q.id, "covers 指向不存在的知识点：" + id);
    });
    ["next", "peer"].forEach((k) => {
      (q[k] || []).forEach((rid) => {
        const id = collectRef(q.id, k, rid);
        if (!id) return;
        if (id === q.id) P("E_SELF_REF", q.id, k + " 含自身");
        else if (!qaById.has(id)) P("E_QA_REF", q.id, k + " 指向不存在的问答：" + id);
      });
    });
  });

  checkSeen.forEach((s) => {
    const id = collectRef(s.cid, "seeAlso", s.ref);
    if (id && !qaById.has(id)) P("E_QA_REF", s.at, "seeAlso 指向不存在的问答：" + id);
  });

  /* ---------- 覆盖完整性 ---------- */
  const coveredBy = new Map();
  checkById.forEach((_, cid) => coveredBy.set(cid, []));
  deck.qas.forEach((q) => (q.covers || []).forEach((cid) => {
    if (coveredBy.has(cid)) coveredBy.get(cid).push(q.id);
  }));

  const uncovered = [];
  const depth = { 1: 0, 2: 0, 3: 0, 4: 0, more: 0 };
  coveredBy.forEach((list, cid) => {
    if (!list.length) uncovered.push(cid);
    const n = Math.min(list.length, 4);
    depth[n] = (depth[n] || 0) + 1;
  });
  // 覆盖不是协议要求：没有问答覆盖的知识点照样能被引擎渲染（详情里显示“还没有对应问答”）
  uncovered.forEach((cid) => W("W_UNCOVERED", cid, "没有任何问答覆盖（协议允许，仅提示）"));

  /* ---------- 追问链质量 ---------- */
  const edgeCount = { next: 0, peer: 0 };
  const localOnly = (arr) => (arr || []).filter((x) => typeof x === "string" && x.indexOf("#") < 0);
  deck.qas.forEach((q) => {
    edgeCount.next += localOnly(q.next).length;
    edgeCount.peer += localOnly(q.peer).length;
    localOnly(q.next).forEach((rid) => {
      const t = qaById.get(rid);
      if (!t) return;
      if (t.layer < q.layer)
        W("W_LAYER_DOWN", q.id, "追问 " + rid + " 的 layer 更低（" + q.layer + "→" + t.layer + "），不算“递进”");
      const back = (t.next || []).indexOf(q.id) >= 0;
      if (back) W("W_CYCLE", q.id, "与 " + rid + " 互相写在 next 里，建议把一侧改成 peer");
    });
  });

  /* ---------- 统计 ---------- */
  const layers = { 1: 0, 2: 0, 3: 0, 4: 0 };
  deck.qas.forEach((q) => { if (layers[q.layer] != null) layers[q.layer]++; });
  const stats = {
    groups: deck.groups.length,
    checks: checkCount,
    qas: deck.qas.length,
    edges: edgeCount.next + edgeCount.peer,
    edgesNext: edgeCount.next,
    edgesPeer: edgeCount.peer,
    covered: checkCount - uncovered.length,
    coverage: checkCount ? (checkCount - uncovered.length) / checkCount : 0,
    layers,
    depth,
    crossRefs: crossRefs.length,
    deps: Array.isArray(deck.deps) ? deck.deps.length : 0,
  };

  return { problems, warnings, stats, uncovered };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.log("用法：node validate-deck.js <deck.json> [--json] [--verbose]");
    process.exit(2);
  }
  let deck;
  try {
    deck = JSON.parse(fs.readFileSync(args.file, "utf8"));
  } catch (e) {
    const out = { ok: false, file: args.file, problems: [{ code: "E_READ", path: "", msg: String(e.message || e) }], warnings: [] };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else console.error("读不到或不是合法 JSON：" + args.file + "\n" + e.message);
    process.exit(1);
  }

  const res = validate(deck);
  const ok = res.problems.length === 0;
  const notes = res.warnings.filter((w) => NOTE_CODES.has(w.code));
  const warn = res.warnings.filter((w) => !NOTE_CODES.has(w.code));
  const out = {
    ok,
    file: path.relative(ROOT, args.file) || args.file,
    stats: res.stats,
    problems: res.problems,
    warnings: warn,
    notes,
  };

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    const s = res.stats;
    if (s) {
      console.log("知识包：" + (deck.title || "?") + "（" + (deck.id || "?") + "，schema " + deck.schema + "）");
      console.log("  模块 " + s.groups + " · 知识点 " + s.checks + " · 问答 " + s.qas +
        " · 交叉引用 " + s.edges + "（next " + s.edgesNext + " / peer " + s.edgesPeer + "）" +
        (s.crossRefs ? " · 跨包 " + s.crossRefs : ""));
      console.log("  覆盖 " + s.covered + "/" + s.checks + "（" + (s.coverage * 100).toFixed(1) + "%）" +
        " · 分层 L1 " + s.layers[1] + " / L2 " + s.layers[2] + " / L3 " + s.layers[3] + " / L4 " + s.layers[4]);
      console.log("  覆盖深度：1 条 " + (s.depth[1] || 0) + " · 2 条 " + (s.depth[2] || 0) +
        " · 3 条 " + (s.depth[3] || 0) + " · 4+ 条 " + ((s.depth[4] || 0) + (s.depth.more || 0)));
    }
    if (warn.length) {
      const byCode = new Map();
      warn.forEach((w) => {
        if (!byCode.has(w.code)) byCode.set(w.code, []);
        byCode.get(w.code).push(w);
      });
      console.log("\nwarnings（" + warn.length + "）");
      Array.from(byCode.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([code, list]) => {
          console.log("  [W] " + code + " × " + list.length + " — " + list[0].msg);
          list.slice(1, 3).forEach((w) => console.log("      · " + w.path + " — " + w.msg));
          if (list.length > 3) console.log("      … 另有 " + (list.length - 3) + " 条（--json 看全部）");
        });
    }
    if (notes.length) {
      console.log("\nnotes（" + notes.length + "，协议允许的软提示，加 --verbose 展开）");
      if (args.verbose) {
        const byCode = new Map();
        notes.forEach((w) => {
          if (!byCode.has(w.code)) byCode.set(w.code, []);
          byCode.get(w.code).push(w);
        });
        Array.from(byCode.entries()).forEach(([code, list]) => {
          console.log("  [N] " + code + " × " + list.length);
          list.slice(0, 10).forEach((w) => console.log("      · " + w.path + " — " + w.msg));
          if (list.length > 10) console.log("      … 另有 " + (list.length - 10) + " 条");
        });
      }
    }
    if (res.problems.length) {
      console.log("\nproblems（" + res.problems.length + "）");
      res.problems.slice(0, 40).forEach((p) => console.log("  [E] " + p.code + " " + p.path + " — " + p.msg));
      if (res.problems.length > 40) console.log("  … 另有 " + (res.problems.length - 40) + " 条");
    }
    console.log("\n" + (ok ? "✓ 通过协议 v1 校验" : "✗ 未通过：" + res.problems.length + " 个问题"));
  }
  process.exit(ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { validate };

/* math.js — LaTeX 子集 → MathML（无依赖）
 *
 * 为什么自己写而不是打包 KaTeX：
 *   ① 应用要能离线单文件跑，KaTeX 还要额外字体文件；
 *   ② 知识包里的公式是面试/教材级别，不需要完整 LaTeX；
 *   ③ 用原生 MathML 后，安卓 WebView（Chromium 109+）和电脑浏览器同一份渲染。
 *
 * 支持的写法见 docs/deck-protocol.md §7「数学公式」。
 * 不认识的命令会退回原文（渲染成等宽字），不会让整段内容消失。
 */
(function (global) {
  "use strict";

  /* 命令 → 字符 */
  var SYM = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε",
    zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
    lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
    tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
    Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆",
    circ: "∘", bullet: "∙", oplus: "⊕", otimes: "⊗",
    le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈",
    equiv: "≡", sim: "∼", simeq: "≃", propto: "∝", ll: "≪", gg: "≫",
    infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃",
    in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃",
    supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅",
    to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐",
    leftrightarrow: "↔", Leftrightarrow: "⇔", mapsto: "↦", longrightarrow: "⟶",
    ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
    angle: "∠", perp: "⊥", parallel: "∥", mid: "|", vert: "|", Vert: "‖",
    prime: "′", degree: "°", therefore: "∴", because: "∵",
    langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
    sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮",
    bigcup: "⋃", bigcap: "⋂", lim: "lim", log: "log", lg: "lg", ln: "ln",
    exp: "exp", sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec",
    csc: "csc", arcsin: "arcsin", arccos: "arccos", arctan: "arctan",
    max: "max", min: "min", sup: "sup", inf: "inf", arg: "arg",
    argmax: "arg max", argmin: "arg min", det: "det", dim: "dim", mod: "mod",
    quad: "\u2003", qquad: "\u2003\u2003", ",": "\u2009", ";": "\u2005",
    ":": "\u2005", " ": " ", "%": "%", "$": "$", "{": "{", "}": "}",
    "&": "&", "#": "#", "_": "_", "|": "‖", "\\": "\n"
  };
  /* 带上下限的大运算符（用 munderover 排版） */
  var UNDER = { sum: 1, prod: 1, coprod: 1, bigcup: 1, bigcap: 1, lim: 1 };
  /* 极限在下方、不上下夹（用 munder） */
  var UNDER_ONLY = { lim: 1, max: 1, min: 1, sup: 1, inf: 1, argmax: 1, argmin: 1, arg: 1 };
  /* 函数名下方带参数（munder 排版） */
  var UNDER_FUNC = { lim: 1, max: 1, min: 1, sup: 1, inf: 1, argmax: 1, argmin: 1 };
  /* 函数名：正体 */
  var FUNC = {
    log: 1, lg: 1, ln: 1, exp: 1, sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1,
    arcsin: 1, arccos: 1, arctan: 1, max: 1, min: 1, sup: 1, inf: 1, lim: 1,
    det: 1, dim: 1, mod: 1, arg: 1, argmax: 1, argmin: 1
  };
  var SPACE = { ",": 1, ";": 1, ":": 1, quad: 1, qquad: 1, " ": 1, "\\": 1 };
  /* 希腊字母当作变量（斜体），不是运算符 */
  var GREEK = {};
  ("alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu "
    + "xi pi rho sigma tau upsilon phi varphi chi psi omega "
    + "Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega").split(" ").forEach(function (k) {
    GREEK[k] = 1;
  });

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function P(src) { this.s = String(src || ""); this.i = 0; }
  P.prototype.peek = function (n) { return this.s.charAt(this.i + (n || 0)); };
  P.prototype.eof = function () { return this.i >= this.s.length; };
  P.prototype.ws = function () {
    while (!this.eof() && /\s/.test(this.peek())) this.i++;
  };

  /* 读一个「参数」：{...} 组、单字符、或一条命令 */
  P.prototype.arg = function () {
    this.ws();
    if (this.peek() === "{") return this.group();
    var a = this.atom(true);
    return a ? a.html : "";
  };

  P.prototype.group = function () {
    if (this.peek() !== "{") return this.arg();
    this.i++;
    var inner = this.seq("}");
    if (this.peek() === "}") this.i++;
    return inner;
  };

  /* 读命令名，如 \frac */
  P.prototype.command = function () {
    this.i++; /* 跳过反斜杠 */
    var name = "";
    while (!this.eof() && /[A-Za-z]/.test(this.peek())) { name += this.peek(); this.i++; }
    if (!name) { var one = this.peek(); this.i++; return one; } /* \, \{ */
    return name;
  };

  /* 一个原子（不含上下标） */
  P.prototype.atom = function (asArg) {
    this.ws();
    if (this.eof()) return null;
    var ch = this.peek();

    if (ch === "{") return { html: this.group() };
    if (ch === "}") return null;

    if (ch === "\\") {
      var name = this.command();
      return this.commandNode(name, asArg);
    }

    if (/[0-9]/.test(ch)) {
      var num = "";
      while (!this.eof() && /[0-9.]/.test(this.peek())) { num += this.peek(); this.i++; }
      return { html: "<mn>" + esc(num) + "</mn>" };
    }
    if (/[A-Za-z]/.test(ch)) {
      this.i++;
      return { html: "<mi>" + esc(ch) + "</mi>" };
    }
    if ("+-=<>(),[]|!*'/:;".indexOf(ch) >= 0) {
      this.i++;
      return { html: "<mo>" + esc(ch) + "</mo>" };
    }
    this.i++;
    return { html: "<mo>" + esc(ch) + "</mo>" };
  };

  P.prototype.commandNode = function (name, asArg) {
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      var a = this.arg(), b = this.arg();
      return { html: "<mfrac><mrow>" + a + "</mrow><mrow>" + b + "</mrow></mfrac>" };
    }
    if (name === "sqrt") {
      this.ws();
      if (this.peek() === "[") {              /* 开 n 次方 */
        this.i++;
        var idx = this.seq("]");
        if (this.peek() === "]") this.i++;
        var body0 = this.arg();
        return { html: "<mroot><mrow>" + body0 + "</mrow><mrow>" + idx + "</mrow></mroot>" };
      }
      return { html: "<msqrt><mrow>" + this.arg() + "</mrow></msqrt>" };
    }
    if (name === "text" || name === "mathrm" || name === "textrm" || name === "operatorname") {
      var raw = this.rawGroup();
      if (name === "mathrm" || name === "operatorname") {
        return { html: '<mstyle mathvariant="normal"><mi>' + esc(raw) + "</mi></mstyle>" };
      }
      return { html: "<mtext>" + esc(raw) + "</mtext>" };
    }
    if (name === "mathbf" || name === "bm" || name === "boldsymbol") {
      return { html: '<mstyle mathvariant="bold"><mrow>' + this.arg() + "</mrow></mstyle>" };
    }
    if (name === "overline" || name === "bar") {
      return { html: "<mover><mrow>" + this.arg() + "</mrow><mo>‾</mo></mover>" };
    }
    if (name === "hat") {
      return { html: "<mover><mrow>" + this.arg() + "</mrow><mo>^</mo></mover>" };
    }
    if (name === "vec") {
      return { html: "<mover><mrow>" + this.arg() + "</mrow><mo>→</mo></mover>" };
    }
    if (name === "dot") {
      return { html: "<mover><mrow>" + this.arg() + "</mrow><mo>˙</mo></mover>" };
    }
    if (name === "left") {
      var open = this.peek();
      this.i++;
      var sym = open === "\\" ? SYM[this.command()] || "" : open;
      var body = this.seq(null, "right");
      var close = ")";
      if (this.peek() === "\\") {
        this.command();                       /* right */
        var c = this.peek();
        this.i++;
        close = c === "\\" ? SYM[this.command()] || "" : c;
      }
      return {
        html: '<mrow><mo stretchy="true">' + esc(sym) + "</mo>" + body
          + '<mo stretchy="true">' + esc(close) + "</mo></mrow>"
      };
    }
    if (name === "right") { return { html: "" }; }  /* 由 left 消费 */
    if (name === "big" || name === "Big" || name === "bigl" || name === "bigr" ||
        name === "Bigl" || name === "Bigr" || name === "biggl" || name === "biggr") {
      return this.atom(asArg);
    }
    if (SYM.hasOwnProperty(name)) {
      var v = SYM[name];
      if (FUNC[name]) {
        /* 函数名用 mo（正体），后面跟不可见应用符，否则 MathML 会把 log n 排成 "logn" */
        return {
          html: "<mo>" + esc(v) + "</mo><mo>&#x2061;</mo>",
          big: UNDER_FUNC[name] ? 1 : 0,
          under: UNDER_FUNC[name] ? 1 : 0
        };
      }
      if (SPACE[name]) {
        var w = name === "quad" ? "1em" : name === "qquad" ? "2em"
          : name === ";" || name === ":" ? "0.28em" : name === "," ? "0.17em" : "0.25em";
        return { html: '<mspace width="' + w + '"/>' };
      }
      if (GREEK[name]) return { html: "<mi>" + esc(v) + "</mi>" };
      if (UNDER[name] || name === "int" || name === "iint" || name === "iiint" || name === "oint") {
        return { html: "<mo>" + esc(v) + "</mo>", big: 1, int: name.indexOf("int") >= 0 || name === "oint" ? 1 : 0 };
      }
      return { html: "<mo>" + esc(v) + "</mo>" };
    }
    /* 未知命令：原样保留，避免内容丢失 */
    return { html: "<mtext>\\" + esc(name) + "</mtext>" };
  };

  /* \text{...} 里保留原文（不做解析） */
  P.prototype.rawGroup = function () {
    this.ws();
    if (this.peek() !== "{") { var a = this.peek(); this.i++; return a; }
    this.i++;
    var out = "", depth = 1;
    while (!this.eof()) {
      var ch = this.peek();
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (!depth) { this.i++; break; } }
      out += ch;
      this.i++;
    }
    return out;
  };

  /* 序列；stop 为 }，或 endCmd 为 "right" 时遇到 \right 停下 */
  P.prototype.seq = function (stop, endCmd) {
    var out = "";
    while (!this.eof()) {
      this.ws();
      if (this.eof()) break;
      if (stop && this.peek() === stop) break;
      if (endCmd && this.peek() === "\\" && this.s.substr(this.i + 1, endCmd.length) === endCmd) break;

      var a = this.atom();
      if (!a) break;

      var base = a.html, sup = null, sub = null, guard = 0;
      for (;;) {
        this.ws();
        guard++;
        if (guard > 40) break;
        if (this.peek() === "^") { this.i++; sup = this.arg(); }
        else if (this.peek() === "_") { this.i++; sub = this.arg(); }
        else break;
      }
      out += script(base, sub, sup, a);
    }
    return out;
  };

  function script(base, sub, sup, a) {
    var big = a && a.big;
    /* munder/mover/munderover 只接受两个子节点，base 必须先裹一层 mrow */
    var B = big ? "<mrow>" + base + "</mrow>" : base;
    if (sub && sup) {
      if (big && !(a && a.int)) return "<munderover>" + B + "<mrow>" + sub + "</mrow><mrow>" + sup + "</mrow></munderover>";
      return "<msubsup>" + base + "<mrow>" + sub + "</mrow><mrow>" + sup + "</mrow></msubsup>";
    }
    if (sup) {
      if (big && !(a && a.int)) return "<mover>" + B + "<mrow>" + sup + "</mrow></mover>";
      return "<msup>" + base + "<mrow>" + sup + "</mrow></msup>";
    }
    if (sub) {
      if (big && a && a.under) return "<munder>" + B + "<mrow>" + sub + "</mrow></munder>";
      return "<msub>" + base + "<mrow>" + sub + "</mrow></msub>";
    }
    return base;
  }

  /* 对外：TeX → MathML 字符串；失败返回 null */
  function toMathML(tex, display) {
    try {
      var p = new P(tex);
      var body = p.seq(null, null);
      if (!body) return null;
      return '<math display="' + (display ? "block" : "inline") + '"><mrow>' + body + "</mrow></math>";
    } catch (e) {
      return null;
    }
  }

  /* 把一段混排文本里的公式切出来；其余交给 plain() 处理 */
  function renderText(text, plain) {
    var s = String(text == null ? "" : text);
    var out = "", i = 0, buf = "";
    function flush() { if (buf) { out += plain(buf); buf = ""; } }

    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === "\\" && s.charAt(i + 1) === "$") { buf += "$"; i += 2; continue; }
      /* 反引号里的内容交给 plain()，里面可能有 $（如属性名 $Species） */
      if (ch === "`") {
        var tick = s.indexOf("`", i + 1);
        if (tick > 0) {
          flush();
          out += plain(s.slice(i, tick + 1));
          i = tick + 1;
          continue;
        }
      }
      if (ch === "$") {
        var block = s.charAt(i + 1) === "$";
        var open = block ? "$$" : "$";
        var start = i + open.length;
        var end = s.indexOf(open, start);
        if (end < 0) { buf += ch; i++; continue; }      /* 不成对，当普通字符 */
        var tex = s.slice(start, end);
        var ml = toMathML(tex, block);
        if (!ml) { buf += s.slice(i, end + open.length); i = end + open.length; continue; }
        flush();
        /* 块级公式：单独的 <math display="block">，靠 CSS 控制上下留白 */
        out += ml;
        i = end + open.length;
        continue;
      }
      buf += ch;
      i++;
    }
    flush();
    return out;
  }

  var API = { toMathML: toMathML, renderText: renderText };
  if (typeof module === "object" && module.exports) module.exports = API;
  global.MathML = API;
})(typeof window !== "undefined" ? window : this);

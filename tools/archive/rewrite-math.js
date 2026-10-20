/* 把学习包源码里的「伪数学」改成协议 v1.1 的 $…$ 公式。
 *
 *   node tools/rewrite-math.js --dry      # 只报告，不写文件
 *   node tools/rewrite-math.js            # 就地改写
 *
 * 处理两类：
 *   ① 反引号里的表达式：`XᵀX` → `$X^T X$`
 *   ② 正文里的复杂度写法：O(N²) → $O(N^2)$
 * 其它单符号（≥ ≈ ± × 等）留在正文里不动——它们渲染本来就正常，
 * 全包成公式反而让行文变碎（这条也写进协议 §7）。
 *
 * 源码是 JS 双引号字符串，所以插入的 TeX 反斜杠要写成 \\。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "qa-1.js", "qa-2.js", "qa-3.js", "qa-4.js", "qa-5.js", "qa-6.js",
  "qa-7.js", "qa-8.js", "qa-9.js", "qa-10.js", "qa-11.js", "qa-12.js"
].map((f) => path.join(ROOT, "..", "pcg-doc", "data", f))
  .concat([
    path.join(ROOT, "decks-src", "ml-intro", "qa-core.js"),
    path.join(ROOT, "decks-src", "ml-intro", "qa-advanced.js")
  ]);

/* Unicode → TeX（只用于公式内部）。命令后统一带一个空格，
 * 免得 \cdot 和后面的字母黏成 \cdotb 这种不存在的命令。 */
const MAP = [
  [/⁻¹/g, "^{-1}"], [/⁻/g, "^-"], [/²/g, "^2"], [/³/g, "^3"], [/⁴/g, "^4"],
  [/ⁿ/g, "^n"], [/ᵀ/g, "^T"],
  [/₀/g, "_0"], [/₁/g, "_1"], [/₂/g, "_2"], [/ᵢ/g, "_i"], [/ⱼ/g, "_j"],
  [/∑/g, "\\sum "], [/∫/g, "\\int "], [/√/g, "\\sqrt "], [/∞/g, "\\infty "],
  [/≤/g, "\\le "], [/≥/g, "\\ge "], [/≈/g, "\\approx "], [/±/g, "\\pm "],
  [/×/g, "\\times "], [/÷/g, "\\div "], [/·/g, "\\cdot "],
  [/σ/g, "\\sigma "], [/μ/g, "\\mu "], [/η/g, "\\eta "], [/θ/g, "\\theta "],
  [/λ/g, "\\lambda "], [/α/g, "\\alpha "], [/β/g, "\\beta "], [/γ/g, "\\gamma "],
  [/Δ/g, "\\Delta "], [/∇/g, "\\nabla "], [/∂/g, "\\partial "],
  [/π/g, "\\pi "], [/ρ/g, "\\rho "], [/ε/g, "\\varepsilon "]
];

/** 表达式里是否含「该改成公式」的东西 */
const MATHISH = /[²³⁴ⁿ⁻ᵀ√∑∫≤≥≈±×÷σμηθλ∇∂πρℝ]|O\(/;

function toTex(expr) {
  let s = expr;
  /* log / max 这类函数名要变成命令，否则 MathML 会排成斜体的 log */
  s = s.replace(/\b(log|ln|lg|sin|cos|tan|cot|max|min|exp|arg)\b/g, "\\$1 ");
  for (const [re, rep] of MAP) s = s.replace(re, rep);
  /* √x → \sqrt{x}：把紧跟的一坨收进花括号 */
  s = s.replace(/\\sqrt\s+([A-Za-z0-9]+)/g, "\\sqrt{$1}");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** 把 TeX 塞回 JS 字符串：反斜杠需要转义 */
function forJs(tex) { return "$" + tex.replace(/\\/g, "\\\\") + "$"; }

function rewrite(text, report) {
  let out = "";
  let i = 0;
  const n = text.length;

  while (i < n) {
    /* 已有的 $…$ / $$…$$ 原样保留 */
    if (text[i] === "$" && !(i > 0 && text[i - 1] === "\\")) {
      const block = text[i + 1] === "$";
      const open = block ? "$$" : "$";
      const end = text.indexOf(open, i + open.length);
      if (end > 0) { out += text.slice(i, end + open.length); i = end + open.length; continue; }
    }
    /* ① 反引号表达式 */
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > 0) {
        const inner = text.slice(i + 1, end);
        if (inner.length <= 60 && MATHISH.test(inner) && inner.indexOf("$") < 0
          && !/[\u4e00-\u9fa5]/.test(inner)) {
          const tex = toTex(inner);
          report.push([inner, tex]);
          out += forJs(tex);
          i = end + 1;
          continue;
        }
        out += text.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    /* ② O(...) 复杂度 */
    const m = /^O\(([^()]{1,40})\)/.exec(text.slice(i, i + 48));
    if (m && MATHISH.test(m[0])) {
      const tex = "O(" + toTex(m[1]) + ")";
      report.push([m[0], tex]);
      out += forJs(tex);
      i += m[0].length;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

const dry = process.argv.includes("--dry");
let total = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log("跳过（不存在）：" + f); continue; }
  const src = fs.readFileSync(f, "utf8");
  const hits = [];
  const out = rewrite(src, hits);
  if (!hits.length) continue;
  total += hits.length;
  console.log(path.relative(ROOT, f) + "  改写 " + hits.length + " 处");
  hits.slice(0, 5).forEach(([a, b]) => console.log("   " + a + "  →  $" + b + "$"));
  if (hits.length > 5) console.log("   …");
  if (!dry) fs.writeFileSync(f, out, "utf8");
}
console.log((dry ? "[dry] 共 " : "共 ") + total + " 处");

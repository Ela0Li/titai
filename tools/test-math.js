/* 公式转换器自测：node tools/test-math.js
 * 打印 MathML，并生成 dist/math-preview.html 供浏览器核对排版。 */
const fs = require("fs");
const path = require("path");
const M = require("../app/src/main/assets/math.js");

const cases = [
  ["行内分式", "\\frac{a}{b}"],
  ["方差", "\\sigma^2 = \\frac{\\sum_{i=1}^{n}(x_i-\\mu)^2}{n-1}"],
  ["带括号上标", "\\left( \\frac{a}{b} \\right)^2"],
  ["根号", "\\sqrt{\\frac{1}{m}}"],
  ["偏导", "\\frac{\\partial L}{\\partial w_j} = \\eta \\cdot \\nabla L"],
  ["复杂度", "O(n \\log n)"],
  ["比较符", "\\alpha \\le \\beta \\ne \\gamma"],
  ["中文夹排", "\\text{学习率} \\eta = 0.001"],
  ["负指数", "10^{-3}"],
  ["argmax", "\\argmax_{\\theta} \\sum_{i} \\log p(x_i|\\theta)"],
  ["矩阵式连乘", "\\prod_{k=1}^{K} \\sigma_k"],
  ["积分", "\\int_{0}^{1} f(x)\\,dx"],
  ["转置", "\\nabla f^\\top u \\ge -\\|\\nabla f\\|\\,\\|u\\|"],
  ["黑板体", "X \\in \\mathbb{R}^{n\\times d}"],
  ["花体", "\\mathcal{N}(0, 2/n_{in})"],
  ["箭头标注", "\\bar X_n \\xrightarrow{p} \\mu"],
  ["半正定", "H(x) \\succeq 0"],
  ["手写体 l", "L = \\sum_i w_{y_i} \\ell_i"],
  ["不认识的命令", "\\foobar{x}"],
  ["单独美元符", "价格 $5 和 $6"]
];

let ok = 0, bad = 0;
for (const [name, tex] of cases) {
  const ml = M.toMathML(tex, false);
  if (ml && ml.indexOf("<math") === 0) { ok++; console.log("✓ " + name + "  " + tex); }
  else { bad++; console.log("✗ " + name + "  " + tex + "  →  " + ml); }
}
console.log(`\n转换成功 ${ok} · 失败 ${bad}`);

/* 文本混排 */
const text = "学习率取 $\\eta=0.001$ 时，$$\\Delta w = -\\eta \\nabla L$$ 约为 1e-4；代码里写 `reserve()` 不受影响。";
const html = M.renderText(text, (t) => t.replace(/`([^`]+)`/g, "<code>$1</code>"));
console.log("\n混排样例：\n" + html.slice(0, 300) + "…");

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
 body{background:#0d1117;color:#e6edf3;font:15px/1.9 -apple-system,"Segoe UI",system-ui,sans-serif;padding:24px 28px;max-width:760px}
 .case{border:1px solid #1f2730;background:#11161d;border-radius:8px;padding:10px 14px;margin:8px 0}
 .cap{color:#7d8590;font-size:12px;margin:12px 0 2px}
 code{background:#161b22;border:1px solid #222a33;border-radius:4px;padding:1px 5px;font-size:13px}
 math{font-size:1.06em}
 mtext{font-size:.95em}
 .eqblock{margin:10px 0;overflow-x:auto}
</style></head><body>
<h3 style="color:#7ee787;font-size:15px">math.js 排版核对</h3>
${cases.map(([n, t]) => `<div class="cap">${n}</div><div class="case">${M.toMathML(t, false) || "FAIL"}</div>`).join("\n")}
<div class="cap">混排（段落内）</div><div class="case">${html}</div>
</body></html>`;

const out = path.join(__dirname, "..", "dist", "math-preview.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page, "utf8");
console.log("\n预览页：" + out);

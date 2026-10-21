/* 公式体检：node tools/check-math.js [deck.json...]
 * 把每个 $…$ 过一遍 math.js，若渲染结果里还残留 "\命令"，说明这个命令不被支持，
 * 在正文里会显示成反斜杠源码。不带参数时检查 decks/ 下所有知识包。 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const M = require(path.join(ROOT, "app/src/main/assets/math.js"));

function decks() {
  const args = process.argv.slice(2);
  if (args.length) return args.map((p) => path.resolve(p));
  const dir = path.join(ROOT, "decks");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
}

let bad = 0, total = 0;
const missing = new Map();
for (const file of decks()) {
  const deck = JSON.parse(fs.readFileSync(file, "utf8"));
  const texts = [];
  const walk = (o) => {
    if (typeof o === "string") texts.push(o);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(deck.qas);
  walk(deck.groups);
  let n = 0;
  for (const t of texts) {
    for (const m of t.matchAll(/\$([^$]+)\$/g)) {
      total++;
      let out = "";
      try { out = M.renderText("$" + m[1] + "$"); } catch (e) { out = "ERR " + e.message; }
      if (/\\[A-Za-z]/.test(out)) {
        n++; bad++;
        for (const c of out.matchAll(/\\([A-Za-z]+)/g)) {
          if (!missing.has(c[1])) missing.set(c[1], { n: 0, ex: m[1].slice(0, 40) });
          missing.get(c[1]).n++;
        }
      }
    }
  }
  console.log((n ? "✗ " : "✓ ") + path.relative(ROOT, file) + " — 公式 " + n + " 处有残留");
}
console.log("\n共检查公式 " + total + " 处，残留 " + bad + " 处");
if (missing.size) {
  for (const [k, v] of [...missing.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log("  \\" + k + " ×" + v.n + "  例 $" + v.ex + "$");
  }
  process.exit(1);
}
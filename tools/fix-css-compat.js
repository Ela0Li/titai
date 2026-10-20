const fs = require("fs");
const p = process.argv[2];
let s = fs.readFileSync(p, "utf8");
const before = s;

// 1) 顶栏/底栏毛玻璃底色：退化为纯色（Chromium 110 无 color-mix）
s = s.replace(/background: color-mix\(in srgb, var\(--bg\) 88%, transparent\);/g, "background: var(--bg);");
s = s.replace(/background: color-mix\(in srgb, var\(--bg\) 94%, transparent\);/g, "background: var(--bg);");

// 2) 选中态淡色底：固定半透明强调色，深浅两套都成立
s = s.replace(/background: color-mix\(in srgb, var\(--accent\) 12%, transparent\);/g,
  "background: rgba(47, 129, 247, .14);");

// 3) 徽章/标签描边：改用中性线，文字色仍然区分优先级
s = s.replace(/border: 1px solid color-mix\(in srgb, var\(--red\) 45%, transparent\);/g,
  "border: 1px solid var(--line2);");
s = s.replace(/border: 1px solid color-mix\(in srgb, var\(--gold\) 45%, transparent\);/g,
  "border: 1px solid var(--line2);");
s = s.replace(/border: 1px solid color-mix\(in srgb, var\(--purple\) 45%, transparent\);/g,
  "border: 1px solid var(--line2);");
s = s.replace(/border: 1px solid color-mix\(in srgb, var\(--green\) 45%, transparent\);/g,
  "border: 1px solid var(--line2);");
s = s.replace(/border: 1px solid color-mix\(in srgb, var\(--accent\) 45%, transparent\);/g,
  "border: 1px solid var(--line2);");
s = s.replace(/border-color: color-mix\(in srgb, var\(--red\) 45%, transparent\);/g,
  "border-color: var(--line2);");

// 4) 补 -webkit- 前缀
s = s.replace(/(\n\s*)backdrop-filter: blur\(10px\);/g, "$1-webkit-backdrop-filter: blur(10px);$1backdrop-filter: blur(10px);");

fs.writeFileSync(p, s, "utf8");
const left = (s.match(/color-mix\(/g) || []).length;
console.log(JSON.stringify({ changed: before !== s, remainingColorMix: left }));

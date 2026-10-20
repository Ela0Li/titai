/* 浏览器直开时的兜底数据位。
 *
 * App 运行时内容全部由原生桥（window.Native）从 assets/decks/*.json 读取，
 * 这个文件只是 index.html 里的一个固定注入点：
 *   - 浏览器单独打开 index.html 时没有 window.Native，页面会提示「网页调试模式」；
 *   - tools/conformance.js 会在临时目录里用真实 deck 数据覆盖它，再跑无头渲染。
 * 因此这里不内嵌任何学习包内容。 */
window.DECK = { groups: [], qas: [] };

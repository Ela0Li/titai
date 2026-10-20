# tools/archive｜一次性迁移脚本

这里放的是**内容建设阶段用过的一次性脚本**，不是日常流程的一部分。保留它们是为了「当初那份 JSON 是怎么变成现在这样的」还能查得到；正常使用、校验、构建都不需要它们。

| 文件 | 当年干什么 |
| --- | --- |
| `split-pcg.js` | 把最初那个大 PCG 包按模块区间拆成 `cs-base` / `cv-graphics` / `ue5-pcg`，重编号并改写跨包引用 |
| `split-deck.js` | 更通用的一版拆包（按模块数量切分，产物 id 手工指定） |
| `mkdeck.js` | 单包时代的构建器：`decks-src` → `dist/deck.json` + `assets/deck.js` |
| `gen-modules-src.js` | 从已有 deck 反向生成 `decks-src/modules.js` |
| `reorder-modules.js` | 调整模块顺序并同步重编号 |
| `rewrite-math.js` | 把散落的公式文本批量改成 `$…$` / `$$…$$` 标记 |
| `fix-qa-headers.js` | 把四段式标题批量改写成自由结构 (v1.5) |
| `fix-css-compat.js` | 给 `color-mix()` 补前进兼容的纯色回退 |
| `restructure-answers.js` + `answers-patches.json` | 按体裁重排答案结构：脚本只负责应用，补丁表是数据 |
| `snapshot-patches.js` | 把已经改好的答案反推回补丁表 |
| `patch-from-file.js` | 把批次 JSON 合并进补丁表 |
| `restructure-plans.js` | 早期把计划从代码里挪成 `plans/*.plan.json` |

这些脚本假定的是**当时**的目录布局，现在不一定能直接跑；要用就先看清楚它引用的路径。

日常工具在上一层 `tools/` 里：校验（`validate-*.js`、`check-links.js`、`audit-answers.js`）、渲染一致性（`conformance.js`）、内容生成（`build-ml-math.js`、`apply-hints.js`）、协议拆分（`split-protocol.js`）、开发与同步（`dev.js`、`sync.js`）、数学单测（`test-math.js`）。

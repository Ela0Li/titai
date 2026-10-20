# 机器学习入门学习包

`ml-intro`：从数据、模型、损失、评估一路走到上线。10 章、60 个知识点、66 条问答，覆盖 100%。

## 文件

| 文件 | 作用 |
| --- | --- |
| `modules.js` | 10 个模块、60 个自查点、章节导语/关键点/易错点 |
| `qa-core.js` | 第 1–5 章、30 条基础问答 |
| `qa-advanced.js` | 第 6–10 章、30 条基础问答 + 6 条综合问答 |
| `build.js` | 合并、校验引用与覆盖、生成 `backNext/backPeer` |

产物：`../../decks/ml-intro.json`。构建只写这一份文件，不会碰 `dist/deck.json` 或 App 内置学习包。

## 重新构建与校验

在 `studydeck/` 目录执行：

```powershell
node decks-src/ml-intro/build.js
node tools/validate-deck.js decks/ml-intro.json
node tools/conformance.js decks/ml-intro.json
```

`conformance.js` 需要本机 Edge，会真实渲染列表页、自查点和问答详情，检查无 JS 异常、数量一致、文案使用 `terms`、详情面板能打开。

## 导入

- 桌面端运行 `node tools/sync.js`，手机连接同一局域网后在 App 的「局域网同步」里选择这份学习包。
- 也可以把 `decks/ml-intro.json` 直接放到 App 可读取的 `decks/` 目录（文件名任意，`id` 必须保持 `ml-intro`）。

## 设计约定

- 基础问答严格一条覆盖一个自查点；6 条综合问答各覆盖两个知识点，用来做跨章连接。
- 每章基础问答按 `layer` 递进，`next` 串成学习链，`peer` 放横向关联；综合问答只建 `peer`。
- 问答固定四段：结论 → 机制 → 取舍 → 实战，避免只有定义、没有取舍和落地。

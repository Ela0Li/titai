# 机器学习入门知识包（已停用的生成源）

> ⚠ **这里不是内容真相。** 从 0.8.7 起，`ml-intro` 的内容以 [`decks/ml-intro.json`](../../decks/ml-intro.json) 为准，改内容直接改那份 JSON。
>
> 本目录停在 0.7.0 的形态（10 模块 / 60 知识点 / 66 问答、问答固定四段），跑 `build.js` 会**覆盖**现在的 9 模块 / 54 知识点版本，并丢掉后加的 `hint`（及格线）等字段。留在这里只是为了让这段历史还能读懂。

## 文件

| 文件 | 作用 |
| --- | --- |
| `modules.js` | 10 个模块、60 个知识点、章节导语/关键点/易错点 |
| `qa-core.js` | 第 1–5 章、30 条基础问答 |
| `qa-advanced.js` | 第 6–10 章、30 条基础问答 + 6 条综合问答 |
| `build.js` | 合并、校验引用与覆盖、生成 `backNext/backPeer` |

产物：`../../decks/ml-intro.json`（现在**不要**再生成）。

## 当年怎么用

在 `studydeck/` 目录执行：

```powershell
node decks-src/ml-intro/build.js
node tools/validate-deck.js decks/ml-intro.json
node tools/conformance.js decks/ml-intro.json
```

`conformance.js` 需要本机 Edge，会真实渲染列表页、知识点和问答详情，检查无 JS 异常、数量一致、文案使用 `terms`、详情面板能打开。

## 现在改内容怎么做

1. 直接编辑 `decks/ml-intro.json`（它已经是手写维护的），再把同一份拷到 `app/src/main/assets/decks/`；
2. 跑 `node tools/validate-deck.js decks/ml-intro.json`、`node tools/audit-answers.js`、`node tools/conformance.js decks/ml-intro.json`。

## 设计约定（当年）

- 基础问答严格一条覆盖一个知识点；6 条综合问答各覆盖两个知识点，用来做跨章连接。
- 每章基础问答按 `layer` 递进，`next` 串成学习链，`peer` 放横向关联；综合问答只建 `peer`。
- 问答固定四段：结论 → 机制 → 取舍 → 实战——**这条已经作废**，协议 v1.5 起答案结构自由，按体裁选结构。

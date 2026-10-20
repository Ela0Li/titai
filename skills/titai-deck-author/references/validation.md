# 校验与修法

## 三条命令

```bash
node scripts/check.js my-deck.json                  # 总检：结构校验 + 答案体检（最常用）
node scripts/validate-deck.js my-deck.json          # 只跑结构校验
node scripts/audit-answers.js my-deck.json          # 只看答案结构（不影响通过与否）
node scripts/check.js my.plan.json --decks ./decks  # 计划 + 成员包存在性
node scripts/validate-plan.js --decks ./decks my.plan.json
```

退出码：`0` 全过；`1` 有错误；`2` 用法问题。脚本只依赖 Node，不需要装任何依赖。

`check.js` 会先看文件里有没有 `groups` / `members`，自动判断是知识包还是计划，所以一条命令就够。

输出分三段：

```
学习包：Git 版本控制 · 提交与分支（git-basics，schema 1）
  模块 2 · 自查点 5 · 问答 4 · 交叉引用 3（next 1 / peer 1）
  覆盖 4/5（80.0%） · 分层 L1 2 / L2 1 / L3 0 / L4 0
  覆盖深度：1 条 4 · 2 条 0 · 3 条 0 · 4+ 条 0

warnings（1）
  [W] W_UNCOVERED × 1 — 没有任何问答覆盖（协议允许，仅提示）

problems（1）
  [E] E_QA_REF groups[0].checks[1].seeAlso — seeAlso 指向不存在的问答：m1.1
```

- **problems（E_ 开头）必须清零**，否则导入会被挡下。
- **warnings（W_ 开头）应该清零**：都是「协议允许但内容不完整」的信号（没写 `signal`、问答不覆盖知识点、问题缺句末标点）。
- **notes（也是 W_ 开头，但只提示）**：`W_CYCLE`（双向追问）与 `W_LAYER_DOWN`（追问越问越浅）被单独归类，**不计入 warnings 数、不影响退出码**，要加 `--verbose` 才展开。它们仍是真问题，只是不拦导入。

## 错误码表

### 顶层与模块

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_SCHEMA` | `schema` 不是 1 | 写 `"schema": 1` |
| `E_DECK_ID` | 包 id 不合规 | 小写字母数字与连字符，2–41 字符 |
| `E_TITLE` | 标题为空或超长 | ≤ 120 字 |
| `E_ACCENT` | 颜色不是 `#RRGGBB` | 如 `#3b82f6` |
| `E_GROUPS` / `E_QAS` | 不是非空数组 | 至少一个模块、一条问答 |
| `E_GROUP_ID` | 模块 id 不合规 | 字母开头，≤ 16 字符，如 `m1` |
| `E_GROUP_DUP` | 模块 id 重复 | 改其中一个 |
| `E_GROUP_TITLE` | 模块标题为空 | 写「模块一 · …」 |
| `E_GROUP_LVL` | `priority` 不是 P0/P1/P2 | 改枚举值 |
| `E_GROUP_STAGE` | `stage` 不是 1–4 的整数 | 改数字 |
| `W_SIGNAL` / `W_KEYPOINTS` / `W_TRAPS` | 模块缺这三项 | 补上，见 content-rules.md |

### 知识点

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_CHECK_ID` / `E_CHECK_DUP` | id 不合规或重复 | `m1.3` 形式 |
| `E_CHECK_PREFIX` | id 前缀与所属模块不一致 | `m2` 模块里的必须叫 `m2.x` |
| `E_CHECK_TEXT` | 文本不足 4 字 | 写完整一句话 |
| `W_CHECK_LONG` | 超过 300 字 | 拆成两条知识点 |
| `E_CHECK_LVL` | `lvl` 不是 P0/P1/P2 | 改枚举值 |
| `E_CHECK_HINT` | `hint` 不是字符串 / 少于 6 字 / 多于 60 字 / 含换行 | 写一条单行判据 |
| `E_REF_LIMIT` | `seeAlso` 超过 2 条，**或根本不是数组** | 改成 2 条以内的字符串数组 |
| `E_REF_DUP` | 同一数组里有重复引用 | 删重复 |

还有几个「容器本身坏了」的码，见到就说明 JSON 结构塌了，按提示层级改：`E_ROOT`（顶层不是对象）、`E_GROUP` / `E_GROUPS`（模块不是对象／不是非空数组）、`E_CHECKS`（`checks` 不是非空数组）、`E_QA` / `E_QAS`（问答同上）、`E_READ`（文件读不出来，检查路径）。

### 问答

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_QA_ID` / `E_QA_DUP` | id 不合规或重复 | `q.m1.merge` 形式 |
| `E_QA_M` | `m` 指向不存在的模块 | 改成已有模块 id |
| `E_QA_LVL` / `E_QA_LAYER` | `lvl` 或 `layer` 越界 | P0–P2 / 1–4 |
| `E_QA_Q` | 问题少于 6 字 | 把问题写完整 |
| `W_QA_MARK` | 问题没有句末标点 | 补 `？` 或 `。` |
| `W_QA_TAGS` | `tags` 超过 6 个 | 删到 6 个以内 |
| `E_QA_COVERS` / `E_QA_COVERS_DUP` | `covers` 为空或有重复 | 至少覆盖一个知识点 |
| `E_QA_ANS` | `ans` 为空 | 至少一块 |
| `E_QA_ARR` / `E_QA_ARR_DUP` | `next`/`peer` 不是数组或有重复 | 改成字符串数组 |

### 引用（最常踩）

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_COVER_REF` | `covers` 指向的知识点不存在 | 检查 id 与模块前缀；跨包要写 `deck#m1.1` |
| `E_QA_REF` | `next`/`peer`/`seeAlso` 指向的问答不存在 | **`seeAlso` 只能指向问答**，指向知识点就会报这个 |
| `E_CROSS_SYNTAX` | 跨包引用写法不对 | `deckId#localId`，`#` 两边都不能空 |
| `E_SELF_REF` | 引用了自己 | 删掉 |

只提示、不拦导入（notes 段）：

| 码 | 含义 | 怎么改 |
|---|---|---|
| `W_CYCLE` | `next`/`peer` 互相指向 | 只保留单向 |
| `W_LAYER_DOWN` | 追问指向的问答 layer 更低 | 追问应往深里走 |

### 答案块

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_ANS` | 块不是对象 | 改成 `{"p": "…"}` |
| `E_ANS_P` | `p` 少于 8 字 | **配了 list 也要写引导句**，这是最常见的返工 |
| `W_ANS_LONG` | 一段超过 1200 字 | 拆段 |
| `E_ANS_HEAD` | `h` 是空白字符串 | 要么删掉，要么写标题 |
| `W_ANS_HEAD_LONG` | 标题超过 24 字 | 缩短 |
| `E_ANS_LVL` | `lvl` 非 1–3 / 跳级 / 无 `h` 却写了 `lvl` | 从 1 开始逐级加 |
| `E_ANS_LIST` | `list` 不是非空字符串数组 | 每条至少 2 字 |
| `W_ANS_LIST_LONG` | `list` 超过 10 条或单条超 200 字 | 拆段或缩短 |
| `E_ANS_HTML` | 段落里有 HTML 标签 | 删标签，强调靠结构 |
| `W_ANS_NOHEAD` | 超过 3 块却没有标题 | 加分节标题 |

### 公式

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_MATH_BRACE` | 花括号不平衡 | 检查 `\frac{}{}`、`^{}` |
| `E_MATH_BALANCE` | `$` 落单 | 成对写 |
| `E_MATH_EMPTY` | 空公式 `$$` | 删掉或补内容 |
| `W_MATH_CMD` | 用了不支持的宏 | 换成本技能支持的子集（见 deck-format.md） |

## 答案体检（audit-answers.js）

结构合法 ≠ 结构合适。这个脚本给的是**线索**，不参与通过与否（退出码恒为 0）：

| 规则 | 命中条件（精确） | 通常怎么改 |
|---|---|---|
| E1 | 某块 `p` + `list` 合计少于 **40 字**（快问类 25 字） | 补一句实质内容，或把这题删掉 |
| E2 | 全篇只有 **1 块**且超过 260 字 | 分节 |
| E3 | 问句以「怎么/如何/怎样」开头，某块标题是「取舍/实战/边界/权衡」，且全篇没有步骤结构（无 `list`、也没有步骤型标题） | 换成「一句话／分几步／边界」 |
| E4 | 标题是「结论」，正文里出现 `先…再/然后/接着/最后`、`第一步`、`依次` 之类 | 结论只留判断，过程挪到步骤块 |
| E5 | 某块超过 400 字、有 3 个以上分号、又没有 `list` | 改成 `list`，一条一个维度 |
| E6 | 超过 3 块却没有一个标题 | 加 `h` |
| E7 | 3 块以上全是 1 级标题，正文里却有「其中/具体来说/再细分/进一步」 | 加 2 级标题 |

命中不等于错：一句刻意的短结论（「不需要。」）是 E1 的正常误报。看一眼，判断是人写的短句还是占位符。

## 脚本不查什么

下面这些是协议／schema 层的约定，**`validate-deck.js` 不会拦**（写了超限值也能导入，只是界面会难看或行为不符合预期）：

- `title` ≤ 120 字、`subtitle` ≤ 200 字、`accent` 之外的样式字段
- `terms` 三项要一起写（混着写界面会半中半英）
- `group.stage` 在同一包内单调递增
- `tags` 每个 ≤ 24 字、`next`/`peer` ≤ 3 条（schema 里有限制，脚本不查）
- 模块 `keypoints`／`traps` 的条数与写法

结构上限以 `assets/schema/deck.schema.json` 与 `assets/schema/plan.schema.json` 为准；脚本是「语义 + 常见坑」的补充，两者不重叠。

## 计划校验

| 码 | 含义 | 怎么改 |
|---|---|---|
| `E_PLAN_*` | 计划结构问题（`schema`/`id`/`title`/`members`/`primary`），字段定义见 `assets/schema/plan.schema.json` | 按提示改 |
| `E_PLAN_MEMBER_MISSING` | `--decks` 目录里没有这个包 | 把包放进去，或改成员名 |
| `W_PLAN_NO_DECKS` | `--decks` 目录为空 | 用 `--decks` 指向正确的目录 |

计划的 `primary` 必须在 `members` 里；成员顺序就是学习顺序。

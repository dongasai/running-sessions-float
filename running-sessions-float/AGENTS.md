[根目录](../AGENTS.md) > **running-sessions-float**

# running-sessions-float（插件包）

本文件只写**这个包**的职责、入口、接口、数据形状与坑。仓库级命令、硬约束、改动连带项在
[根 AGENTS.md](../AGENTS.md)；用法与排错在 [README](../README.md)；设计取舍在
[IMPLEMENTATION](../IMPLEMENTATION.md)。与代码冲突时以代码为准。

## 模块职责

DSH Web 插件的**可安装单元**：一个包两半，Host 半边为空，浏览器半边在官方
`sidebar.footer.action` 槽位注册一个「进行中」会话坞 —— 侧栏底部动作区顶部、正常流里的真实一块，
不浮层、不盖住会话列表。仓库根没有 `package.json`，安装 target 必须指到本目录。

- 不新增数据源：只读 slot 提供的 `useSessions` / `useSessionStatus` 快照。
- 不落盘、不轮询、不加 Host 路由 / 工具 / 状态。
- 无构建、无 npm 依赖、无 JSX；样式与文案都在 `client.js`。

## 入口与启动

| 文件 | 作用 |
|---|---|
| `package.json` | `exports["."] = ./index.js`、`exports["./client"] = ./client.js`；`dsh.bundle.patch` 指 patch，`dsh.client` 声明 web + 启动即加载 + 依赖 session UI 包 |
| `cordis.patch.yml` | `insert` 一行：id `running-sessions-float` → `@local/running-sessions-float` |
| `index.js` | Host 半边，导出空 `apply()`（8 行），只给 bundle 一个挂载入口 |
| `client.js` | 浏览器半边（417 行）：`DICTS` / `promoteFooterContainer` / `CSS` / `useTranslator` / `pendingLabel` / `RunningSessionsDock` / `apply` |

加载路径：`dsh.client.immediately: true` → 启动即加载，不等面板打开；`inject` 里的
`@deepseek-ai/dsh-client-ui-session` 先激活，`useSessions` / `useSessionStatus` 才在渲染前就位。

生效方式（改完怎么看到）：改 `client.js` 靠 Web 组合的 `client-hmr`（500ms stat，通常一两秒自动
换新）；改 `index.js` 要重启 dsh；改 `dsh.*` / patch 要重新装配。详见根 AGENTS.md 的生效表。

## 对外接口

| 面 | 契约 |
|---|---|
| slot | `sidebar.footer.action`（list 槽，`scope: root`，owner props 只有 `wide`，无 patterns），id `running-sessions-float`，`order: -10`（负值排在官方动作默认 0 之前）；注册走 `ctx.slots.inject(...)` 等槽存在。挂载时把该行改成列（`promoteFooterContainer`），官方入口排在坞下面 |
| locale | 命名空间 `local.runningSessions`；en / zh 各 7 个 key（`title` `running` `approval` `plan` `answer` `empty` `openHint`） |
| inject face | 组件拿到 `{ locale, openSession }`；`openSession` 内部再判 `uiWorkspace.openSession` 是否存在 |
| 数据入 | slot 标准 props：`useSessions(select)` / `useSessionStatus(select)` |
| 副作用出 | 仅 `uiWorkspace.openSession(sessionId)`（点击行） |
| 降级 | 无 `locale` → 内置 `DICTS.zh`；无 `uiWorkspace` → 点击 no-op；状态缺该 id → 回落 `summary.running`；`wide === false` → 36px 计数圆片 |

`locale/*.json` 只承载插件页 `meta.title` / `meta.description`，不是坞内文案。

## 关键依赖与配置

- 运行期唯一 `require('react')`（classic bundle，宿主把各 client bundle 拼成一个脚本，**顶层只允许
  一个 `window.__ModuleLoader__.load`**）。
- 无 `dependencies` / `devDependencies`；`private: true`，未发布 registry。
- 样式只用主题 token（`--dsw-alias-*`）；坞在正常流里，没有坐标 / 阴影硬编码。
- 唯一的宿主布局介入（两处同一动作）：坞挂载时的 ref 回调 `promoteFooterContainer` 用
  `closest('[data-slot="sidebar.footer.action"]')` 找到锚点、把其父元素的 `flex-direction` 置为
  `column`，卸载时还原；另有一条等价
  `div:has(> [data-slot="sidebar.footer.action"] > .rsf-dock)` 规则管首帧、免闪烁。锚点由渲染器的
  `SlotOutlet` 提供。**不改列就会把 `用量统计` / `会话管理` 挤出可视区**（实测踩过）。
- 坞最高 `min(28vh, 200px)`：底部动作区还有官方入口与设置行，侧栏自己没有滚动条。
- `files` 白名单只含运行文件（`index.js` `client.js` `cordis.patch.yml` `locale/*.json` `icon.svg`），
  **本文件不进包**，只在仓库内给 agent 看。

## 数据模型

| 来源 | 字段 | 用途 |
|---|---|---|
| `useSessions` | `ids[]`、`byId[id] = { displayTitle, updatedAt, running, blank, origin, retainedBy }` | 候选集、标题、排序键、过滤 |
| `useSessionStatus` | `Map<id, { running, pendingInteraction: { kind }, completionUnread }>` | 实时运行态、待办归类 |
| 派生 `rows` | `{ id, title, updatedAt, state: { text, tone } }` | 按 `updatedAt` 降序；`tone` 为 `live` / `warn` |

规则要点（改任一条要同步 smoke / README / IMPLEMENTATION）：

1. `blank === true` 与 `origin === 'subagent'` 不进坞；
2. 保留条件是 `running || pendingInteraction`；
3. 有 `pendingInteraction` 时**优先显示待处理**，即使 `running` 为真；
4. `kind` 做小写包含匹配：含 `plan` → 计划待审，含 `approval` / `permission` → 等待审批，其余 → 等待回答；
5. `completionUnread` 与 `retainedBy` 当前**未使用**（已知边界，不是漏读）。

## 测试与质量

```bash
node --check running-sessions-float/client.js
node --check running-sessions-float/index.js
node test/smoke.mjs          # 31 项，必须 ALL PASS
```

`test/smoke.mjs` 用 `vm` 加载本包的 `client.js`、React 桩渲染，23 项行为断言（过滤 / 排序 / 四种状态 /
计数 / 空态 / 点击转发 / locale 回落 / 无 openSession / en 字典注册 / 窄栏圆片与计数 / CSS 无 `position: fixed` /
挂载时把底部动作行改成列（锚点是该行唯一子元素时也生效）、卸载时还原）
+ 8 项包契约（client id 与包名一致、注册在 `sidebar.footer.action`、`order < 0`、patch 行指向本包、
`files` 含运行文件、zh/en 键集合相同、每个 `t()` 键两本都有、只 require react）。

没有 DOM：位置、遮挡、主题、悬停提示、语言切换只能在浏览器按 README 打勾清单人工核，
**不要声称跑过浏览器清单**。

## 常见问题 (FAQ)

- **装不上，报 `not-bundle` / 找不到 manifest**：target 指到仓库根了，改指本目录。
- **装完没变化**：只装没启用；或 `application: restart-required` 需重启 Harness。
- **改 `client.js` 页面没变**：装的是副本（git / tarball），或部署没挂 `client-hmr`。
- **坞一直「暂无进行中」**：确实没有 running / pending 会话，或它们都是 blank / subagent（被刻意过滤）。
- **点行没反应**：部署里没有 `uiWorkspace`，属降级行为。
- **坞和官方底部动作挤在同一行**：`promoteFooterContainer` 没找到锚点（宿主改了 `data-slot` 名）或 `closest` 不可用，坞退化成 row 里的一个 flex 项 —— 数据不受影响，改选择器即可。
- **坞盖住会话列表**：说明被改回了 `position: fixed` / `shell.overlay`，这违反约束 5。
- **加一个可见文案就红**：smoke 双向校验 zh/en 键与每个 `t()` 键，先补齐 `DICTS` 两本。
- **不要为了「方便」加 Host 逻辑**：那会改变生效条件、权限与验证方式，等于换一类插件。

## 相关文件清单

| 文件 | 关系 |
|---|---|
| [package.json](package.json) | 包声明：exports / files / dsh.bundle / dsh.client |
| [cordis.patch.yml](cordis.patch.yml) | 装配 insert 行 |
| [index.js](index.js) | Host 半边（空 `apply()`） |
| [client.js](client.js) | 浏览器半边：样式、组件、locale、slot 注册 |
| [locale/zh.json](locale/zh.json) · [locale/en.json](locale/en.json) | 插件页 meta |
| [icon.svg](icon.svg) | 插件图标（`exports["./icon"]`） |
| [../test/smoke.mjs](../test/smoke.mjs) | 无 DOM 冒烟 + 包契约 |

## 变更记录 (Changelog)

| 日期 | 变更 |
|---|---|
| 2026-10-20 | 新建本模块文档（init-architect）：职责 / 入口 / 接口 / 数据形状 / 测试映射，内容取自现有代码与根文档，未移动根 AGENTS.md 原文 |
| 2026-10-20 | 位置修正：槽位从 `shell.overlay`（fixed、order 60）改为 `sidebar.footer.action`（正常流、order -10），补窄栏圆片与 `:has()` 布局介入；行数 318 → 368、断言 21 → 27。 |
| 2026-10-20 | 共存修正：挂载时 `promoteFooterContainer` 把槽位所在那一行改成列（锚点是该行唯一子元素时也生效，卸载还原），官方入口排在坞下面；坞最高 200px。行数 368 → 417，断言 27 → 31。 |

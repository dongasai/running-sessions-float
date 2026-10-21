# 实现说明

本文件只写**为什么**。怎么装、怎么用、怎么排错、已知边界都在 [README.md](README.md)，
给 agent 的命令与约束在 [AGENTS.md](AGENTS.md)。

## 数据流

```text
Session Controller（官方，事件驱动）
  ├─ useSessions ──────→ 会话目录：ids / byId(displayTitle, updatedAt, running, blank, origin)
  └─ useSessionStatus ─→ 运行状态：Map<id, { running, pendingInteraction, completionUnread }>
                                   │
                                   ▼
                     rows = 过滤(blank / subagent) → 保留(running 或 pending 或完成未读) → 按 updatedAt 降序
                                   │
                                   ▼
                     .rsf-dock（sidebar.footer.action 里的正常流元素）
                                   │ 点击行
                                   ▼
                     uiWorkspace.openSession(id) → replaceMain(reveal)
```

坞里没有第三份数据。两个 Hook 都是官方维护的可观察快照，插件只读。

## 为什么不要 Host 半边

插件不落盘、不暴露路由、没有配置项，Host 侧没有任何状态可管。`index.js` 保留一个空 `apply()`，只是为了让 bundle 有一个可挂载的入口：

```js
export function apply() {}
```

这样一来，插件的全部行为都在 `client.js`，也不存在「Host 改了要重启 Harness」的生效问题。真要加设置项或 Host 统计，才需要把状态搬到 Host，并重新考虑持久化与权限。

## 为什么注册 `sidebar.footer.action`

坞要的是「在侧栏里占一块、不盖住会话列表」。宿主能给的稳定席位只有侧栏底部这一排动作：

- `sidebar` 是 single 槽（整列），`sidebar.workspaces` 是列表里的 single 槽 —— 塞进会话列表会跟着列表一起滚，还会被工作区分组折叠带走。
- `shell.overlay` 是铺满整个 frame 的浮层：位置只能靠 `position: fixed` 写死，于是它会盖住列表，也不随侧栏宽度 / 折叠变化（旧实现就是这样）。
- `sidebar.footer.action` 是官方给「设置旁边的底部动作」留的 list 槽，scope `root`、没有 patterns；插进去就是侧栏底部的真实布局，容器在 `footArea > footerActions`。

代价有两块：坞只能待在侧栏最底部（这正是需求 —— 不遮挡），以及 56px 窄栏放不下列表。后者用 `wide: false` 的 36px 计数圆片兜住：折叠时收起的是列表，不是「有东西在跑」这个事实。

槽位的内容锚点是 `display: contents` 的 `<div data-slot="sidebar.footer.action">`，它的子节点直接成为 `footerActions` 的 flex 项。宿主把这一行做成 `flex-direction: row`，一个占满宽度的坞会把同行的 `用量统计` / `会话管理` 挤出可视区（实测就是整排只剩坞）。

所以坞必须先让那一行**能换行**，而且不能只靠 CSS：`div:has(> [data-slot="sidebar.footer.action"] > .rsf-dock)` 只能管首帧、且依赖客户端支持 `:has()`；坞挂载时还会用一个 ref 回调（`promoteFooterContainer`）从自己的节点 `closest('[data-slot="sidebar.footer.action"]')` 找到锚点，把 `anchor.parentElement` 的 `flex-wrap` 置为 `wrap`、`align-items` 置为 `stretch`，卸载时还原成空串。两条路径做的是同一件事，所以谁先到都不冲突。

为什么是 wrap 而不是 column：这条生态里的底部入口（`dsh-all-usage` 的 `.uh-side-entry`、`dsh-session-manager`、`dsh-search-index` 的 `.dsws_root{flex:0 0 100%}`）都用「100% 弹性基准」表达「我要占满一整行」。行里 wrap 时 100% 是宽度，各占一行；换成 column 后 100% 变成高度 —— 实测搜索入口当场涨成 256×139.95，把坞和其它入口一起顶出视口。

选 `data-slot` 锚点而不是宿主那个 hash 过的类名，是因为渲染器把锚点当作可寻址面（`SlotOutlet`），hash 类名会随构建变；代价写进了 README 的「已知边界」。

## 尺寸从哪来

| 常量 | 值 | 依据 |
|---|---|---|
| 宽度 | `width: 100%` | 等宽于侧栏内容的可用宽度（侧栏本身有 12px 内边距），不再算 252 / 264 |
| 最高 | `min(28vh, 200px)` | 行多时在坞内滚动。底部动作区里还有官方入口与设置行，而侧栏自己**没有滚动条** —— 坞一旦超过这个高度，就会把它们顶到视口外面 |
| 空态 | `padding: 2px 6px` + 11px 文字 | 收成一行细字、无边框，占位成本最小 |
| 窄栏圆片 | `36px × 36px` | 与同槽位官方 Cordis 动作的 36px 对齐 |
| 顺序 | `order: -10` | 官方底部动作都用默认 0；负值让坞排到槽位内容区顶部，官方入口在它下面 |

这些值都在 `client.js` 的 `CSS` 常量里（第 105–279 行），没有读任何布局变量。官方改侧栏内边距 / 底部结构时，这里要跟着看。

## 过滤规则

```js
if (!summary || summary.blank === true || summary.origin === 'subagent') continue;
```

- **空白会话**：`blank` 是「新建但还没发消息」的占位会话，没有「进行中」的意义；放进来会让每次新建都多一行没内容的条目。
- **subagent 会话**：`origin === 'subagent'` 的子会话的标题是子代理自己的标签。把它们列出来，一个任务会在坞里裂成多行，反而看不出「主会话在跑」。想看子代理进度，进主会话看。

保留条件是 `running`、`pending` 与「完成未读」的**并集**：

```js
const running = status && status.running !== undefined ? status.running === true : summary.running === true;
const pending = status ? status.pendingInteraction : undefined;
const done = status ? status.completionUnread === true : false;
if (!running && !pending && !done) continue;
```

`status.running` 是事件驱动的最新值；快照里还没有这个 id 时（刚创建、还没收到状态），退回列表快照的 `summary.running`。两者都不确定时不列 —— 宁可少一行，不要留一行假「运行中」。

`completionUnread` 只认状态快照：列表快照里没有这个事实，缺字段就按「已读过」处理，不猜。官方语义是「在主视图之外观察到一次停止」——`observeRunning` 把 `true → false` 记进 `completionUnread`，而 `reconcileStatus` 每隔一轮把 `retainedBy.mainView > 0` 的会话从这个集合里删掉，回到主视图 / 打开会话同样会清。所以坞里出现的「已完成」行一定是「你没当前看着它跑完」的那些。

## 为什么把「完成未读」也收进来

早先版本只用 running / pending 两个条件，会话一跑完就从坞里消失 —— 那正是需求里说的「已经运行结束但未读的没有显示」。补这一行的取舍：

- **它是同一个 Hook 的第三个字段**，不新增数据源、不轮询，因此不违反「坞是聚合视图，不是第二份真相」的约束。
- **措辞抄官方**：官方会话行把 `completed` 显示成「已完成」（`status.completed`），坞用同一个词、同一层含义，避免用户在两处看到两种说法。
- **优先级排在最后**：待处理 > 运行中 > 已完成。一个刚跑完又被追问的会话应当先说「等待回答」，而不是「已完成」。
- **配色降级**：运行中是 success 绿、待处理是 warn 橙，已完成用次级文字色 `--dsw-alias-label-tertiary` —— 它是提醒，不是告警，不该抢走待处理的注意力。
- **头部状态点跟着降级**：只要还有 running / pending 的行，坞头绿点继续脉冲；只剩「已完成」提醒时换成 6px 静止圆点（`rsf-settled`）。否则最后一个任务跑完时，坞头还在脉冲，等于在撒谎。尺寸保持 6px 是为了切换时坞头高度不跳。
- **固定座位不变**：全部清空后仍回落到「暂无进行中」细行，不新增空态分支。

## 排序

只按 `updatedAt` 降序：

```js
visible.sort((left, right) => right.updatedAt - left.updatedAt);
```

不跟随侧栏的固定 / 手动排序。侧栏排序是「导航顺序」，坞要回答的是「最近在动的是谁」，两个问题不该共用一个键。代价是长时间不写消息的旧会话会排到后面。

## 待处理归类

`pendingInteraction.kind` 是各域自己定的字符串（官方目前发 `approval`、`plan-review`、`question`），坞只做大小写无关的包含匹配：

```js
if (normalized.indexOf('plan') !== -1) return { text: t('plan'), tone: 'warn' };
if (normalized.indexOf('approval') !== -1 || normalized.indexOf('permission') !== -1) {
  return { text: t('approval'), tone: 'warn' };
}
return { text: t('answer'), tone: 'warn' };
```

为什么不按精确值映射：`kind` 属于各交互域，新增类型不该让坞里那一行消失。包含匹配的代价是未知类型会落到「等待回答」，需要在新增交互类型时回来补一条映射。

待处理优先于运行中：一个会话既在跑又在等你审批时，行尾显示「等待审批」—— 那才是需要你动手的状态。

## 空态为什么还留一行

没有任何进行中会话时，坞不整个消失，而是收成一行无边框的细字（`rsf-empty`）：灰点、11px 次级色文字「暂无进行中」。

- 好处：坞有固定座位，「有 → 无」时不会整块跳掉，视线不用重新找。
- 代价：常驻一行视觉噪音。用次级色、小字号、无计数、无边框把它压到最低，也避免在底部动作区里凭空多出一个卡片。

## locale 两层

- `locale/en.json` / `locale/zh.json` 的 `meta` 只服务**插件页**：列表里的标题与描述。
- 坞里的界面文案在 `client.js` 的 `DICTS`（en / zh 各 8 个 key），通过 `locale.register('local.runningSessions', DICTS)` 注册；组件用 `locale.subscribe` 订阅语言切换，`locale.bind(NS)` 取翻译。
- locale 服务不存在时，`useTranslator` 退回内置 `DICTS.zh`。这就是「locale 服务缺失时界面是中文」的来源，不是漏翻译。

把界面文案放进 `client.js` 而不是 `locale/*.json`，是因为后者由 Host 侧插件清单读取，只承载 meta；运行时字典走 Client locale 服务。加语言要同时改 `DICTS` 并重新装。

## 注册时序

```js
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: 'running-sessions-float',
  order: -10,
  ...
}, RunningSessionsDock));
```

`slots.inject` 等槽位真正存在才注册，避免布局包与插件包的加载顺序问题。`package.json` 里 `dsh.client.immediately: true` 让客户端半边在启动时就加载，不用等某个面板被打开；`dsh.client.inject` 声明依赖 `@deepseek-ai/dsh-client-ui-session`，保证 `useSessions` / `useSessionStatus` 这两个全局标准 props 在组件渲染前就位 —— `sidebar.footer.action` 是 `scope: root` 的槽位，和 `shell.overlay` 一样拿得到这两个 Hook。

`order: -10` 是「排在内容区顶部」的唯一手段：list 槽按 order 升序渲染，官方动作没有写 order（默认 0），负值就排在它们前面。

## 生效路径（改 client.js 后发生了什么）

Web 组合挂了 `client-hmr`。它每 500ms 对图里每一行的 bundle 做一次 `stat`（mtime / ctime / size；用轮询是因为网络挂载没有 inotify）。文件一变就调 `clientModules.rebuilt(id)`：

1. `rebuilt` 重新 stat，用 mtime / ctime / size 算 revision（不是读内容哈希）；revision 没变就什么都不做；
2. revision 变了才重新 `readFileSync` bundle，替换图里这一行的字节与 URL 上的 rev；
3. `/plugins/events` SSE 推 `rebuilt` 帧，浏览器半边同步替换该条目的代码。

所以 `link:` 装的插件改完 `client.js`，通常一两秒内就换新，不需要刷新。

**没有 `client-hmr` 的部署是另一回事**：Host 的 `clientModules` 只在包注册时读一次字节，之后没人调 `rebuilt()`；刷新页面拿到的仍是内存里的旧 bundle —— 必须重启（或重新安装）才会重读。装的是副本时，改仓库代码根本没碰到被监视的文件，得重新安装。

## 服务注入的时机（踩过的坑）

`uiWorkspace` 不是本插件声明的 inject 依赖，而是**可选服务**，并且它属于 `@deepseek-ai/dsh-client-ui-workspace` —— 那个包自己 inject 了连接、session controller、workspace controller、layout、renderer、sidebar 等十余个包，因此在启动顺序里很晚才 `provide('uiWorkspace')`。

`ctx.get(name, strict = true)` 的 strict 语义是「只返回**当前已激活**的 fiber 提供的实现」，所以在本插件 `apply` 执行的那一刻取 `uiWorkspace` 通常拿到 `undefined`。

早先的写法把这次取值缓存在闭包里：

```js
apply(ctx) {
  const uiWorkspace = ctx.get('uiWorkspace');   // ← 此刻通常是 undefined
  ...
  openSession: id => { uiWorkspace?.openSession(id); }
}
```

后果是所有行点击静默失效，而坞的数据、配色、计数全都正常 —— 看起来像「只有某个状态点不动」，其实三种状态一条都点不动。

正确写法是**每次点击现取**，并把取值包在 `try/catch` 里（provider 卸载后 `ctx.get` 会抛，不该让一次点击炸掉渲染）：

```js
openSession: sessionId => {
  let uiWorkspace;
  try { uiWorkspace = ctx.get('uiWorkspace'); } catch { uiWorkspace = undefined; }
  if (uiWorkspace && typeof uiWorkspace.openSession === 'function') uiWorkspace.openSession(sessionId);
}
```

代价：每次点击多一次 `ctx.get`（一次 Map 查表）。这个代价远小于「整块坞看起来正常但点不动」。

**为什么探针没抓到**：所有点击断言都是 `render(component, ..., { openSession })` 直接把函数当 prop 传进去，测的是组件的 `onClick` 转发，**不是**插件注册的 `inject()` 返回的那个包装函数。现已补 4 条走注入面的断言，并做过变异验证（把缓存写法改回去 → 2 项 FAIL）。

## 降级路径

- `uiWorkspace` 不存在：点击时现取不到服务，`openSession` 什么都不做；按钮仍可聚焦、可点，只是不导航。已完成的提醒行也因此点不掉，只能等官方下一轮 reconcile。
- `locale` 不存在或不完整：`register` / `subscribe` / `bind` 都先做 `typeof` 检查；组件始终能渲染。
- 状态快照里没有某个会话：`running` 用列表快照的 `summary.running` 兜底，`completionUnread` 则一律按 `false`（没有可信来源就不显示「已完成」）；都没有就不列。
- `wide === false`（侧栏折叠成 56px 窄栏）：不渲染列表，只渲染 36px 圆片 + 计数；`aria-label` 写「进行中 · N」，空态写「暂无进行中」。这是唯一按槽位 owner props 分叉的地方，圆片不可点（槽位没给展开侧栏的回调）。
- `:has()` 不被支持：换行由组件挂载时的 `promoteFooterContainer` 完成，`wide: false` 时不介入（窄栏本来就是一行图标）。
- 节点没有 `closest`、或锚点被宿主改名：找不到锚点就什么都不改，坞退化成 row 里的一个 flex 项（会挤邻居，但数据与文案不受影响）。

## 测试策略

`test/smoke.mjs` 不引依赖：用 Node `vm` 执行 `client.js`，用 React 桩把组件渲染成普通对象树，断言：

- 过滤：blank / subagent / 空闲不进坞；
- 排序：按 `updatedAt` 降序；
- 文案：等待审批 / 计划待审 / 等待回答 / 运行中 / 已完成；
- 完成未读：只带 `completionUnread` 的会话进坞、排在其 `updatedAt` 位置、点它也能转发 id、行尾灰字配色只用主题 token；
- 头部状态点：有 running / pending 时是 `rsf-pulse`，只剩「已完成」时是 `rsf-pulse rsf-settled`（含窄栏圆片）；
- 计数徽标、空态类名与文案、空态无计数；
- 点击把 id 转发给 `openSession`；
- **注入面本身可用**（这条是补漏）：直接调用 `spec.inject().openSession`，验证它经 `uiWorkspace` 真能跳转、`apply` 时没有缓存服务、晚到的 `uiWorkspace` 补挂后仍然有效、服务缺失时不抛异常。此前所有点击断言都是把 `openSession` 作为 prop 直接传给组件，绕过了插件自己的包装函数，于是「`apply` 时缓存到 `undefined`」这个 bug 能带着 38 项全绿溜过去；探针改成走注入面后再把旧实现改回去，会看到 2 项 FAIL（已实测）；
- 没有 locale 服务时回落中文；
- 没有 `openSession` 时点击不抛异常；
- en 字典确实注册；
- 窄栏（`wide: false`）渲染圆片而不是列表，`aria-label` 带计数，空态无计数；
- CSS 里没有 `position: fixed`，且选择器指向 `data-slot="sidebar.footer.action"`（防止有人把坞改回浮层）；
- 挂载时把底部动作行改成可换行（`flexWrap` / `alignItems`；即使锚点是该行唯一元素子元素也照改），卸载时还原为空串。

另有 8 项包契约，防止 manifest / patch / 槽位漂移：client id 与包名一致、注册在
`sidebar.footer.action`、`order < 0`（排在官方动作之前）、patch 行指向本包、`files` 含运行文件、
zh / en 键集合相同、源码里每个 `t('key')` 两本字典都有、client bundle 只 `require('react')`。

34 + 8 = 42 项。样式、布局、遮挡、悬停提示、主题色这些没有 DOM 断言环境，放在 README 的浏览器打勾清单里，不在这里假装能测。

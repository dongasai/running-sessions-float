# DSH 插件仓库

DeepSeek Harness（DSH）独立插件仓库。每个插件是一个可链接安装的 npm 包，位于本仓库下的同名子目录，通过 `dsh.bundle.patch` 插入 `cordis.patch.yml` 行，并由 `dsh.client` 提供浏览器半边。

## 插件列表

| 目录 | 插件名 | 作用 |
|---|---|---|
| `running-sessions-float/` | `@local/running-sessions-float` | 在侧边栏工作区列表下方悬浮显示“进行中”的会话；无进行中会话时收缩为一条细条 |

## 安装

在 Harness 会话中让 Agent 执行 `plugin_manager`（或手工按下面的等价步骤）：

```text
action: install_bundle
target: D:\wwwroot\ai\dsh\running-sessions-float
```

安装会做三件事：把包 link 进当前 profile、选择该 bundle、按 `cordis.patch.yml` 插入插件行。安装结果为 `application: applied` 才表示已生效；客户端插件的浏览器半边会动态加载，**升级已安装包的客户端代码通常需要刷新页面或重启客户端**，以取得新的模块代次。

卸载：

```text
action: remove_bundle
target: @local/running-sessions-float
```

## 目录约定

每个插件目录必须自包含：

```
<plugin>/
├─ package.json        # name / version / private / exports / files / dsh.bundle + dsh.client
├─ cordis.patch.yml    # insert 一行插件入口
├─ index.js            # Host 半边（export function apply）
├─ client.js           # 浏览器半边：window.__ModuleLoader__.load({ id, factory })
├─ locale/en.json      # 插件管理元数据（meta.title / meta.description）+ 英文文案
├─ locale/zh.json      # 中文元数据
└─ icon.svg            # 插件图标（原创或可再分发）
```

`dsh.client.inject` 用于声明客户端激活顺序依赖：本仓库的插件会用到 slot 提供的标准 Hook（如 `useSessions`、`useSessionStatus`），这些 Hook 由 `@deepseek-ai/dsh-client-ui-session` 提供给全局标准 props，因此必须排在它之后激活。

## 开发约定

- 只使用主题 token（`--dsw-alias-*`）着色，禁止写死品牌色，明暗主题都要能看。
- 浮层类界面优先注册进 `shell.overlay`（全框架浮层、默认点击穿透，条目自行恢复 `pointer-events`），并复用已有 slot 的数据 Hook，不自行轮询 `agent/status`。
- 不导入 Harness Client 包（如 `@deepseek-ai/dsh-client-ui-primitives`），控件按宿主样式自行实现。
- 可见文案走 Client locale 服务；插件管理元数据写在 `locale/*.json` 的 `meta` 字段。
- 修改 `client.js` 后需要重新安装并刷新页面，页面里不会自动热更新已安装包的模块代次。

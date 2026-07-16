# GSE

[English](https://github.com/275005746/gse/blob/main/README.md) | 简体中文

面向长期 agent 辅助软件项目的 Goal-Spec-Evidence Engineering。

GSE 给 coding agent 和团队一个很小的项目工作区，用来保存目标、规格、执行说明、证据和交接信息。它让下一步更清楚，让验证贴近代码，让后续会话更容易接上。

它适合 agentic engineering、spec-driven development、SDD 风格的项目推进，也适合需要证据闭环的 AI coding agent 工作流。

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

## 亮点

- 项目本地 `.gse/` 工作区，用来保存长期工程上下文
- 目标地图、变更规格、质量门、证据日志和交接记录
- `lite`、`standard`、`enterprise` 三种脚手架，适配不同规模项目
- 面向 Codex、Claude Code、Hermes-style runtimes、WorkBuddy 等 host 的可迁移 `/gse ...` 命令语义
- 面向日常开发和发布检查的 focused validation profiles
- 可选 host folders、LSP、MCP、hooks、plugins、project skills 适配说明
- 面向成熟项目的 release、packaging、public collaboration 和 evidence gate 工作流

## 安装

从 npm 安装：

```bash
npm install -g @t275005746/gse
gse status --target .
```

从已检出的 GSE 副本直接使用：

```bash
node scripts/validate-gse.mjs --root . --json
```

把已检出的副本打包给其他环境：

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
```

从本地包安装：

```bash
node scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>
```

从 URL 形式的包源安装：

```bash
node scripts/install-gse.mjs --source-url <file-or-http-package-url> --target <install-skill-dir>
```

发布包、签名和信任记录见 `references/packaging.md`。

## 快速开始

给项目初始化 GSE：

```bash
node scripts/init-project.mjs --target <project-root>
```

如果已经知道项目形态，可以直接指定模式：

```bash
node scripts/init-project.mjs --target <project-root> --mode lite
node scripts/init-project.mjs --target <project-root> --mode standard
node scripts/init-project.mjs --target <project-root> --mode enterprise
```

只读检查项目画像：

```bash
node scripts/discover-project-profile.mjs --target <project-root> --json
```

验证 GSE 包：

```bash
node scripts/validate-gse.mjs --root . --json
```

发布或交接前检查 Node package metadata：

```bash
node scripts/audit-npm-package-metadata.mjs --root . --json
node scripts/audit-npm-tarball-install.mjs --root . --json
node scripts/audit-npm-publish-dry-run.mjs --root . --json
npm pack --dry-run --json
```

## 什么时候用 GSE

适合这些情况：

- 项目会跨很多 agent 会话持续推进，
- 需求和决策开始埋在聊天历史里，
- 每次变更都需要清楚的范围和验收方式，
- 多个 agents、workers、tools 或 model routes 会碰同一个项目，
- 希望先有证据，再说完成。

小型一次性任务可以走最轻路径。产品、runtime、平台或开源发布可以启用更严格的质量门。

## 工作方式

GSE 始终让五件事可见：

| 步骤 | 作用 |
|---|---|
| Goal | 记录北极星、当前焦点、风险和下一刀。 |
| Spec | 在实现漂移前定义当前变更。 |
| Execute | 按项目规则和现有代码模式执行。 |
| Evidence | 用 focused tests、API smokes、browser smokes、review 或结构检查证明结果。 |
| Learn | 记录可复用经验，把重复问题提升为质量门或模板。 |

流程按风险伸缩：小变更保持轻量；共享行为、发布、安全敏感和跨 host 声明走更严格的验证。

## 会创建什么

GSE 会在目标项目里创建一个可迁移的 `.gse/` 工作区。

| 模式 | 创建内容 | 适合场景 |
|---|---|---|
| `lite` | 目标地图、项目画像、质量门、工具说明、证据日志、变更模板 | 小项目、低风险任务、首次接入 |
| `standard` | 包含 `lite`，并增加 agent 角色、派发说明、项目 skills、LSP/index 说明 | 会持续由 agent 接续开发的项目 |
| `enterprise` | 包含 `standard`，并增加 hooks、MCP、plugins、release、incident review、audit、host adapters | 大型项目、多 host、runtime 集成、治理 |
| `auto` | 根据项目线索选择保守脚手架 | 希望 GSE 自动选择时 |

大项目第一次接入也可以直接使用 `standard` 或 `enterprise`。

## 项目结构

典型工作区：

```text
.gse/
  README.md
  project-profile.md
  goal-map.md
  goals/
  quality-gates.md
  tooling.md
  changes/
  evidence/
  templates/
```

`standard` 和 `enterprise` 项目还可能包含：

```text
.gse/
  agents/
  skills/
  lsp/
  hooks/
  mcp/
  plugins/
  release.md
  incident-review.md
  audit.md
```

`.gse/goal-map.md` 是短索引。模块级详情放在 `.gse/goals/`。已有产品路线图、架构文档和项目规则可以继续留在原位置，由 GSE 指向它们，不需要搬进 `.gse/`。

## 命令

GSE 定义了一组可迁移命令语义，能读取这个 skill 的 agent 可以按这些命令执行：

```text
/gse help
/gse init
/gse adopt
/gse continue
/gse stage
/gse status
/gse doctor
/gse acceptance
/gse owner-actions
/gse probe
/gse release
/gse package
/gse install
/gse public-release
/gse change
/gse slice
/gse verify
/gse learn
/gse audit
/gse close
```

`/gse close` 是只读的收口就绪检查。需要在证据存在后归档某个 change pack 时，使用 `scripts/close-change.mjs`。

可迁移 runner：

```bash
node scripts/gse.mjs continue --target <project-root>
node scripts/run-gse-command.mjs --target <project-root> --command "/gse continue"
node scripts/run-gse-command.mjs --target <project-root> --command "/gse stage <intent>"
node scripts/run-gse-command.mjs --target <project-root> --command "/gse learn --summary <lesson>" --execute --json
```

验证 profile：

```bash
node scripts/run-validation-profile.mjs --target <project-root> --profile lite
node scripts/run-validation-profile.mjs --target <project-root> --profile standard
node scripts/run-validation-profile.mjs --target <project-root> --profile enterprise
node scripts/run-validation-profile.mjs --target <project-root> --profile release
```

## 证据模型

GSE 使用三层证据：

```text
result -> verified -> accepted
```

- `result`：产物存在，或者命令已经执行。
- `verified`：focused checks 证明当前环境里的行为有效。
- `accepted`：项目 owner、策略、CI gate、release gate、review gate 或产品验收门接受 verified 结果。

这样日常产品切片可以保持快速，发布、安全和跨 host 声明也能被追踪和审计。

## 文档

- `SKILL.md`：agent 入口和路由规则
- `references/`：工作流说明和更深的运行文档
- `scripts/`：项目初始化、验证、发布和审计 helper
- `assets/templates/`：可复用记录和交接模板
- `README.md`：英文 README

## 社区

GateHub（[gatehub.top](https://gatehub.top/)）支持 GSE 的开发和贡献者协作。

## License

MIT。见 `LICENSE`。

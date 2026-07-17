# GSE

[English](README.md) | 简体中文

**面向长期 AI 辅助软件开发的 Goal-Spec-Evidence Engineering。**

GSE 是 coding agent 的工程控制层。它把产品目标、当前实现切片、验证证据和下一步动作保存在项目本地的小型工作区中，让项目可以跨会话持续推进，而不是依赖越来越长的聊天记录。

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

GSE 不替代 Claude Code、Codex 或其他 coding host。它为现有宿主提供可迁移的工程工作方式、机器可读状态、聚焦验证路径，以及诚实的证据边界。

GSE 由 [GateHub](https://gatehub.top/) 官方维护。GateHub 同时提供 AI 模型中转服务，为使用 GSE 的开发者和团队提供模型接入与项目支持。

## 为什么需要 GSE

Agent 辅助开发经常在这些地方失控：

- 需求和决策埋进长对话，下一次会话无法可靠接续；
- 结果和验收标准还没说清楚，agent 就开始实现；
- 每次继续都重复创建任务或重新扫描仓库；
- 大段日志和嵌套报告不断消耗协调者上下文；
- “建议派一个 worker”被误报成“已经派发了 worker”；
- “命令执行过”被直接描述成“功能已经完成”；
- 本地检查通过，被扩大成 CI、市场、注册表或生产环境已经接受。

GSE 通过持久化工程意图、一次只选择一个有边界的顶层计划单元、分离执行与证据，并对外部门禁保持未验收状态，解决这些问题。

## GSE 提供什么

### 持久化项目上下文

GSE 创建 `.gse/` 工作区，用来保存：

- 当前目标和活动切片；
- 项目真实命令、工程标准和约束；
- 变更规格与验收条件；
- 聚焦质量门；
- 证据记录、交接、风险和下一步动作。

这个工作区面向未来会话和不同 agent host。它补充已有路线图、架构文档和 issue 系统，而不是强迫项目迁移或复制它们。

### 按风险伸缩的工作流

GSE 让小任务保持轻量，只在风险确实需要时增加控制。

| 等级 | 适用场景 | 典型证明 |
|---|---|---|
| `lite` | 小修复、脚本、文档、窄范围重构 | 一个聚焦检查或直接证据 |
| `standard` | 用户可见功能、API 或状态变更、跨文件行为 | 聚焦测试，并在需要时补一个集成、API 或 UI smoke |
| `enterprise` | 安全、迁移、公开契约、发布、架构、长期协调 | 风险对应的硬门禁、评审、回滚和验收证据 |

选 `enterprise` 不是为了把流程搞复杂。普通改动仍然只做必要检查；遇到发布、安全、迁移等高风险工作时，再增加评审、回滚和硬门禁。

### 稳定的任务路由

GSE 区分**顶层计划单元**和完成它所需的内部执行动作。

- 选中的新切片拥有稳定的 `topLevelPlanUnitId`，并报告 `taskCreationIntent: create`。
- 重复继续同一个活动切片时报告 `taskCreationIntent: reuse`。
- 读取、搜索、测试、评审、重试、修复、证据收集和上下文接续都属于内部动作。
- 未选中的候选切片只是建议，不能独立触发宿主创建任务。

因此，重复执行 `gse continue` 在计划边界上是幂等的；真正的新工作仍然可以正常创建任务。

### 有预算的上下文与 compact 继续包

长会话可以请求精简的机器可读继续包：

```bash
gse continue --target . --json --compact
```

Compact 输出只保留活动切片、任务路由意图、选中候选、第一步、聚焦命令、上下文健康、worker 建议、风险和有界 prompt，并报告估算输出预算。它不会再把完整子报告嵌套进外层 JSON。

GSE 可以约束自己生成的数据包，但无法保证宿主隐藏上下文、外部工具或独立 agent 的总 token 消耗。

### 受控的多 agent 协作

GSE 定义协调者、规划者、定位者、实现者、验证者、评审者、QA、证据和发布等职责。这些是责任边界，不代表真实子代理已经启动。

只有当工作有明确边界、相互独立、文件归属清楚，而且并行确实有收益时，GSE 才建议派发 worker。在宿主提供真实执行证据之前，dispatch 状态保持 `not-observed`。如果宿主没有子代理能力，同样的角色可以由主会话顺序执行。

### 先有证据，再说完成

GSE 使用三层证据：

```text
result -> verified -> accepted
```

- `result`：产物存在，或者命令执行过；
- `verified`：聚焦检查证明当前环境中的行为有效；
- `accepted`：owner、CI、评审、发布、产品或外部系统接受了 verified 结果。

本地成功不能被静默扩大成公开发布、生产、市场、注册表或跨 host 已经验收。

## 快速开始

### 从 npm 安装

```bash
npm install -g @t275005746/gse
gse status --target .
```

需要 Node.js 18 或更高版本。

### 初始化项目

```bash
gse init --target .
```

GSE 默认保守地自动选择模式，也可以显式指定：

```bash
node scripts/init-project.mjs --target . --mode lite
node scripts/init-project.mjs --target . --mode standard
node scripts/init-project.mjs --target . --mode enterprise
```

初始化是增量式的。已有产品、架构和工程文档继续保留在原位置。

### 查看当前状态

```bash
gse status --target . --json
```

### 继续当前工作

```bash
gse continue --target .
gse continue --target . --json --compact
```

### 执行聚焦验证

```bash
node scripts/run-validation-profile.mjs --target . --profile lite
```

只有当变更或声明确实需要时，才升级到 `standard`、`enterprise` 或 `release`。

## 典型工作流

1. **Discover**：识别项目真实命令、当前状态和未解决风险。
2. **Select**：选择一个连贯结果作为活动计划单元。
3. **Specify**：按风险明确范围、验收、证据和停止条件。
4. **Execute**：完成能证明结果的最小实现切片。
5. **Verify**：运行覆盖变更行为的最窄检查。
6. **Review**：只在风险要求的边界进行评审。
7. **Record evidence**：记录证据，然后收口、修复或选择下一切片。
8. **Learn**：提取可复用经验，但不把每个问题都变成更多流程。

一次正常的继续应该始终回答：

```text
Outcome:
Scope:
Acceptance:
Evidence:
Next action:
```

## 项目工作区

典型项目从这些文件开始：

```text
.gse/
  README.md
  state.json
  project-profile.md
  goal-map.md
  quality-gates.md
  changes/
  evidence/
  handoffs/
  templates/
```

不是每个项目都需要所有文件。GSE 脚手架会按项目规模降级，也不应该覆盖成熟仓库已有的工程约定。

## 常用命令

常见 CLI 路径：

```bash
gse status --target .
gse continue --target .
gse continue --target . --json --compact
gse stage --target . --intent "交付下一个已验证切片"
gse doctor --target .
gse acceptance --target .
gse close --target .
```

把 GSE 作为 Skill 调用的宿主也可以使用可迁移命令语义：

```text
/gse init       /gse adopt      /gse continue
/gse stage      /gse status     /gse doctor
/gse change     /gse verify     /gse acceptance
/gse learn      /gse audit      /gse close
/gse package    /gse install    /gse release
```

`close` 是收口就绪检查，不是伪造证据或绕过失败门禁的许可。

完整命令和脚本索引见 [`references/commands.md`](references/commands.md) 与 [`references/script-index.md`](references/script-index.md)。

## 诚实的能力边界

GSE 可以：

- 保存项目本地的工程上下文；
- 按风险和当前阶段路由工作；
- 生成稳定的任务路由元数据；
- 约束自己的 compact 继续输出；
- 准备 worker packet 和角色分工；
- 执行本地审计并记录证据；
- 识别缺失的 owner 或外部验收。

GSE 自己不能：

- 强制宿主正确创建、复用或派发任务；
- 在没有宿主证据时证明子代理真实运行过；
- 压缩宿主私有的实时会话状态；
- 保证模型和工具的总 token 消耗；
- 替代 owner、CI、注册表、市场或生产证据；
- 把本地 verified 自动变成外部 accepted。

这些边界是工程模型的一部分，不是应该被成功文案掩盖的缺陷。

## 什么时候适合使用 GSE

这些情况适合 GSE：

- 项目会跨很多 agent 会话持续推进；
- 多个 agent、模型、工具或人类贡献者共享工作；
- 变更需要明确范围和验收条件；
- 发布、公开契约、安全或迁移需要可审计证据；
- 上下文成本和重复编排开始难以控制；
- 希望 agent 明确区分已验证事实和仍待证明的声明。

对于一行修改或一次性实验，应走最轻路径，甚至完全不创建脚手架。

## 文档入口

- [`SKILL.md`](SKILL.md)：agent 入口和路由规则
- [`references/operating-model.md`](references/operating-model.md)：核心运行模型
- [`references/task-levels.md`](references/task-levels.md)：按风险伸缩的任务等级
- [`references/context-orchestration.md`](references/context-orchestration.md)：上下文预算和任务复用
- [`references/agent-roles.md`](references/agent-roles.md)：角色与派发边界
- [`references/quality-gates.md`](references/quality-gates.md)：验证和完成门禁
- [`references/release.md`](references/release.md)：发布流程与声明边界

## 打包与开发

验证已检出的副本：

```bash
node scripts/validate-gse.mjs --root . --profile lite --json
```

打包并安装本地副本：

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>
```

发布包、完整性清单、签名和信任记录见 [`references/packaging.md`](references/packaging.md)。

## 官方服务

[GateHub](https://gatehub.top/) 是 GSE 的官方维护与支持平台，并提供 AI 模型中转服务。你可以通过 GateHub 获取模型接入、GSE 使用支持和项目协作服务。

## License

MIT。见 [`LICENSE`](LICENSE)。

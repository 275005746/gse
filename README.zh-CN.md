# GSE

[English](README.md) | 简体中文

**面向需要跨很多 agent 会话持续推进的 AI coding 工作的 Goal-Spec-Evidence Engineering。**

GSE 是一个可迁移的 Agent Skill 和 CLI。它把活动 Goal 投影、当前功能切片、验收契约、证据、风险和下一步动作保存到仓库中，让新的 agent 不依赖上一段聊天记录就能继续工作。

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

GSE 不替代 Claude Code、Codex、Hermes 或其他宿主。宿主仍然负责自己的 Goal、回合、任务、worker 和审批生命周期；GSE 提供下面那层可迁移的工程契约。

## 为什么需要 GSE

长周期 agent 工作容易在会话之间丢失范围、验收条件和证据。GSE 把这些契约保存在仓库中，使继续执行可复现、可审阅。

## 快速开始

```bash
npm install -g @t275005746/gse
gse init --target .
gse continue --target . --json --compact
```

## 什么时候适合使用 GSE

当项目会跨很多 agent 会话持续推进、多个贡献者共享仓库，或变更需要明确验收和证明时使用 GSE。一次性实验和微小编辑应使用宿主的轻量路径。

## 如何找到 GSE

规范入口：

- GitHub：<https://github.com/275005746/gse>
- Agent 入口：[`SKILL.md`](SKILL.md)
- CLI 包：[`@t275005746/gse`](https://www.npmjs.com/package/@t275005746/gse)

仓库结构适合被基于 GitHub 的 Agent Skill 索引发现。目录或 catalog 的真实收录属于外部证据；在取得公开 listing 或索引结果前，GSE 不声称已经收录。

## 如何安装 GSE

### 作为 Agent Skill 安装

克隆仓库，并让宿主加载包含 `SKILL.md` 的目录：

```bash
git clone https://github.com/275005746/gse.git
```

具体安装目录由宿主决定。请遵循宿主自己的 Skill 安装约定；不要把生成的 adapter 文件当成宿主已经支持或运行过 GSE 的证据。

### 作为 CLI 安装

```bash
npm install -g @t275005746/gse
gse status --target .
```

需要 Node.js 18 或更高版本。

## 在项目中使用 GSE

初始化项目工作区：

```bash
gse init --target .
```

查看并继续当前工作：

```bash
gse status --target . --json
gse continue --target . --json --compact
```

新会话或恢复会话时，先读取：

```text
.gse/state.json
.gse/current-slice.md
.gse/evidence/      # lastEvidence 指向的文件
.gse/project-profile.md
.gse/quality-gates.md
```

继续包就是有边界的下一步行动契约。除非它要求 rollover 或 owner 决策，否则工作应继续放在同一个顶层 Plan Unit 下。

## 什么是一个 Slice

一个 Slice 必须是一个完整、可运行、可以独立验证的功能实现。它不能只是类型变更、调用点变更、仅测试变更、resolver 变更、状态翻转、文档变更或 handoff。

每个 Slice 都要记录：

- outcome；
- scope 和 non-goals；
- acceptance；
- proof boundary；
- evidence matrix；
- risks；
- 一个可验证的 next action。

完成 Slice 不等于自动完成 Goal，也不等于结束会话。下一个 Slice 继续使用同一个已批准的 Plan Unit。

## 工作流

1. **Discover**：识别仓库、真实命令、阶段和风险。
2. **Select**：选择一个连贯的 Slice。
3. **Specify**：明确结果、范围、验收、证明边界和非目标。
4. **Execute**：完成最小但完整的实现。
5. **Verify**：用聚焦证据验证变更行为。
6. **Record**：记录状态、证据、风险和下一步。
7. **Continue**：继续 Plan Unit，或因真实决策停下。
8. **Learn**：只记录可复用的经验。

一次正常交接包含：

```text
Outcome:
Scope:
Acceptance:
Evidence:
Next action:
```

## 证据边界必须保守

GSE 区分：

```text
result -> verified -> accepted
```

`result` 表示产物或命令结果存在；`verified` 表示本地聚焦检查支持该行为；`accepted` 必须有真实 owner、CI、registry、catalog、release 或外部系统记录。

本地审计不证明：

- 其他 Host 已采用或运行 GSE；
- native slash command 支持；
- Host task 创建或 worker dispatch；
- 除已记录 channel evidence 外的 Registry 发布；
- Skill 目录索引或 catalog 收录；
- 公开产品验收。

缺少遥测或外部证据时，使用 `unknown`、`unavailable` 或 `external-required`。

## 常用命令

```bash
gse status --target .
gse continue --target . --json --compact
gse stage --target . --intent "交付下一个已验证 Slice"
gse doctor --target .
gse acceptance --target .
gse close --target .
```

宿主也可以使用对应的可迁移命令：

```text
/gse init       /gse adopt      /gse continue
/gse stage      /gse status     /gse doctor
/gse change     /gse verify     /gse acceptance
/gse learn      /gse audit      /gse close
```

`close` 只是就绪检查，不能制造验收或绕过失败门禁。

## 项目工作区

典型初始化项目包含：

```text
.gse/
  state.json
  current-slice.md
  project-profile.md
  goal-map.md
  quality-gates.md
  changes/
  evidence/
  handoffs/
```

GSE 是增量接入且按风险伸缩的，但这不意味着说明文档需要重复堆叠；项目已有的成熟约定应被保留。

## 运行契约

- **按风险伸缩的工作流：** 根据项目风险选择 `lite`、`standard` 或 `enterprise`；每种模式都把可迁移状态保存在 `.gse/`。
- **稳定的任务路由：** `topLevelPlanUnitId` 保持 Plan Unit 连续性；`taskCreationIntent: create` 只是给具备能力的宿主的建议，不证明任务已经创建。
- **有预算的上下文与紧凑继续：** `/gse status` 和 `/gse continue --compact` 无需聊天历史即可暴露当前契约。
- **先有证据，再说完成：** 使用 `result -> verified -> accepted`；缺少运行时证据时保持 `not-observed`。
- **受控的多 agent 协作：** 仅在宿主支持时调度，并保留所有权和证据边界。

## 诚实的能力边界

本地成功不能被静默扩大为外部接受。Registry 证据只证明已记录的 channel；marketplace approval 和其他 Host 执行需要独立记录。

## 打包与开发

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>
```

npm、bundle、完整性和安装审计见 [`references/packaging.md`](references/packaging.md)。

## 官方服务

GSE 由 [GateHub](https://gatehub.top/) 官方维护。GateHub 同时提供 AI 模型中转服务；该关联服务不构成 GSE marketplace approval 或 Host runtime 支持证据。

## 文档入口

先读 [`SKILL.md`](SKILL.md)，再通过 [`references/commands.md`](references/commands.md)、[`references/quality-gates.md`](references/quality-gates.md) 和 [`references/packaging.md`](references/packaging.md) 查看完整契约。

## 验证 GSE 本身

```bash
node scripts/audit-agent-entrypoint.mjs --root . --json
node scripts/audit-project-capability-registry.mjs --root . --target . --json
node scripts/validate-gse.mjs --root . --profile lite --json
git diff --check
```

Agent 入口契约见 [`SKILL.md`](SKILL.md)，完整命令索引见 [`references/commands.md`](references/commands.md)。

## License

MIT。见 [`LICENSE`](LICENSE)。

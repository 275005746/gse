# GSE 优化观察与最终整合计划

## 目的

当前 GSE 已能提供目标、切片、证据、状态、上下文 rollover 和 bounded continuation。两轮真实使用评价显示，下一阶段不应立即堆叠更多流程，而应先观察多个项目和多个切片，区分系统性问题、项目特定问题和环境问题，再形成最终优化版。

本文件是观察与规划文档，不是当前运行门禁，也不代表其中的候选功能已经实现。

## 新增真实使用反馈

来自一个已使用 GSE 完成多个切片的项目会话的反馈进一步确认：主要摩擦集中在“实现完成后，验证结果、证据等级、风险状态、当前切片和 next action 不能自动保持一致”，而不是缺少更多审计规则。

这次反馈新增或强化了以下观察结论：

- 手动同步 evidence markdown、evidence JSONL、state、residual risks 和 next action 容易造成代码完成但状态仍为待实现；
- evidence level 需要由结构化验证矩阵约束，不能只依赖人工 summary；
- `implemented-unverified`、`verified`、`out-of-scope`、`blocked`、`deferred` 等风险状态必须与“未实现”分离；
- append-only evidence 需要校验 eventId、stateRevision、日期顺序、文件存在性、state 一致性和历史字节不变；
- 验证命令需要保存结构化实际结果，而不只是命令字符串；
- Windows readiness 不能依赖 Unix-only 命令，工具失败必须与应用失败分开；
- 已满足的历史 follow-up 不应继续渲染成当前待办；
- `currentSlice` 和 `nextSlice` 必须结构化分离；
- 只读审计默认是有效的安全边界，应继续保留；
- `verified-integration` 需要轻量 profile，默认不扩展到浏览器、远程服务、完整 E2E 或额外安全审计。

这些反馈先作为第三轮观察样本记录；是否进入核心实现仍按跨项目重复性和阻塞影响判断。

## 新增真实使用反馈：完整证明边界与单一事实源

来自另一个项目多轮使用的反馈进一步收窄了 slice 和 evidence 的设计：slice 不应按 compiler、resolver、send-stream 等相邻实现组件机械拆分，而应按一个完整的证明边界拆分。新切片开始前，应先明确证据矩阵，避免重复验证已经由 mock contract 证明过的内容，并把真实持久化结果作为优先补强方向。

新增观察结论：

- 减少切片数量，按完整证明边界组织功能，不把相邻组件自动拆成多个 slice；
- 新 slice 开始前先建立证据矩阵，列出已证明、未证明和需要补强的边界；
- 优先真实持久化结果测试，避免只验证 mock 调用顺序；
- evidence log 保存历史证据，`current-slice.md` 保存当前状态，`state.json` 只做机器投影，`goal-map.md` 只保存方向和边界；
- evidence log 必须追加写入，不能通过整文件重写维护历史；
- 尽量用生成器统一更新 state、索引和证据输出，减少人工同步；
- evidence level 需要区分 component、route、persistence、live、release 等不同证明强度；
- 小改动只更新必要的 GSE 字段，避免产生无关 metadata diff；
- 长文件读取应先确认总行数，再计算合法 offset；定位优先 Grep，Read 只读取局部范围；
- `nextAction` 必须是一个单一、可验证行为；
- focused test、LSP、lint 和 evidence 更新应固化为最小验证模板；
- Vitest shutdown timeout、pnpm build gate 等环境问题应记录一次性 residual risk，后续引用而不是重复调查。

该反馈与“功能 Slice 契约”“结构化验证矩阵”“canonical/derived 边界”和“轻量 profile”直接相关，后续实施时合并处理，不新增平行流程。

## 当前核心判断

GSE 的后续优化需要同时满足三个维度：

```text
状态正确
证据诚实
执行连续
```

特别要避免把一个切片完成误认为整个会话完成：

```text
slice complete != session complete
```

切片是执行边界，不是自动停止边界。只有顶层计划单元完成、发生真实阻塞、需要用户决策、触发 rollover 或需要额外授权时，才应停止。

## 当前定义与需要确认的缺口

当前 GSE 的 `slice` 实际上是一个七字段执行包：`outcome`、`scope`、`non-goals`、`acceptance`、`evidence`、`risks` 和 `next action`。`references/task-levels.md` 已经建议优先覆盖一条用户可见链或一个生产能力边界，但这是切片 sizing 指南，不是命令、模板或 close gate 强制执行的功能契约。

因此，当前实现可能把以下内容都当作 slice：

- 一个完整、可验收的功能行为；
- 一个功能中的内部实现步骤；
- 一个调用点或类型变更；
- 一个测试或状态迁移步骤。

这正是“完成一步就停”的潜在来源。后续优化需要把默认定义收窄为：

> Slice 是当前批准范围内，可以独立实现、验证并产生明确证据的最小功能闭环。它可以包含多个文件修改、内部步骤和测试步骤，但不能只代表一个机械实现动作。

切片大小仍需受控：不能把多个无关产品流、宽泛重构和发布流程塞进一个 slice；也不能把没有独立验收价值的类型、调用点或状态翻转单独当作默认 slice。对于确实只有内部步骤的工作，应将其作为功能 slice 的执行步骤，而不是提前宣布一个独立功能 slice 完成。安全修复、迁移和纯基础设施工作可以使用不同的能力边界，但仍必须有独立验收标准。

### 功能 slice 的层级

```text
Top-level plan unit
└── Change / feature group
    ├── Slice 1: 一个可独立验收的功能闭环
    ├── Slice 2: 下一个可独立验收的功能闭环
    └── Slice 3: 必要时的集成或边界能力闭环
```

一个功能 slice 内部可以包含：

```text
定义验收 → 写 RED → 多文件实现 → focused verification → 记录证据
```

例如，`选中的 SourceRef 能被精确读取并纳入 bounded compiled context` 是功能 slice；新增 resolver 类型、接入调用点和测试属于该 slice 的内部步骤，除非它们本身拥有独立的用户或生产能力验收边界。

观察阶段需要验证这个定义是否能跨项目工作，并确认它不会让切片变得过大或增加不必要文档成本。

## 观察阶段：暂不改 GSE

让至少两个不同项目分别继续使用当前 GSE 版本，每个项目完成 2～3 个真实小切片，总计观察 4～6 个切片。观察期间不主动实现本文件中的候选功能；只有直接阻塞正常开发的明确缺陷才单独修复。

覆盖场景：

- component slice；
- integration slice；
- 带 RED/GREEN 证据的 TDD slice；
- 带 residual risk 但当前切片已完成的 slice；
- Windows 验证或 fallback；
- 跨会话 continue；
- 当前切片完成后继续下一个已批准切片。

每轮只记录实际摩擦，不提前把建议当作缺陷。建议记录以下最小字段：

```text
Project:
Slice:
Outcome:
Evidence status:
Evidence level:
Focused command:
Result:
Residual risks:
GSE friction:
Stop reason:
Suggested change:
```

### 重点观察项

1. 状态是否在切片完成后滞后；
2. `status` 与 `evidenceLevel` 是否再次混用；
3. updater 是否出现部分成功或 revision 先推进；
4. current-slice、goal-map、state 是否需要手工重复同步；
5. evidence 是否需要手工拼接或容易丢失 RED/GREEN；
6. continue 是否重复已经完成的工作；
7. nextAction 明确时是否仍仅因 slice complete 而停止；
8. 停止原因是否属于合法停止状态；
9. 验证入口、runtime probe、Windows host 检查是否重复失败；
10. 小切片的任务和文档成本是否持续过高；
11. 当前 slice 是否真的有独立功能验收，而不是只完成了内部类型、调用点、测试或状态迁移；
12. 将多个内部步骤合并为一个功能 slice 后，是否仍能保持证据边界清晰、验证范围可控。

## 连续执行策略

### 目标

GSE 应在已批准的顶层计划范围内连续推进，而不是完成一个 slice 就结束会话。

```text
slice complete
→ 读取 nextAction
→ 判断是否仍属于当前 topLevelPlanUnitId
→ 判断是否需要决策、外部授权或风险确认
→ 不需要时继续下一个 slice
→ 只有真实停止条件出现时才暂停
```

### 执行状态

```text
continue-now
await-decision
blocked
rollover-required
top-level-complete
```

- `continue-now`：下一步明确且仍在批准范围内，自动继续；
- `await-decision`：需要产品、架构、范围或权限决策；
- `blocked`：测试、依赖、环境或代码问题阻塞继续；
- `rollover-required`：上下文接近边界，需要 checkpoint/continue；
- `top-level-complete`：当前顶层计划单元完成，正常结束。

### 自动继续条件

以下条件全部满足时，应继续执行：

- 顶层目标尚未完成；
- `nextAction` 已明确；
- 下一步仍属于稳定的 `topLevelPlanUnitId`；
- 下一步仍在已批准范围内；
- 不需要新的产品或架构决策；
- 不需要外部发布、推送、部署或其他额外授权；
- 没有阻塞性验证失败；
- 没有触发上下文 rollover；
- 没有达到用户指定的任务或执行预算。

例如，当前 slice 完成后若 `nextAction` 已明确为下一个开发 slice，结果应为 `continue-now`，而不是因为 slice 完成而停下。

### 合法停止条件

只有以下情况应暂停：

- 需求边界发生变化；
- 存在多个合理方案需要选择；
- 需要扩大批准范围或引入依赖；
- 需要修改公共接口；
- 需要用户授权外部操作；
- 测试或环境问题阻塞继续；
- 发现安全、数据完整性或不可逆操作风险；
- 上下文需要 rollover；
- 顶层计划单元已完成；
- 用户明确要求停止。

“当前 slice 已完成”本身不是合法停止原因。

## 问题归并规则

观察结束后，把每个摩擦归入以下类别：

### 系统性问题

满足以下任一组合时进入 GSE 候选修复：

- 在两个项目中重复出现；
- 在至少两个不同 slice 类型中出现；
- 会导致 close、resume、evidence 或执行连续性错误；
- 现有 workaround 不能稳定规避。

### 成本问题

反复出现但不造成错误时，优先考虑自动化或简化，而不是增加人工流程，例如压缩 projection、统一 fallback 或 evidence append。

### 项目/环境问题

只在单个项目、单个工具链或单一宿主出现的问题，留在 project profile、host adapter 或 residual risk，不直接扩大 GSE 核心。

## 最终优化候选与优先级

只有经过观察确认重复后，才按以下顺序实施。

### P0：功能 Slice 契约与完整证明边界

将 slice 从“七字段执行包”提升为“可独立验收的最小功能闭环”，并以完整证明边界而不是组件数量来决定切片数量。compiler、resolver、send-stream 等相邻实现组件如果共同构成一个能力证明，应默认属于同一个 slice；只有存在独立 acceptance、独立风险或独立验证结果时才拆分。

实施范围：

- 定义功能 slice、change/feature group、完整证明边界和内部实现步骤的关系；
- 要求 acceptance 至少对应一个用户可见链、生产能力边界或明确的安全/迁移能力边界；
- 新 slice 开始前生成证据矩阵，列出已证明、未证明、需要补强和本 slice 不覆盖的边界；
- 将类型、调用点、单条测试、状态翻转等机械动作默认视为 slice 内部步骤；
- 优先用真实持久化结果证明持久化能力，不把 mock 调用顺序当成持久化结果；
- 防止一个功能被拆成多个相邻小 slice，也防止多个无关功能被合并进一个无法单次验证的过大 slice；
- 让 `/gse slice`、`/gse close`、continue packet 和相关模板识别并保留该边界。

建议涉及的实现和验证面：

- `references/task-levels.md`：将完整证明边界从 sizing 建议提升为默认 slice 契约；
- `references/commands.md` 与 slice/close 相关脚本：检查 acceptance 和 evidence matrix 是否覆盖能力边界；
- slice/tasks 模板：区分功能验收、证据矩阵和内部步骤；
- `scripts/generate-continue-packet.mjs`：继续完整功能 slice，而不是继续机械动作；
- 对应 audit：加入相邻组件合并、重复 mock contract、缺失 persistence result 的 fixture。

验收：给定包含 compiler、resolver、send-stream 多个内部步骤的功能，GSE 将其识别为一个完整证明 slice；只有该 slice 的 acceptance 和完整证据边界满足后才允许 close。

### P0：宿主 Goal 模式兼容与执行权限边界

连续执行不能覆盖宿主 Agent 的 goal 模式。GSE 与宿主之间应采用“宿主拥有执行权限，GSE 提供有界 continuation 建议”的关系：

```text
宿主 Goal / turn 生命周期
└── 当前已批准的 topLevelPlanUnitId
    └── GSE 功能 slice 1 → 功能 slice 2 → 功能 slice 3
```

规则：

- 宿主 goal 是外层权威，GSE 不得创建、切换、延长或伪造宿主 goal；
- `topLevelPlanUnitId` 是 GSE 在该 goal 内保持连续性的边界，不是新的宿主任务；
- GSE 只能在当前宿主 goal 已批准的范围内建议 `continue-now`；
- GSE 不得因为有 `nextAction` 就自动扩大范围、开始另一个 top-level plan unit 或触发 host task creation；
- 宿主明确支持自动 continuation 时，GSE 才能在同一 goal 内继续下一个功能 slice；
- 宿主按 turn/packet 控制执行时，GSE 应输出结构化 continuation packet，由宿主决定是否注入下一轮，而不是自行绕过宿主生命周期；
- 宿主暂停、取消、替换或结束 goal 时，GSE 必须服从宿主状态，即使本地仍存在未完成 `nextAction`；
- GSE 的 `await-decision`、`blocked`、`rollover-required` 和 `top-level-complete` 是对宿主的状态建议，不得伪装成宿主已经接受或继续执行；
- 只有真实宿主 dispatch、goal continuation 或 task creation 证据，才能声明相应的 host 行为。

需要区分两种模式：

```text
host-autonomous-continuation:
  宿主授权当前 goal 连续执行
  → GSE 在同一 topLevelPlanUnitId 内自动推进功能 slices

host-turn-controlled:
  宿主每轮重新注入 goal 或 packet
  → GSE 完成当前 slice 后输出 continue packet
  → 等宿主决定是否开始下一个 slice
```

这不是简单地把 GSE 的停止条件改成长循环，而是增加宿主能力协商和权限检查。若宿主能力未知，默认采用 `host-turn-controlled`，保持证据诚实并避免与某些 Agent 的 goal 模式冲突。

建议涉及的实现和验证面：

- `references/host-adapters.md` 与相关工具适配文档：定义宿主 goal 生命周期和 continuation 能力；
- `references/context-orchestration.md`：明确 rollover/continue 是内部建议，不等于 host dispatch；
- `scripts/generate-continue-packet.mjs`：输出 continuation mode、authority boundary 和是否需要宿主重新注入；
- `scripts/run-gse-command.mjs` 或宿主路由层：只在明确授权时执行自动 continuation；
- context/command audit：覆盖宿主自动模式、宿主 turn 模式、宿主取消和未知能力四种 fixture。

验收：在宿主 turn-controlled 模式下，GSE 不会因 `nextAction` 自动跨越宿主生命周期；在宿主明确授权的 autonomous 模式下，GSE 可以在同一顶层 goal 内连续完成多个功能 slice；两种模式都不会创建或声称未观察到的宿主任务。

### P0：连续执行与停止策略

- 将 `slice complete` 与会话完成分离；
- 明确 `continue-now`、`await-decision`、`blocked`、`rollover-required`、`top-level-complete`；
- 自动读取并判断 `nextAction`；
- 仅在真实决策、阻塞、rollover、顶层完成或授权边界处停止；
- 保留用户指定的任务预算和安全边界。

验收：一个功能 slice 完成后，如果下一个功能 slice 已明确且无需决策，至少连续推进下一个 slice；仅因内部步骤完成或第一个功能 slice 完成不得无理由停止。

### P0：分离 status 与 evidenceLevel

```json
{
  "status": "verified",
  "evidenceLevel": "verified-integration"
}
```

`status` 表示记录可信度，`evidenceLevel` 表示验证深度。close-gate 必须读取结构化字段，不再通过字符串猜测等级。

验收：`verified-component`、`verified-integration`、`verified-browser` 不互相误报；slice、change、project 结果可分别表达。

### P0：标准化切片完成与状态同步

把“实现完成后的多文件手工同步”收敛为一个受校验的标准动作。目标命令或脚本应在一次事务中完成：

- 追加 evidence markdown；
- 追加一条 evidence index JSONL；
- 增加 `stateRevision`；
- 更新当前功能 slice 的状态；
- 明确更新 `nextSlice` 和 `nextAction`；
- 将已满足的 residual risk 标记为 satisfied，而不是删除历史；
- 保留浏览器、移动端、远程服务等仍未完成风险；
- 生成并校验 current-slice、state 和 projection 的一致性。

验收：实现已完成但任一状态源仍为待实现时，标准动作必须失败或报告不一致；成功更新后所有 canonical 状态和派生 projection 指向同一功能 slice、revision 和 next action。

### P0：结构化验证矩阵与 evidence level 计算

每个功能 slice 维护结构化验证矩阵，由规则计算最高允许的 evidence level，而不是由 summary 人工升级。矩阵至少支持以下证明维度：

```text
component   → verified-component
route       → verified-route
persistence → verified-persistence
live        → verified-live
release     → verified-release
```

兼容已有的验证深度映射：

```text
unit tests              → verified-unit
real API/service chain  → verified-api
local app/service chain → verified-integration
browser rendering       → browser-rendered
successful browser path → verified-browser
full end-to-end         → verified-e2e
```

浏览器渲染只能证明渲染；点击失败不能升级为 `verified-browser`；局部成功不能推断完整 E2E。真实持久化结果必须和 mock contract 区分。close gate 必须比较声明等级与矩阵允许等级。

验收：新 slice 开始前能生成“已证明/未证明/本 slice 不覆盖”的矩阵；给定命令、结果和验证对象，工具自动拒绝超出矩阵的 evidence level，并能生成当前 slice 的 evidence summary 和允许等级。

### P1：结构化 residual risk 状态

将“未验证”和“未实现”分开，风险记录至少支持：

```text
not-started
implemented-unverified
verified
out-of-scope
blocked
deferred
```

保留 `owner`、`blocking`、`satisfiedBy`、`nextCommand`、`expectedEvidenceLevel` 和 `exitCriteria`。满足的风险通过 `satisfiedBy` 指向证据并停止渲染为当前待办；历史记录仍保留。

验收：已实现但未验证、已验证但暂不实现、当前 slice 排除、阻塞和延期在状态包中不会互相混淆。

### P1：append-only evidence 完整校验

除 `eventId` 去重外，校验还必须覆盖：

- 新记录的 `stateRevision` 大于上一条；
- `date` 不早于上一条记录；
- `evidenceFile` 存在且位于目标范围内；
- `nextAction` 与当前 state 一致；
- 历史行的字节内容未改变；
- evidence level 不超过验证矩阵允许等级。

审计必须默认只读，明确输出 `write: false` 和 `writes: []`；invalid state 时不猜测、不覆盖、不自动修复。

### P1：结构化验证命令结果

证据记录除了命令字符串，还应保存结构化结果，例如 command id、exit code、duration、test/pass/fail counts、服务 readiness、observed target 和 result status。由此生成 evidence summary、close gate 和 regression history，减少“命令通过但 summary 未同步”。

### P1：current slice 与 next slice 分离

状态模型明确区分：

```json
{
  "currentSlice": { "id": "...", "status": "in-progress", "acceptance": [] },
  "nextSlice": { "id": "...", "goal": "...", "selected": true },
  "nextAction": "..."
}
```

当前 slice 的 outcome、证据和关闭状态不能被下一个 slice 的 next action 覆盖。continue packet、close gate 和 projection 都必须保持这三个字段的边界。

### P1：verified-integration 轻量 profile

提供针对小型功能 slice 的最小闭环 profile：

```text
RED test
→ GREEN implementation
→ focused tests
→ typecheck
→ integration regression
→ read-only state/evidence audit
→ append evidence
→ update state
```

默认不触发浏览器、远程服务、完整 E2E 或额外安全审计；只有当前 slice 的 acceptance 或项目风险明确要求时才升级 profile。

验收：小型 integration slice 可以通过最小充分证据闭环完成，不被无关的浏览器、移动端或远程 gate 拖入重流程。

### P1：evidence append API

目标命令：

```text
gse evidence append --target <target> --record-file <file>
```

最小责任：校验单条 JSON schema，处理 BOM/空行，防止重复 `eventId`，保持 JSONL append-only，同步 `lastEvidence` 和 `nextAction`，失败不产生部分更新。

### P1：单一事实源与生成式状态投影

最终边界固定为：

| 产物 | 定位 |
|---|---|
| evidence log | 历史证据，append-only canonical source |
| `.gse/current-slice.md` | 当前 slice 状态、证明边界和 next action |
| `.gse/state.json` | 机器可读 projection，不作为人工历史编辑面 |
| `.gse/goal-map.md` | 方向、边界和当前 focus，不保存完整历史 |
| evidence index | 可重建的索引或 derived projection |

实现和更新优先使用生成器，一次完成 state、索引和证据输出；手工修改只作为明确的低级修复路径。任何更新都只触碰必要字段，避免小改动产生大范围 metadata diff。evidence log 只能追加，不能通过整文件重写维护历史。

验收：从 evidence log 可以重建 index 和 state projection；current slice 与机器 projection 一致；goal-map 不重复保存历史证据；追加新证据不会改变已有行的字节内容。canonical evidence/state 损坏或缺失时硬失败；可重建 projection 过期时只警告并提供 rebuild。

### P1：结构化 nextAction 与最小验证模板

`nextAction` 必须是一个单一、可验证的行为，不得同时包含多个未拆分目标。针对常见 `verified-integration` 功能 slice 固化最小模板：

```text
证据矩阵
→ RED test
→ GREEN implementation
→ focused test
→ LSP / typecheck / lint（按项目配置）
→ integration regression
→ read-only GSE audit
→ append evidence
→ update projection
```

模板按项目和风险降级，不默认触发浏览器、移动端、远程服务、完整 E2E 或额外安全审计。

### P1：一次性环境残余风险

Vitest shutdown timeout、pnpm build gate、平台命令缺失等环境问题应形成一次性结构化 residual risk，记录 owner、blocking、首次证据、引用路径、nextCommand 和 exitCriteria。后续切片只引用该风险，不重复调查；只有环境状态或证据发生变化时才重新验证。


### P1：slice/change/project 三层关闭结果

统一表达：

```text
slice: complete
change: verified-integration
project: not-ready
```

当前切片完成不应抹平未完成能力或残余风险，也不应自动升级项目 readiness。

### P2：capability evidence matrix

为不同能力独立保存证据深度，例如 transport、daemon-routing、browser-workbench、persistence-resume、mobile-path。close-gate 只检查当前 slice 声明需要的 capability，不要求无关能力全部完成。

### P2：live smoke、deadline 与 terminal-state evidence

若观察确认异步流程是跨项目问题，再标准化：

```text
assign → wait → query → review → assert-empty → finalize
```

记录 orchestration/task 标识、cursor、观察到的事件类型、deadline、progress 和 terminal state；不记录认证信息。dry-run、fixture、handoff 不得被当作真实 host dispatch 证据。

### P2：portable host probes

仅在 Windows/宿主问题重复阻塞时进入核心：原生端口检查、HTTP readiness、process lifetime、child-process exit code 和可复制的本地服务启动证据，不依赖 Unix-only 工具。

### P3：可执行 residual risks

将风险从纯文本提升为可执行字段：

```json
{
  "id": "browser-workbench",
  "owner": "project-owner",
  "blocking": false,
  "nextCommand": "...",
  "expectedEvidenceLevel": "verified-browser",
  "exitCriteria": "..."
}
```

## 固定轻量切片模板

最终应保持足够轻量：

```text
1. Slice brief
   goal / in scope / non-goals / acceptance
2. TDD
   RED / minimal implementation / GREEN
3. Focused evidence
   exact command / result / evidence level / residual risks
4. State update
   current-slice / state / next action
```

极小切片可以合并为：

```text
实现并验证切片
更新 evidence 和 next action
```

不要让 GSE 变成第二套产品 roadmap 或完整项目管理系统。

## 最终验收标准

- 状态正确：state、current-slice、projection 可检查且不会部分成功；
- 状态同步自动化：一次受校验的完成动作能同步 evidence、revision、current slice、next slice、next action 和 residual risk；
- 证据诚实：验证深度不升级，外部发布和 host dispatch 仍证据门控；
- 验证可计算：结构化命令结果和验证矩阵可以自动生成允许的 evidence level、summary 和 close gate；
- 执行连续：已批准目标会持续推进，只有真实停止条件才暂停；
- 宿主兼容：GSE 不越过宿主 goal 生命周期；宿主 turn-controlled 时只输出 continuation packet，宿主授权 autonomous 时才在同一 goal 内自动推进；
- 文档有界：当前文件只保留当前执行信息，历史证据进入日志；
- 验证可复现：标准命令、fallback 和残余风险有明确记录；
- 多项目可用：不同项目可以独立使用，不把同宿主使用误报成 registry、marketplace 或公共接受；
- 小切片成本可控：任务、spec、evidence 不因 GSE 规则无限膨胀；
- 切片定义正确：默认 slice 是可独立实现、验证和记录证据的功能闭环，内部实现步骤不会被误报为独立功能完成；
- 连续执行正确：功能 slice 完成后，明确的下一个功能 slice 会在无决策、阻塞或 rollover 时自动继续。

## 观察期明确不做

- 不立即重构 updater；
- 不立即增加 evidence append CLI；
- 不立即迁移全部 capability matrix；
- 不立即新增并行流程文档；
- 不为了通过 close-gate 弱化真实门禁；
- 不在业务 slice 中顺手重构无关的测试运行时生命周期；
- 不把本地 fixture、dry-run、handoff、安装包或测试报告当作公共接受证据；
- 不进行 push、publish、release 或其他外部操作。

## 执行顺序

```text
现在：两个项目各完成 2～3 个真实、可验收的功能 slice
→ 记录实际摩擦和停止原因
→ 归并跨项目重复问题
→ 先定义并实现功能 Slice 契约与完整证明边界
→ 再定义宿主 Goal 模式兼容与执行权限边界
→ 再实现连续执行与停止策略
→ 再实现状态同步、验证矩阵、风险状态和 updater 原子性
→ 再实现结构化命令结果、evidence append 与 projection rebuild
→ 最后评估 capability matrix、live probe、Windows adapter 和轻量 profile 的项目化落地
→ 跑 focused、standard、release 验证
→ 输出最终 GSE 优化版
```

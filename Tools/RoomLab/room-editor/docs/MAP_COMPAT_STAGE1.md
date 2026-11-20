# 阶段 1 · 统一地图兼容层与道具配置

本阶段只做兼容与配置，不改 Unity、不改云协议、不删除任何旧数据。回滚源码快照位于
`test-output/snapshot-stage1-20261120-181949`（不含 node_modules / release / test-output / 凭据）。

## 1. 旧数据审查结论

旧模型仍是三层：`project.courses[]`（大关容器）→ `course.rooms[]`（房间）→
`room.objects/movables/zones/entries/exits`（机关与端口），连线在 `course.connections[]`，
规则在 `course.blocks/artBindings`（美术绑定）、`project.settings/blockDefaults/pluginManifest`。
运行时依赖：`Engine` 以 `course.rooms` 找房间、以 `course.connections` 找出口、
以 `Registry.params` 解析参数、以 `checkpoint` 承载资源与道具、以 `room.phase` 写
`courseState.phase`（旧快慢节奏）。AI ID、素材相对路径、试玩路径、原生兼容字段都必须原样保留。

本阶段**没有**迁移、拆分或删除 `project.courses`；所有旧房间 ID、机关 ID、未知字段、
素材绑定、原连接与运行行为保持不变。`M.migrate` 只清理新增可选字段
`project.map` 的结构，不重建 courses。

## 2. 兼容适配层 `src/project/map-compat.cjs`

统一用户模型取消“大关分类”后，项目级全局视图由该模块显式提供：

| 接口                                              | 作用                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `listRooms(project)` / `roomRef(project, roomId)` | 全局房间索引（含所属 courseId），跨原大关可解析                              |
| `connections(project)`                            | 合并项目级显式连接 + 原 `course.connections`，统一为全局结构；不修改 courses |
| `resolve(project, roomId, exitId)`                | 出口 → 目标房间/入口；`crossCourse` 标记跨原大关                             |
| `connect(project, from, to)`                      | 写入 `project.map.connections` 的显式项目级连接，保存前校验房间与端口        |
| `validate(project)`                               | 全局房间/端口/连接校验；跨原大关连接合法并给出兼容提示                       |
| `sanitize(map)` / `ensure(project)`               | 清理/创建可选 `project.map`，未知字段尽量保留                                |
| `view(project)`                                   | 成品可消费的只读快照（房间 + 全局连接），courses 原样保留                    |

优先级：项目级显式连接 > 原 `course.connections`（同一起点）。`Engine.loadRoom`、
反向返回和出口过门改用全局索引/全局连接，因此跨原大关连接实际可运行；原同大关连接
行为不变。M.validate 追加全局校验（错误与警告）。

运行边界：跨原大关进入房间时引擎保留起始 `this.course` 作为 AI/规则默认来源（本阶段
未把 course 规则做成全局合并）；房间归属仍由 courses 决定。

## 3. 试玩进入背包（房间属性）

- 字段合同：`room.playtestItems?: string[]`，元素为 Registry 中 `item === true` 的类型 ID
  （`item.coffee` / `item.calculator` / `item.phone` / `item.icedTea`）。
- 缺失字段 ⇒ 旧存档兼容：编辑器开发者试玩携带全部道具（4.2 行为）。
- 字段存在（含空数组）⇒ 显式配置优先，只注入列出的道具。
- UI：房间属性「试玩进入背包」提供图标 + 勾选，清单来自 `Registry`（`playtest-items.cjs`）。
- 只作用于编辑器「试玩此房 / 从此入口试玩」；`app.startPlay` 只在显式传入
  `playtest` 时交给 Engine，正常成品流程不注入试玩背包。

## 4. 项目级道具状态与运行时接口

- 字段合同：`project.itemState = { version: 1, initial: { [itemType]: count } }`（可选）。
- `src/runtime/item-state.cjs`：`initial/setInitial` 读写项目初始状态；
  `snapshot(engine)` / `restore(engine, state)` 为运行时收集状态接口。
- Engine：构造时先应用项目初始状态，再应用编辑器试玩背包；`itemState()` /
  `restoreItemState()` 暴露跨房间可序列化收集状态。收集道具跨房间保留，死亡按
  `checkpoint.items` 回退（存档点快照）。状态不写回项目，不产生云版本。

## 5. 快慢节奏

- 房间属性删除「阶段」快慢选择，不写入 `phase`；旧房间的 `phase` 字段原样保留。
- Engine 仍读取旧 `phase` 以保持老数据运行行为，但新统一流程不再由大关阶段切换驱动；
  该字段仅作兼容，不再作为新流程分支依据。

## 6. 测试与验收

```text
node --test --test-isolation=none tests/map-compat.test.cjs tests/playtest-items.test.cjs
node --test --test-isolation=none tests/*.test.cjs   # 295 项核心测试
```

本机（workspace-write 沙箱）`node scripts/build.cjs` 因 esbuild 需要以管道启动子进程被
沙箱拒绝（`spawn EPERM`），且无审批通道，**构建未在本阶段验证**；`build/` 未声称已更新。
需在允许子进程的环境重跑 `pnpm build` 并做实际 Electron 验收。

未完成/后续阶段：框选复制粘贴、删除房间三按钮、教师节点路线、清醒加速修复、
高清地图预览、属性即时应用；本阶段只交付统一地图兼容层、道具配置与兼容迁移文档。

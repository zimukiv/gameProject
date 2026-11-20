# 统一地图 / 阶段 3 验收矩阵

日期：2026-09-10。每条用户需求列出入点、真实测试与状态。**未运行 GUI 的 UI 用例只写测试，由主代理在真实窗口执行**；本文件不把“写了测试”写成“已通过 GUI”。

## 1. 教师节点路线（slacker.teacher）

| 需求 | 落点 | 测试 | 状态 |
| --- | --- | --- | --- |
| 0 节点在老师自身，二维逐段路线 | `src/project/teacher-route.cjs`（points 以老师坐标为 0）、`src/plugins/teacher.cjs` tick/runtimePosition | `tests/teacher.test.cjs`「teacher follows a 2D node route…」真引擎 360 帧 | 逻辑通过 |
| 右键一次添加、画布整格拖动 | `src/editor/pages/room.cjs` teacher-path 工具 + teacherNodeHit/拖动；`src/editor/teacher-node-panel.cjs` | `tests/teacher-ui-smoke.cjs`（右键加点、拖到相邻整格） | 已写，待 GUI 执行 |
| 逐段时间/运动方式/循环往返 | 面板字段、`Route.modes/loops/at`、行为 schema `pathLoop` | `tests/teacher.test.cjs` 逐段用时/往返；序列化用例 | 逻辑通过 |
| 移动老师整条路线跟随 | `Route.moveOwner`，画布拖动与 XY 输入均走此入口 | 「moving the teacher carries the node route…」 | 逻辑通过 |
| 复制房间 path 重映射/深拷贝 | `model.duplicateRoom` 深拷贝 + `TeacherLinks.remap` | 同测试断言副本 path 不共享、签到 ID 重映射 | 逻辑通过 |
| 旧 patrolMinX/MaxX/speed 无 path 完全旧行为 | `teacher.cjs` 仅 `Route.hasPath` 为真时走新路线 | 「a teacher without a node route keeps the legacy patrol behaviour」 | 逻辑通过 |
| 签到消除与撞击惩罚保留 | 未改动 tick 尾部与 onPlayerContact | 原有 6 项 teacher 测试全通过 | 逻辑通过 |

## 2. 清醒板咖啡提示/加速

| 需求 | 落点 | 测试 | 状态 |
| --- | --- | --- | --- |
| 无咖啡走上去有受控“需要咖啡”，不刷屏 | `engine.fire` 对 `silentWithoutItem` 分支每方块 3 秒一次 `item-needed` + say | `tests/awake-coffee-frames.test.cjs` 新增 2 项（180/240 帧仅 1-2 次） | 逻辑通过 |
| 有咖啡上/侧触发、方向与持续 | `slacker.awake` 既有 onTrigger + 引擎 region/solid；新增测试未改触发 | 原有真实帧测试 6 项通过 | 逻辑通过 |
| 碰撞开关独立于触发 | 无咖啡 solid 阻挡/站立提示；关碰撞仍要求咖啡 | 原有 collision 用例通过 | 逻辑通过 |
| 方块说明方向/持续/冷却 | `src/editor/block-guide.cjs` awake/teacher 文案 | 文案审查 | 已改 |

## 3. 统一地图 UI 冒烟（unified-map-ui-smoke）

- 根因：前面为 DPR 固定 `Emulation.setDeviceMetricsOverride(1480x1000)`；Electron `setContentSize` 不会改变模拟 viewport，ResizeObserver 等不到 CSS 尺寸变化（原 line 324 超时）。
- 修复：保留 resize 断言；`setContent` 在设置窗口尺寸后同步把同一 CDP session 的 emulation 尺寸改为目标值（非模拟路径仍用 setViewportSize），恢复时同步回原尺寸。没有删除 resize 断言。
- 状态：`node --check`/模块加载通过；GUI 由主代理跑真实 Electron 确认，本 worker 未启动任何 GUI。

## 4. 可见旧大关清理

| 项 | 落点 | 状态 |
| --- | --- | --- |
| focus 按钮不回落旧 course | `graph-board.cjs` 无选中/分组时适配全部地图 | 已改 |
| 房间 AI 入房/AI ID 文案改全局 | `pages/room.cjs`（值仍 inherit，旧数据继承归属配置） | 已改 |
| 素材库不强迫选大关 | `pages/assets.cjs` 文案与“全部素材”筛选 | 已改，旧 courseId 仍兼容读取 |
| 旧美术绑定/旧存档容器 | 未删除 `courses` 容器；`courseDefaults/artBindings` 继承逻辑未动 | 仅内部兼容，界面不再可见 |
| 导航里的旧大关入口 | `planning-nav.cjs` 移除“大关工作区 / 本关美术绑定”条目；大关不再作为导航步骤 | 已改 |
| 路线图配色 | `graph-board.cjs` 房间色 = 用户分组色，未分组统一中性色 `#8496a8`，不再按主题/大关分类 | 已改 |
| 规划说明文案 | `pages/planning.cjs` 帮助改为“从出口拖到任意房间的入口接线” | 已改 |
| 素材/定义归属选择 | 仅作为内部兼容字段保留，新流程不强制选择大关 | 兼容保留 |

## 5. 发布前验收（主代理实测）

- 核心套件 **343 项通过**（主代理独立执行）。
- `teacher-ui-smoke.cjs`、`unified-map-ui-smoke.cjs`、`room-first-ui-smoke.cjs` 三个 UI 验收均由主代理在真实 Electron 中 **PASS**；本文件原先“待 GUI 执行”的行以本节为准。
- 结论：功能完成，**待打包**；本 worker 补充的两处发布前边界（撤销合并态、输入草稿 flush）只做代码与纯测，未启动 GUI，最终由主代理复验。

## 6. 发布前两处边界修复（本 worker）

| 边界 | 根因 | 落点 | 测试 |
| --- | --- | --- | --- |
| 撤销后立刻编辑同一字段会丢撤销 | `History.lastMerge` 在 `undo/redo/clear` 后未清除，900ms 合并窗口内新编辑被并入旧 burst，返回时不再推开新快照 | `src/editor/history.cjs` 三个入口都 `lastMerge = null` | `tests/history-merge-reset.test.cjs` 4 项（undo/redo/clear 后新编辑成为独立可撤销步骤，快速 burst 合并不变） |
| 输入后立刻保存/试玩/云同步/导出可能缺最新值 | live-fields 有 180ms 草稿队列，原只在实际导航 `go()` 前 flush | `saveNativeNow`、`startPlay`、`exportRoom`、导出项目包点击、云同步 `capture()` 入口统一 `flushAll()`；`flushAll` 增加重入保护，避免提交重绘再次进入 flush 递归 | `tests/live-fields.test.cjs` 新增 3 项（重入不重复点击、5 个入口都 flush、输入框内 Ctrl+S 仍保存且 Ctrl+C/V 保持系统行为） |

- 定义页不再展示 `course.blockDefaults` / `artBindings` 技术说明，改为“新放置的方块共用项目默认值。已有方块保持原参数。”；旧兼容数据与读取优先级未改。
- 以上仅改源码与文档，未运行打包/发布脚本，未改用户资料。

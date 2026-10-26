# 当前 RoomLab 2.5.2 完整连线版

GitHub 拉取与跨机器运行见 [程序 B 最新交接](../Handoff/ROOMLAB_20261026.md)。后续玩法源码以仓库内 `Tools/RoomLabRuntimeApp` 为准，通过 `Tools/RoomLabExactHost/setup-runtime.ps1` 同步运行副本；下列外部目录属于提交者本机部署记录。

- Unity 工程：`D:\minigame\B-three-levels-demo`（Unity 6000.6.4f1）。
- Unity 场景：`Assets/RoomLabExactConnected/RoomLabExact.unity`。
- 试玩：`D:\minigame\RoomLab-2.5.2-Unity-Connected-20261026\RoomLabUnity.exe`。
- 运行器：试玩目录内的 `RoomLabRuntime`。编辑器也使用此副本，必须保留。
- 策划原件：`D:\minigame\策划\第一大关 · 物理 DDL.zip`。

项目包含 11 个房间、10 条连接。前十个出口切换房间，最后一个才通关。
F1/右上角按钮选房；A/D/左右移动；空格/W/↑跳跃；Shift 左右冲刺（有左右输入时按输入，否则沿角色朝向）；S/↓蹲下；R重试；Esc 打开/关闭暂停菜单，菜单内只有“退出游戏”按钮。

## 2026-10-26 Esc 菜单

- 菜单显示在 Unity 层，打开时与隐藏运行器同步暂停，再按 Esc 恢复；暂停和恢复切换时清除累计时间及未发送的跳跃、冲刺、重试输入。
- 菜单内屏蔽玩法与选房输入；“退出游戏”调用正常退出流程，关闭本机连接及隐藏运行器。编辑器中按钮停止 Play 模式。
- 已重新构建试玩 EXE。通过 computer-use 实际操作验证：Esc 打开、paused 状态、菜单唯一按钮及返回提示、R 与 Shift+右输入被屏蔽、Esc 恢复 playing、再次打开后点击退出。退出后 RoomLabUnity/RoomLabCore 均无残留进程。
- 构建日志：`Validation/LatestRoomLabEvidence/escape-menu-build.txt`。

## 实现

Unity 转发输入并显示画布，隐藏运行器直接执行 RoomLab 2.5.2 原 Engine、模型、插件、碰撞、温度、摄像机和绘制代码。
这属于原核心嵌入，未把全部 JavaScript 重写为 C# 组件；修改玩法应调整 RoomLab 项目或原核心，而非旧 PlayerController/EnemyAI。
采用原版资源、AI 档位、累计融冰、轨道角度、触发冷却、房间缓存和死亡回退；按用户要求，冲刺已改为仅水平左右两向，速度、时长和资源规则保持原值。
运行器 source-hashes.json 保留 60 个原版源码文件的基线哈希；当前 src/runtime/engine.cjs 包含水平冲刺定制与导轨拾取修复，其余文件沿用基线。策划编辑器原件不修改。

## 2026-10-26 导轨 Token 拾取修复

- 原始错误代码、原因、修复代码和验证出处集中记录在 [Bug 修复日志](BUGFIX_LOG.md)。
- 原因：`update` 的 `p.rail` 分支在轨道移动后提前返回，绕过普通移动分支中的拾取检测；普通冲刺可以正常拾取。
- 修复：提取原拾取判定为 `tryCollect`，普通移动与导轨移动共用。导轨位置更新后执行拾取，保留解锁条件、触碰范围、奖励入账及去重规则，不修改轨道路径、加速度、上限或末端发射角度。
- `Tools/RoomLabExactHost/verify-rail-pickups.cjs` 使用“AI追逐1”的实际轨道和截图中的两个小 Token。修复前冲刺拾取通过、导轨拾取失败；修复后滑行中两个均入账且各一次，Token +2、积分 +200，验证充能进度与库存，以及轨道终点位置和发射速度不变。
- 32 种水平冲刺组合回归通过；隐藏运行器桥接对照 176 项、11 房间通过。日志：`Validation/LatestRoomLabEvidence/rail-pickups-rules.txt`、`rail-pickups-bridge.txt`。
- 修改发生在 EXE 与编辑器共用的运行器 JS 源码，无需重建 Unity；重新启动试玩即可加载。
- 现有 EXE 以 `-batchmode -roomLabExactVerify` 验证 11 个房间/11 张画面通过，以 0 退出；日志 `Validation/LatestRoomLabEvidence/rail-pickups-unity.txt`。本次初次隐藏窗口启动未持续更新，已关闭该测试实例并改用批处理模式完成验证。

## 2026-10-26 水平冲刺调整

- 实际修改位于试玩目录 `RoomLabRuntime/resources/app/src/runtime/engine.cjs`，编辑器与 EXE 共用。上、下输入不影响冲刺方向，未输入左右或同时输入左右时沿当前朝向。
- Unity 按键提示同步修改。通过 `RoomLabExactBuild.RebuildConnected` 重建既有连线场景，不重新生成场景或修改 PlayerSettings。
- `Tools/RoomLabExactHost/verify-horizontal-dash.cjs`：修改前复现向上冲刺 vy=-850，修改后 32 种输入/朝向组合通过；验证完整冲刺期间垂直位移为零，水平初速、持续时间、免费/付费消耗、三次上限和无库存限制。
- 修改后隐藏运行器与直接引擎状态对照：176 项、11 房间通过。此对照验证桥接一致性，独立的水平冲刺断言负责验证新规则。
- 连线场景重新构建成功；更新后的 Unity EXE 逐房加载 11 张画面通过并以 0 退出。日志：`Validation/LatestRoomLabEvidence/horizontal-dash-build.txt`、`horizontal-dash-rules.txt`、`horizontal-dash-unity.txt`。

## 验证

- 176 次原引擎状态对照通过。
- 自动将角色放到各出口，验证 10 次房间切换，只有最后出口 won；这不等于人工通关全部路线。
- 最终 Unity EXE 逐房加载 11 张画面，以 0 退出。
- 构建/运行日志保存在 `Validation/LatestRoomLabEvidence`。
- 对照脚本：`Tools/RoomLabExactHost/verify.cjs`，运行时参数指定试玩目录内的 RoomLabRuntime。

## 清理记录

旧工程的未提交源码和 Git 历史已压缩到 `D:\minigame\资料\历史源码备份-20261026.zip`。
旧构建、重复运行器和临时验证工程已清理。原始文档、交接资料位于 `D:\minigame\资料`。

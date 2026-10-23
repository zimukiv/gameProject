# 冷热路线试玩版（2026-10-23）

已修改 `Assets/Scenes/Level1.unity`，从编辑器重新打开该场景并 Play 即可；不需要重建场景。场景生成器同步更新了物理关布局，但不要为了试玩运行 Rebuild generated scenes，它仍会重写全部生成场景。

## 试玩路线

1. 开局热态，向右到 A 控制器，靠近按 E 降温。
2. 三段冰阶凝固，冰墙同时封住上方通道。沿冰阶跳上永久平台；下方地面可接住失误，回到 A 重试。
3. 高台检查点可保存冷态。在 B 控制器靠近按 E 升温，冰阶和冰墙一起融化。控制器与站立平台始终不消失。
4. 穿过冰墙原来的位置，向右落入后段地面，经过喷气前的小旗子，用喷气登上固定高台，再按 E 启动 AI，接电磁炮和终点流程。后续布局详见 `VENT_ROUTE.md`。

A/B 共享温度并同步显示状态，切换有冷暖波纹和背景色反馈；冰带独立边框和雪花标识，热态仅留很淡的非实体轮廓。当前使用工程原有方块美术完成玩法结构，没有把概念图里的整套场景美术导入游戏。

冰不再打滑，也没有踩踏消失或计时恢复。冰与控制器都参与现有检查点快照恢复；玩家与待凝固冰块重叠时，拒绝降温并显示提示，避免突然结冰夹住角色。

## 验证

- Unity 6000.6.4f1 对运行脚本和编辑器脚本的独立编译检查。
- `python Validation/temperature_route_audit.py` 检查实际 Level1 文件：引用完整、A/B 联动、受控冰列表、初始热态、普通跳跃余量、冰墙与顶棚闭合、安全检查点、后段地面衔接、镜头范围；同时确认 MainMenu/Level2/Level3 未改动。
- 原有 59 项纯逻辑回归、通用几何检查及 meta 完整性检查。
- `Validation/TemperatureRoutePlaytest.cs` 为真实 Unity 集成验收脚本，只能复制到隔离工程的 Assets 后以 `-batchmode -executeMethod TemperatureRoutePlaytest.Run` 运行。使用不同 productName，避免碰到正常试玩存档。

本机在隔离工程 `Validation/obj/ThermalPlaytest` 中以 Unity 6000.6.4f1 进入 Play Mode，73 项集成断言通过（退出码 0）：初始热态、A/B 切换同步、碰撞体随温度开关、踩踏不切温、站立不计时消失、热态不自动重结冰、真实 SaveManager 冷热快照恢复、结冰拒绝夹住玩家、两种恢复顺序均保持一致。结果在隔离工程的 `temperature-route-result.txt`，过程日志在 `unity-thermal.log`。

冷、热两态已用 Unity 相机实际渲染检查，预览位于 `Validation/Previews/temperature-cold.png` 和 `temperature-hot.png`。截图采用拉远镜头显示整段布局，不包含屏幕空间 HUD；游戏正常镜头仍跟随玩家。随后调整了永久地面颜色、纯色相机背景和控制器文字大小，并重新渲染核对。

隔离工程启动时日志另有 UnityEditor.Search 搜索数据库索引异常，调用栈不在游戏脚本中；未阻止上述 Play Mode 检查或相机渲染。本轮没有更改编辑器搜索设置。

自动集成检查直接调用机关交互接口，尚未模拟真实键盘 E 输入或完整跑关，跳跃手感还需要人工试玩。此后用户已调整冲刺为三 Token 单槽水平冲刺，当前规则与验证见 `HORIZONTAL_DASH.md`。

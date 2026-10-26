# 当前版本：RoomLab 2.5.2 完整连线导入版

**程序 B 请先读 [2026-10-26 最新交接说明](Handoff/ROOMLAB_20261026.md)。** GitHub 分支为 `codex/roomlab-handoff-2026-10-26`。

拉取后在仓库根目录执行 `Tools/RoomLabExactHost/setup-runtime.ps1`，准备仓库内 `.roomlab-runtime`，然后用 Unity 6000.6.4f1 打开 `Assets/RoomLabExactConnected/RoomLabExact.unity`。运行器源码、11 房间数据及素材已纳入 `Tools/RoomLabRuntimeApp`，后续修改该目录并重跑初始化脚本同步。构建用 `Tools/RoomLabExactHost/build-connected.ps1 -UnityExe <Unity.exe路径>`。

以下 D 盘路径是提交者本机入口；B 的机器使用上方初始化流程。

Unity Hub 添加本目录 `D:\minigame\B-three-levels-demo`，使用 **Unity 6000.6.4f1**。
打开 **`Assets/RoomLabExactConnected/RoomLabExact.unity`**，点击 Play；F1 选择房间。

直接试玩：`D:\minigame\RoomLab-2.5.2-Unity-Connected-20261026\RoomLabUnity.exe`。
Unity 编辑器和试玩程序共用该目录的 `RoomLabRuntime`，请完整保留试玩目录。

当前策划数据为 `D:\minigame\策划\第一大关 · 物理 DDL.zip`，共 11 房间、10 连线。
规则与画面基于 RoomLab 2.5.2 原核心，包含用户要求的水平冲刺、Esc 菜单及导轨拾取修复，详见 [当前导入说明](Validation/ROOMLAB_EXACT.md) 和 [Bug 修复日志](Validation/BUGFIX_LOG.md)。

---

以下为原三关 Unity 原型的历史说明，不是当前策划导入版的启动入口。

# AI 大人，拜托了 — Unity 2D 动作解谜原型

包含物理、高数、水课三关，使用色块占位美术。当前交接版本为 2026-10-23 的物理关路线与单槽水平冲刺迭代。

**程序员 B 请先阅读 [交接说明](Handoff/队友交接说明.md)**，其中列明当前规则、代码入口、验证结果及后续事项。

## 打开与运行

使用 Unity Hub 添加本仓库根目录，选择 **Unity 6000.6.4f1**。打开 `Assets/Scenes/MainMenu.unity` 后点击 Play；`Level1`、`Level2`、`Level3` 已提交，无需重新生成。

其他 Unity 版本未验证。`MiniGame > Rebuild generated scenes` 会覆盖全部四个场景，试玩不需要执行。场景检查和 Windows 构建入口分别为 `MiniGame > Validate generated scenes`、`MiniGame > Build Windows PC`。

## 操作与当前规则

| 操作 | 按键 |
| --- | --- |
| 左右移动 | A/D 或左右方向键 |
| 跳跃 | W / 空格 |
| 下蹲 | S / 下方向键 |
| 水平冲刺 | Shift；A/D 指定左右，无横向输入时沿面朝方向 |
| 物理关冷热控制、AI 核心 | 靠近按 E |
| 暂停 | Esc |

三关开局均为 0 次冲刺，每收集 3 个 Token 单位充满一次，最多储存一次。满充后继续拾取仍计分并保留 Token 供 AI 使用，不积攒额外冲刺能量；使用后从 0/3 重新充能。AI 启动不赠送冲刺，落地不补充。

追逐前收集的 Token 在启动时全部投入以削弱 AI 速度：Token 越多，AI 越慢，但全收集后仍明显快于玩家普通跑速。冲刺使用不减少持有 Token，因此不损失这份减速收益。现行公式、试玩数值与接口变更见 [Token 削弱 AI 追逐速度](Validation/TOKEN_CHASE_WEAKENING.md)。

物理关采用 A 降温生成冰阶、B 升温融开冰墙的路线；随后喷气登台，按 E 主动启动追逐，再经电磁炮通往终点。周期平台及上方收藏品为可选路线，有倒计时和 AI 靠近提示。高数、水课保留原有主题机关，本次同步冲刺逻辑与 HUD。

物理关仅保留喷气前的小旗子检查点，高台首个检查点已删除。旗子前死亡从关卡起点恢复，保存旗子后死亡回喷气前重新准备追逐。

电磁炮现为金色载人弹射平台：跳上后平台和角色一起水平向右加速，途中可按空格 / W 跳离；到末端角色水平脱离、平台自动回位，详见 [载人弹射平台](Validation/RAIL_CARRIER.md)。

## 验证与继续开发

- [水平冲刺规则与验证](Validation/HORIZONTAL_DASH.md)
- [冷热路线与验证](Validation/TEMPERATURE_ROUTE.md)
- [喷气、主动追逐与周期平台引导](Validation/VENT_ROUTE.md)
- [完整人工验收清单](Validation/PLAYTEST.md)
- [体验基线与下一轮改进切入点（2026-10-25）](Validation/EXPERIENCE_BASELINE.md)
- [实际游戏截图](Validation/Previews/)

本机 Unity 6000.6.4f1 脚本编译及记录中的自动检查已通过；完整三关人工跑关、整体难度平衡和本轮 Windows 独立构建仍需完成，详见交接说明。测试脚本须在独立工程运行，避免影响正常试玩存档。

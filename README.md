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

物理关采用 A 降温生成冰阶、B 升温融开冰墙的路线；随后喷气登台，按 E 主动启动追逐，再经电磁炮通往终点。周期平台及上方收藏品为可选路线，有倒计时和 AI 靠近提示。高数、水课保留原有主题机关，本次同步冲刺逻辑与 HUD。

## 验证与继续开发

- [水平冲刺规则与验证](Validation/HORIZONTAL_DASH.md)
- [冷热路线与验证](Validation/TEMPERATURE_ROUTE.md)
- [喷气、主动追逐与周期平台引导](Validation/VENT_ROUTE.md)
- [完整人工验收清单](Validation/PLAYTEST.md)
- [实际游戏截图](Validation/Previews/)

本机 Unity 6000.6.4f1 脚本编译及记录中的自动检查已通过；完整三关人工跑关、整体难度平衡和本轮 Windows 独立构建仍需完成，详见交接说明。测试脚本须在独立工程运行，避免影响正常试玩存档。

## 物理关卡编辑器（Windows）

队友请阅读 [工作台中文操作说明](Tools/PhysicsLevelEditor/TEAM_GUIDE.zh-CN.md)。

当前已验收版本为 Phase 3，使用 Electron 桌面程序，需要 Node.js 22+。

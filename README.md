# AI 大人，拜托了 — 2D 动作解谜 MiniGame（前三关完整 Playable Demo）

根据策划案打造的 2D 动作解谜逃生游戏。三关关卡依次为**物理关**、**高数关**、**水课关**。
美术采用简洁色块占位，核心机制完整可玩，方便其他开发者二次开发、数值调节与换皮接入。

---

## 游戏直接游玩与工程打开

### 方式 A：在 Unity 编辑器中打开与试玩（推荐开发者）
1. 在 **Unity Hub** 中添加此工程目录（推荐使用 **Unity 6000.6.4f1**，亦完全兼容 Unity 2022.3 LTS 及 Unity 6 LTS 各版本）。
2. 项目已预先生成并提交完整的场景文件（开箱即用，无需二次生成）：
   - `Assets/Scenes/MainMenu.unity`（主菜单）
   - `Assets/Scenes/Level1.unity`（关卡 1：物理）
   - `Assets/Scenes/Level2.unity`（关卡 2：高数）
   - `Assets/Scenes/Level3.unity`（关卡 3：水课）
3. 在 Project 窗口双击打开 `Assets/Scenes/MainMenu.unity`，点击上方 **Play** 按钮即可畅玩！

### 方式 B：一键重新生成场景或打包可执行版
- **重新生成场景**：菜单栏 `MiniGame > Rebuild generated scenes`（纯代码一键还原 4 个关卡场景）
- **场景可玩性与结构校验**：菜单栏 `MiniGame > Validate generated scenes`
- **Windows PC 一键构建**：菜单栏 `MiniGame > Build Windows PC`（输出至 `Builds/Windows/MiniGame.exe`）

---

## 游戏操作指南

| 操作 | 对应按键 | 机制说明 |
| :--- | :--- | :--- |
| **左右移动** | A / D 或 方向键 | 平滑加减速，支持冰面低摩擦滑动与空中位移微调 |
| **跳跃** | W / 空格键 | 单段高跳，可跃上各高台平台 |
| **下蹲** | S / 下方向键 | 碰撞体高度减半，穿过低矮障碍通道 |
| **八方向冲刺** | Shift 配合方向键 | 空中/地面八向匀减速冲刺；无方向时朝面向冲刺。首发冲刺免费，后续消耗充能槽（最多 3 槽） |
| **暂停菜单** | Esc 键 | 呼出暂停面板，可调节全局音量、切换全屏/窗口或返回主菜单 |

---

## 前三关核心玩法特色

每关遵循「**慢节奏探索收集 -> 启动装置 -> 快节奏 AI 追击逃生**」的双段节律：

1. **关卡 1（物理关）**：
   - 收集 Token 为冲刺充能；体验极低阻尼的**冰面**。
   - **热控方块**：踩踏切换冷热状态（炎热融化冰面，寒冷重新结冰）。
   - **喷气与电磁炮**：喷气装置垂直推升上抛；电磁炮踩上后进入匀加速导轨并猛烈弹射！
   - **狂暴 AI 技能**：超强爆发突刺（Burst Dash）；需引 AI 靠近以解除紫色收藏品保护并拾取。
2. **关卡 2（高数关）**：
   - **积分 / 求导方块**：踩踏切换状态。积分状态聚拢零散方块拼成通行平台，求导状态拆散回原位。
   - **旋转击飞方块**：持续旋转的阻挡物，触碰会将玩家与 AI 猛烈击退打飞。
   - **狂暴 AI 技能**：微积分力场牵引（Calculus Drift），近身将玩家强行吸附向 AI。
3. **关卡 3（水课关）**：
   - **5 次签到大门**：踩满前半段 5 个签到方块，开启通往逃生区的签到大门。
   - **巡查老师**：沿固定轨迹巡逻，碰触扣除 500 积分；巡逻穿过**清醒方块**时会将其唤醒为穿透状态，玩家穿过获得加速 Buff。
   - **狂暴 AI 技能**：Deadline 压迫光环，近身时光环持续减速玩家。
   - **AI 近身距离大门**：终点前大门由 AI 距离感应锁定，必须将追击 AI 引至开关 5 米范围内方可开门逃入 Exit！

---

## 检查点、存档与防挫败设计

- **房间检查点**：每关设有多个坚实地面的绿色保存点旗帜，触碰记录坐标、得分、Token 与机关状态。
- **死亡与完美回滚**：死亡后在最近检查点复活，享有 1.5 秒无敌保护；签到进度、机关大门、平台位置、冷热模式即时回滚，避免卡关或坏档。
- **数据持久化**：最高得分与已通关关卡自动存档至本地 JSON 文件，主菜单实时联动显示。

---

## 自动化测试与工程验证

本项目已通过全方位的自动化质量审计：
- **C# 编译验证**：`dotnet build Validation/CompileCheck.csproj` 0 错误、0 警告。
- **新版 Input System 兼容分支**：`dotnet build Validation/CompileCheck.csproj -p:UseNewInputSystem=true` 0 错误、0 警告。
- **核心逻辑回归测试**：`dotnet run --project Validation/RegressionChecks/RegressionChecks.csproj` 59 项业务逻辑断言全部通过。
- **关卡几何审计**：`python Validation/playability_audit.py` 关卡跳跃范围与检查点地面校验全部通过。
- **场景连线审计**：`MiniGame > Validate generated scenes` 场景 UI 绑定与触发链路全部校验通过。
- **独立可执行版本构建**：成功生成 `Builds/Windows/MiniGame.exe`。

---

## 其他开发者二次开发与换皮说明

- **美术替换（换皮）**：当前所有物体均挂载标准 `SpriteRenderer`，美术同学可直接替换为正式的 Sprite 切图或 Prefab，无需改动任何逻辑代码。
- **手感与数值调节**：移动速度、跳跃高度、冲刺速度与时长、AI 速度与技能参数均在 `PlayerController` 和 `EnemyAI` 等组件的 Inspector 中公开并标注中文 Header，直接拖拽滑杆即可调试。
- **扩展新关卡**：详见 [队友交接与二次开发说明](file:///C:/Users/Kayla/gameProject/Handoff/队友交接说明.md)。

# 单槽水平冲刺（2026-10-23 用户确认）

适用于当前 B-three-levels-demo 的三关，替代旧的首次免费、三槽、八向规则。退出 Play，重新打开关卡或 MainMenu 后运行即可，无需重建场景。

- 新关 Token、冲刺次数、部分充能全部为 0。
- 收集的 Token 单位累计到 3，获得 1 次冲刺，最多储存 1 次。普通 Token 贡献 1，大 Token 仍贡献 5，但不能突破容量，超出本次充满所需的能量丢弃。
- 满充后继续收集仍增加持有 Token 和分数，不额外积攒冲刺能量。消耗冲刺后从 0/3 开始，需要新收集 3 个 Token 单位。
- Shift 配合 A/D 或左右键只进行水平冲刺，W/S 不提供垂直分量。无横向输入时沿面朝方向。跳跃、下蹲按键保持原样。
- AI 启动继续消耗持有 Token，不赠送冲刺，也不清除已经得到的冲刺或部分充能。落地不补充能量。
- 检查点保存并恢复持有 Token、0/1 次数、0–2 的部分充能，以及原有拾取物、分数、机关等状态。
- 三关 HUD、主菜单及开场操作提示同步更新，显示单槽和“充能 0/3、1/3、2/3”或“冲刺 1/1”。其他关卡的几何没有修改。

`DashChargeMeter` 是充能状态的唯一来源，Token 与大 Token 都经 `PlayerController.AddTokens` 累计，旧的单枚 Token 直接补次数和首次免费字段已移除。旧资源快照的次数会限制到 0/1，满充快照不会同时保留部分能量。

## 验证

- Unity 6000.6.4f1 运行脚本、编辑器脚本编译通过。
- 同源码纯逻辑回归在本机 .NET 10 执行，76 项断言通过，包含单槽上限、满充丢弃能量、大 Token、负值与大数边界、恢复及输入缓存。
- `HorizontalDashPlaytest.cs` 在隔离 Unity 工程进入 Play Mode，34 项断言通过，退出码 0：真实 Token/大 Token 碰撞拾取和计分、上下组合键下的水平刚体速度、两次冲刺之间的重新收集要求、落地不补能、真实 AI 启动、暂停、死亡中的资源/重力/拾取物回滚、满充快照恢复，以及 Level2/Level3 的空资源开局与单槽 HUD。
- 实际 HUD 相机渲染已检查，预览为 `Previews/dash-two-thirds.png` 与 `Previews/dash-ready.png`。
- 该 Unity 验收脚本只可复制到隔离工程 Assets，以 `-batchmode -executeMethod HorizontalDashPlaytest.Run` 运行，并使用不同 productName。它注入游戏自身输入缓存验证 FixedUpdate 和真实物理拾取，不代替人工按键手感与完整三关追逐验收。

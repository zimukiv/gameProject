# 2026-10-18 优化记录

## 本轮变更

- 检查点通过 `ICheckpointState` 保存机关快照。签到数与颜色、门的位置及运动目标、启动装置、距离开关、清醒块、导航标记、移动/消失平台、冰块计时和冷热/积分模式随死亡回滚。快照只扫描当前场景，在同一次遍历中记录拾取物和机关。
- 初始快照在普通组件 Start 初始化后记录；签到静态计数先清零再保存。复活先恢复状态，再发出复活事件，AI 和 HUD 读取最终阶段。角色会脱离移动平台，重置蹲伏碰撞体与临时速度效果。
- 加速与减速使用独立的限时倍率，不再覆盖基础 moveSpeed；同一来源重复触发只刷新，多个来源按倍率相乘，各自到期。时间使用 Unity 游戏时间，暂停时不消耗效果时长。
- AI 遍历已启用导航标记的注册表；抵达标记后取消其引导，避免停在标记处。距离机关与收藏品复用当前关卡 AI 引用，取消每帧全场景搜索。
- 玩家、Esc 和机关交互共用 GameInput。生成器按当前输入后端选择 UI 输入模块；已生成场景更换后端时需同步修改 EventSystem。当前 manifest 仍只安装 UGUI，当前配置仍使用旧版输入。
- 热控按冰块组件而非启用中的碰撞体查找目标；热态保持融化，冷态能重新启用已禁用的碰撞体。冰块和消失平台使用可保存的剩余计时，避免死亡后旧协程继续改写状态。
- 电磁炮临时接管角色运动，正常输入不再争用导轨；死亡/禁用时取消导轨协程，弹射后恢复角色原始重力配置。

新增机关若需要死亡回滚，应实现 ICheckpointState；快照是当前场景内存状态，退出或重载关卡仍从关卡起点开始。不要在 RestoreCheckpointState 中重放得分或开门事件；被驱动对象应保存自己的状态。

## 验证与限制

- 旧版和新输入条件编译均为 0 错误、0 警告。
- 独立回归运行实际 TimedSpeedModifiers 实现，16 项断言通过。
- 关卡几何静态检查通过。
- Unity 批处理日志 `unity-optimization-validation.log` 显示缺少 `com.unity.editor.headless` 许可，编辑器返回 198。未执行 Unity 场景结构检查、碰撞/协程运行检查或 Windows 构建；不能据此认为运行验收已通过。
- 后续优先在 Unity 中按 PLAYTEST.md 完成复活、叠加效果与电磁炮验收，再用 Profiler 判断是否需要调整物理更新频率、存档写入频率及难度。

UI 输入模块的默认 action 配置参见 [Unity InputSystemUIInputModule 官方说明](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.UI.InputSystemUIInputModule.html)。

# Bug 修复日志

## BUG-001：电磁导轨滑行时无法拾取 Token

记录日期：2026-10-26。状态：已修复并验证。

GitHub 交接后，实际引擎的版本管理入口为 [Tools/RoomLabRuntimeApp/src/runtime/engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs#L728)，通过初始化脚本同步运行副本；下文绝对路径保留本次修复时的部署与原件出处。

### 用户反馈与复现

> 在电磁导轨上滑行时吃不到token，这是什么原因，是不是冲刺状态中无法吃到token

使用当前 ZIP 关卡中的“AI追逐1”房间，沿第一条多段电磁导轨滑行，经过两个小 Token（对象 `block-mvnjmv0r-npmfdw`、`block-mvnjmvjy-hbph5r`）。修复前这两个 Token 均未入账；另行验证普通冲刺可正常拾取 Token。

### 导致问题的原始代码

原始代码出处：[保留的 RoomLab 2.5.2 原件 engine.cjs](D:/minigame/策划/RoomLab-2.5.2-win-x64/RoomLab-2.5.2-win-x64/resources/app/src/runtime/engine.cjs:720)，`Engine.update()`。以下代码与修复前实际试玩运行器的对应分支一致；原件保留未改动。

```js
    if (p.rail) {
      this.moveRail(dt);
      this.updateAI(dt, colliders);
      this.recordTrails();
      return;
    }
```

原始拾取检测位于上述分支之后的对象循环中：

```js
      if (
        ['common.coin', 'common.small', 'common.collectible'].includes(o.type) &&
        (!o.params.unlockPadId || this.objectStates.get(o.params.unlockPadId)?.hitAI) &&
        (solidContact || overlap(p, { x: rect.x + 5, y: rect.y + 5, w: 22, h: 22 }))
      )
        this.collect(o);
```

当 `p.rail` 存在时，角色沿导轨移动后直接执行 `return`，本帧永远走不到后面的拾取检测。问题来自滑行分支漏做检测，拾取条件没有禁止冲刺。

### 修复代码与位置

实际生效文件：[试玩运行器 engine.cjs](D:/minigame/RoomLab-2.5.2-Unity-Connected-20261026/RoomLabRuntime/resources/app/src/runtime/engine.cjs:728)。在滑行位置更新后、提前返回前补上拾取检测：

```js
    if (p.rail) {
      this.moveRail(dt);
      for (const o of this.room.objects) this.tryCollect(o);
      this.updateAI(dt, colliders);
      this.recordTrails();
      return;
    }
```

原拾取判定提取为同文件的 [tryCollect()](D:/minigame/RoomLab-2.5.2-Unity-Connected-20261026/RoomLabRuntime/resources/app/src/runtime/engine.cjs:508)，普通移动和导轨滑行共用；`collect()` 继续负责 Token、积分、充能及重复拾取保护。轨道路径、加速度、速度上限和末端发射规则保持原值。

修改位于 Unity EXE 与编辑器共用的运行器，重新启动试玩生效。

### 验证记录

- [复现与回归脚本](D:/minigame/B-three-levels-demo/Tools/RoomLabExactHost/verify-rail-pickups.cjs)：修复前普通冲刺拾取通过，导轨两个 Token 的拾取断言失败；修复后两个 Token 都在仍处于导轨状态时入账，各仅一次。
- [规则验证日志](D:/minigame/B-three-levels-demo/Validation/LatestRoomLabEvidence/rail-pickups-rules.txt)：Token +2、积分 +200；初始库存 2、充能 9，结束库存 3、充能 1；导轨终点和末端发射速度断言通过。
- 水平冲刺回归：32 种方向输入与朝向组合通过。
- [桥接验证日志](D:/minigame/B-three-levels-demo/Validation/LatestRoomLabEvidence/rail-pickups-bridge.txt)：176 项状态对照、11 房间通过。
- [Unity 加载日志](D:/minigame/B-three-levels-demo/Validation/LatestRoomLabEvidence/rail-pickups-unity.txt)：11 房间、11 张画面通过，以 0 退出。

这些结果来自实际关卡数据上的核心自动验证及 EXE 加载检查，不代表人工从头通关。

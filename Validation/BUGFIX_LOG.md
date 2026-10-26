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

## BUG-002：尖刺整格判死范围过大，改为带容错的半圆危险物

记录日期：2026-10-26。状态：已修改并验证，仍需用户实际试玩确认手感。

后续朝向修正见 BUG-003：半圆底边按所在墙面旋转，不再统一朝上；14px 外观半径和 11px 危险半径继续沿用。

### 用户反馈

> 这种尖刺的判定范围太大了，玩起来会很难受，你把这种尖刺的判定范围改小一点，外观也换一下，改成半圆形吧

### 原代码与原因

原代码位于 `Engine.update()`；可在交接提交 `0c8fd13` 的 `Tools/RoomLabRuntimeApp/src/runtime/engine.cjs` 查看修复前版本：

```js
      const rect = this.objectRect(o);
      const solidContact =
        o.collision === true &&
        overlap({ x: p.x - 0.2, y: p.y - 0.2, w: p.w + 0.4, h: p.h + 0.4 }, rect);
      if (
        o.type === 'common.spike' &&
        (solidContact || overlap(p, { ...rect, y: rect.y + 22, h: 10 }))
      ) {
        this.retry('碰到尖刺');
        return;
      }
```

危险判定采用“整格实体接触”或“底部 10 像素条带”两者之一，`collision: true` 的尖刺会按整个 32×32 格触碰判死。`colliders()` 还会把它作为整格实体阻挡角色。旧绘制则是方框中的 `^`，与实际危险范围不够直观。

### 新规则与代码

- 当前 225 个尖刺均为 1×1 格。统一显示为底部红色半圆，外观半径 14 像素，危险半径 11 像素，周围预留 3 像素容错。
- [spikes.cjs](../Tools/RoomLabRuntimeApp/src/project/spikes.cjs) 共享几何定义。危险检测使用玩家矩形与上半圆的相交检测，弧形角落空白处安全，只有接触内缩半圆才判死。
- [engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 中尖刺从整格阻挡碰撞体列表排除，危险检测改为：

```js
      if (o.type === 'common.spike' && Spikes.touches(p, this.objectRect(o))) {
        this.retry('碰到尖刺');
        return;
      }
```

- [draw.cjs](../Tools/RoomLabRuntimeApp/src/editor/draw.cjs) 使用同一几何绘制红色半圆，取消尖刺原有方框、`^` 和非实体虚线格框。
- 关卡对象位置、普通地面与其他机关保持原值。同步到仓库内运行副本、现有外部试玩运行器和本机 Builds 运行器；重新启动试玩即可加载。

### 验证

- [verify-spikes.cjs](../Tools/RoomLabExactHost/verify-spikes.cjs)：修改前复现“角色仅接触旧格上半部仍死亡”；修改后 24 项通过。覆盖 collision 开/关、上方/两侧容错、弧形角落、危险半圆接触、底边下方；额外验证尖刺不再整格阻挡、普通地面仍能正常落地。
- [规则日志](LatestRoomLabEvidence/spike-semicircle-rules.txt)、[桥接日志](LatestRoomLabEvidence/spike-semicircle-bridge.txt)、[Unity 加载日志](LatestRoomLabEvidence/spike-semicircle-unity.txt)：176 项桥接状态对照、11 房间/11 张画面通过，Unity 退出码 0。
- 水平冲刺 32 种组合、导轨 Token 拾取回归通过。
- 已检查 [实际关卡画面](Previews/spike-semicircle-room.png)。没有人工从头通关所有路线，也未将自动判定测试等同于手感验收。

## BUG-003：半圆尖刺统一朝上，未按墙面旋转

记录日期：2026-10-26。状态：全部 225 个尖刺已写入方向，已同步试玩。

### 用户要求

> 尖刺是有方向的，放置的逻辑是半圆的底边要贴墙放置。
> 至于悬浮在空中的尖刺，和周围的尖刺保持一个方向即可，保证美观。

### 原始问题代码

上一次半圆改动只实现了朝上的几何，没有朝向参数。`spikes.cjs` 中的底边位置固定为物体下边：

```js
function geometry(rect) {
  const radius = Math.max(0, Math.min(rect.w, rect.h) / 2 - 2);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h, radius, hitRadius: Math.max(0, radius - 3) };
}
```

`draw.cjs` 也固定画上半圆：

```js
ctx.arc(x, y, radius, Math.PI, Math.PI * 2);
```

因此无论尖刺放在地面、天花板还是侧墙，外观和危险区都朝上。

### 修改与判断

- 每个尖刺的 `params.direction` 明确保存 `up/down/left/right`。方向表示弧面朝向：底部有墙则朝上，上方有墙则朝下，左侧有墙则朝右，右侧有墙则朝左。
- 多面接墙处按墙面延伸、相邻尖刺的横排/竖排判断；对 AI追逐1 的竖墙角和 XX 的天花板、阶梯地面串进行复核并记录覆盖理由。
- 无直接支撑墙面的 12 个尖刺，继承附近同组尖刺方向，以保持排列一致。
- XX 中另有 27 个尖刺本来就与实体墙格重叠，不能把方向修改当作摆放修复；保留其位置及地形，按相邻串统一方向，并在逐项记录中标注 `embedded: true`。本次未挪动或删除对象。
- [spikes.cjs](../Tools/RoomLabRuntimeApp/src/project/spikes.cjs) 同时提供四向底边位置及旋转角度，危险相交检测按同一方向裁剪半圆。绘制和判定一起旋转，原 3px 容错保持。
- [common.cjs](../Tools/RoomLabRuntimeApp/src/plugins/common.cjs) 增加朝向选项，方便后续编辑。原始关卡 ZIP 保留不动，当前 `project.json` 仅为 225 个尖刺增加方向字段。

| 房间 | 朝上 | 朝下 | 朝左 | 朝右 |
| --- | ---: | ---: | ---: | ---: |
| 冲刺锻炼 | 6 | 0 | 0 | 0 |
| 8 | 6 | 0 | 0 | 0 |
| AI追逐1 | 6 | 14 | 7 | 9 |
| 新房间 10 | 4 | 0 | 0 | 0 |
| 新房间 12 | 15 | 0 | 0 | 0 |
| XX | 67 | 57 | 8 | 26 |
| 合计 | 104 | 71 | 15 | 35 |

逐个对象的方向、支撑面、推断理由和悬空/重叠标记见 [spike-directions.json](LatestRoomLabEvidence/spike-directions.json)。推断脚本 [orient-spikes.cjs](../Tools/RoomLabExactHost/orient-spikes.cjs) 会重新写入所有方向，后续手工调整方向后不要无意重跑覆盖。

### 验证与画面复核

- 四个方向各 24 项边界测试，共 96 项通过，覆盖两种 collision 标志、擦边、背面、弧形角落及危险区域；并验证全部 225 个方向有效，抽查墙面、天花板、地面、悬空组的预期方向。
- 与 GitHub 上次交接的项目数据逐字段对照：去掉新增方向字段后完全一致，对象位置、地形、连接及资源设置未改。
- 水平冲刺、导轨拾取回归通过；176 项隐藏运行器状态对照、11 房间/11 张画面加载通过，Unity 退出码 0。
- 日志：[方向与判定](LatestRoomLabEvidence/spike-directions-rules.txt)、[桥接](LatestRoomLabEvidence/spike-directions-bridge.txt)、[EXE 加载](LatestRoomLabEvidence/spike-directions-unity.txt)。
- 已复核实际绘制：[AI追逐1](Previews/spike-directions-ai.png)、[XX](Previews/spike-directions-xx.png)。尚未人工从头通关。

## 功能-001：复活后增加 0.5 秒准备缓冲

记录日期：2026-10-26。状态：已实现并同步试玩。

### 用户要求与原代码

> 复活之后增加0.5秒的缓冲时间而不是立即开始新的一轮。

原 `retry()` 恢复入口后直接恢复 playing，结束处没有准备时间：

```js
    this.player.freeDash = true;
    this.player.dashCount = 0;
    this.say(reason + '。已恢复当前入口。');
```

原 `update()` 紧接着就开始推进游戏时间、角色和关卡：

```js
  update(dt, input = {}) {
    if (this.mode !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30);
    this.elapsed += dt;
    this.roomTime += dt;
```

### 新行为

- [engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 在统一 `retry()` 入口恢复后设置 `respawnRemaining = 0.5`，覆盖掉落、危险物、AI 抓捕死亡以及 R 重试。
- `update()` 在准备时间内只递减倒计时，角色、AI、机关、房间时间、冷却、无敌时间和资源均冻结；跳跃/冲刺按下事件直接丢弃，不积攒到下一轮。
- 每次固定步长 1/120 秒，60 步消耗完整 0.5 秒；最后一段准备步仍不推进世界，下一步恢复。按住的移动键在缓冲结束后正常生效。
- 正常开局、选房和正常跨房不添加此缓冲。Esc 菜单也暂停准备倒计时；游戏中的缓冲期内重复按 R 不重启倒计时、不增加死亡次数。
- 用户后续明确要求取消“准备开始”界面：当前为静默锁定操作 0.5 秒，不显示提示面板或倒计时。未修改 Unity 场景和 PlayerSettings，不需要重新构建 C#；已同步编辑器和现有试玩运行器，重启加载。

### 验证

- [verify-respawn.cjs](../Tools/RoomLabExactHost/verify-respawn.cjs)：全部 11 房间，逐步验证 60 帧期间玩家/AI/机关/资源冻结，0.5 秒结束、输入不残留，暂停恢复及重复 R；自动掉落、尖刺、AI 三类死亡均进入缓冲。
- [核心规则日志](LatestRoomLabEvidence/respawn-buffer-rules.txt)、[桥接日志](LatestRoomLabEvidence/respawn-buffer-bridge.txt)：扩展为 298 项实际运行器状态对照（包含 11 房间的准备和恢复步骤），全部通过。
- 原有 96 项尖刺四向判定、32 种水平冲刺组合和导轨 Token 拾取回归通过。
- [Unity 加载日志](LatestRoomLabEvidence/respawn-buffer-unity.txt)：当前试玩入口 11 房间/11 张画面加载通过，退出码 0。已检查 [真实倒计时画面](Previews/respawn-buffer.png)。尚未人工全流程通关。

### 后续修正：取消准备界面，保留 0.5 秒操作锁定

用户反馈：“不要显示那个准备开始的界面……死亡重新复活之后有0.5秒无法操作，之后再开始”。

删除 `draw.cjs` 中以下分支及其背景、文字绘制：

```js
if (game?.respawnRemaining > 0) {
  // 原有提示背景和文字绘制。
  text(ctx, '准备开始 · ' + game.respawnRemaining.toFixed(1) + 's', w / 2, h / 2 + 8, 24, '#edf7ff', 'center');
}
```

引擎内的 0.5 秒锁定继续保留。上方倒计时截图属于已取消的初版外观，当前不再显示该界面。

修正后 [11 房间静默缓冲回归](LatestRoomLabEvidence/respawn-silent-rules.txt) 通过；绘制代码已移除缓冲提示分支，并同步现有试玩目录。

## 功能-002：水平移动短暂加速，方便轻点微调

记录日期：2026-10-26。状态：已实现，等待用户实际试玩确认手感。

### 用户反馈与原代码

> 按一下就会很灵敏……水平位移时有一个比较短的从零开始加速的过程，加速到最高之后就维持匀速。

原 `Engine.update()` 普通移动直接赋予满速：

```js
      } else
        p.vx = p.launched
          ? Math.abs(p.launchX) < 1
            ? horizontal * this.config.speed
            : p.launchX + horizontal * 45
          : horizontal * this.config.speed * (p.crouching ? 0.45 : 1);
```

这让任意轻点在第一次更新就达到最高水平速度。按 120Hz 固定步长，50ms 普通移动约 11px，不易做细小调整。

### 新行为与入口

- [performance.cjs](../Tools/RoomLabRuntimeApp/src/project/performance.cjs) 新增 `moveAccelerationTime: 0.1`，普通水平移动从零线性加速，约 0.1 秒达到原最高速度 220px/s，之后保持匀速。配置可通过 `settings.performance.moveAccelerationTime` 覆盖，必须为正数。
- [engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 的 `accelerateHorizontal()` 用当前水平速度累加每步加速量，封顶到目标速度。普通地面、空中调整、蹲行及纯竖直喷射后的水平控制使用该过程。
- 轻点 50ms（6 个固定步）的位移约 3.208px，原为 11px。普通移动松键立即停止；反向输入从零重新起步，左右同时按视为停止，不引入普通地面惯性滑行。
- 冰面的原有 430px/s² 加速度和材质摩擦减速保持；冲刺仍立即进入原冲刺速度；有横向动力的喷射/导轨末端弹射保持原惯性与控制修正。不修改关卡、跳跃力度、最高速度或原始 ZIP。
- 已同步仓库运行副本和外部试玩运行器；重启试玩加载，不需要重新构建 Unity C#。

### 验证

- [verify-move-acceleration.cjs](../Tools/RoomLabExactHost/verify-move-acceleration.cjs)：旧逻辑第一步达到 220px/s，预期起步仅 18.333px/s，复现失败；修改后地面/空中、左右、0.1 秒满速、满速匀速、松键、反向重新起步、蹲行与 50ms 轻点全部通过。
- 冲刺满速、横向弹射、纯竖直喷射后的水平控制、冰面加速与摩擦分支验证通过；原有 96 项尖刺四向判定、32 种方向冲刺、导轨拾取与 11 房间复活缓冲回归通过。
- 证据：[移动规则](LatestRoomLabEvidence/move-acceleration-rules.txt)、[298 项桥接对照](LatestRoomLabEvidence/move-acceleration-bridge.txt)、[Unity 加载](LatestRoomLabEvidence/move-acceleration-unity.txt)。自动验证不替代真实键盘手感验收。

## 功能-003：免费冲刺落地恢复，付费冲刺每次落地前最多一次

记录日期：2026-10-26。状态：已修改核心规则、重建 HUD 并同步当前试玩。

### 用户要求

> 免费冲刺的机制改为用了之后碰到地面可以恢复。免费冲刺不限制使用，付费冲刺仍然为能储存三次但是每次在再次碰到地面之前只能用一次，也就是说在有付费冲刺的情况下可以连续冲刺两次。

解释：每次落地之间可以使用一次免费冲刺，若有库存可以再使用一次付费冲刺；免费冲刺在反复落地后可不限累计次数使用。落地恢复使用机会，不额外补充付费库存。

### 原机制代码与差异

原 `Engine.update()` 允许单轮最多三次，免费用完后还可连续消耗两份库存：

```js
    if (
      input.dashPressed &&
      p.dashCount < 3 &&
      (p.freeDash || this.charges > 0) &&
      (!p.rail || p.rail.allowExit)
    ) {
      const d = direction(input, p.face),
        free = p.freeDash;
      if (free) p.freeDash = false;
      else this.charges--;
      p.dashCount++;
```

复现：在空中连续按三次，旧逻辑使库存从 3 降至 1；新要求第三次不应生效，库存应停在 2。

### 新规则与代码

[engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 增加 `player.paidDashUsed`，条件改为：

```js
input.dashPressed &&
(p.freeDash || (!p.paidDashUsed && this.charges > 0)) &&
(!p.rail || p.rail.allowExit)
```

- 优先使用免费冲刺，清除 `freeDash`，不扣库存。
- 使用付费冲刺时扣一份库存，并设置 `paidDashUsed = true`，落地前不能再次使用付费冲刺。空中补充库存也不重开使用机会。
- 真正落到可站立表面时，恢复 `freeDash = true`、`paidDashUsed = false`。侧墙和天花板碰撞不算落地。
- 移除 `dashCount < 3` 限制；`dashCount` 只用于诊断记录，不再控制可用次数。历史项目字段 `settings.maxDashes: 3` 保留兼容数据，但不参与现行冲刺限额。
- 付费库存仍上限 3，原 Token 充能规则保持；落地不补充库存。无库存时每次落地后仍能免费冲刺一次。
- 正常跨房携带已使用状态，避免在空中穿过出口刷新机会；若到新房间后实际落地，则正常恢复。入口快照保存新字段；死亡/重试恢复新一轮机会，并保留原 0.5 秒静默缓冲。
- Unity HUD 改为“免费冲刺”“付费库存 /3”“落地前付费：可用/已用/无库存”，删除“周期 /3”。当前 HUD 在 `RoomLabExactPlayer.cs`，历史原编辑器页面不属于当前 Unity UI。

例：库存 3 → 空中免费冲刺（库存 3）→ 付费冲刺（库存 2）→ 第三次无效 → 落地后免费与付费使用机会恢复，库存仍为 2。

### 验证

- [verify-dash-resources.cjs](../Tools/RoomLabExactHost/verify-dash-resources.cjs)：修改前复现空中第三次又扣库存；修改后连冲两次、第三次拦截、三轮消耗库存、无库存连续 20 轮落地免费恢复、空中补库存、碰墙/天花板、跨房继承、复活恢复均通过；诊断计数为 99 时也不会限制新的免费机会。
- [verify-horizontal-dash.cjs](../Tools/RoomLabExactHost/verify-horizontal-dash.cjs) 按新需求更新两次组合与付费一次预期，32 种方向和时长验证通过。
- 水平起步加速、静默复活缓冲、215 个尖刺的四向判定、实际导轨拾取、10 次跨房及最终通关回归通过。
- [资源规则日志](LatestRoomLabEvidence/dash-resources-rules.txt)、[298 项桥接](LatestRoomLabEvidence/dash-resources-bridge.txt)、[构建日志](LatestRoomLabEvidence/dash-resources-build.txt)、[Unity 加载](LatestRoomLabEvidence/dash-resources-unity.txt)。桥接序列增加第三次冲刺尝试，11 房间对照通过。
- 旧导出试玩 ZIP 没有替换；当前本机试玩目录已更新规则和 HUD。自动测试不代表完整人工跑关。

## BUG-004：一次 Shift 重复触发，提前用掉空中的两次冲刺

记录日期：2026-10-26。用户反馈：“依然不能在空中连续两次冲刺呢”。已确认用户启动当前目录的 RoomLabUnity.exe，Player.log 中路径一致。

### 原错误代码与复现

实际运行器 [renderer.cjs](../Tools/RoomLabRuntimeApp/renderer.cjs) 的原代码：

```js
edges.jumpPressed ||= !!c.input?.jumpPressed;
edges.dashPressed ||= !!c.input?.dashPressed;
acc += Math.max(0, Math.min(c.dt || 0, .05));
while (acc >= 1 / 120) {
  g.update(1 / 120, { ...c.input, ...edges });
  edges = {};
  acc -= 1 / 120;
}
```

`edges = {}` 并不会清除 `c.input.dashPressed`。同一个命令后续每个物理步仍从 `...c.input` 取到 `dashPressed: true`，导致一次按键重复触发：第一个物理步免费冲刺，第二个物理步付费冲刺，库存从 3 变为 2、paidDashUsed 变为 true。玩家再次按 Shift 时，两次机会已经用完。50ms 命令可包含 6 个物理步，自动复现输出 `OLD_RENDERER_REPRODUCED presses=1 dashes=2 secondPress=blocked charges=2`。

此前 `verify.cjs` 的参考模拟也使用相同的展开顺序，重复了这个错误，因此旧的状态一致性检查没能发现；直接调用 Engine.update 的资源测试则绕过了实际输入桥接。此次同时修正参考模拟，并增加独立的次数/库存断言。

Unity 端另有可丢失快速连按的代码，位于 [RoomLabExactPlayer.cs](../Assets/Scripts/RoomLabExact/RoomLabExactPlayer.cs)：

```csharp
edgeDash |= GameInput.WasPressed(KeyCode.LeftShift)
         || GameInput.WasPressed(KeyCode.RightShift);
elapsed += Time.unscaledDeltaTime;
if (pending) return;
// 发送一个 dashPressed=edgeDash，之后清零。
```

等待 PNG 回包期间，两次真实按下被合并为一个布尔值，方向也只取发送时状态。回归中复现 `OLD_INPUT_REPRODUCED presses=2 delivered=1 charges=3`。

### 修复

- Unity 按帧记录带 dt 的 InputSample，等待回包时继续保留输入顺序，随下一条命令批量发送。
- 新增 [input-steps.cjs](../Tools/RoomLabRuntimeApp/src/runtime/input-steps.cjs)，每个物理步默认 `jumpPressed: false, dashPressed: false`，只有实际按下事件所在的一个步设为 true。
- 多次事件按顺序排队，保留事件当时的左右方向；两个事件早于同一物理步到达时也分别消费。按住 Shift 不重复触发。
- 暂停、选房、重试清空旧事件；复活 0.5 秒内的事件继续丢弃。跳跃事件同样修复重复触发。
- 免费/付费资源规则、冲刺速度与时长、半圆尖刺、水平加速保持现有要求。
- 已重建并同步当前本机试玩目录 `D:/minigame/RoomLab-2.5.2-Unity-Connected-20261026`，C# 程序集与运行器源码均校验一致；旧导出 ZIP 未替换。

### 验证

- [verify-dash-input.cjs](../Tools/RoomLabExactHost/verify-dash-input.cjs)：复现上述两个旧错误；修复后一次按下只消耗免费机会、第二次才扣库存，第三次不生效；0/50/150/250/350ms 间隔、反向冲刺、同一批次/跨批次短间隔事件、暂停和复活输入丢弃均通过。
- 实际试玩目录运行器：在第一房间真实入口站稳、起跳、免费向右冲刺、松键、付费向左冲刺，全程无落地；第一次库存 3、第二次库存 2、第三次被阻止。协议输入自动验证通过，未声称人工键盘验收。
- [规则证据](LatestRoomLabEvidence/dash-input-rules.txt)、[346 项实际桥接对照](LatestRoomLabEvidence/dash-input-bridge.txt)、[重建记录](LatestRoomLabEvidence/dash-input-build.txt)、[Unity 加载日志](LatestRoomLabEvidence/dash-input-unity.txt)。原有资源、水平冲刺、加速、复活、尖刺、导轨拾取与房间连接回归通过。

## BUG-005：温控从热切冷后，冰块仍等待再生成倒计时

记录日期：2026-10-26。用户要求：“从热切换到冷冰块结冰会有延迟，我要求立刻结冰”。

### 导致延迟的原代码

[ice.cjs](../Tools/RoomLabRuntimeApp/src/plugins/physics/ice.cjs) 的热状态分支设置再生成倒计时，切冷后进入普通再生成分支：

```js
if (!cold) {
  if (s.solid) {
    s.solid = false;
    s.respawnRemaining = o.params.respawnDelay;
    ctx.emit('ice-melt', { id: o.id, reason: 'heat' });
  }
  return;
}
// 冷态，但没有区分“温控切冷”和“踩踏融化后自然恢复”。
// s.solid 为 false 时：
s.respawnRemaining = Math.max(0, s.respawnRemaining - dt);
if (s.respawnRemaining === 0 && !ctx.actorOverlaps(o)) {
  s.solid = true;
  s.standing = 0;
  s.generation++;
  ctx.emit('ice-create', { id: o.id });
}
```

与此同时，[engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 的温控动作原先只更新冷热值，不同步冰块状态：

```js
setTemperature: (zoneId, value) => {
  if (zoneId) this.zoneStates.set(zoneId, value);
  else this.roomEnvironment = value;
},
```

因此温控标签已经显示 cold，冰块仍为 melted，继续等待 respawnDelay（默认 1 秒）；角色重叠时还可能继续等待。原逻辑在“冰引入”的 `block-mvhwoxf8-s8l3j1` 上复现，证据：[修改前失败日志](LatestRoomLabEvidence/instant-freeze-before.txt)。

### 修改与验证

- 温控动作现在比较每个冰块切换前后的实际温度；实际由 hot 变成 cold 的冰块，在同一次 setTemperature 调用中恢复 solid、清零 standing 和 respawnRemaining，并记录 ice-create。绘制与碰撞查询立即一致，无需等待下一物理步。
- 重叠温控区按实际温度计算：另一个覆盖区域仍为 hot 时不会误冻。全房间温控只影响实际温度变化的冰块。
- 立即切冷不再受角色重叠门槛阻挡。持续冷态下踩踏融化后的自然再生成间隔和重叠保护保持原有逻辑；重复设置已经为 cold 的区域不重置它的踩踏融化周期。
- [verify-instant-freeze.cjs](../Tools/RoomLabExactHost/verify-instant-freeze.cjs)：4 个实际装置、317 个冰块检查通过；测试把再生成间隔设为 30 秒，仍要求触发当次立刻恢复实体、外观和碰撞；覆盖角色重叠、相交温控区及踩踏融化自然恢复间隔。
- [规则证据](LatestRoomLabEvidence/instant-freeze-rules.txt)、[346 项实际运行器回归](LatestRoomLabEvidence/instant-freeze-bridge.txt)、[Unity 11 房间加载](LatestRoomLabEvidence/instant-freeze-unity.txt)。双冲刺输入与资源、移动加速、0.5 秒静默复活、尖刺、导轨拾取、房间连接回归通过。
- 已同步编辑器运行副本、Builds 副本及当前本机试玩目录 `D:/minigame/RoomLab-2.5.2-Unity-Connected-20261026`，引擎和冰块插件 SHA256 一致。本次仅修改 JS，无需重建 C#；重启试玩加载。旧导出 ZIP 未替换。

## 功能-004：开发者模式与锁血

记录日期：2026-10-26。用户要求：“加一个开发者模式，功能暂定为能锁血”。

- 使用方式：Esc → 勾选“开发者模式” → 勾选“锁血（免疫尖刺和 AI）” → Esc 返回游戏。顶部显示开发者模式与锁血状态，方便确认生效。
- 游戏目前没有独立生命值数值，锁血按无敌实现：尖刺不触发死亡；AI 抓捕不扣 Token、不增加偷取次数，也不会因 Token 为零而杀死玩家。
- 掉出地图时直接送回当前房间入口，清除冲刺、导轨和发射运动状态；不恢复/扣除库存、不重置房间机关、不增加死亡次数、不进入 0.5 秒复活缓冲。
- 手动 R 仍执行正常重试和 0.5 秒静默缓冲。冲刺次数、Token 收集、移动、机关与通关判定继续执行现有规则。
- 新程序启动时默认关闭。开启状态在暂停、自动跨房、F1 选房和手动重试间保留，仅本次运行有效；关闭开发者模式同时清除锁血。
- [RoomLabExactPlayer.cs](../Assets/Scripts/RoomLabExact/RoomLabExactPlayer.cs) 添加菜单、HUD 及 developer 协议字段；[renderer.cjs](../Tools/RoomLabRuntimeApp/renderer.cjs) 在暂停时也同步设置，选房时携带设置；[engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 在各类伤害入口应用锁血。
- [verify-developer-mode.cjs](../Tools/RoomLabExactHost/verify-developer-mode.cjs) 覆盖开/关、尖刺、AI 有/无 Token、掉落资源保留、恢复正常死亡、开发者模式门槛、11 房间重试/载入保留。立即结冰、双冲刺输入与资源、复活缓冲回归通过。
- 实际运行器新增暂停时切换、选房保留、手动重试和关闭清除锁血检查，共 350 项状态对照通过。实际界面已查看新暂停菜单并确认开发者开关开启后在 HUD 生效；锁血保护由规则测试验证。
- 证据：[规则](LatestRoomLabEvidence/developer-mode-rules.txt)、[实际桥接](LatestRoomLabEvidence/developer-mode-bridge.txt)、[构建](LatestRoomLabEvidence/developer-mode-build.txt)、[Unity 加载](LatestRoomLabEvidence/developer-mode-unity.txt)。已重新构建 C# 菜单并同步当前本机试玩目录，程序与运行器哈希校验一致。旧分发 ZIP 未替换。

## BUG-006：“冰 跑酷”关卡的 5 秒冰块调整为 2 秒

记录日期：2026-10-26。根据截图中的入口 `(1,2)`、出口 `(29,12)` 及冰块平台布局，确认房间为“冰 跑酷”（`room-mv0w2u2r-qkzk40`）。

原关卡实例参数为：

```json
"params": { "friction": 1.4, "meltAfter": 5, "respawnDelay": 1, "zoneId": "" }
```

已将本房间 25 个原 `meltAfter: 5` 的冰块改为 `meltAfter: 2`。另一个原本为 1 秒的冰块保持其关卡设定；其余房间、布局、材质摩擦、再生成间隔和温控立即结冰逻辑均保持原值。

验证：修改后项目结构与预期对象完全一致，只有上述 25 个参数改变，项目校验无错误；逐个验证累计站立 1.99 秒仍为实体，达到 2 秒时融化。证据：[参数与时间检查](LatestRoomLabEvidence/ice-parkour-melt-2s.txt)。

已同步编辑器、Builds 和当前本机试玩目录的 project.json，并核对 SHA256 一致。无需重新构建 C#，重启试玩加载；旧分发 ZIP 未替换。

## 功能-005：Esc 菜单中的键位设置

记录日期：2026-10-26。支持移动、跳跃、下蹲、冲刺、重试与选房的 7 项操作，每项 3 个按键槽。点击绑定后按新键，Esc 取消；可清除备用键，每项至少保留一个键，重复占用会提示冲突，Esc 固定用于返回。

`RoomLabKeyBindings.cs` 用本机 PlayerPrefs 自动保存，重启读取；损坏或不兼容配置不会部分载入，保留默认设置。GameInput 新增 Exact 读取接口，避免修改 A 后仍通过旧的方向键别名误触发。顶部帮助文字和重试说明随绑定更新。

构建前 [RoomLabKeyBindingsCheck.cs](../Assets/Editor/RoomLabImport/RoomLabKeyBindingsCheck.cs) 的 58 项检查通过，覆盖全部操作、备用键、冲突、无效保存、往返序列化及默认恢复。[检查记录](LatestRoomLabEvidence/key-bindings-rules.txt)。实际界面验证已完成冲刺改为 J、R 冲突提示、Esc 取消、原左 Shift 失效、J 实际冲刺、退出后重启保留 J。后续界面操作被用户按物理 Esc 中止，未修改其已保存的 J；玩家可自行恢复默认。当前功能继续随本轮新构建保留。

## 功能-006：开发者飞行与全局地图预览

记录日期：2026-10-26。用户要求：“再向开发者模式中加入飞行和全局地图预览的功能”。

### 使用与行为

- Esc → 开发者模式 → 飞行：左右沿用当前移动绑定；当前跳跃键上升，当前下蹲键下降，松键悬停。速度为普通最高水平速度的 2 倍，斜向归一化；无重力，可穿墙，位置限制在当前房间内。
- 飞行用于检查布局，不消耗冲刺、不收集物品、不触发机关或出口，AI 抓捕无效；房间机关与 AI 的时间继续推进。手动重试保留飞行开关并执行原 0.5 秒缓冲，选房携带开关。
- 关闭飞行或开发者模式后清除飞行/导轨/冲刺残留运动并恢复重力。若当前位置碰墙或处于危险区，返回开启飞行时的安全位置；原位置被冰块占用时退回安全入口或最近空格，避免在实体内关闭后卡住。
- Esc → 开发者模式 → 全局地图预览：默认显示当前房间完整画面和位置标记，可缩放 1–8 倍、拖动平移、一键适应全图。
- “全部房间”按连接顺序显示 11 张缩略图、10 条连接和当前房间标记；点击缩略图可查看对应房间全图。其他房间显示其布局，不传送、不改进度。Esc 或“返回菜单”退出预览，仍保持暂停，继续 Esc 才恢复游戏。
- 地图预览丢弃期间输入并清除待处理按下事件；角色、AI、机关、资源与计时保持冻结。地图功能需要开发者模式开启。飞行与开发者选项默认关闭，仅本次运行有效；保留原有锁血与本机自定义键位。

### 实现与验证

- [engine.cjs](../Tools/RoomLabRuntimeApp/src/runtime/engine.cjs) 扩展 `developer.flight`、飞行运动及安全退出；[developer-map.cjs](../Tools/RoomLabRuntimeApp/src/runtime/developer-map.cjs) 提供只读地图绘制、适应视野和布局；[RoomLabExactPlayer.cs](../Assets/Scripts/RoomLabExact/RoomLabExactPlayer.cs) 扩展菜单、鼠标预览交互和协议。
- [verify-flight-map.cjs](../Tools/RoomLabExactHost/verify-flight-map.cjs)：11 房间、8 方向、斜向归一化、悬停、穿墙、边界、资源、AI 免疫、安全退出、恢复重力、暂停/重试、全房间图适应、地图只读检查通过。对已同步的外部试玩运行器复验通过。
- [实际运行器 359 项检查](LatestRoomLabEvidence/flight-map-bridge.txt)：飞行协议、全部房间预览、其他房间查看、缩放平移、冻结世界、模式门槛和输入不残留通过。
- 已查看实际运行器生成的 [全部房间预览](Previews/developer-map-overview.png) 与 [XX 房间全图](Previews/developer-map-room.png)。此次没有再操作用户的桌面窗口。
- [正常玩法回归](LatestRoomLabEvidence/flight-map-regressions.txt) 覆盖免费/付费冲刺、方向、移动加速、复活缓冲、尖刺、导轨拾取和房间连接；锁血、立即结冰与连冲输入检查通过，58 项键位检查随构建通过。
- [构建日志](LatestRoomLabEvidence/flight-map-build.txt)、[Unity 加载](LatestRoomLabEvidence/flight-map-unity.txt)、[飞行地图规则](LatestRoomLabEvidence/flight-map-rules.txt)。已重建并同步本机当前试玩目录，C# 与 JS 文件哈希一致。旧 v2 ZIP 保持原导出内容，未重新分发。

## 导入-002：DDL1.3 的越界区域和存档点兼容

记录日期：2026-10-26。用户指定 `第一大关 · 物理 DDL1.3.zip` 检查能否导入。已备份当前完整运行器与 Unity 接入源码，并完成兼容处理和导入；完整内容对比见 [DDL1.3 导入记录](DDL_1_3_IMPORT.md)。

原包有两处直接阻止启动的问题：

```json
{"id":"zone-mvnhg8eo-h4brns","x":-1,"y":0,"w":44,"h":15}
{"type":"common.checkpoint","name":"存档点","params":{}}
```

当前原校验报 `AI追逐1 对象越界：zone-mvnhg8eo-h4brns`；修复数据边界后，原注册表又报 `缺少功能模块：common.checkpoint`。原 `common.cjs` 未定义存档点，Engine 只在进入房间时建立入口快照，因此不能把这些新物件当普通摆设忽略。

运行副本将温控区裁为 `x=0,w=43`，逐格证明有效地图覆盖不变。新增 `common.checkpoint`，触碰保存位置、资源、积分、收集与房间状态；死亡/手动重试回最近点，保留 0.5 秒缓冲，AI 按新复活位置重建。7 个点全部通过实际接触测试，掉落/尖刺/AI 合计 21 条死亡恢复通过。

保留 214 个既有尖刺方向和“冰 跑酷”的 25 个 2 秒冰块；其他现有玩法回归通过。53 个物件关闭实体碰撞、删除旧传送点等策划变化按新数据生效。真实运行器经过 362 项检查，包含实际飞到新点后保存/重试；本机 EXE 11 房间加载通过。数据和 JS 已同步当前试玩入口，无 C# 改动，重启生效。原策划 ZIP 和旧试玩 ZIP 未修改。

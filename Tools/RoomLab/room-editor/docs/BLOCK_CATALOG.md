# 功能块参数目录

> 由 `pnpm docs` 从注册表生成，请修改模块源码后重新生成。

## 喷气装置 · physics.jet

版本：2.0.0；大关：physics；触发：foot；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| direction | 喷气方向 | select | `"up"` | up / down / left / right / custom |
| force | 喷气力度（自定义方向时由横纵速度决定） | number | `900` | 0–1500 |
| launchX | 自定义横向速度 | number | `0` | -1000–1000 |
| launchY | 自定义竖向速度（负值向上） | number | `-900` | -1500–1000 |
| cooldown | 冷却（秒） | number | `1` | 0.1–10 |
| affectAI | 也影响范围内 AI | boolean | `true` |  |
| range | 施力范围（格） | number | `3` | 1–20 |

## 累计融化冰块 · physics.ice

版本：1.0.0；大关：physics；触发：none；素材状态：solid / cracked / melted

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| meltAfter | 累计站立融化（秒） | number | `5` | 0.1–60 |
| respawnDelay | 冷态再生成间隔（秒） | number | `1` | 0–30 |
| friction | 松键减速系数（越小越滑） | number | `1.4` | 0.1–20 |

## 冷热控制板 · physics.thermal

版本：1.1.0；大关：physics；触发：foot；素材状态：cold / hot

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| zoneId | 控制区域 | zone | `""` |  |
| initialState | 初始状态 | select | `"inherit"` | inherit / cold / hot |
| mode | 切换方式 | select | `"toggle"` | toggle / cold / hot |
| cooldown | 冷却（秒） | number | `1` | 0.1–10 |

## 电磁加速轨道 · physics.rail

版本：2.0.0；大关：physics；触发：foot；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| path | 轨道节点（格坐标） | path | `[{"x":0.5,"y":0.5},{"x":3.5,"y":0.5}]` |  |
| acceleration | 匀加速度 | number | `2400` | 100–6000 |
| maxSpeed | 速度上限 | number | `900` | 100–1800 |
| launchAngle | 终点抛出角度 | number | `-60` | -180–180 |
| cooldown | 冷却（秒） | number | `2` | 0.1–20 |
| allowExit | 允许跳跃/冲刺脱离 | boolean | `true` |  |
| sideTrigger | 允许左右侧面接触启动（朋友版兼容） | boolean | `false` |  |

## 大 token · common.coin

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 小 token · common.small

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 收藏品 · common.collectible

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 尖刺 · common.spike

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 存档点 · common.checkpoint

版本：1.0.0；大关：*；触发：region；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## AI 启动板 · common.aiStart

版本：1.1.0；大关：*；触发：foot；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## AI 启动板 · 空心 · common.aiStartHollow

版本：1.0.0；大关：*；触发：region；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## AI 传送入口 · common.portalIn

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| routeId | 传送路径 ID | text | `"route-1"` |  |

## AI 传送出口 · common.portalOut

版本：1.0.0；大关：*；触发：none；素材状态：idle

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| routeId | 传送路径 ID | text | `"route-1"` |  |

## 旧版 聚拢 · legacy.integral

版本：1.0.0；大关：legacy；触发：foot；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 旧版 拆散 · legacy.derivative

版本：1.0.0；大关：legacy；触发：foot；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

## 旧版 旋转 · legacy.rotor

版本：1.0.0；大关：legacy；触发：foot；素材状态：idle / active

| 参数 | 说明 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |

# 群测反馈修复记录（2026-10-27）

来源：群测反馈 6 条。1–4 为表现层问题，本次已改；5–6 为规则问题，需确认口径后改（见文末）。

| # | 反馈 | 根因 | 状态 |
| --- | --- | --- | --- |
| 1 | 直接导入工程包会没有美术素材 | 导入包不带 `artBindings`/`blockDefaults` 时 `Bound()` 全返回 null，地形退化成灰块、背景/角色/道具变白块 | 已修（内置像素切片兜底） |
| 2 | 游戏途中上方黑条挡住关卡 | HUD 条直接画在关卡上方，遮住关卡顶部 | 已修（预留 HUD 带，世界层让出顶部 33 设计像素） |
| 3 | 横向喷射板的特效方向是向上的 | 喷气特效写死向上：`(x, y-48, 32, 80)`，未读 `params.direction` | 已修（按 up/down/left/right 摆放并旋转） |
| 4 | 大小 token 美术差别太小 | 两个精灵都被 `Place()` 拉伸到整格 32×32，26px 的“大”和 15px 的“小”在屏幕上一样大 | 已修（保留原像素尺寸 + 重画美术） |
| 5 | 付费冲刺不能积累三次、初始为 0、大 token 恢复一次 | 导出工程 `settings.paidStockCap=3`，原生按 2.5.5 兼容规则开局即 3/3、上限 3 | 待确认口径 |
| 6 | AI 撞到扣一半 token，撞两次死亡 | 2.5.5 规则是每次偷 `1+2*tier` 个 token，token 归零才判死；没有“两次”计数 | 待确认口径 |

## 1. 导入工程包没有美术

`NativePixelWorld` 新增 `Art(type, slot, fallback)`：导入工程只要缺某个槽位的绑定，就回退到内置 `Resources/PhysicsPixel` 切片（地形按邻接选 `groundTopLeft/Middle/Right/Fill`，背景、出口、角色、AI、可移动平台同理）。美术绑定存在但指向缺失素材ID 时仍在导入期报错（I2 规则不变，不会静默变白块）。

## 2. HUD 不再压住关卡

- `HudBand = 33`（26px 状态条 + 7px 上边距）设计像素。
- 世界渲染层改为「设计空间 − 顶部 HUD 带」：`playfield = designWidth × (designHeight − 33)`，RenderTexture 按 playfield 生成，RawImage 顶边下移 33。
- 相机按 playfield 比例取景（`camera.aspect`），关卡顶部完整可见。
- 底部提示条仍是覆盖式（未反馈被挡），如也需要让位可以同样处理。

## 3. 喷射板方向

数据里喷气板方向分布：`up 26 / left 5 / right 1`。修复后按 `params.direction` 摆放并旋转：

- `up`：上方 32×80（原样）
- `down`：下方 32×80，旋转 180°
- `left` / `right`：侧向 80×32，旋转 ±90°，本体贴图同步旋转

## 4. 大小 token 区分

- 渲染改为保留素材原生像素尺寸、只在格内居中（不再拉伸到 32×32）。
- 重新生成美术（`Tools/RoomLabNative/produce-token-art.py`，可复现）：
  - 小 token：12×12 青色菱形碎片
  - 大 token：28×28 金框能量块 + 青色菱形核心 + 四角钉
- 判定：`common.small` = 小，`common.coin` = 大（+10 token / +1000 分）。

## 5–6. 待确认口径（会影响已验证规则基线）

设计案原文：

- 「付费冲刺 最大蓄积一次，得到一个大 token 或 3 个小 token 可以使用一次」→ 上限 1、大 token 直接 +1、3 小 token +1。
- 导出工程自身的 `settings.paidStockCap = 3`（2.5.5 兼容口径），原生当前按它执行：开局 3/3、上限 3、10 小 token +1。

AI 抓取在设计案里没有数值，2.5.5 参考实现为「每次偷 `1+2×tier` 个 token，token 归零才判死」。

因此 5、6 若要按下述口径改，就会把默认 Demo 从「2.5.5 兼容规则」切到「策划案规则」，P3 冻结 oracle（4,110,794 断言）与 P4 存档校验、`NativeGameplaySmokeChecks` 的初始 3/3 断言都会失效，需要同步更新基线。建议做法是新增独立规则集 `NativeGameplayRules.DemoPhysics`，只给正式 Demo 用，`Editor255Compat` / `LatestPhysics` 与既有 oracle 全部保持不动。

建议口径（未实施，等确认）：

- 付费冲刺：上限 1、开局 0、大 token +1、3 小 token +1、满仓不储备（与策划案一致）。
- AI：每次被抓扣当前 token 的一半（向下取整），同一局内第二次被抓直接判死（回最近检查点）；计数在死亡/换房/读档时清零。

## 5–8 已按「DemoPhysics」独立规则集实施（2026-10-27）

为不推翻已验证基线，新增第三个规则值 NativeGameplayRules.DemoPhysics，只有正式 Demo 的内置物理关使用；Editor255Compat（导入的 2.5.5 工程）与 LatestPhysics（策划案派生档）行为一字未改。证据：GAMEPLAY_EDITOR255_SMOKE_PASS checks=390、NATIVE_GAMEPLAY_PASS assertions=4110794 traces=24 operations=1151 仍然通过。

| 项 | 实施口径 |
| --- | --- |
| 付费冲刺 | 上限 1、开局 0、大 token +1、3 小 token +1、满仓不储备 |
| AI 抓取 | 第一次扣当前 token 的一半（向下取整），同一局第二次被抓 → 回最近检查点；计数在死亡/读档/换房清零 |
| AI 启动板 | Demo 规则下改为按 E 启动（踩上去不再触发），提示文案显示「E 启动 AI（消耗全部 N token）」 |
| 收藏品 | Demo 规则下只有 AI 碰到才算收集（+10000），玩家碰到无效 |
| 新手教程 | 首次启动直接进入教程页（读 settings.json 的 	utorialSeen），暂停菜单第三行可再打开；菜单左侧手机板改成三条教学待办 |

新增可执行断言 Tools/RoomLabNative/DemoRuleChecks（24 项，NATIVE_DEMO_RULES_PASS checks=24 rooms=11 small=3 profile=DemoPhysics）：覆盖上限/初始/3小1大/满仓不储备、255 与 latest 未变、收藏品只归 AI、第一次扣半（奇数向下取整）、第二次死亡与计数清零、启动板 E 交互且踩踏不再触发、Demo 存档往返。

仍未占用已验证的旧规则：255 开局 3/3、latest 开局 1/1 的断言保持原样。

注意：默认 Demo 规则切换后，旧存档（identity 含 Editor255Compat）与新存档隔离，旧进度不会串档。

## 第 9 条：喷气板从下面跳会穿模触发（已修）

根因：触发判定是「玩家矩形与喷气板矩形重叠即算接触」，向上顶到板底（或穿过无碰撞的侧向板）同样满足重叠，于是喷气在上升过程中就点火，把玩家往上打，表现为穿模触发。

修复（仅 Demo 规则）：DemoPhysics 下喷气板的接触判定追加「不在上升中」（p.vy >= -1）。上升穿过不触发，落地站上仍正常点火。Editor255Compat / LatestPhysics 的触发判定一字未改。

可执行断言（DemoRuleChecks 已扩到 26 项）：以第一个喷气房间为样例，上升穿越（y=-300）不产生 jet 事件；从上方落下站上板顶（y=60，1/120 步）仍产生 jet 事件。结果：NATIVE_DEMO_RULES_PASS checks=26 rooms=11 small=3 profile=DemoPhysics。

## 构建与实机验收（2026-10-27 18:00 后）

Unity 许可证恢复后完成构建与实机验证，不再是「只有代码级证据」。

- 构建：-executeMethod RoomLab.Native.Editor.NativePhysicsDemoEditor.Build → NATIVE_PHYSICS_BUILD_PASS，退出 0。
- 产物：Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe，SHA256 437691663c5fb21231524f4886e60a10b1841f13e42fbbc93ee39fbd827930cd，667,136 字节。
- 生产验收（实际 EXE）：NATIVE_PHYSICS_CORE_PASS checks=390、NATIVE_PHYSICS_IMPORT_PASS cases=12、NATIVE_AUTHORED_ICE_PASS checks=30、NATIVE_SOUND_PASS、NATIVE_PHYSICS_EXIT_PASS transitions=10、NATIVE_PHYSICS_UI_PASS，Player.log 中异常/错误计数 0，28 张生产截图通过像素断言。
- 分辨率矩阵：7 分辨率 × 7 界面 = 49 张图，ui-matrix.txt 无任何 PROBLEM（重叠/越界/裁剪/世界覆盖全部为 0），另加 import-no-art.png 与 jet-plume-left.png 两张专项证据，合计 51 张。
- 证据目录：Validation/Native/UI/Matrix/（截图 + ui-matrix.txt）、Validation/Native/UI/Verify/（生产验收截图）、Validation/Native/UI/verify-player.log、Validation/Native/UI/no-art.zip（去掉全部美术绑定的工程包）。

矩阵过程中发现并修掉的两个真实缺陷：

1. 音量滑块手柄被 uGUI Slider 的锚点计算拉长，压到「设置」标题与「向右 D」按钮上。改为「隐形 handleProxy + 按锚点跟随数值的可见 knob」。
2. HUD 用横向布局组时暂停按钮被撑到 175 设计像素宽。改为绝对锚点：状态文字左对齐占剩余宽度，暂停按钮固定 32×20 贴右。

世界铺满断言原先用局部坐标比较，改为世界坐标（NativeUiKit.WorldRect）比较页面矩形与预留带，误报已消除。

## v2 群测包（2026-10-27）

- 目录：G:/project null/交付/物理DDL_Demo_群测版_v2_20261027
- ZIP：G:/project null/交付/物理DDL_Demo_群测版_v2_20261027.zip，68,825,647 字节（65.64 MiB），SHA256 0b032ce1fdc8d83b4efbb47d6eb2aa86e6bcc6d18eeaa6b2d12a35a77c30b67；同名 .sha256.txt 附在压缩包旁。
- ZIP 内顶层文件夹 物理DDL_Demo_群测版_v2_20261027/，含 312 个运行文件 + FILES_SHA256.json（313 条），说明 先看我_群测说明.txt / README_zh.txt（v2 变更清单、操作、导入规则）、TECHNICAL_HANDOFF.md（v2 章节 + P4 历史）。
- exe：RoomLabPhysics.exe，SHA256 437691663c5fb21231524f4886e60a10b1841f13e42fbbc93ee39fbd827930cd，667,136 字节。
- 打包后独立验证：把 ZIP 解压到临时目录、从解压目录直接运行 -nativeUiMatrix，退出码 0、ui-matrix.txt 无 PROBLEM、50 张截图正常；随机抽取 8 条清单项与磁盘 SHA256 一致，0 处不符。
- 旧包 交付/物理DDL_Demo_群测版_20261027.zip 保留未动，便于对比与回滚。

## v2 追加：自适应视野、科幻拖动条、折叠分辨率（重新打包）

用户澄清「自适应窗口大小」指大关卡里的自适应视野，不是窗口尺寸。窗口自适应保留，另加：

- 大房间自适应视野：新增 NativeCameraView，跟随视角按 sqrt((房间宽/取景宽)*(房间高/取景高)) 拉远，钳制在 [1, viewMax]，且不超过房间本身；iewMax 默认 1.3（100% 关闭）。实测 XX（60×60）130% 时可见行数 17→约 22。
- 显示子面板改为科幻矩形拖动条（新增 NativeSciFiGauge）：边框 + 端点卡扣 + 8 段刻度 + 发光填充 + 1px 光标，按住任意位置左右拖动改值，右上角百分比。两条：窗口 0.50–1.00、视野 1.00–1.60。
- 分辨率选择折叠：分辨率 1280×720 展开 ▸ 点击展开预设与「窗口/全屏」，每次进入设置默认收起；矩阵连续截图时的状态残留已修（进入设置重置）。
- 矩阵扩到 8 界面 × 7 分辨率 + 大房间视野 130/100 + 横向喷气板 + 无美术包 = 60 张，ui-matrix.txt 无 PROBLEM。

重新打包（替换原 v2）：

- ZIP：G:/project null/交付/物理DDL_Demo_群测版_v2_20261027.zip，68,831,736 字节（65.64 MiB），SHA256 eee7ad76200961ad96b98aa4f4ba3645c85ffef6878e97dab5e04846a1e81759；同名 .sha256.txt 已更新。
- 构建指纹：RoomLabPhysics_Data/Managed/Assembly-CSharp.dll SHA256 B21353EA1667A0B329506B65420C6674C06D4C120A1EC2A9B1DD9FAF80BF0A29（320,000 字节）；313 条逐文件哈希见包内 FILES_SHA256.json。
- 打包后独立验证：解压到临时目录直接运行 -nativeUiMatrix，退出 0、0 PROBLEM、59 张截图；从解压目录取 Assembly-CSharp.dll 哈希与构建一致。

# Demo喷气AI轨迹修复（2026-10-30，v2）

当前源码工程：`D:\minigame\gameProject-main`。修改前主代理已fetch远端，确认main、交接分支及v2标签均为`75613df8b1addcda61b09663f69e222c16a26b26`，HEAD与origin/main无差异。保留已有AGENTS和ProjectAuditor本地修改。

## 本轮行为与最小修改

新录像《屏幕录制 2026-10-30 001304.mp4》在右侧喷气处暴露了上一轮保留的行为：玩家落到喷气装置时，范围内尚未到喷口的AI也立即获得独立弹射速度；它偏离玩家已经走过的路径，落回下方后再接续追踪。上一轮`AI_JUMP_FIX_V2.md`所述“范围喷射合法”是保留旧需求的历史结论；本轮用户明确要求正式Demo连续沿玩家历史轨迹追逐，覆盖该Demo行为约定。

仅修改`Assets/RoomLabNative/Core/NativeGameplayAI.cs`的`LaunchAI`：

- 保留AI激活与原`range`判定；命中时仍设置`hitAI/hasHitAI`，不破坏关联`unlockPadId`拾取门槛。
- 仅`DemoPhysics + physics.jet`不再额外写入AI的`flight/vx/vy`、处理延迟、传送warning或历史路径。AI通过正常追踪按时间顺序走完玩家喷气前后留下的路径。
- 玩家喷气弹射、`affectAI=false`、作者关卡/参数/连接、`Editor255Compat`与`LatestPhysics`独立弹射、`legacy.rotor`及开发者复位逻辑保持原实现。

没有添加AI新状态、存档字段或Snapshot字段。没有改作者JSON、素材及冻结oracle。作者JSON SHA256保持`03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836`。

## 定向红绿与证据

新增`Tools/RoomLabNative/JetTrailChecks`。同套最终测试可通过`UseBeforeJetFix=true`编译修改前的AI源码快照，不覆盖生产文件。

- `Validation/Native/JetTrail20261030/red.txt`：16例，3失败，准确定位真实房间10异地起飞、Demo范围内独立弹射及重复喷气改写AI运动。
- `Validation/Native/JetTrail20261030/green.txt`：16例、964断言、0失败，作者JSON未变。
- 实际新房间10右jet为`block-mvon8h4k-p7uyal`（19,12）。用真实`Tick`落板触发玩家喷气，再以普通left输入落上`tile-13-7`平台。逐帧检查AI追踪速度、到达原喷口拐点的顺序、随后向左上追踪；最终player=(429.58,196)，AI=(449.14,194.91)。
- 边界覆盖两个旧profile、`affectAI=false`、95/97px范围内外、合法命中对关联拾取的解锁、二次落板不清除pending portal状态或历史。
- `ai-jump-regression.txt`：现行默认AIJumpChecks 26例、378断言、0失败；`demo-rule-regression.txt`：DemoRuleChecks 30项通过。均为Unity内置.NET8真实执行，无需Unity窗口。

旧`AIJumpChecks`仅更新两处非冻结的Demo同步弹射断言：Demo范围命中仍有效，但不进入独立flight；二次喷气保持追踪路径。其余弹射着陆接续、开发者复位和旧profile测试保留。旧已知越界恢复诊断未纳入本轮修复。

## 交付边界

实现代理没有启动生产游戏、构建、提交或推送。独立回归、Unity构建、实际成品启动及本机试玩目录/快捷方式同步由主代理执行并补充结果。上述定向场景包含初始位置布置，不能当作完整11房人工正常通关或性能验收。

## 主代理独立验收与本机交付

主代理审查生产差异仅为上述LaunchAI分支，作者JSON和冻结oracle保持不变；使用Unity自带.NET 8.0.318执行实际回归：JetTrailChecks 16例/964断言、Progress572、DemoRules30、Motion9679均通过。实现代理的AIJumpChecks默认26例/378断言通过，原有开发者复位与兼容profile仍覆盖。

完整GameplayChecks本次实际退出1：前16个既有trace通过，随后因基线仓库缺失`Validation/Native/P3/Scenarios`下8个JSON停止。这是首次接手时已确认的交接遗漏，没有重新生成或改写oracle来掩盖，不能声称本次完整24trace回归通过。

Unity 6000.6.4f1通过`NativePhysicsDemoEditor.Build`成功构建，日志包含`NATIVE_PHYSICS_BUILD_PASS`并以0退出。构建前后32份Core/Data/Presentation/Editor源码逐一SHA256一致；恢复了构建器自动重写的场景和项目显示设置，保留构建前已有本地改动。实际新成品以`-nativePhysicsVerify`和独立存档目录执行，退出0；生产日志为CORE388、ICE30、CODEC71、IMPORT12及界面/声音/出口链检查通过。出口链有位置布置，仍不代表正常完整跑关。

- 本机新成品：`D:\minigame\试玩版-v2-20261030-喷气追逐修复\RoomLabPhysics.exe`。
- `D:\minigame\开始试玩-v2.lnk`已核对指向新成品及正确工作目录；20261029旧程序和更新前快捷方式备份保留，未关闭用户已有游戏进程或覆盖其个人进度。
- 新DLL SHA256：`d4c86dcc0ba42d6bc6094db328eed97741084a42c27282d37d06eeb85c22cbe2`。
- 32份运行/构建源码清单聚合SHA256：`597bd712b070bbd9f6f79c96893b13536822483d80da7812c0deba5e27d2526d`。
- 新目录含`BUILD_INFO.json`、`SOURCE_CODE_SHA256.json`和`FILES_SHA256.json`，313份清单文件逐一大小及SHA256核验通过。版本信息明确为75613df基线上的本地未提交修复，不冒称已经发布到GitHub。
- 完整本机日志、截图与构建前备份：`D:\minigame\资料\修复验证\20261030-喷气追逐`；摘要见`Validation/Native/JetTrail20261030/independent-acceptance.json`。

已打开的旧游戏仍执行旧DLL；退出后从原快捷方式重新进入即可使用修复版。本机验收结束时源码与成品已同步，尚未上传远端，未声称完整人工通关或性能验收。

## 用户复测与源码同步

2026-10-30用户复测后确认“好了没问题”，并授权更新GitHub代码。本次同步目标为`origin/main`，提交修复源码、定向测试及红绿证据、验收摘要、交接说明和后续本机试玩同步规则。推送前重新fetch确认远端仍为75613df，无并发源码更新，采用普通快进推送；不覆盖原有发布标签。提交SHA以Git历史与推送后远端核对结果为准。用户确认仅指本次反馈的问题，不扩展为完整11房通关结论。

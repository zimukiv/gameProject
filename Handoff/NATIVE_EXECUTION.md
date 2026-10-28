# 原生 Unity 阶段执行记录

本会话用户已指定使用子代理实现，主代理制定合同、只读审查和独立测试验收；本会话不调用DSH，不修改长期分工偏好。

唯一写入工程：`G:\project null\gameProject-roomlab255`。参考提交：`a0ecb6aa4517f14afaa2e32c825fdc71b0d246b6`。总计划：`G:\project null\UNITY_NATIVE_ROOMLAB255_PLAN.md`。

2026-10-27 范围锁定：用户明确当前 Demo 仅第一大关「物理 DDL」。默认 11 房及 10 条连接；菜单、选关、存档与最终结算仅第一大关，不新增数学/摸鱼/老师内容或后续大关入口。最新策划案 (3) 与最新两张素材/配置截图优先处理本范围内冲突。原编辑器 2.5.5 文件替换导入要求保留。

| 阶段 | 状态 | 当前交付 |
| --- | --- | --- |
| P0 | independent_PASS_snapshot_alias_closed | 冻结来源、真实导出fixture、16案例817操作replay、硬件与P1合同；编辑器来源散列Minor已关闭 |
| P1 | independent_PASS | 两项Important已独立关闭；117项C#与Unity数据验收通过，可进入P2 |
| P2 | independent_PASS_core | 原生运动底层独立PASS，9679断言与实际EXE通过；用户截图确认窗口/HUD和移动拾取，完整出口与像素美术进入P3/P4 |
| P3 | independent_PASS | I1重复奖励、M1输入溢出保护已独立复验关闭；13项独立定向、390共享合约及实际生产UI日志通过，人工窗口检查和美术留P4 |
| P4 | independent_PASS | 原I1/I2/M1独立关闭，用户源/控温/原生GIF-WebP通过独立复验；正式默认源SHA73c0df8e…b2a5ad9、Editor255Compat |
| P5 | deferred_by_user | 用户要求先不做测试，先给现有成品群测包；不启动性能/试玩/新增测试，仅打包当前完整发行目录 |

## 2026-10-27 当前群测包交付

用户要求先给现有成品供群友测试，本次未启动P5或新增运行测试。基于P4已独立PASS的 `Builds/NativePhysicsDemo-Final` 完整复制，仅更新群测说明和独立验收状态文字，保留所有运行文件、许可证与原作者关卡。

- ZIP：`G:/project null/交付/物理DDL_Demo_群测版_20261027.zip`
- 已展开目录：`G:/project null/交付/物理DDL_Demo_群测版_20261027`
- ZIP大小：70,288,995字节（67.03 MiB）。SHA256：`3c6de7e0fbef7346f4e2b60c2c210a213d803cae8781468f8ed5780e94e2e020`。
- 随包 `先看我_群测说明.txt`、`README_zh.txt`、`TECHNICAL_HANDOFF.md`、`FILES_SHA256.json`；压缩包旁另有SHA256文本。玩家完整解压后运行RoomLabPhysics.exe，不能只分发单个exe。
- 性能量化、完整人工跑关与群友反馈后的修复仍未进行，不以群测包交付冒充P5通过。未向任何群聊或第三方发送文件。

## P0 自测记录

执行 `node Tools/RoomLabNative/freeze-baseline.cjs` 和 `node Tools/RoomLabNative/freeze-baseline.cjs --check`，实际输出均通过：53个冻结文件、71个oracle来源、16个case、817个operation；数量为1大关、11房、10连接、1311地形、695对象、7检查点、214尖刺、9素材。

每个oracle文件对照Git提交，默认JSON使用Git规范原始字节，来源散列与CRLF区别见 `Validation/Native/README.md`。本阶段没有修改游戏源码、Packages或旧场景，没有原生玩法验收结论。

生成后连续两次完整 `--check` 均通过。另临时给本阶段生成的unknown-major fixture追加一个空格，`--check`实际返回1并定位该文件；在finally恢复原字节后再次通过。检查其余51个冻结产物的mtime未变，证明校验模式没有回写冻结数据。异常fixture独立复核输出 `BAD_FIXTURES_PASS truncated=true corruptCrcOnly=true declared26MiB=true unknownMajorRejectedByRealEditorRegistry=true`：CRC损坏包仍能解压为相同正文，专门用于防止“仅解压成功”的假通过。

硬件采样没有更改显示设置，当前显示仍为2560×1440/180Hz；1920×1080窗口、60fps是后续构建的拟固定渲染配置，不是已执行的60Hz显示器测试。

## P0 独立审查及窄修

主代理独立审查结论PASS，0 Critical / 0 Important / 1 Minor。唯一Minor为编辑器来源只校验版本号，现已在`baseline-manifest.json.editorSources`冻结15个实际编辑器/fflate文件的路径、SHA256和字节数，并由`--check`直接核对。

窄修后实际生成及`--check`均通过：53文件、71参考源、15编辑器源、16案例、817操作。除`baseline-manifest.json`和随之更新的`frozen-files.json`，其余51个冻结fixture/scenario/trace/index文件逐个SHA256保持不变；前后散列清单的聚合SHA256见下。未改编辑器、游戏源码或任何玩法预期，P1仍为pending。

前：`36e6463dc1830fa682e17b73517970f47a81b70690ca2ee255842097a39b170a`。后：`36e6463dc1830fa682e17b73517970f47a81b70690ca2ee255842097a39b170a`。聚合输入为按原frozen-files清单顺序排列的51项`{file,sha256}`JSON数组，逐项比对同时通过。

## 入口与恢复

原 `G:\project null\gameProject` 的旧分支及未提交设置保持原状；本工程既有套壳兼容尝试dirty改动全部保留，未作为P0 oracle，也未宣称其导入流程已验收。原参考试玩入口为 `Assets/RoomLabExactConnected/RoomLabExact.unity`，需要旧运行器；原三关位于 `Assets/Scenes`。

后续原生入口只在 `Assets/RoomLabNative` 下新增，阶段独立验收前不替换旧入口。阶段失败可停用新增原生入口，继续旧场景/历史发布目录；不重建旧场景、不重写源存档、不删除既有工作。

每阶段只允许一名写入者。阶段完成后停止写入，由主代理确认真实差异与测试再进入下一阶段。P0实现者到此停止，不自动进入P1。

## P1 自测记录

Data与Editor入口见 `Validation/Native/P1/README.md`。正式Unity锁定官方Newtonsoft3.2.2；独立.NET8 runner链接同一Data源码。54项C#回归通过，Unity6000.6.4f1数据验收通过11房/695对象/1311地形/10连接/9素材及4坏fixture。原始DDL1.3 SHA保持404098abcf1e3ccf2f856482d95b558f2d62d2e008b08d32bf8d10ba4fbc6c8f。未改P0冻结预期、旧脚本、旧场景或套壳运行器。此阶段不包含原生图形/玩法，P2仍pending，交付后停止写入供独立验收。

## P1 两项 Important 窄修自测

严格JSON前置RFC语法扫描与Normalize后必要模块再校验已实现。原54项不删减，新增共享.NET/Unity定向63项，总117通过；Unity6000.6.4f1最终`unity-data-repair.log`含repair63项、默认11/695/1311/10/9和坏fixture4项通过，退出0。实际编辑器五项模块迁移对照通过。源码和报告已冻结，当前仍为repairing_two_important直到主代理独立复核PASS；不自动前进P2。

## P2 自测记录

具名写入者 native_p2 已停止源码写入，等待独立验收。仅新增 Assets/RoomLabNative 下 Core、Presentation、Prototype Scene、Resources 与专用Editor验证/构建，以及 Tools/RoomLabNative/MotionChecks、Validation/Native/P2。没有修改旧场景/脚本，保护哈希变化=0；P0完整 --check仍通过。P1 Data API未修改。

最终同源码.NET8输出 NATIVE_MOTION_PASS checks=9679 oracleCases=8 oracleFrames=260 fixedHz=120 renderRates=30/60/120/144；另有107帧轨道实接触/分段运动/拾取/角度出口对照。9679为断言数。轨道oracle由干净a0ecb6a离线产生，不随玩家运行，不改P0预期。P3检查点、冰、温控、AI未声称通过。

串行 build-motion-prototype.ps1 实际构建专用场景，进入Editor PlayMode并运行新Windows EXE，最后输出 NATIVE_PROTOTYPE_PIPELINE_PASS build=true editorPlayMode=true standalone=true。共享16项接触检查均完成。Standalone像素校验 player=749、terrain=42806，1280x800。输出目录 Builds/NativePrototype，程序 RoomLabNative.exe；自动相机图 Validation/Native/P2/Standalone/native-prototype.png 不含GUI，结果JSON明确captureIncludesGUI=false。原始灰图保留为负控并被同判据拒绝，不能将早先exit0作为图形通过。

最初ScreenCapture缺模块与隐藏窗口backbuffer无绘制帧的问题已按实际日志处理；最终使用显式Camera RenderTexture，不保留无用screencapture依赖。Editor有UnityEditor.Search索引异常，栈不在游戏；Standalone无该编辑器异常。真实可见窗口/HUD/物理键盘交互由主代理继续独立验收，未以自动相机图替代。

控制器同参数物理实验见controller-comparison.json：240次120Hz、同gravity1500/speed220/ramp0.1、双方零摩擦/零弹性、Rigidbody Continuous/None。记录x最大差0.0012px、y约1.04167px；选可控AABB以匹配既有规则，不将该小诊断泛化成刚体优劣结论。全部事实/API/边界见 Validation/Native/P2/README.md。

构建前后必要PlayerSettings与Physics2D值均由finally恢复。Unity序列化导致ProjectSettings/Physics2DSettings.asset、ProjectSettings.asset出现换行层面的工作区标记，git diff对这两个文件没有语义差异；未使用reset/clean覆盖旧设置或已有修改。

## P3 implementation handoff

2026-10-27 native_p3 唯一写入者已停写，待主代理独立验收。仅第一大关物理11房；没有增加数学/水课/老师或后续大关内容。完整说明与P4 API见 Validation/Native/P3/README.md。

原生typed机关/温区/AI/检查点/跨房已接入P2 exact motor。默认constructor仍Editor255Compat，旧P0/P2规则保留；正式Gameplay显式LatestPhysics，依最新策划DOCX SHA6d5d5628d1c3ef9ab51790d6f695ff786c07784b98be191ce7683a14ee8adb64派生独立latest-physics.json，ice1s/3s、paidCap1/3小或1大充能、满充不储备、温控与AI近距E、喷气与轨道脚踩。外部JSON/ZIP导入默认Compat，失败保留当前游戏。退出/最终结算/下一房继续/选关/重试窗口已实现；P4负责像素美术、正式存档Continue/最高分、完整改键/地图界面与滤镜。

最终证据：P0 --check53文件/71oracle source/16case817op通过，P1 117通过，P2原9679通过。P3 24条独立clean-reference oracle、1151op，含原P0所有非对象预期直接比较与修正capture独立对象状态比较，共2200744断言通过；共享.NET/Unity新增382合约通过。P0 objectSnapshots浅引用缺陷已报主代理，未改P0预期；新oracle在独立P3目录deepclone生成，不称原缺陷已修复。

Unity6000.6.4f1 final build退出0，Builds/NativeGameplay/NativeGameplay.exe仅NativeGameplay场景；真实Editor PlayMode共享382+11房/10连接/9素材通过并退出，StandaloneFinal同样通过并产图。Editor PlayMode有UnityEditor.Search数据库索引异常（已存栈，非Native代码）；Standalone无此异常。相机图不含GUI，未冒充物理键盘/窗口点击独立验收。旧Prototype输出未重建，也未终止用户旧游戏。

默认原件SHA404098abcf1e3ccf2f856482d95b558f2d62d2e008b08d32bf8d10ba4fbc6c8f不变，latest派生SHA045e0c06e7c638bc8ab915decd0af9f2b988cf79edaade2a0887f119021769bf。几何图仅P3临时测试表现，未把它当最终像素Demo。核心Legacy transforms已有实现但无独立legacy oracle，默认物理关movables=0，不声称全类型E2E均已验收。
### P0 snapshot alias narrow closure / P3 directed retest

主代理通知P0快照alias修复独立PASS：0 Critical / 0 Important / 0 Minor；旧浅生成器复现52旧产物，16条/817操作输入及36源fixture不变。P0状态更新为independent_PASS_snapshot_alias_closed，以上发现与历史自测记录保留。P3仅GameplayChecks/说明窄收尾，不修改正在只读审查的Core，不改规则、不重建程序。GameplayChecks现对修后P0完整objects（objectStatesRef展开）及原始ordered events直接比较，同时保留独立deepclone oracle与额外覆盖；普通测试不再隐式重写latest派生资源，生成需显式--write-demo。P3仍awaiting_independent_acceptance。定向.NET最终输出 NATIVE_GAMEPLAY_PASS assertions=4110786 traces=24 operations=1151；共享合约382通过。修后P0全16条/817操作完整状态、对象及事件直比通过。此次仅测试与说明改动，Core和既有EXE未改；再次停写。

### P3 I1/M1 independent review narrow repair

独立审查初次FAIL 0C/1I/1M，主代理授权native_p3唯一写者窄修。I1 won→选关→返回游戏重复+50000：Core新增Completed完成锁与单次奖励保护；UI Resume保留won，选关返回、retry按钮调用生产方法；显式retry恢复checkpoint分数并重置尝试完成锁，可再次正常完成但不叠加旧通关奖励。新一局同样正常。M1 65次物理边沿静默丢失：Update统一走AdvanceInput，Overflowed触发timeline可见保护暂停，清理队列，恢复后不重放。

最终修复自测P1=117，P2=9679，P3=4110794断言/24trace1151op/390共享合约通过。P0 --check53文件、16/817与来源不变；独立oracle没有修改。Unity6000.6.4f1 repair build退出0。实际EditorPlayMode和重建NativeGameplay.exe均执行生产UI ShowRoomSelection→Resume、RetryCurrentRoom、新一局及真实keyboard65次down/up→AdvanceInput：输出NATIVE_GAMEPLAY_UI_REPAIR_PASS terminalSelectionReturn=true retry=true newSession=true overflow65Paused=true visibleReason=true staleReplay=false；390共享合约+11房/10连接/9素材通过，均已退出。证据在Validation/Native/P3/*repair*.log及EditorRepair/StandaloneRepair，截图不含GUI。Editor已知UnityEditor.Search索引异常保留原栈，不在Native代码；Standalone无该异常。

源码再次停写，P3仍awaiting_independent_acceptance；自报修复不替代主代理独立复验。未改P0/oracle、旧Prototype输出或用户旧游戏进程，未提前进入P4。


## P4 自测交接（冻结待独立验收）

native_p2唯一源码写入；新场景 `Assets/RoomLabNative/Scenes/PhysicsDemo/NativePhysicsDemo.unity`，新入口 `Builds/NativePhysicsDemo/RoomLabPhysics.exe`。84非legacy生产切片+背景、中文FusionPixel/OFL、手机论文待办菜单/HUD/暂停/设置/开发检查/结算、640×360原生Sprite与uGUI呈现，未覆盖旧Prototype/Gameplay。已移除失败ScreenCapture尝试的无用依赖；SVG仅新增内置vectorgraphics及其依赖，构建时显式保留隐藏shader并finally恢复。

P4新Core仅 `NativeProgress.cs` partial存档API，旧P3规则文件不改。Continue以项目来源SHA+内置/外部前缀+规则隔离，从检查点/入口恢复状态，开发检查不写正常成绩。242项新存档检查；P1 117、P2 9679、P3 4110794断言/24trace1151ops/390共享、P0 53冻结文件16trace817ops均复跑通过。

真实新EXE `release-player.log` 通过9SVG像素、9组导入/解码/绑定事务（失败保持同motor和continuation）、生产菜单New/Continue、65边沿保护、真实AudioSource与音量滑杆、10连接/最终结算及终局UI返回。`ReleaseRun/`包含11房、外部SVG/自定义PNG帧绑定、菜单/暂停/设置/结算以及1024×768/1920×1080完整uGUI截图。自动GUI图来自实际生产Canvas临时专用UI相机，非mock；与物理鼠标键盘/系统文件选择器的可见窗口验收分开。出口链测试明确使用定位到真实出口的离线装置，不伪称人工完整通关。

用户说明与完整美术生产清单/来源提示词/字体许可已随包。WebP/GIF本冻结版明确预提交拒绝，主代理已另行安排工程外原生解码依赖，等待串行接入；不宣称全格式兼容。源码/截图/API与已知边界见 `Validation/Native/P4/README.md`。没有开始P5性能或发布工作。


## P4 综合修复与用户源接入（当前交接，覆盖前述历史默认/格式限制）

最终Windows入口为 `Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe`，旧P4目录及用户程序未终止/覆盖。正式默认是用户《存档/第一大关 · 物理 DDL.json》原字节，SHA73c0df8eb955f22ae9fa56e30537e87751e2dfab3b45143d81885d873b2a5ad9，单独放AuthoredPhysics/authored-physics.json+9资产。EditorAuto/Editor255Compat，不改成Latest，不覆盖foot或冰时间/库存，P0与旧default/latest均未改。

冰引入初始hot42冰融化，真实踩控温板后cold42固态+42碰撞；裂纹/实例融化/1秒再生/再次踩热实际生产UI截图。全房与温区叠色实际在背景上方，HUD说明冷热与踩踏。冰跑酷真实为25块5/1与1块1/1，按作者逐实例保留。AuthoredChecks31项含热点胜出与四resetPolicy的Continue/Retry温控冰同步。

I1校验成对坐标、实际spawn安全、资源/AI tier和各状态数值；Continuation v2保存current+checkpoint并复用P3 RetryGameplay重置规则，使preserve/life/initial/checkpoint继续也一致，损坏/旧版本拒绝不换当前motor。旧源/新源各572项定向。I2完整引用链（含blockDefaults）预解码验证，缺ID不再变白块；M1改选真正空闲合法交互键，不覆盖合法迁移的E/I/F/T/Y。有效RED见repairs-real-red.log；Editor GREEN见repairs-editor-green.log。

原生roomlab_images.dll已独立验收后接入，SHA196159b507727da01ac86ad71838882e3d9ccb7e4155215022c2c63381aadc04，官方libwebp1.6.0+系统WIC GIF；逐帧Texture上传/行翻转/容器时长与循环，原生handle finally释放；原包完整来源/源码和许可证随Final分发。Editor与实际WindowsMonoPlayer各71项黄金像素/实际Sprite Shader验证；12组生产atomic导入包括有效GIF/WebP与坏包/缺完整fallback引用保留。元数据暂缺特性（GIF文本、WebP ICCP/EXIF）明确预提交拒绝，不静默丢效果。

P1 117/P2 9679/P3 4110794断言/390共享/P0冻结检查均保持通过。最终FinalAcceptance是新EXE实际生产Canvas完整GUI证据；不代替物理键鼠。没有开始P5；详细API/矩阵/真实结果见Validation/Native/P4/README.md，等待主代理独立复验。

## 2026-10-27 分辨率与 UI 适配（进行中，未验收）

用户新要求：适配主流分辨率并做界面分别适配，不要出现 UI 重叠；分辨率/全屏切换合并为一个选项组。方案细节与旧实现实测占用见 `Handoff/UI_RESOLUTION_ADAPTATION.md`。

- 世界层改为铺满窗口（RT = 设计空间 × 整数像素倍率，无黑边），`NativePixelWorld` 的相机缩放/夹取改用 `camera.aspect`，16:9 下与原 640/360 常量等价。
- 界面层新增 `Assets/RoomLabNative/Presentation/NativeUiKit.cs`：所有页面改用布局组堆叠，HUD/提示条横向锚点拉伸，面板宽度钳制并等比缩小，文字按 preferredHeight 决定高度。
- 设置页把 `切换全屏 / 窗口 1280×720 / 窗口 1920×1080` 合并为一个「显示」选项组（预设按显示器可用分辨率过滤 + 窗口/全屏模式），仍写回同一 settings.json 字段。
- 新增 `-nativeUiMatrix` 启动参数与 `Tools/RoomLabNative/verify-ui-resolution.ps1`：7 个分辨率 × 6 个界面，逐帧断言文字/控件两两不重叠、不越界、不被裁剪，并检查世界层覆盖整个窗口。

当前状态：代码完成，用 Unity 自带 Roslyn 对 Assets/RoomLabNative 及依赖做独立编译校验通过（0 error / 0 warning）。**尚未构建、尚未实机看图**：本机 Unity 编辑器许可证丢失（`C:\ProgramData\Unity` 不存在，licensing client 报 `Found 0 entitlement groups`，batchmode 退出码 198，`-force-free` 同样 198）。需先在 Unity 内登录刷新许可证，再跑上述脚本产出 `Validation/Native/UI/Matrix` 截图与 `NATIVE_UI_MATRIX_PASS` 日志；在此之前不得声称适配或去重叠已验收，旧 `Builds/NativePhysicsDemo-Final` 与 `交付/` 群测包保持原样未动。

## 2026-10-27 群测反馈修复（未构建验收）

1–8 条反馈的修复与口径见 `Handoff/GROUP_TEST_FIXES_20261027.md`。要点：新增 `NativeGameplayRules.DemoPhysics` 只给正式 Demo，255/latest 规则与冻结 oracle 全部未动；`NativePixelWorld` 增加导入工程美术兜底、喷射板方向、token 原生尺寸；HUD 预留 33 设计像素带且世界层让位；新增新手教程页与 `-nativeUiMatrix`（7 分辨率 × 7 界面）。

可执行证据（无 Unity）：`NATIVE_DATA_PASS checks=117`、`NATIVE_MOTION_PASS checks=9679`、`NATIVE_PROGRESS_PASS checks=572`、`NATIVE_GAMEPLAY_PASS assertions=4110794`、`NATIVE_DEMO_RULES_PASS checks=24`；Unity 侧脚本用自带 Roslyn 独立编译 0 error / 0 warning。

仍未构建：本机 Unity 许可证缺失（`C:\ProgramData\Unity` 不存在，batchmode 198），因此没有新 EXE、没有实机截图，不宣称已验收。

## 2026-10-27 构建与实机验收完成（UI 适配 + 群测 1–9 条）

许可证恢复后已构建并实测。产物 Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe，SHA256 437691663c5fb21231524f4886e60a10b1841f13e42fbbc93ee39fbd827930cd。

- 生产验收全通过：CORE 390 / IMPORT 12 / AUTHORED ICE 30 / SOUND / EXIT transitions=10 / UI，Player.log 异常 0。
- 分辨率矩阵 7×7=49 张 + 无美术工程包导入 1 张 + 横向喷气板 1 张，共 51 张，ui-matrix.txt 无 PROBLEM。
- Core 级回归（无 Unity）：DATA 117 / MOTION 9679 / PROGRESS 572 / GAMEPLAY 4,110,794 断言 / DEMO RULES 26 项，全部通过。
- 矩阵抓出并修复两个真实 UI 缺陷：音量滑块手柄被 Slider 拉长压住标题与按钮；HUD 暂停按钮被布局组撑成 175 设计像素宽。
- 群测反馈 1–9 条全部实施，见 `Handoff/GROUP_TEST_FIXES_20261027.md`。旧 `交付/物理DDL_Demo_群测版_20261027.zip` 未替换，等用户确认后再出新群测包。

## 2026-10-27 关卡换版 + 导入机制修复（已构建验证）

用户提供修正版关卡《第一大关 · 物理 DDL (1).json》，据此完成换版与导入修复；初稿与实施结果见 `Handoff/AUTHORED_LEVEL_REBASE_DRAFT.md`。

- 内置关卡换为 `880a65111ff27bc0389da57ac110784a15c412a70fa99f0f2c0aeeb00633ee06`（1,840,048 字节原字节），现 11 房 / 10 连接 / 696 对象 / 1310 地形 / 8 检查点；旧版 `73c0df8e…` 记入 `provenance.json` 的 `previousSourceSha256`。旧进度因 identity 含源 SHA 自动隔离。
- P0 冻结基线冻结的是自己的 DDL1.3 副本，与本次换版无关，`P0_CHECK_PASS files=53` 换版后仍绿，未重生成。
- 导入修复：缺 assets 时自动以 `RequireAssets=false` 重试并回退内置像素美术（`NativeDemoAssets.Decode(allowUnresolved)` + `Has(id)`）；导入规则从 `Editor255Compat` 改为 `DemoPhysics`，并在设置提供「按 2.5.5 原规则」开关。
- 验收：生产 EXE 的 CORE 390 / IMPORT 12 / ICE 30（source=880a6511…）/ SOUND / EXIT 10 / UI PASS（rules=DemoPhysics）全通过，28 张生产截图；矩阵 61 张 0 PROBLEM；Core 侧 DATA 117 / MOTION 9679 / PROGRESS 572 / GAMEPLAY 4,110,794 / DEMO RULES 30 / AUTHORED ICE 31 全通过。
- v2 群测包重出：`交付/物理DDL_Demo_群测版_v2_20261027.zip`，68,830,784 字节，SHA256 `0b149f355e725dab01fee49b3deea776d2bb17798bdb1aaa137f88c65e7327bf`；构建指纹 `Assembly-CSharp.dll` = `A3AAB112…5F94D9`；解压后独立复跑矩阵 0 PROBLEM。
- 新增诊断工具 `Tools/RoomLabNative/ImportProbe`：一条命令判定任意 JSON/ZIP 能否导入（可带 `--ice` 跑冰检查）。

## 2026-10-28 关卡换版 (2) + 导入美术根因修复

- 内置关卡换为《第一大关 · 物理 DDL (2).json》原字节，SHA256 `8049354e56a9ddd841ce08b2aaa40930dc056744e2ce792e8179ad4c455aa776`（1,826,785 字节）。本次修正：冰引入 +3 尖刺、AI追逐1 +3 地形/−8 尖刺、XX +12 地形/−19 尖刺。现 11 房 / 672 对象 / 1324 地形 / 190 尖刺 / 8 检查点；换版历史记入 `provenance.json` 的 `sourceSha256History`。
- **「导入后没有美术素材」根因**：编辑器 9 个 `seed-*` 占位 SVG 被导入链路原样渲染成灰色圆角方块（内置关卡走像素美术，所以对比明显）。修复：`NativePixelWorld.Placeholder(id)` 按素材**字节 SHA256** 识别占位图并回退内置像素美术，作者自定义图（即使沿用 seed id）优先保留；判定按 id 缓存。修复后带 assets 导入的关卡画面与内置关卡一致。
- 新增矩阵用例目录机制 `<evidence>/user-cases/<name>/level.json`，可把任意关卡（带/不带 assets）丢进去自动导入并截图，实测 `with-assets` 与 `bare` 两个用例均 accepted，`rules=DemoPhysics`。
- 回归：DATA 117 / MOTION 9679 / PROGRESS 572 / GAMEPLAY 4,110,794 / DEMO RULES 30（672/1324/8 计数已更新）/ AUTHORED ICE 31（source=8049354e…）；生产 EXE：CORE 390 / IMPORT 12 / ICE 30 / SOUND / EXIT 10 / UI PASS（rules=DemoPhysics）。
- v2 包重出：`交付/物理DDL_Demo_群测版_v2_20261027.zip`，68,830,344 字节，SHA256 `865076471f937a22aa85d0c2432365f9756eba7714c5e93a3d43ed5d99dacf7b`；构建指纹 `Assembly-CSharp.dll` = `D9C4324658A6BDBBE5A6F368CA74BA2FBAC906EEC2EE6C650AE5BF5CF0D2A3D9`；解压后独立复跑矩阵 0 PROBLEM、59 张。

## 2026-10-28 关卡 (3) + 导入表现/持久化修复 + 刺砖审计

- 内置关卡换为《第一大关 · 物理 DDL (3).json》原字节，SHA256 `03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836`。仅 XX 房变化：+1 冰(52,36)、−3 冰、−1 小 token；现 11 房 / 669 对象 / 1324 地形 / 348 冰 / 8 检查点。`AuthoredChecks` 与 `DemoRuleChecks` 常量同步；共享合约检查随数据 390→388，已用 `ImportProbe --smoke` 对 (2)/(3) 对照确认是数据驱动。
- 导入表现修复：`physics.jet` 按 direction 旋转并生成喷气特效、`physics.rail` 光束改用 `physics_cannon-railMiddle` 切片（原为白色拉长条，视觉上像与砖块重合）、炮座与控温台在导入关卡同样绘制——这些此前都被 `Builtin&&` 限制为仅内置关卡。
- 导入持久化：导入包（JSON/ZIP + assets）复制到 `<存档目录>/imported/`，settings 记 `importedLevel`，启动自动恢复；「恢复内置物理关」清除记忆。实机证据 `IMPORT_RESTORE restored=True remembered=imported\level.json sha=03b948a7… builtin=False`。
- 刺/地板砖审计：新增 `Tools/RoomLabVision`（像素分类/定点放大/接触检测 + 尖刺分类）。结果：190 刺中 floor 78 / ceiling 62 / air 30 / **onTile 14** / **buried 6**，20 处重叠全在 XX；渲染侧 XX 接触区域 35 处 vs 普通房 1 处。报告 `Handoff/SPIKE_FLOOR_AUDIT_20261028.md`，数据 `Validation/Native/UI/spike-audit-3.json`。
- 验收：生产 EXE CORE 388 / IMPORT 12 / ICE 30（source=03b948a7…）/ SOUND / EXIT 10 / UI PASS（rules=DemoPhysics），脚本异常 0；矩阵 67 张 0 PROBLEM（含导入喷射板/导轨专项与导入恢复截图）；Core DATA 117 / MOTION 9679 / PROGRESS 572 / GAMEPLAY 4,110,794 / DEMO RULES 30 / AUTHORED ICE 31。
- v2 包重出：`交付/物理DDL_Demo_群测版_v2_20261027.zip`，68,832,857 字节，SHA256 `e43f463fa78cda3e3133717f5e16522b7eb20272ae2a7b93b80a4fdeb72a2a43`；构建指纹 `Assembly-CSharp.dll` = `C7FED9D5EAD553B517BB20AE3F744B3DA0BAB0154521B30E48F03762B02A8CF0`；解压后独立复跑矩阵 0 PROBLEM、59 张。

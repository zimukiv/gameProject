# DDL · 截止之前 — RoomLab 原生 Unity Demo v2

当前入口为 **2026-11-07 符号与弱提示版**：原作者物理 11 房、高数 10 房、水课 11 房，共 32 房、67 条有向连接、27 件藏品。默认从原物理关开始；主菜单「作业待办」可选择章节。高数围绕积分、求导和折返环路展开；水课通过一次性咖啡/讲义管理清醒度，保留已探索地图与已知房间道具余量。

- 发布标签：`roomlab-native-v2-ddl-symbols-20261107`；[本版发布页](https://github.com/zimukiv/gameProject/releases/tag/roomlab-native-v2-ddl-symbols-20261107)。
- Windows 下载名：`RoomLab-Demo-v2-DDL-Symbols-20261107-win-x64.zip`。完整解压后运行 `RoomLabPhysics.exe`，保留同目录数据和 DLL。
- Unity：**6000.6.4f1**。用 Unity Hub 打开仓库根目录，加载 `Assets/RoomLabNative/Scenes/PhysicsDemo/NativePhysicsDemo.unity` 后 Play。
- 默认关卡：`Assets/StreamingAssets/RoomLabNative/Campaign/deadline-autosave.json`；课程 ID 为 `physics`、`guided-calculus`、`guided-slacker`。文件名沿用自动存档阶段，**本版门操作已经改为交互进入**。
- 原作者 `AuthoredPhysics/authored-physics.json` 未改；合包的 physics 完整课程与其规范化数据相同，9 个作者 SVG 配套保留。
- 旧程序、旧课程 JSON 和旧存档继续保留；2026-11-05 的机制示例版见下方历史入口。

本轮仅调整显示文案：高数房间改为简短希腊字母和组合符号，物理与水课采用环境短名，部分水课房名带图形记号；提示更短、更含蓄。关卡 JSON、房间 ID、机关、清醒度资源、门操作和保存方式沿用互动过门版，既有存档来源不变。上一互动过门版仍可从[原发布页](https://github.com/zimukiv/gameProject/releases/tag/roomlab-native-v2-ddl-20261107)取得。

## 门、存档与引导

在门内按交互键进入，默认 **E**，随设置改键；单纯经过、站在门口或跳过门都不会传送。门牌写实际去向，每章第一次靠近门时短暂提示交互键。门口同时有可交互物件时，一次按键处理物件后不会顺带过门。

触碰旗子静默自动保存，不打断操作；旗旁按 E 打开 **6 个手动存档槽**。读取页面分别显示最近 **3 份自动档**和 6 个手动档。过门仍保存目标入口，暂停可以回到存档点；保存失败保留旧磁盘记录。当前版本沿用 `deadline-autosave-progress-v1` 和 `settings-autosave-v1.json`，不挪动旧 Demo 存档。

UI 使用像素字体和环境笔记字体，提示短暂出现；重复背景字条与摆件已移除。三章配有探索/追逐音乐、机关音效、角色动作和 AI 反馈。首次探索约 30 分钟是设计目标，仍需真人计时与难度校准。

## 自定义资产与关卡

成品附同名 PNG/WAV 替换目录、图片/音频模板、UI 文案入口和关卡源文件。具体格式、尺寸、命名与错误回退见 [当前资产规范](Handoff/CUSTOM_ASSETS_SYMBOLS_20261107.txt) 和 [符号房名与弱提示补充规范](Handoff/SYMBOLS_CUSTOMIZATION_ADDENDUM.txt)。源文件替换无需开发入口。

房名与提示的模板为 `文案模板/contact-auto.json`；修改后需放回 `Assets/RoomLabNative/Resources/DisplayCopy/contact-auto.json` 并用 Unity 重建。成品不会直接读取模板副本，`自定义资产/ui.json` 仍只控制标题与颜色。

设计者在主菜单或暂停界面用方向键连续输入 **↑↑↓↓←→←→** 打开隐藏开发页（不是 WASD）。替换导入、原 Demo 与机制示例、教程、恢复内置和导入规则切换均在此页；普通玩家菜单不显示这些工具。支持 Room Lab 2.5.5 与 3.0 JSON/ZIP，JSON 的 `assets/` 必须一同保留。Unity 扩展字段可随编辑器往返，但编辑器预览不等同于完整 Unity 战役规则。

## 构建与检查

使用有有效授权的 Unity 6000.6.4f1；`RoomLab Native/Open pixel physics demo` 可重建当前场景。构建命令：

```powershell
& '<Unity安装目录>/Editor/Unity.exe' -batchmode -quit -projectPath '<本仓库目录>' -executeMethod RoomLab.Native.Editor.NativePhysicsDemoEditor.Build -logFile '<构建日志路径>'
```

默认输出 `Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe`；可用环境变量 `ROOMLAB_NATIVE_BUILD_DIR` 指定独立目录。`Tools/RoomLabNative/package-symbols.py` 整理已构建成品并核对程序集、关卡与本轮验收报告；脚本采用本机交付目录约定，异地使用前需调整 `BUILD`，不会代替 Unity 构建。

关卡 JSON、原创音频、贴图和字体已随源码提供，运行无需重新生成。生成器位于 `Tools/RoomLabNative`；音频重生成需要 NumPy，包装需要 Pillow。字体许可见 `Assets/StreamingAssets/RoomLabNative/Licenses` 和 `Resources/DiegeticFont/OFL.txt`。原生图像解码插件已提供，全部第三方重建工具链未包含。

安装 .NET 8 SDK 后，可在仓库根运行当前交互门与存档专项：

```powershell
dotnet run --project Validation/Native/InteractDoors20261107/CoreChecks/CoreChecks.csproj
```

上一互动过门版独立 Core **50/50**、Windows 运行验收 **103/103**，运行时覆盖 32 房显示、正常移动触旗、自动三档/手动六槽、跨章读档、保存失败保护和交互门行为。Windows 门专项先定位到门内，再验证无按键不进入、按键进入与入口恢复，**不是完整路径通关**。Core 使用独立夹具和输入步骤，也不代替三章真人跑关。这些历史结果见 [Core 报告](Validation/Native/InteractDoors20261107/CoreChecks/results.json)、[Windows 报告](Validation/Native/InteractDoors20261107/Runtime/autosave-runtime.json) 和 [规则说明](Validation/Native/InteractDoors20261107/CORE_INTEGRATION.md)。

上一自动过门阶段的关卡数据/编辑器往返与正常输入路线记录保留为历史证据，不能视为本轮 E 过门全流程重跑。尚未完成本轮真人完整试玩、首次 30 分钟计时或低配性能验收。本轮符号与弱提示验收以 `Validation/Native/Symbols20261107/Runtime/autosave-runtime.json` 为准；旧版通过数字不代替新程序验收。发布范围与证据边界见 [本轮说明](Handoff/SYMBOLS_20261107.md)。

改动前先读 [AGENTS.md](AGENTS.md)，核对远端并保留工作区内容。同仓库编辑器与云服务位于 [Tools/RoomLab](Tools/RoomLab/README.md)，使用独立发布标签；本次不替换其源码。

---

# 历史入口：2026-11-05 编辑器 build6 三主题示例版

以下保留当时说明。其中“当前”“本轮”及下载包名仅指 2026-11-05 版本，不是上方 32 房符号与弱提示版。

# RoomLab：三主题原生 Unity Demo v2 · 编辑器 3.0 build6 适配

当前维护入口为 **Unity原生三主题Demo v2**：原作者物理11房，以及build6高数、水课各3房机制示例。主菜单「选择大关」切换；各课程进度独立。旧套壳连接版、旧三关场景及其历史v3包保留，见下方历史说明，勿与当前原生v2混用。

2026-11-05接入、验收及限制见 [本轮交付记录](Handoff/EDITOR3_DEMO_20261105.md)。高数/水课覆盖编辑器的积分、求导、签到和清醒机制，并非25–50分钟正式战役；策划中的教师巡逻、五站签到开门等尚未进入build6模块，不能视为本轮已完成内容。

- Unity：**6000.6.4f1**；用Unity Hub添加本仓库根目录。
- 当前场景：`Assets/RoomLabNative/Scenes/PhysicsDemo/NativePhysicsDemo.unity`；打开后点击Play。
- Windows成品：完整解压 `RoomLab-Demo-v2-Editor3-20261105-win-x64.zip`，运行其中 `RoomLabPhysics.exe`，保留同目录全部数据/DLL。
- 本轮v2源码与成品发布页：[三主题 Demo v2](https://github.com/zimukiv/gameProject/releases/tag/roomlab-native-v2-editor3-20261105)。下载包内有文件清单与SHA256；具体构建/试玩状态以该次发布记录为准。[20261029旧版](https://github.com/zimukiv/gameProject/releases/tag/roomlab-native-v2-20261029)继续保留。
- 当前作者关卡：`Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json`，来源《第一大关 · 物理 DDL (3).json》，SHA256 `03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836`，11房/10连接。
- 改动前请先读 [AGENTS.md](AGENTS.md)，先核对远端分支最新提交，再保留并整合本地改动。

## 构建与兼容

Unity菜单 `RoomLab Native/Open pixel physics demo` 可生成当前场景；`RoomLab Native` 的构建逻辑在 `Assets/RoomLabNative/Editor/NativePhysicsDemoEditor.cs`。命令行示例（将路径换成本机安装位置）：

```powershell
& '<Unity安装目录>/Editor/Unity.exe' -batchmode -quit -projectPath '<本仓库目录>' -executeMethod RoomLab.Native.Editor.NativePhysicsDemoEditor.Build -logFile '<构建日志路径>'
```

构建输出 `Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe`，需要有效的Unity编辑器授权。项目已有运行所需的Windows x64图像解码插件和字体；来源/许可证见 `Assets/StreamingAssets/RoomLabNative/Licenses` 及各资源provenance文件。上游原生图像解码依赖的全部重建工具链未随本项目提供，不能将此源码包等同于所有第三方库源码。

本包默认 `DemoPhysics`。编辑器2.5.5与3.0.0 build6导出的JSON/ZIP可替换导入，多大关包显示选择窗口；设置里保留 `按2.5.5原规则`，不强改作者触发方式、温区初态、冰块实例数值、自绘素材优先级或原关卡文件。旧规则冻结参考与Demo派生行为分开验证。导入需保留JSON同目录assets或使用完整ZIP，资源仍按整包验证。

可设置环境变量 `ROOMLAB_NATIVE_BUILD_DIR` 输出到独立目录。本轮目录为 `Builds/NativeDemo-v2-Editor3-20261105`；旧成品不覆盖。

## 同仓库的 Room Lab 编辑器与云服务

云端main的2026-10-29更新（27cf59b）已原样合入：编辑器2.5.5与独立云服务源码在 [Tools/RoomLab](Tools/RoomLab/README.md)，组件来源清单在 [SOURCE_MANIFEST.json](Tools/RoomLab/SOURCE_MANIFEST.json)。后续编辑器维护先读其AGENTS并核对上游；它与原生Unity游戏使用独立发布标签。

## 回归与证据边界

安装完整 .NET 8 SDK 后，可在仓库根运行：

```powershell
dotnet run --project Tools/RoomLabNative/AIJumpChecks/AIJumpChecks.csproj
dotnet run --project Tools/RoomLabNative/GameplayChecks/GameplayChecks.csproj
dotnet run --project Tools/RoomLabNative/ProgressChecks/ProgressChecks.csproj
dotnet run --project Tools/RoomLabNative/DemoRuleChecks/DemoRuleChecks.csproj
```

冻结fixture/oracle已随源码保留，普通C#回归不需要重新生成。Node参考生成器用于审计历史来源，需要单独准备原a0ecb6a版本和2.5.5编辑器目录，并设置脚本顶部的 `ROOMLAB_REFERENCE_ROOT` / `ROOMLAB_EDITOR_ROOT`；仓库没有包含相邻编辑器工程或自动为你下载它。**不要为了跑绿而重新生成/覆盖冻结预期。**

`verify-ui-resolution.ps1` 仍含原作者本机G盘路径；异地使用需自行指定等效Unity/工程/输出路径，或按其源码执行相同构建与验证参数，不能声称该脚本异地开箱可跑。

AI视频问题与开发者越界复位修复、回归结果及未覆盖范围见 [本次修复记录](Handoff/AI_JUMP_FIX_V2.md)；独立验收与实际试玩另见发布记录。自动定位出口仅验证连接和结算；开发者选房/锁血/飞行不能算作正常跑关通过。性能及输入延迟仍需要独立实测。

---

# 历史入口：旧套壳连接版与旧三关原型

以下内容保留历史原文。这里的“当前”“最新”、D盘路径及v3均只指对应历史版本，不是上方的原生Unity v2。

# 当前版本：RoomLab 2.5.2 完整连线导入版

**阶段1（2026-10-26）：已接入 RoomLab 编辑器 2.5.5 导出兼容。** 详见 [阶段1兼容日志](Validation/RoomLab255/stage1-runtime-log.md)：支持 2.5.5 项目 JSON/ZIP 导入、朋友版单次迁移、导轨 `sideTrigger`、实体/空心存档点安全复活；未改旧三关场景与共享服务。

导入项目：运行器可用 `RoomLabCore.exe --roomlab-port=<端口> --roomlab-project=<project.json|项目.zip>`（加 `--roomlab-project-dialog` 直接弹选择框），或在游戏内按 Esc → **导入项目（JSON / ZIP）…** 用 Windows 原生对话框选文件。导入会先做迁移、结构与模块校验，失败保留当前游戏，不写回默认 `project.json` 或来源文件。

**程序 B 请先读 [DDL1.3 试玩 v3 最新交接说明](Handoff/ROOMLAB_DDL13_V3_20261026.md)。** GitHub 分支为 `codex/roomlab-ddl13-v3-handoff-2026-10-26`，完整试玩包见 [v3 Release](https://github.com/zimukiv/gameProject/releases/tag/roomlab-playtest-20261026-v3)。

拉取后在仓库根目录执行 `Tools/RoomLabExactHost/setup-runtime.ps1`，准备仓库内 `.roomlab-runtime`，然后用 Unity 6000.6.4f1 打开 `Assets/RoomLabExactConnected/RoomLabExact.unity`。运行器源码、11 房间数据及素材已纳入 `Tools/RoomLabRuntimeApp`，后续修改该目录并重跑初始化脚本同步。构建用 `Tools/RoomLabExactHost/build-connected.ps1 -UnityExe <Unity.exe路径>`。

以下 D 盘路径是提交者本机入口；B 的机器使用上方初始化流程。

Unity Hub 添加本目录 `D:\minigame\B-three-levels-demo`，使用 **Unity 6000.6.4f1**。
打开 **`Assets/RoomLabExactConnected/RoomLabExact.unity`**，点击 Play；F1 选择房间。

直接试玩：`D:\minigame\RoomLab-2.5.2-Unity-Connected-20261026\RoomLabUnity.exe`。
Unity 编辑器和试玩程序共用该目录的 `RoomLabRuntime`，请完整保留试玩目录。

最新分发包：`D:\minigame\资料\试玩导出\RoomLab-试玩版-20261026-v3.zip`。完整解压后运行其中的 `RoomLabUnity.exe`，无需安装 Unity。包含 DDL1.3、7 个存档点、键位设置、开发者锁血/飞行/地图预览，以及此前的双冲刺、温控立即结冰和 2 秒冰块调整；开包说明见 `开始试玩.txt`，完整性与独立目录启动验证见 [v3 导出记录](Validation/LatestRoomLabEvidence/playtest-export-20261026-v3.json)。旧同日无版本后缀及 v2 ZIP 为历史版。

重新打包已构建的当前版本可用 `python Tools/RoomLabExactHost/export-playtest.py --tag YYYYMMDD-vN`；脚本校验运行器源码、打包完整性和解压后文件哈希，不覆盖已有版本。

当前策划数据为 `D:\minigame\策划\第一大关 · 物理 DDL1.3.zip`，共 11 房间、10 连线，新增 7 个可用存档点。越界温控区已兼容处理，保留本地 2 秒冰块与尖刺朝向；具体变化、检查和备份见 [DDL 1.3 导入记录](Validation/DDL_1_3_IMPORT.md)。此前的 v2 分发 ZIP 保留原导出内容。
规则与画面基于 RoomLab 2.5.2 原核心，包含用户要求的水平冲刺、Esc 菜单及导轨拾取修复，详见 [当前导入说明](Validation/ROOMLAB_EXACT.md) 和 [Bug 修复日志](Validation/BUGFIX_LOG.md)。

---

以下为原三关 Unity 原型的历史说明，不是当前策划导入版的启动入口。

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

追逐前收集的 Token 在启动时全部投入以削弱 AI 速度：Token 越多，AI 越慢，但全收集后仍明显快于玩家普通跑速。冲刺使用不减少持有 Token，因此不损失这份减速收益。现行公式、试玩数值与接口变更见 [Token 削弱 AI 追逐速度](Validation/TOKEN_CHASE_WEAKENING.md)。

物理关采用 A 降温生成冰阶、B 升温融开冰墙的路线；随后喷气登台，按 E 主动启动追逐，再经电磁炮通往终点。周期平台及上方收藏品为可选路线，有倒计时和 AI 靠近提示。高数、水课保留原有主题机关，本次同步冲刺逻辑与 HUD。

物理关仅保留喷气前的小旗子检查点，高台首个检查点已删除。旗子前死亡从关卡起点恢复，保存旗子后死亡回喷气前重新准备追逐。

电磁炮现为金色载人弹射平台：跳上后平台和角色一起水平向右加速，途中可按空格 / W 跳离；到末端角色水平脱离、平台自动回位，详见 [载人弹射平台](Validation/RAIL_CARRIER.md)。

## 验证与继续开发

- [水平冲刺规则与验证](Validation/HORIZONTAL_DASH.md)
- [冷热路线与验证](Validation/TEMPERATURE_ROUTE.md)
- [喷气、主动追逐与周期平台引导](Validation/VENT_ROUTE.md)
- [完整人工验收清单](Validation/PLAYTEST.md)
- [体验基线与下一轮改进切入点（2026-10-25）](Validation/EXPERIENCE_BASELINE.md)
- [实际游戏截图](Validation/Previews/)

本机 Unity 6000.6.4f1 脚本编译及记录中的自动检查已通过；完整三关人工跑关、整体难度平衡和本轮 Windows 独立构建仍需完成，详见交接说明。测试脚本须在独立工程运行，避免影响正常试玩存档。

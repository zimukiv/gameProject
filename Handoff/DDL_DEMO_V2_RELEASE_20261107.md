# DDL · 截止之前 — Demo v2 源码发布说明

本次以互动过门版作为当前 Demo 入口，保留旧程序、旧关卡 JSON 和已有存档。发布标签为 `roomlab-native-v2-ddl-20261107`，Windows 包名为 `RoomLab-Demo-v2-DDL-20261107-win-x64.zip`。此文记录发布候选内容；推送和 Release 完成状态以远端结果为准。

## 内容与操作

- 32 房、67 条有向连接、27 件藏品、49 个旗子；原作者 physics 11 房完整课程不改，后续为 guided-calculus 10 房和 guided-slacker 11 房。
- 三章统一在门内按交互键进入（默认 E，支持改键）；经过门口不自动传送。门牌显示实际去向，首次靠近时短暂提示操作。
- 触旗静默自动保存，旗旁 E 打开六个手动槽；最近三份自动档和手动档分开。过门保存目标入口，失败不覆盖原磁盘记录。
- 高数阶段环路、清醒度一次性资源、探索地图与水课已知房间物件数量、短暂弱引导、环境字体、音乐和动作反馈沿用已打磨内容；移除重复背景摆件与字条。
- 当前默认数据仍名为 `deadline-autosave.json`，SHA-256 `523b045170f88881cf14cc4a401f023f76f5169a16aaf8f98b5bb2a9ca472ab5`。文件名不表示门仍自动进入。

## 来源和范围

源码基线为 `f251c8b9d2f8f60710e065794acda6736684b50f`。本次提交限定原生游戏 Core/Data/Presentation/场景、图片音频字体及许可、五份兼容关卡 JSON 与作者 SVG、生成/打包工具、本轮 Handoff 与必要验收记录。同仓库 Room Lab 编辑器、云服务和旧运行器不改。

不提交构建程序、Unity/编译缓存、个人存档、隔离测试磁盘档、旧程序副本或临时发布脚本。历史设计文档中的“未上传”和本机路径记录当时状态；当前入口以 README 与本说明为准。历史自动过门数据报告保留其原日期和语义，不更改冻结预期。

图片和音频替换、字体许可、关卡导入及隐藏开发入口见 `CUSTOM_ASSETS_INTERACT_20261107.txt` 和 `INTERACT_CUSTOMIZATION_ADDENDUM.txt`。Arrow 序列 ↑↑↓↓←→←→ 仅作为设计者工具入口；常规资产文件替换无需该入口。

## 当前证据与边界

- `Validation/Native/InteractDoors20261107/CoreChecks/results.json`：50/50。独立夹具使用正常移动、跳跃和单帧互动输入检查门、存档、资源锚点、终点续玩和原子文件写入；不代表三章完整通关。
- `Validation/Native/InteractDoors20261107/Runtime/autosave-runtime.json`：Windows 103/103、32 房显示。触旗使用普通移动；门 UI 专项先定位到门内，验证无输入保持、按键进入与目标入口恢复，不是完整路径证据。程序集 SHA-256 `30b48d692ca3e6a19acd201aecc0a38eed33fb12f197e65837b60f1ea61600b8`。
- 上一自动门阶段的 `AutoSave20261107/LevelChecks/REPORT.md`、各结果和编辑器往返记录是历史证据。物理首房正常输入与 13,832 帧配对、高数/水课路线和藏品记录并未在最终 E 门语义下完整重跑；不能把旧结果改称本轮全流程通过。
- 未完成本版三章真人完整试玩、首次约 30 分钟体验计时或低配性能验收。自动测试运行时间不等于玩家流程时长。

Windows ZIP 已完成本地封装：128,858,902 字节，SHA-256 `f729e9e14499df0747e67e6998120608c6ce72b05f8930e0f5fea68155be1f30`。下载后应完整解压，保留程序旁全部数据与 DLL。

## 复核入口

从仓库根运行 `.NET 8` 专项：

```powershell
dotnet run --project Validation/Native/InteractDoors20261107/CoreChecks/CoreChecks.csproj
```

测试将写入隔离测试目录，不使用玩家存档。Unity 构建入口为 `RoomLab.Native.Editor.NativePhysicsDemoEditor.Build`，版本 6000.6.4f1；构建和打包路径约定见 README。已提交生成后的资源和关卡，运行无需重新生成历史关卡或音频。

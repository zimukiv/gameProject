# AI 大人，拜托了 — Windows PC Unity 项目

根据 `minigame策划案.docx` 制作的三关 2D 游戏。目标平台为 Windows PC。关卡依次为物理、高数、水课。美术由团队后续接入；目前用可替换的色块验证玩法。

## 打开项目

1. 在 Unity Hub 中激活 Unity Editor 许可证，并使用 **Unity 6000.6.4f1** 打开此目录。
2. 首次导入完成后，编辑器自动生成 `Assets/Scenes/MainMenu.unity` 和三个关卡场景。打开 `MainMenu.unity` 后点击 Play。
3. 如果场景生成中断，可使用 **MiniGame > Rebuild generated scenes**。此操作会覆盖四个生成场景；团队接入美术后请先备份已编辑的场景。

操作：A/D 移动，W/空格跳跃，S 下蹲，Shift 八方向冲刺，Esc 暂停。

## 玩法与工具

- Token 为冲刺充能；启动装置消耗持有 Token 并按数量提升 AI 难度。
- 三关各有独立机关和 AI 技能。收藏品需要引 AI 靠近才能拾取。
- 房间检查点记录位置、分数、Token、冲刺及拾取状态；死亡会回滚这些状态。
- 主菜单支持新游戏、继续游戏、关卡解锁和最高分；游戏内有暂停、音量、全屏及通关结算。
- **MiniGame > Validate generated scenes** 检查场景对象、按钮事件和检查点安全位置。
- **MiniGame > Build Windows PC** 先运行场景检查，再输出 `Builds/Windows/MiniGame.exe`。

## 已完成的验证

- `dotnet build Validation/CompileCheck.csproj -p:RestoreIgnoreFailedSources=true`：0 错误，0 警告。
- `python Validation/playability_audit.py`：关卡流程顺序、检查点地面位置和跳跃缺口检查通过。

**尚未完成 Unity Play 模式跑关及 Windows 可执行文件验证。** 许可证已在 Unity Hub 激活，但当前 API 沙箱启动的编辑器无法连接 Hub 的本地 Licensing Client，因而没有生成场景。请从 Unity Hub 正常打开项目：导入后先运行场景校验，再实际从主菜单跑通三关、检查复活和通关结算，最后构建并测试 Windows 版本。达到商用发行标准还需团队美术、音频、难度调校、长时间试玩和正式版本测试。

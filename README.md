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
- 房间检查点记录位置、分数、Token、冲刺、拾取与机关状态；死亡时回滚签到、门、开关、热控和平台状态，并清除临时速度效果。
- 主菜单支持新游戏、继续游戏、关卡解锁和最高分；游戏内有暂停、音量、全屏及通关结算。
- 移动、跳跃、冲刺和 AI 追击在固定物理步中更新，渲染帧缓存输入；旋转机关击退期间 AI 暂停追击，复活保护结束后的持续接触会重新判定伤害。
- 通关分数即时保存；实时分数最多合并 1 秒、音量修改最多合并 0.5 秒，暂停/返回菜单/退出时刷新。强制结束进程可能丢失最近一个合并窗口内的实时修改。
- **MiniGame > Validate generated scenes** 检查场景对象、按钮事件和检查点安全位置。
- **MiniGame > Build Windows PC** 先运行场景检查，再输出 `Builds/Windows/MiniGame.exe`。

## 已完成的验证

- `dotnet build Validation/CompileCheck.csproj -p:RestoreIgnoreFailedSources=true`：0 错误，0 警告。
- `dotnet build Validation/CompileCheck.csproj -p:UseNewInputSystem=true -p:RestoreIgnoreFailedSources=true`：新输入分支编译 0 错误、0 警告；引用本机 Unity 模板中的 Input System 程序集，并不修改工程的旧版输入配置。
- `dotnet run --project Validation/RegressionChecks/RegressionChecks.csproj`：速度叠加、存档分数规则、输入缓存、冲刺积分、延迟写入和复活保护，共 59 项断言通过。
- `python Validation/playability_audit.py`：关卡流程顺序、检查点地面位置和跳跃缺口检查通过。

**尚未完成 Unity Play 模式跑关及 Windows 可执行文件验证。** 2026-10-18 的批处理尝试已连接 Licensing Client，但因缺少 `com.unity.editor.headless` 许可而退出（编辑器日志返回码 198）；场景校验没有执行，场景仍未生成。请从 Unity Hub 正常打开项目并确认 Editor 许可：导入后运行场景校验，再按 `Validation/PLAYTEST.md` 从主菜单跑通三关、检查机关回滚和通关结算，最后构建并测试 Windows 版本。达到商用发行标准还需团队美术、音频、难度调校、长时间试玩和正式版本测试。

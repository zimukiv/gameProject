# Physics Level Editor Beta r5 · 操作手册

适用产物：`release/PhysicsLevelEditor-r5-win-x64.zip`
（SHA-256 `24827ecfde91381a9047ffe47fa2d5daed2793e911b13d6971b730bbc5c77ccf`）

本版本的核心能力：在编辑器里修改 Room 1 的 `Start ground` 位置，保存工作副本，
点击 **试玩 Room 1**，真实的 Unity 游戏会在工作台中间的试玩区域内运行；停止后回到编辑，
再次试玩会应用新的位置。

> 运行环境：Windows 10/11 x64。队友不需要安装 Unity Editor，也不需要 Node.js。
> 不要直接在 ZIP 内双击 EXE，必须完整解压后运行。

---

## 1. 启动

1. 完整解压 `PhysicsLevelEditor-r5-win-x64.zip`。
2. 保持解压后的整个文件夹结构不变（`game-runner/` 不能删、不能单独移动）。
3. 双击 `PhysicsLevelEditor.exe`。
4. 在 **三关总览** 中点击 **Room 1 · Physics**。

---

## 2. 编辑 → 保存 → 试玩 → 停止（验收流程）

1. 左侧层级树选择 **Start ground**（`A · 4`）。
2. 右侧 Inspector 修改 **Transform · localPosition** 的 X（例如从 `-5` 改为 `-4.5`）。
   - 只有非 UI、归属 A 且未锁定的对象的 `localPosition` 可写。
   - 其他组件字段、Collider 尺寸、旋转/缩放均为只读；UI 对象位置也按只读处理。
3. 点击顶部 **保存工作副本**。
   - 成功提示：`工作副本已保存：<路径>（原始 Scene 与 V3 草稿未改）`。
   - 有未保存修改时，**试玩 Room 1** 按钮会变为 **先保存再试玩** 并禁用。
4. 点击 **试玩 Room 1**，等待页脚出现：
   `Unity 已确认应用 N 项位置修改 · PID <pid>`，并在下方显示 `试玩日志：<Player.log 路径>`。
   - 这一步的 `N` 和实际坐标来自 Unity 回写的 `receipt.json`，不是编辑器的自我声明。
5. **点击游戏画面一次**，让 Unity 窗口获得键盘焦点。
   - `A` / `D`：左右移动
   - `空格`：跳跃
   - `Shift`：水平冲刺（3 Token 充能，最多 1 次）
   - `E`：在 A 附近切换冷热状态
6. 点击 **停止试玩**（或直接关闭游戏窗口）。游戏退出，编辑画布恢复。
7. 再次点击 **试玩 Room 1**，确认 `Start ground` 的新 X 仍然生效。

### 如何确认"修改真的应用了"

查看本次会话目录中的 `receipt.json`：

```
%APPDATA%\Physics Level Editor Beta\playtest-sessions\<sessionId>\receipt.json
```

关键字段：

| 字段 | 含义 |
| --- | --- |
| `status` | `applied` 才表示 Unity 接受了本次修改 |
| `appliedCount` | 实际应用的对象数 |
| `positions[].objectId` | 稳定对象 ID；`Start ground` 为 `46c11342-6027-593d-87d5-ff1d6cb512b2` |
| `positions[].x/y/z` | Unity 回读到的真实 Transform 坐标 |

同目录的 `Player.log` 是 Unity 运行日志；`room1.overlay.json` 是本次会话的只读快照。

---

## 3. 数据放在哪里

| 内容 | 路径 |
| --- | --- |
| 工作副本 | `%APPDATA%\Physics Level Editor Beta\room-work-copies\room1.overlay.json` |
| 自动备份 | 同目录下的备份文件 |
| 试玩会话 | `%APPDATA%\Physics Level Editor Beta\playtest-sessions\<sessionId>\` |
| 会话内文件 | `room1.overlay.json`、`receipt.json`、`Player.log` |

安全边界：

- 原始 `Assets/Scenes/Level1.unity`、`Level2.unity`、`Level3.unity` **不会被修改**。
- 工作副本与来源 Scene 以 SHA-256 绑定；来源不一致时拒绝应用。
- 若工作副本被外部程序改动，编辑器会报冲突并要求重新打开，不会静默覆盖。
- Unity Player 的 Company/Product 是隔离的，和正式游戏存档分开。
- 启动前会把 `HKCU\Software\MiniGame Team Phase4A Test\Physics Level Editor Phase4A Isolated`
  下的 `GameFullscreen_h3745021268` 临时设为 `0`，退出时恢复原值。

---

## 4. 试玩窗口的行为

- 游戏画面显示在工作台中间的试玩区域内，比例固定 16:9 并居中，避免 HUD 被裁切。
- 它技术上是一个**无边框、无任务栏的 owned 顶层窗口**，不是真正的子窗口：
  视觉上嵌在区域内、跟随窗口移动/缩放、不能单独拖走，但在系统层面仍是独立 HWND。
  因此屏幕录制/窗口捕获工具可能把它识别为第二个窗口，这是已知限制，不是故障。
- 最小化主窗口会隐藏游戏；还原后会重新显示、对齐并请求焦点。
- 点击编辑器其他区域后键盘焦点会离开游戏，**再点一次游戏画面**即可恢复操作。
- 关闭游戏窗口等同于 **停止试玩**；主程序退出时也会结束本次试玩。

---

## 5. 故障排查

| 现象 | 处理 |
| --- | --- |
| 提示 `PlaytestHost.exe 缺失；运行器包不完整` | 没有完整解压，或杀毒软件隔离了文件；重新完整解压并放行 |
| 提示 `Unity Player EXE 缺失` / `Data 目录缺失` | `game-runner/` 不完整；重新解压，不要只复制 EXE |
| 提示 `请先保存当前修改，再启动真实 Unity 试玩` | 先点 **保存工作副本** |
| 提示 `目前仅 Room 1 Physics 支持真实 Unity 试玩` | Room 2/3 当前没有运行器，只能查看 |
| 提示 `工作副本已在外部修改` / 冲突 | 关闭当前房间后重新打开，确认使用哪一份工作副本 |
| 提示 `Unity Player 拒绝增量` / `未完整应用` / `超时` | 查看页脚给出的 `Player.log`，以及同目录 `receipt.json` 的 `error` |
| 游戏区域黑屏 | 先停止再重试；确认没有最小化/被其他置顶窗口遮挡；更新显卡驱动后重试 |
| 点击后键盘无反应 | 先点击游戏画面一次；确认主窗口未最小化；再按 A/D/空格 |
| 停止后游戏仍在 | 关闭主程序会清理；若宿主异常退出，可在任务管理器结束本次的 `PhysicsLevelPlaytest.exe` 与 `PlaytestHost.exe`，不要结束其他 Unity 进程 |
| 画面比例不对/HUD 被裁 | 拖大主窗口后重新试玩；试玩区域会按 16:9 重新计算 |

如果解压包内的 `README.txt` 与本文路径写法不一致，以本文为准。

---

## 6. 当前能力与限制

已实测（打包版 r5）：

- Room 1 的 A 类非 UI 对象 `localPosition` 编辑、工作副本保存与备份。
- 真实 Unity Player 嵌入试玩区域运行，键盘 A/D/空格/Shift/E 可用。
- SHA-256 绑定的修改应用与 Unity 坐标回读回执。
- 停止按钮、关闭游戏窗口、主程序退出时的清理。
- 16:9 居中与 150% DPI 下的几何对齐。

未实现/未验证：

- Room 2、Room 3 的真实试玩（只有 Room 1 运行器）。
- Collider/组件字段编辑、UI 布局编辑、Sprite 原生资源渲染。
- 从编辑器编辑内容**重新构建** Unity Player；内置 Player 是预构建的，只读取 overlay。
- Unity 进程被强杀（无窗口关闭消息）时的崩溃恢复路径未测试；宿主使用 Job Object
  做兜底，但没有运行证据。
- 其他 DPI 缩放比例、多显示器、远程桌面环境未逐一验证。

---

## 7. 开发者：构建与测试

在 `Tools/PhysicsLevelEditor`：

```powershell
npm.cmd install
npm.cmd run check      # TypeScript + 数据/运行器测试
npm.cmd run build      # 渲染层 + Electron 主进程
npm.cmd run package:portable
```

`package:portable` 的前置条件：

- `Temp/Phase4AIsolatedProject/Builds/LevelEditorPlaytest/<timestamp>/` 中存在通过校验的
  `runner-manifest.json`、`PhysicsLevelPlaytest.exe`、`PhysicsLevelPlaytest_Data/`。
- `native/PlaytestHost.cs` 会被打包脚本用系统 `csc.exe` 现场编译，不依赖预置二进制。
- 没有合格运行器时脚本会**拒绝打包**，不会生成一个假的试玩按钮。

打包产物位于 `release/`（已加入 `.gitignore`，不进入 Git）：

- `PhysicsLevelEditor-win32-x64-beta-r5-playtest/`
- `PhysicsLevelEditor-r5-win-x64.zip`

开发期试玩使用 `runner-staging/`（指向隔离工程的 junction，已忽略），
正式包使用 `game-runner/`。

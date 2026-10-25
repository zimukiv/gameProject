# Physics Level Editor（Windows x64）

当前交付版本：**r5 Playtest**。
队友操作手册：[PLAYTEST_GUIDE.md](PLAYTEST_GUIDE.md)　·　开发历史与技术债：[WORKLOG.md](WORKLOG.md)

## 队友：运行

1. 完整解压 `PhysicsLevelEditor-r5-win-x64.zip`，不要直接在 ZIP 内双击。
2. 双击 `PhysicsLevelEditor.exe`。
3. 不需要安装 Node.js、Unity Editor 或 Unity Hub。

启动后在 **三关总览** 中选择房间。

## 三个 Room

| Room | 内容 | 当前能力 |
| --- | --- | --- |
| Room 1 · Physics | `Level1.unity` 的 71 个来源对象 / 254 个组件 | 可编辑位置、可真实试玩 |
| Room 2 · Calculus | `Level2.unity` 的 64 / 221 | 只读浏览对象与 Collider 几何 |
| Room 3 · Slacker | `Level3.unity` 的 72 / 254 | 只读浏览对象与 Collider 几何 |

画布显示真实的 Box/Circle Collider 轮廓和网格；Sprite 资源未打包，视觉对象使用带标签的占位图。

## 编辑与保存

- 左侧层级选择对象，右侧 Inspector 可修改 **Transform · localPosition** 的 X/Y/Z。
- 仅支持非 UI、归属 A、未锁定的对象。旋转、缩放、Collider 尺寸和组件字段只读。
- 点击 **保存工作副本**。工作副本与自动备份写入：

```
%APPDATA%\Physics Level Editor Beta\room-work-copies\room1.overlay.json
```

- 原始 `Assets/Scenes/Level1.unity`、`Level2.unity`、`Level3.unity` 不会被修改。
- 多选对象可整体位移；含只读或锁定对象时整批拒绝。
- 撤销 / 重做只作用于当前会话的编辑。

## 试玩与停止

1. 保存工作副本后，点击 **试玩 Room 1**。
2. 等待页脚出现 `Unity 已确认应用 N 项位置修改`；`N` 和坐标来自 Unity 回执 `receipt.json`。
3. 点击游戏画面一次获得键盘焦点：`A` / `D` 移动，`空格` 跳跃，`Shift` 冲刺，`E` 互动。
4. 点击 **停止试玩**（或关闭游戏窗口）返回编辑画布。
5. 再次试玩会读取最新保存的工作副本。

试玩窗口在视觉上嵌入工作台中央，比例固定 16:9；它技术上是一个无边框 owned 顶层窗口，不是真正的子窗口，不能单独拖走，最小化主窗口时会隐藏。

日志与回执：

```
%APPDATA%\Physics Level Editor Beta\playtest-sessions\<sessionId>\Player.log
%APPDATA%\Physics Level Editor Beta\playtest-sessions\<sessionId>\receipt.json
```

## 尚未实现

- Room 2 / Room 3 的真实 Unity 试玩运行器。
- Collider、组件字段、旋转/缩放的编辑。
- 原生 Sprite / 音频资源的渲染和导入。
- 从编辑内容重新构建 Unity Player（发行包内是预构建 Player，只读取 overlay）。
- Unity 进程被强制杀死时的崩溃恢复路径尚未实测。

## 开发

在 `Tools/PhysicsLevelEditor`：

```powershell
npm.cmd install
npm.cmd run check       # TypeScript + 数据/运行器测试
npm.cmd run build       # 渲染层 + Electron 主进程
npm.cmd run desktop     # 开发模式启动
npm.cmd run package:portable
```

打包前置条件：

- `Temp/Phase4AIsolatedProject/Builds/LevelEditorPlaytest/<timestamp>/` 中存在通过校验的
  `runner-manifest.json`、`PhysicsLevelPlaytest.exe` 和 `PhysicsLevelPlaytest_Data/`。
- `native/PlaytestHost.cs` 由打包脚本用系统 `csc.exe` 现场编译，不依赖预置二进制。
- 没有合格运行器时脚本拒绝打包，不会生成假的试玩按钮。

发行包默认输出到 `release/`。可以用 `PLE_RELEASE_NAME` 指定新包名，例如：

```powershell
$env:PLE_RELEASE_NAME='PhysicsLevelEditor-r5-win-x64'
npm.cmd run package:portable
```

`release/`、`node_modules/`、`dist/`、`runner-staging/`、`native/bin/` 均不进入 Git。

## 目录

```
Assets/Editor/LevelImportExport/   Unity 导入导出、Player 构建与验证
Assets/Scripts/LevelRuntime/       Playtest Bootstrap 与 V3 运行期数据
Levels/                            ProjectManifest、SourceMaps、V3 草稿
Tools/PhysicsLevelEditor/src/      Electron 主进程、编辑器与 React UI
Tools/PhysicsLevelEditor/native/   PlaytestHost.cs（Win32 嵌入宿主）
Tools/PhysicsLevelEditor/tests/    Node 测试
```

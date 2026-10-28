# UI 分辨率适配与重叠治理（进行中）

日期：2026-10-27。范围：`gameProject-roomlab255` 原生物理 Demo 的表现层与界面层；不改 Core 玩法、不改 P0/P1–P4 冻结预期、不改旧场景。

## 问题（用户反馈）

1. 主流分辨率下界面没有真正适配：旧实现是「640×360 逻辑画布 + `Mathf.Floor` 整数倍缩放」，非整数倍分辨率会留大片黑边，4:3 直接缩成中间一小块。
2. 默认分辨率下设置页的「选项」已经挤在一起：`切换全屏 / 窗口 1280×720 / 窗口 1920×1080` 三个独立按钮 + 一行过长的帮助文本被截断。
3. 要求把分辨率/全屏合并成一个选项组。

## 旧实现的实测占用（改前）

| 分辨率 | 旧显示区域 | 占屏 |
| --- | --- | --- |
| 1280×720 / 1920×1080 / 2560×1440 / 3840×2160 | 满屏 | 100% |
| 1366×768 | 1280×720 | 87.8% |
| 1600×900 | 1280×720 | 64% |
| 1440×900 | 1280×720 | 71.1% |
| 1920×1200 | 1920×1080 | 90% |
| 2560×1080 | 1920×1080 | 75% |
| 3440×1440 | 2560×1440 | 74.4% |
| 1024×768 | 640×360 | 29.3% |

## 采用的方案（用户选择 A：世界铺满窗口 + UI 全屏自适应）

`NativePhysicsDemoPlayer.ApplyScreen()` 每帧检测窗口尺寸，据此同时确定世界层与界面层：

- **设计空间随窗口比例生长**：以 640×360 为基准，只在「较窄的那一侧」扩展。
  - 宽于 16:9（超宽）：设计高固定 360，宽 = 360×aspect。
  - 窄于 16:9（16:10 / 4:3）：设计宽固定 640，高 = 640/aspect。
  - 因此设计空间永远 ≥ 640×360，任何界面都不需要缩小或裁切。
- **CanvasScaler**：`ScaleWithScreenSize`，参考 640×360，`matchWidthOrHeight` 在宽屏取 1、窄屏取 0，正好等价于上面「扩展较窄侧」。
- **世界层铺满窗口**：世界不再画进固定 640×360 的图，而是渲染到 `design × pixelScale` 的 RenderTexture（`pixelScale = clamp(floor(canvasScale), 1, 4)`），RawImage 用锚点 0..1 铺满，**没有黑边**。
- **相机改用真实比例**：`NativePixelWorld` 的缩放/夹取由硬编码 `640f/360` 改为 `camera.aspect`；16:9 下结果与原值完全一致（无回归），其它比例下按「整间房可见」自动缩放。

### 界面层：布局组代替绝对坐标

新增 `Assets/RoomLabNative/Presentation/NativeUiKit.cs`，所有页面用 `VerticalLayoutGroup / HorizontalLayoutGroup + ContentSizeFitter` 堆叠，尺寸由内容决定：

- 两个纵向相邻元素在数学上不可能重叠（布局组按顺序排布并撑开父容器高度）。
- 文本按实际宽度换行，高度由 `Text.preferredHeight` 决定，不再出现「长句被截断/压到按钮上」。
- 面板宽度 `min(560, designWidth-32)`，高度自适应；若仍超出可用高度，`Fit()` 等比缩小而不是裁切。
- HUD（顶部条）与提示条（底部）改为横向锚点拉伸，宽屏时跟着变宽，不会挤在 640 宽的中间。
- 菜单保留左侧 224×312 手机美术板（固定像素、内部绝对坐标，与窗口无关），右侧按钮列用布局组。

### 设置页：分辨率与全屏合并为一个「显示」选项组

原来是三个独立按钮（`切换全屏`、`窗口 1280×720`、`窗口 1920×1080`），现已合并为一组：

```
显示
[1280×720] [1600×900] [1920×1080] [2560×1440]   ← 同一组内的窗口预设，当前项高亮
[窗口] [全屏]                                     ← 同一组内的模式
```

- 预设按当前显示器可用分辨率过滤（`Screen.currentResolution`），显示器不支持的不显示；当前尺寸不在预设里时自动追加一项。
- 选择结果仍然写回既有 `settings.json` 的 `width/height/fullscreen` 字段，旧存档兼容。

## 验收方式

`Tools/RoomLabNative/verify-ui-resolution.ps1`：

1. `Unity -batchmode -executeMethod RoomLab.Native.Editor.NativePhysicsDemoEditor.Build` 构建。
2. 运行 `RoomLabPhysics.exe -nativeUiMatrix -nativeEvidencePath <dir>`。

矩阵覆盖 1280×720 / 1366×768 / 1600×900 / 1920×1080 / 1024×768 / 1920×1200 / 2560×1440，每个分辨率捕 6 个界面（主菜单 / 游戏内 / 暂停 / 设置 / 开发检查 / 结算），并逐帧做断言：

- **重叠**：对所有「文字」与「可交互控件」两两求矩形交，除父子关系外必须为 0 交叠。
- **越界**：任何文字/控件必须完整落在设计空间内。
- **裁剪**：`Text.preferredHeight` 必须 ≤ 其矩形高度（防止文字被截断）。
- **世界覆盖**：RawImage 的矩形必须等于设计空间（即无黑边）。

通过时日志为 `NATIVE_UI_MATRIX_PASS shots=42 pairs=… overlaps=0 outside=0 clipped=0`，截图落在 `Validation/Native/UI/Matrix/`。

## 当前状态

- 代码完成，使用 Unity SDK 自带 Roslyn（`E:\Unity\6000.6.4f1\Editor\Data\DotNetSdk`）对 `Assets/RoomLabNative` + 依赖脚本做独立编译校验：**0 error / 0 warning**。
- **尚未构建与实机看图**：本机 Unity 编辑器许可证已丢失（`C:\ProgramData\Unity` 不存在，licensing client 报 `Found 0 entitlement groups`，batchmode 退出码 198）。需要先在 Unity 里登录一次刷新许可证，然后执行上面的脚本即可产出截图与矩阵日志。
- 属性面板已不再是「选项重叠」的来源，但最终结论以矩阵日志与截图为准，不以本文自述代替。
